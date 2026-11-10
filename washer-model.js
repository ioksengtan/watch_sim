// 惠而浦 8TWTW4955JW 洗衣機模擬器：純狀態機，不含任何 DOM。
// 依據官方手冊《上開式高效能低水量洗衣機使用保養手冊》（W11590301A，36頁）整理的研究規格實作；
// 註解中的「第幾頁」為該手冊印刷頁碼。手冊查無的行為一律不實作，由介面層另行標示。
(function (root) {
  'use strict';

  // 旋鈕檔位。名稱保留手冊面板短詞（第20、25頁）。
  const KNOBS = {
    soil: { name: '衣物髒度', options: ['輕', '標準', '重'] },
    temp: { name: '洗衣水溫', options: ['熱水', '溫水', '涼水', '冷水', '自來水'] },
    cycle: { name: '洗衣行程', options: null }, // 由 CYCLES 填入
    rinse: {
      name: '洗清選擇',
      options: [
        '一次洗清（自動偵測水位）',
        '二次洗清（自動偵測水位）',
        '一次洗清（高水位／添加柔軟精）',
        '二次洗清（高水位／添加柔軟精）',
      ],
    },
    level: { name: '水位選擇', options: ['自動偵測', '高水位'] }, // 效果未實作（圖文衝突，第19–20、25頁）
  };

  // 第22頁行程指南全部12項。spin 為手冊的相對脫水轉速（高／低），不是每分鐘轉數。
  // kind 決定階段組成：wash＝進水→洗衣→洗清→脫水；soak＝單獨浸泡；spin＝單獨脫水；
  // rinse＝洗清&脫水；clean＝槽洗淨（手冊寫「含攪動與脫水」，第22、26頁）。
  const CYCLES = [
    { name: '衣量多/大物件', kind: 'wash', spin: '低' },
    { name: '厚重衣物', kind: 'wash', spin: '高' },
    { name: '高水位洗衣', kind: 'wash', spin: '高' },
    { name: '標準', kind: 'wash', spin: '高' },
    { name: '冷水洗衣', kind: 'wash', spin: '高', coldOnly: true },
    { name: '免燙衣料', kind: 'wash', spin: '低' },
    { name: '柔洗', kind: 'wash', spin: '低' },
    { name: '少量快洗', kind: 'wash', spin: '高' },
    { name: '單獨浸泡', kind: 'soak', spin: null },
    { name: '單獨脫水', kind: 'spin', spin: '高', noTemp: true },
    { name: '洗清&脫水', kind: 'rinse', spin: '高', noTemp: true },
    { name: '槽洗淨（搭配 affresh 錠）', kind: 'clean', spin: '低' },
  ];
  KNOBS.cycle.options = CYCLES.map((c) => c.name);

  // 洗清次數：檔位 0、2 為一次洗清，1、3 為二次洗清（第20頁）。
  const rinseCount = (rinseIdx) => (rinseIdx === 1 || rinseIdx === 3 ? 2 : 1);

  // 行程的階段序列。「浸泡」「排水」不是面板進度燈名稱，燈號對應查無，介面層不點燈。
  function phasesFor(cycle, rinseIdx) {
    const rinses = Array(rinseCount(rinseIdx)).fill('洗清');
    switch (cycle.kind) {
      case 'wash': return ['進水', '洗衣', ...rinses, '脫水'];
      case 'soak': return ['進水', '浸泡', '排水']; // 不進入脫水（第22頁）
      case 'spin': return ['脫水']; // 不加洗衣或洗清步驟（第22頁）
      case 'rinse': return ['進水', ...rinses, '脫水']; // 不加洗衣步驟（第22頁）
      case 'clean': return ['進水', '洗衣', '脫水']; // 依「含攪動與脫水」呈現
      default: return [];
    }
  }

  // 門鎖：進水階段可開蓋（開蓋會暫停，第20頁），其餘運轉階段上鎖；精確鎖門時序手冊查無。
  const lockForPhase = (phase) => phase !== '進水';

  // 示範設定（須標明為示範，非原廠預設；原廠預設查無）：
  // 標準行程、標準髒度、自來水、一次洗清（自動偵測水位）。
  function createWasher() {
    return {
      state: 'idle', // idle | settable | running | paused | lidPaused | cancelled | drained | complete
      knobs: { soil: 1, temp: 4, cycle: 3, rinse: 0, level: 0 },
      lidOpen: false,
      doorLocked: false,
      drumSpinning: false, // 暫停／取消後槽是否仍在旋轉（等待停止才解鎖，第21、32頁）
      lidFlash: false, // 上蓋未關而嘗試啟動 → 門上鎖燈閃爍（第32頁）
      phases: [],
      phaseIndex: 0,
      anomaly: null, // null | 'fill'（無法正常注水，第29頁）| 'drain'（10分鐘內無法排水，第30頁）
      message: '已接電、上蓋關閉、尚未啟動。短按啟動／暫停或轉動洗衣行程旋鈕可喚醒（第24頁）。',
    };
  }

  const cycleOf = (m) => CYCLES[m.knobs.cycle];
  const curPhase = (m) => m.phases[m.phaseIndex] || null;
  const ASLEEP = ['idle', 'cancelled', 'drained', 'complete'];

  function wake(m, how) {
    m.state = 'settable';
    m.phases = [];
    m.phaseIndex = 0;
    m.doorLocked = false;
    m.drumSpinning = false;
    m.message = how + '，進入可設定狀態；再短按啟動／暫停才會開始（第24–25頁）。' +
      '喚醒時的開機燈號組合編號對照未經圖像確認，暫不映射（第24頁）。';
  }

  function startCycle(m) {
    const c = cycleOf(m);
    if (m.lidOpen) {
      m.lidFlash = true;
      m.message = '上蓋未關，無法啟動或注水；門上鎖燈閃爍（第32頁）。請先關上上蓋。';
      return;
    }
    if (c.coldOnly && KNOBS.temp.options[m.knobs.temp] !== '冷水') {
      m.message = '「冷水洗衣」僅允許冷水（第22頁）；其他水溫組合的實機反應手冊查無，' +
        '模擬器不執行也不編造錯誤提示，請先把洗衣水溫轉到冷水。';
      return;
    }
    m.phases = phasesFor(c, m.knobs.rinse);
    m.phaseIndex = 0;
    m.state = 'running';
    m.doorLocked = lockForPhase(curPhase(m));
    const notes = [];
    if (curPhase(m) === '進水') notes.push('先注水並偵測衣量，再補到所需水位（第20頁）');
    if (c.noTemp) notes.push('此行程不使用洗衣水溫旋鈕設定（第22頁）');
    notes.push('各階段實際時間手冊查無，請用面板外的「推進階段」工具前進');
    m.message = '行程「' + c.name + '」開始，進入「' + curPhase(m) + '」階段。' + notes.join('；') + '。';
  }

  function pressStart(m) {
    if (m.anomaly) {
      m.message = '異常情境中；異常解除後的清燈／重設流程手冊查無，模擬器不自動恢復，請用「重設模擬器」。';
      return;
    }
    if (ASLEEP.includes(m.state)) return wake(m, '短按啟動／暫停鍵喚醒');
    if (m.state === 'settable') return startCycle(m);
    if (m.state === 'running') {
      m.state = 'paused';
      if (m.doorLocked) {
        m.drumSpinning = true;
        m.message = '已暫停，原先亮起的進度燈改為閃爍（第20頁）。槽可能仍在旋轉，' +
          '須等停止才解鎖、可開蓋，可能需要數分鐘（第21、32頁）；模擬器以「槽已停止旋轉」工具代表這個等待。';
      } else {
        m.message = '已暫停，原先亮起的進度燈改為閃爍（第20頁）。再短按啟動／暫停可繼續。';
      }
      return;
    }
    if (m.state === 'paused') {
      if (m.lidOpen) {
        m.message = '上蓋開啟中。關上上蓋後再短按啟動／暫停，行程會從暫停前的階段繼續（第25頁）。';
        return;
      }
      m.state = 'running';
      m.drumSpinning = false;
      m.doorLocked = lockForPhase(curPhase(m));
      m.message = '繼續行程，從暫停前的「' + curPhase(m) + '」階段續行，不從頭重跑（第25頁）。';
      return;
    }
    if (m.state === 'lidPaused') {
      m.message = '進水階段因開蓋而暫停；關上上蓋即可續行（第20頁）。';
    }
  }

  function holdStart(m) {
    if (['running', 'paused', 'lidPaused'].includes(m.state)) {
      m.state = 'cancelled';
      m.phases = [];
      m.phaseIndex = 0;
      m.anomaly = null;
      if (m.doorLocked) m.drumSpinning = true; // 仍須等槽停止才解鎖
      m.message = '按住啟動／暫停滿3秒，已取消目前行程（第20、26頁）。取消後的燈號、是否立即排水、' +
        '設定是否清除手冊查無，模擬器熄滅進度燈並停住；需要排水可改選「單獨脫水」並啟動（第22頁）。';
      return;
    }
    m.message = '目前沒有進行中的行程；手冊只載明按住3秒取消行程，其他長按作用查無，不實作。';
  }

  function turnKnob(m, knob, value) {
    const def = KNOBS[knob];
    if (!def || value < 0 || value >= def.options.length) return;
    if (['running', 'paused', 'lidPaused'].includes(m.state) || m.anomaly) {
      m.message = '運轉中轉動旋鈕是否立即生效手冊查無，運轉中變更設定不實作（第24–25頁）；旋鈕維持原位。';
      return;
    }
    m.knobs[knob] = value;
    const picked = def.name + '：' + def.options[value];
    if (knob === 'cycle' && ASLEEP.includes(m.state)) {
      wake(m, '轉動洗衣行程旋鈕（' + def.options[value] + '）喚醒');
      return;
    }
    if (knob === 'level') {
      m.message = picked + '。此旋鈕僅保留外觀，效果未實作：手冊圖示與正文對同一旋鈕的說明衝突（第19–20、25頁）。';
      return;
    }
    if (ASLEEP.includes(m.state)) {
      m.message = picked + '（機器未喚醒；喚醒須短按啟動／暫停或轉動洗衣行程旋鈕，第24頁）。';
      return;
    }
    let note = '';
    if (knob === 'soil') note = '重會增加洗衣時間、輕會縮短；分鐘數手冊查無，不顯示（第20、25頁）。';
    if (knob === 'temp') note = '熱水、溫水會混入冷水；洗清一律用冷水；攝氏數值手冊查無（第20、22頁）。';
    if (knob === 'rinse') note = '使用柔軟精須選「高水位／添加柔軟精」檔位；逐行程相容表手冊查無（第20、24頁）。';
    m.message = picked + '。' + note;
  }

  function setLid(m, open) {
    if (m.anomaly) {
      m.message = '異常情境中；異常解除後的流程手冊查無，請用「重設模擬器」。';
      return;
    }
    if (open) {
      if (m.doorLocked) {
        m.message = '上蓋已上鎖（門上鎖燈亮），不可開蓋；須停止運動並解鎖後才能開（第21頁）。';
        return;
      }
      if (m.lidOpen) return;
      m.lidOpen = true;
      if (m.state === 'running' && curPhase(m) === '進水') {
        m.state = 'lidPaused';
        m.message = '進水階段開蓋，行程暫停；關上上蓋可續行。開蓋暫停達10分鐘會排水（第20、25頁，' +
          '「達」與「超過」用字在手冊內不一致）。';
      } else {
        m.message = '上蓋已打開。';
      }
      return;
    }
    if (!m.lidOpen) return;
    m.lidOpen = false;
    m.lidFlash = false;
    if (m.state === 'lidPaused') {
      m.state = 'running';
      m.doorLocked = lockForPhase(curPhase(m));
      m.message = '已關上上蓋，進水階段續行（第20頁）。';
    } else if (m.state === 'paused') {
      m.message = '已關上上蓋；再短按啟動／暫停，行程會從暫停前的階段繼續（第25頁）。';
    } else {
      m.message = '上蓋已關閉。';
    }
  }

  function advancePhase(m) {
    if (m.state !== 'running' || m.anomaly) {
      m.message = '「推進階段」只在行程運轉中可用（這是模擬器工具，不是實機按鍵）。';
      return;
    }
    if (m.phaseIndex + 1 < m.phases.length) {
      m.phaseIndex += 1;
      m.doorLocked = lockForPhase(curPhase(m));
      const c = cycleOf(m);
      let note = '';
      if (curPhase(m) === '洗清') note = '洗清一律使用冷水（第22頁）。';
      if (curPhase(m) === '脫水') note = '脫水轉速由行程決定（相對轉速：' + c.spin + '），不可手選（第20、22頁）。';
      if (curPhase(m) === '浸泡') note = '攪動與浸泡交替；浸泡分鐘手冊查無。此階段燈號對應查無，面板進度燈不亮。';
      if (curPhase(m) === '排水') note = '排水後結束、不進入脫水（第22頁）。此階段燈號對應查無，面板進度燈不亮。';
      m.message = '模擬器工具：推進到「' + curPhase(m) + '」階段（各階段實際時間手冊查無）。' + note;
      return;
    }
    m.state = 'complete';
    m.phases = [];
    m.phaseIndex = 0;
    m.doorLocked = false;
    m.message = '行程結束，完成燈亮（第21、25頁）。完成燈何時熄滅手冊查無，模擬器於下次喚醒進入可設定時才熄滅。';
  }

  function drumStopped(m) {
    if (m.drumSpinning) {
      m.drumSpinning = false;
      m.doorLocked = false;
      m.message = '模擬器工具：槽已停止旋轉，門上鎖解除，可開蓋（第21、32頁）。';
      return;
    }
    m.message = '目前沒有在等待槽停止（這是模擬器工具，不是實機按鍵）。';
  }

  function lidOpen10Min(m) {
    if (m.state !== 'lidPaused') {
      m.message = '此工具只適用於進水階段開蓋暫停的情境（第20、25頁）。';
      return;
    }
    m.state = 'drained';
    m.phases = [];
    m.phaseIndex = 0;
    m.message = '開蓋暫停達10分鐘，機器已排水（第20、25頁）。排水後是否自動取消、燈號如何收尾手冊查無，' +
      '模擬器停在排水情境，不自動視為完成。';
  }

  function injectAnomaly(m, kind) {
    if (kind === 'fill') {
      if (m.state !== 'running' || curPhase(m) !== '進水') {
        m.message = '「無法正常注水」情境只能在進水階段注入（第29頁）。';
        return;
      }
      m.anomaly = 'fill';
      m.message = '模擬器注入異常：無法正常注水——手冊列為洗衣燈號亮起，可能原因含水源、進水管、供電、' +
        '開蓋或運作條件，不能單憑燈號斷定唯一原因（第29頁）。異常解除流程手冊查無，請用「重設模擬器」。';
      return;
    }
    if (kind === 'drain') {
      if (m.state !== 'running' || curPhase(m) !== '脫水') {
        m.message = '「10分鐘內無法排水」情境只能在脫水階段注入（第30頁）。';
        return;
      }
      m.anomaly = 'drain';
      m.message = '模擬器注入異常：10分鐘內無法排水——脫水燈號一直亮起，可能為排水受阻等原因（第30頁）。' +
        '異常解除流程手冊查無，請用「重設模擬器」。';
    }
  }

  function dispatch(m, ev) {
    switch (ev.type) {
      case 'pressStart': pressStart(m); break;
      case 'holdStart': holdStart(m); break;
      case 'turnKnob': turnKnob(m, ev.knob, ev.value); break;
      case 'lid': setLid(m, ev.open); break;
      case 'advance': advancePhase(m); break;
      case 'drumStopped': drumStopped(m); break;
      case 'lidOpen10Min': lidOpen10Min(m); break;
      case 'anomaly': injectAnomaly(m, ev.kind); break;
    }
    return m;
  }

  // 面板燈號（進水、洗衣、洗清、脫水、完成、門上鎖）：off | on | flash。
  // 進度燈只對應手冊有載的階段；浸泡／排水階段的燈號查無，不點燈。
  function lights(m) {
    const L = { 進水: 'off', 洗衣: 'off', 洗清: 'off', 脫水: 'off', 完成: 'off', 門上鎖: 'off' };
    const p = curPhase(m);
    if (m.state === 'running' && p && L[p] !== undefined) L[p] = 'on';
    if ((m.state === 'paused' || m.state === 'lidPaused') && p && L[p] !== undefined) L[p] = 'flash'; // 第20頁
    if (m.state === 'complete') L['完成'] = 'on'; // 第21、25頁
    if (m.anomaly === 'fill') L['洗衣'] = 'on'; // 第29頁
    if (m.anomaly === 'drain') L['脫水'] = 'on'; // 第30頁
    if (m.doorLocked) L['門上鎖'] = 'on'; // 第21頁
    if (m.drumSpinning || m.lidFlash) L['門上鎖'] = 'flash'; // 第32頁
    return L;
  }

  // 啟動／暫停鍵的按壓判定：按住滿 holdMs 觸發長按（取消），之後放開不得再觸發一次短按。
  // 以明確時間戳實作，方便自動測試。
  function createPressTracker(holdMs) {
    let downAt = null;
    let holdFired = false;
    return {
      down(t) { downAt = t; holdFired = false; },
      // 介面層在按住期間輪詢；回傳 'hold' 恰好一次
      tick(t) {
        if (downAt !== null && !holdFired && t - downAt >= holdMs) { holdFired = true; return 'hold'; }
        return null;
      },
      up(t) {
        if (downAt === null) return null;
        const short = !holdFired && t - downAt < holdMs;
        downAt = null;
        holdFired = false;
        return short ? 'short' : null;
      },
    };
  }

  const api = { KNOBS, CYCLES, phasesFor, rinseCount, createWasher, dispatch, lights, createPressTracker, HOLD_MS: 3000 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WASHER = api;
})(typeof window !== 'undefined' ? window : globalThis);
