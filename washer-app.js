// 洗衣機模擬器介面層：把 washer-model.js 的狀態機接上 DOM。
(function () {
  'use strict';
  const W = window.WASHER;
  const $ = (id) => document.getElementById(id);

  let m = W.createWasher();
  const send = (ev) => { W.dispatch(m, ev); render(); };

  // ---- 旋鈕 ----
  const KNOB_CAPTIONS = {
    temp: '面板標示：需接熱水管',
    cycle: '檔位依手冊第22頁行程指南；原機檔位順序查無',
    level: '效果未實作（手冊圖文衝突）',
  };
  const knobEls = {};
  Object.entries(W.KNOBS).forEach(([key, def]) => {
    const el = document.createElement('div');
    el.className = 'knob';
    el.innerHTML = '<div class="name">' + def.name + '</div>' +
      '<button class="dial" type="button" aria-label="' + def.name + '（點一下轉到下一檔）"><span class="pointer"></span></button>' +
      '<div class="value"></div>' +
      (KNOB_CAPTIONS[key] ? '<div class="caption">' + KNOB_CAPTIONS[key] + '</div>' : '');
    el.querySelector('.dial').addEventListener('click', () => {
      send({ type: 'turnKnob', knob: key, value: (m.knobs[key] + 1) % def.options.length });
    });
    $('knobs').appendChild(el);
    knobEls[key] = el;
  });

  // ---- 燈號 ----
  const LIGHT_NAMES = ['進水', '洗衣', '洗清', '脫水', '完成', '門上鎖'];
  const ledEls = {};
  LIGHT_NAMES.forEach((name) => {
    const el = document.createElement('div');
    el.className = 'light' + (name === '門上鎖' ? ' lock' : '');
    el.innerHTML = '<span class="led"></span><span>' + name + '</span>';
    $('lights').appendChild(el);
    ledEls[name] = el.querySelector('.led');
  });

  // ---- 啟動／暫停：短按與按住滿3秒取消；長按觸發後放開不得再觸發短按 ----
  const tracker = W.createPressTracker(W.HOLD_MS);
  const startBtn = $('startBtn');
  let holdTimer = null;
  startBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startBtn.setPointerCapture(e.pointerId);
    startBtn.classList.add('down');
    tracker.down(Date.now());
    holdTimer = setTimeout(() => {
      if (tracker.tick(Date.now()) === 'hold') { startBtn.classList.remove('down'); send({ type: 'holdStart' }); }
    }, W.HOLD_MS);
  });
  const release = () => {
    clearTimeout(holdTimer);
    startBtn.classList.remove('down');
    if (tracker.up(Date.now()) === 'short') send({ type: 'pressStart' });
  };
  startBtn.addEventListener('pointerup', release);
  startBtn.addEventListener('pointercancel', release);

  // ---- 模擬器工具 ----
  $('lidBtn').addEventListener('click', () => send({ type: 'lid', open: !m.lidOpen }));
  $('advanceBtn').addEventListener('click', () => send({ type: 'advance' }));
  $('drumBtn').addEventListener('click', () => send({ type: 'drumStopped' }));
  $('tenMinBtn').addEventListener('click', () => send({ type: 'lidOpen10Min' }));
  $('fillAnomalyBtn').addEventListener('click', () => send({ type: 'anomaly', kind: 'fill' }));
  $('drainAnomalyBtn').addEventListener('click', () => send({ type: 'anomaly', kind: 'drain' }));
  $('resetBtn').addEventListener('click', () => { m = W.createWasher(); render(); });

  const STATE_NAMES = {
    idle: '待機（未喚醒）',
    settable: '可設定（再短按啟動／暫停開始）',
    running: '運轉中',
    paused: '已暫停（按鍵）',
    lidPaused: '已暫停（進水階段開蓋）',
    cancelled: '已取消（取消後燈號手冊查無）',
    drained: '已排水（開蓋暫停達10分鐘；後續燈號手冊查無）',
    complete: '行程完成',
  };

  function render() {
    Object.entries(W.KNOBS).forEach(([key, def]) => {
      const i = m.knobs[key];
      knobEls[key].querySelector('.value').textContent = def.options[i];
      // 檔位沿 300 度圓弧示意排列；原機刻度角度查無
      const angle = def.options.length > 1 ? -150 + (300 * i) / (def.options.length - 1) : 0;
      knobEls[key].querySelector('.pointer').style.transform = 'rotate(' + angle + 'deg)';
    });

    const L = W.lights(m);
    LIGHT_NAMES.forEach((name) => { ledEls[name].className = 'led ' + L[name]; });

    $('lidBtn').textContent = m.lidOpen ? '關上上蓋' : '打開上蓋';
    const phase = m.phases[m.phaseIndex];
    $('simState').textContent =
      '機器狀態：' + (STATE_NAMES[m.state] || m.state) +
      (phase && m.state !== 'complete' ? '，階段：' + phase : '') +
      '　｜　上蓋：' + (m.lidOpen ? '開' : '關') +
      '　｜　門鎖：' + (m.doorLocked ? '已上鎖' : '未上鎖') +
      (m.anomaly ? '　｜　異常情境：' + (m.anomaly === 'fill' ? '無法正常注水' : '10分鐘內無法排水') : '');
    $('message').textContent = m.message;
  }

  render();
})();
