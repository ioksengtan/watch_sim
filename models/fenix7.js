// Garmin fēnix 7 的按鍵佈局與畫面狀態表。
// 與 Forerunner 255 同為五鍵邏輯，因此沿用 fr255 的畫面，只覆寫有差異的部分。
// 已對照官方手冊（fēnix 7 Standard/Solar/Pro Series Owner's Manual）的
// Device Overview、Starting/Stopping an Activity、Viewing the Map：
//   - 長按 BACK：開啟最近使用的應用程式列表
//   - 地圖：START > 地圖，或活動中 UP/DOWN 捲到地圖頁；
//     長按 MENU > 平移／縮放 後，UP/DOWN 動作、START 切換模式、長按 START 選取準星位置
// 手冊未列出的部分（選單順序、預設活動、最近應用程式內容）為推測。
(function () {
  const base = window.WATCH_MODELS.fr255;
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;

  const SCALES = ['5 km', '2 km', '800 m', '300 m', '120 m'];
  const MODES = ['縮放', '上下平移', '左右平移'];
  const mapHtml = (v, extra) =>
    `<div class="map" style="--z:${v.mapZoom + 1};--x:${v.mapX * 30}px;--y:${v.mapY * 30}px">` +
    `<div class="track"></div><div class="me">▲</div><div class="scale">${SCALES[v.mapZoom]}</div>${extra}</div>`;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  // 平移／縮放模式下 UP/DOWN 依目前模式有不同作用
  const mapMove = (dir) => ({
    label: (v) => [dir < 0 ? '放大' : '縮小', dir < 0 ? '地圖向上平移' : '地圖向下平移', dir < 0 ? '地圖向左平移' : '地圖向右平移'][v.mapMode],
    do: (api) => {
      const v = api.vars;
      if (v.mapMode === 0) v.mapZoom = clamp(v.mapZoom - dir, 0, SCALES.length - 1);
      else if (v.mapMode === 1) v.mapY -= dir;
      else v.mapX -= dir;
    },
  });
  const panZoomItem = { label: '平移／縮放', icon: '✥', do: (api) => { api.vars.mapMode = 0; api.replace('mapPan'); } };
  const togglePage = { label: (v) => (v.act.page ? '切到資料頁' : '切到地圖頁'), do: (api) => { api.vars.act.page = !api.vars.act.page; } };

  const sports = ['健行', '登山', '越野跑', '跑步', '騎行', '泳池游泳'];

  const screens = Object.assign({}, base.screens, {
    activities: {
      title: '活動',
      type: 'list',
      items: sports.map((label) => ({ label, icon: '●', do: base.startSport(label) }))
        .concat([{ label: '地圖', icon: '▧', do: 'map' }]),
    },
    recent: {
      title: '最近使用',
      type: 'list',
      items: [{ label: '地圖', icon: '▧', do: 'map' }, { label: '健行', icon: '●', do: base.startSport('健行') }, { label: '碼錶', icon: '⏱' }],
    },

    // ---- 地圖 ----
    map: {
      title: '地圖',
      render: (v) => mapHtml(v, '<div class="caption">長按 MENU › 平移／縮放</div>'),
      on: {
        'UP:hold': { label: '打開地圖選單（平移／縮放從這裡進）', do: 'mapMenu' },
      },
    },
    mapMenu: {
      title: '地圖選單',
      type: 'list',
      items: [panZoomItem, { label: '地圖設定', icon: '⚙' }],
    },
    mapPan: {
      title: '平移／縮放',
      render: (v) => mapHtml(v, `<div class="cross">＋</div><div class="caption">${MODES[v.mapMode]} · START 切換</div>`),
      on: {
        'UP': mapMove(-1),
        'DOWN': mapMove(1),
        'START': { label: (v) => `切換成「${MODES[(v.mapMode + 1) % 3]}」模式`, do: (api) => { api.vars.mapMode = (api.vars.mapMode + 1) % 3; } },
        'START:hold': { label: '選取準星所指的位置', do: (api) => api.toast('已選取位置（可儲存或導航，模擬器未實作）') },
        'BACK': { label: '離開平移／縮放', do: (api) => api.pop() },
      },
    },

    // ---- 活動：多一頁地圖 ----
    actRun: {
      title: '活動進行中',
      render: (v) => (v.act.page
        ? mapHtml(v, `<div class="caption">${v.act.name} ${clock(v.act.elapsed)} · 地圖頁</div>`)
        : `<div class="act"><small>${v.act.name} · 第 ${v.act.laps + 1} 圈</small><b>${clock(v.act.elapsed)}</b><small>距離 3.2 km · 爬升 412 m</small></div>`),
      on: Object.assign({}, base.screens.actRun.on, { 'UP': togglePage, 'DOWN': togglePage }),
    },
    actMenu: {
      title: '活動選單',
      type: 'list',
      items: [panZoomItem].concat(base.screens.actMenu.items),
    },
  });

  window.WATCH_MODELS.fenix7 = {
    name: 'Garmin fēnix 7',
    home: base.home,
    buttons: [
      // 角度量自手冊 Device Overview 機身圖；START 鍵帶紅色環
      { id: 'LIGHT', angle: 211, key: 'l' },
      { id: 'UP', angle: 180, key: 'u', label: 'UP·MENU' },
      { id: 'DOWN', angle: 150, key: 'd' },
      { id: 'START', angle: 331, key: 's', label: 'START·STOP', color: 'linear-gradient(90deg,#3a3e44 45%,#e0564a 45% 70%,#3a3e44 70%)' },
      { id: 'BACK', angle: 29, key: 'b', label: 'BACK·LAP' },
    ],
    labelRadius: 154, // 按鍵名刻在較窄的金屬錶圈上
    global: Object.assign({}, base.global, {
      'BACK:hold': { label: '打開最近使用的應用程式列表', do: 'recent' },
    }),
    init: () => Object.assign(base.init(), { mapZoom: 2, mapMode: 0, mapX: 0, mapY: 0 }),
    tick: base.tick,
    screens,
  };
})();
