// Garmin Forerunner 255 的按鍵布局與畫面狀態表。
// 引擎（engine.js）不含任何型號知識；新增型號只需再寫一份同結構的資料。
//
// 畫面定義：
//   type: 'list'  -> items: [{ label, icon, do }]，UP/DOWN 移動、START 選擇、BACK 返回（引擎預設）
//   type: 'info'  -> body: 字串或 (vars) => 字串
//   render(vars)  -> 自繪畫面（錶面、活動計時等）
//   on: { 'KEY' | 'KEY:hold': { label, do } }  覆蓋預設行為
// do 為字串時表示「進入該畫面」，為函數時收到 api（push/pop/home/replace/toast/vars）。
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;

  const faces = [
    { name: '數字', render: (d) => `<div class="face face-digital"><small>${d.date}</small><b>${d.hm}</b><small>♥ 62 · 🔋 78%</small></div>` },
    { name: '大字', render: (d) => `<div class="face face-big"><b>${d.h}</b><b class="accent">${d.m}</b></div>` },
    { name: '資料', render: (d) => `<div class="face face-data"><small>步數 6,482</small><b>${d.hm}</b><small>${d.date} · 身體能量 71</small></div>` },
  ];
  const now = () => {
    const t = new Date();
    const h = pad(t.getHours()), m = pad(t.getMinutes());
    return { h, m, hm: `${h}:${m}`, date: `${t.getMonth() + 1}/${t.getDate()} 週${'日一二三四五六'[t.getDay()]}` };
  };

  const glances = [
    ['心率', '♥', '當前 62 bpm\n靜息 51 bpm'],
    ['HRV 狀態', '〰', '7 日平均 58 ms\n均衡'],
    ['身體能量', '⚡', '71\n今日 +45 / -32'],
    ['訓練狀態', '▲', '高效\nVO2 Max 52'],
    ['步數', '👣', '6,482 / 8,000'],
    ['天氣', '☀', '26° 晴\n最高 29° 最低 21°'],
    ['通知', '✉', '沒有新通知'],
    ['日曆', '▦', '今天沒有行程'],
  ];

  const sports = ['跑步', '跑步機', '騎行', '泳池游泳', '鐵人三項', '力量訓練'];
  const startSport = (name) => (api) => {
    api.vars.act = { name, running: false, elapsed: 0, laps: 0 };
    api.push('actReady');
  };

  const screens = {
    watchface: {
      title: '錶面',
      render: (v) => faces[v.face].render(now()),
      on: {
        'UP': { label: '進入小工具一覽（從最後一項）', do: (api) => api.push('glances', glances.length - 1) },
        'DOWN': { label: '進入小工具一覽（從第一項）', do: 'glances' },
        'START': { label: '打開活動列表', do: 'activities' },
        'UP:hold': { label: '打開主選單（換錶面從這裡進）', do: 'menu' },
      },
    },

    // ---- 小工具一覽 ----
    glances: {
      title: '小工具一覽',
      type: 'list',
      wrapHome: true, // 滾出首尾會回到錶面
      items: glances.map(([label, icon], i) => ({ label, icon, do: 'glance' + i })),
    },

    // ---- 主選單（錶面長按 UP）----
    menu: {
      title: '主選單',
      type: 'list',
      items: [
        { label: '錶面', icon: '◷', do: (api) => { api.vars.preview = api.vars.face; api.push('wfPick'); } },
        { label: '時鐘', icon: '⏰', do: 'clocks' },
        { label: '歷史記錄', icon: '↺' },
        { label: '訓練', icon: '▲' },
        { label: '導航', icon: '➤' },
        { label: '活動與應用', icon: '🏃' },
        { label: '外觀', icon: '◐', do: 'appearance' },
        { label: '通知與提醒', icon: '✉' },
        { label: '感測器與配件', icon: '⌁' },
        { label: '健康與保健', icon: '♥' },
        { label: '地圖', icon: '▧' },
        { label: '電源管理', icon: '🔋' },
        { label: '音樂', icon: '♫' },
        { label: '連接', icon: '⇄' },
        { label: '安全與追蹤', icon: '⛑' },
        { label: '使用者資料', icon: '☺' },
        { label: '系統', icon: '⚙' },
      ],
    },
    wfPick: {
      title: '選擇錶面',
      render: (v) => faces[v.preview].render(now()) + `<div class="caption">${faces[v.preview].name} ${v.preview + 1}/${faces.length}</div>`,
      on: {
        'UP': { label: '預覽上一個錶面', do: (api) => { api.vars.preview = (api.vars.preview - 1 + faces.length) % faces.length; } },
        'DOWN': { label: '預覽下一個錶面', do: (api) => { api.vars.preview = (api.vars.preview + 1) % faces.length; } },
        'START': { label: '選定此錶面', do: 'wfOpts' },
      },
    },
    wfOpts: {
      title: '錶面選項',
      type: 'list',
      items: [
        { label: '套用', icon: '✓', do: (api) => { api.vars.face = api.vars.preview; api.home(); api.toast('已套用錶面「' + faces[api.vars.face].name + '」'); } },
        { label: '自訂', icon: '✎' },
      ],
    },
    clocks: {
      title: '時鐘',
      type: 'list',
      items: [{ label: '鬧鐘', icon: '⏰' }, { label: '計時器', icon: '⏳' }, { label: '碼錶', icon: '⏱' }, { label: '備用時區', icon: '🌐' }],
    },
    appearance: {
      title: '外觀',
      type: 'list',
      items: [{ label: '小工具', icon: '▤' }, { label: '控制選單', icon: '☰' }],
    },

    // ---- 控制選單（任意畫面長按 LIGHT）----
    controls: {
      title: '控制選單',
      type: 'list',
      items: [
        { label: '關機', icon: '◯' }, { label: '勿擾模式', icon: '☾' }, { label: '尋找手機', icon: '☎' },
        { label: '鎖定裝置', icon: '🔒' }, { label: '同步', icon: '⟳' }, { label: '碼錶', icon: '⏱' },
        { label: '計時器', icon: '⏳' }, { label: '背光', icon: '☼' }, { label: '音樂', icon: '♫', do: 'music' },
        { label: '錢包', icon: '▭' }, { label: '儲存位置', icon: '⚑' }, { label: '睡眠模式', icon: '☽' },
      ],
    },
    music: { title: '音樂控制', type: 'info', body: '♫\n未在播放\n（手機音樂控制）' },

    // ---- 活動 ----
    activities: {
      title: '活動',
      type: 'list',
      items: sports.map((label) => ({ label, icon: '●', do: startSport(label) })),
    },
    actReady: {
      title: '活動準備',
      render: (v) => `<div class="act"><small>${v.act.name}</small><b>00:00</b><small class="accent">GPS 就緒 · 按 START 開始</small></div>`,
      on: {
        'START': { label: '開始計時', do: (api) => { api.vars.act.running = true; api.replace('actRun'); } },
      },
    },
    actRun: {
      title: '活動進行中',
      render: (v) => `<div class="act"><small>${v.act.name} · 第 ${v.act.laps + 1} 圈</small><b>${clock(v.act.elapsed)}</b><small>配速 5:32 /km · ♥ 148</small></div>`,
      on: {
        'START': { label: '停止計時（進入暫停選單）', do: (api) => { api.vars.act.running = false; api.replace('actPaused'); } },
        'BACK': { label: '計圈', do: (api) => { api.vars.act.laps++; api.toast('第 ' + api.vars.act.laps + ' 圈'); } },
        'UP': { label: '上一個資料頁', do: (api) => api.toast('切換資料頁（模擬器只有一頁）') },
        'DOWN': { label: '下一個資料頁', do: (api) => api.toast('切換資料頁（模擬器只有一頁）') },
        'UP:hold': { label: '打開活動選單（可切換運動）', do: 'actMenu' },
      },
    },
    actMenu: {
      title: '活動選單',
      type: 'list',
      items: [{ label: '切換運動', icon: '⇆' }, { label: '活動設定', icon: '⚙' }],
    },
    actPaused: {
      title: '已暫停',
      type: 'list',
      items: [
        { label: '繼續', icon: '▶', do: (api) => { api.vars.act.running = true; api.replace('actRun'); } },
        { label: '儲存', icon: '✓', do: (api) => { api.home(); api.toast('活動已儲存'); } },
        { label: '稍後繼續', icon: '⏸' },
        { label: '計圈', icon: '↻' },
        { label: '返回起點', icon: '⌂' },
        { label: '恢復心率', icon: '♥' },
        { label: '放棄', icon: '✕', do: (api) => { api.home(); api.toast('活動已放棄'); } },
      ],
      on: {
        'BACK': { label: '繼續活動', do: (api) => { api.vars.act.running = true; api.replace('actRun'); } },
      },
    },
  };

  glances.forEach(([title, icon, body], i) => {
    screens['glance' + i] = { title, type: 'info', body: icon + '\n' + body };
  });

  window.WATCH_MODELS = window.WATCH_MODELS || {};
  window.WATCH_MODELS.fr255 = {
    name: 'Garmin Forerunner 255',
    startSport,
    home: 'watchface',
    // angle：以 3 點鐘方向為 0°、順時針為正
    buttons: [
      // 角度量自手冊 Overview 機身圖
      { id: 'LIGHT', angle: 207, key: 'l' },
      { id: 'UP', angle: 180, key: 'u' },
      { id: 'DOWN', angle: 153, key: 'd' },
      { id: 'START', angle: 333, key: 's', color: '#d0312d', label: '<i>START</i> STOP' },
      { id: 'BACK', angle: 27, key: 'b' },
    ],
    // 任意畫面都有效的長按熱鍵（畫面自身的 on 優先）
    global: {
      'LIGHT:hold': { label: '打開控制選單', do: 'controls' },
      'DOWN:hold': { label: '打開音樂控制', do: 'music' },
    },
    init: () => ({ face: 0, preview: 0, act: null }),
    tick: (v) => { if (v.act && v.act.running) v.act.elapsed++; },
    screens,
  };
})();
