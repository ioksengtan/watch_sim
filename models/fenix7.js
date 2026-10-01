// Garmin fēnix 7 的按鍵佈局與畫面狀態表。
// 與 Forerunner 255 同為五鍵邏輯，因此沿用 fr255 的畫面，只覆寫有差異的部分：
// 長按 BACK 回錶面、活動列表多了健行／登山與地圖、活動中多一頁地圖。
// 注意：此型號沒有對照手冊，內容依一般 fēnix 操作整理，需對照實錶校正。
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
  // 地圖畫面的 UP/DOWN 依目前模式有不同作用
  const mapMove = (dir) => ({
    label: (v) => [dir < 0 ? '放大' : '縮小', dir < 0 ? '地圖向上平移' : '地圖向下平移', dir < 0 ? '地圖向左平移' : '地圖向右平移'][v.mapMode],
    do: (api) => {
      const v = api.vars;
      if (v.mapMode === 0) v.mapZoom = clamp(v.mapZoom - dir, 0, SCALES.length - 1);
      else if (v.mapMode === 1) v.mapY -= dir;
      else v.mapX -= dir;
    },
  });

  const sports = ['健行', '登山', '越野跑', '跑步', '騎行', '泳池游泳'];

  const screens = Object.assign({}, base.screens, {
    activities: {
      title: '活動',
      type: 'list',
      items: sports.map((label) => ({ label, icon: '●', do: base.startSport(label) }))
        .concat([{ label: '地圖', icon: '▧', do: 'map' }]),
    },
    map: {
      title: '地圖',
      render: (v) => mapHtml(v, `<div class="caption">${MODES[v.mapMode]}模式 · START 切換</div>`),
      on: {
        'UP': mapMove(-1),
        'DOWN': mapMove(1),
        'START': { label: (v) => `切換成「${MODES[(v.mapMode + 1) % 3]}」模式`, do: (api) => { api.vars.mapMode = (api.vars.mapMode + 1) % 3; } },
      },
    },
    actRun: {
      title: '活動進行中',
      render: (v) => (v.act.page
        ? mapHtml(v, `<div class="caption">${v.act.name} ${clock(v.act.elapsed)} · 地圖頁</div>`)
        : `<div class="act"><small>${v.act.name} · 第 ${v.act.laps + 1} 圈</small><b>${clock(v.act.elapsed)}</b><small>距離 3.2 km · 爬升 412 m</small></div>`),
      on: Object.assign({}, base.screens.actRun.on, {
        'UP': { label: (v) => (v.act.page ? '切到資料頁' : '切到地圖頁'), do: (api) => { api.vars.act.page = !api.vars.act.page; } },
        'DOWN': { label: (v) => (v.act.page ? '切到資料頁' : '切到地圖頁'), do: (api) => { api.vars.act.page = !api.vars.act.page; } },
      }),
    },
  });

  window.WATCH_MODELS.fenix7 = {
    name: 'Garmin fēnix 7',
    home: base.home,
    buttons: [
      { id: 'LIGHT', angle: 210, key: 'l' },
      { id: 'UP', angle: 180, key: 'u', label: 'UP·MENU' },
      { id: 'DOWN', angle: 150, key: 'd' },
      { id: 'START', angle: 330, key: 's', label: 'START·STOP' },
      { id: 'BACK', angle: 30, key: 'b', label: 'BACK·LAP' },
    ],
    global: Object.assign({}, base.global, {
      'BACK:hold': { label: '從任何畫面直接回到錶面', do: (api) => api.home() },
    }),
    init: () => Object.assign(base.init(), { mapZoom: 2, mapMode: 0, mapX: 0, mapY: 0 }),
    tick: base.tick,
    screens,
  };
})();
