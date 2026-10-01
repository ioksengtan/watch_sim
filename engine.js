// 通用狀態機引擎：讀取 window.WATCH_MODELS 裡的型號資料，處理按鍵與渲染。
(function () {
  const modelId = new URLSearchParams(location.search).get('model');
  const model = window.WATCH_MODELS[modelId] || window.WATCH_MODELS.fr255;
  const HOLD_MS = 600;
  const $ = (id) => document.getElementById(id);

  const s = { stack: [model.home], cursor: {}, vars: model.init(), log: '點擊手錶四周的按鍵；按住 0.6 秒算長按。' };
  const curId = () => s.stack[s.stack.length - 1];
  const cur = () => model.screens[curId()];

  const api = {
    vars: s.vars,
    push(id, cursor = 0) { s.cursor[id] = cursor; s.stack.push(id); },
    pop() { if (s.stack.length > 1) s.stack.pop(); },
    home() { s.stack = [model.home]; },
    replace(id) { s.stack.pop(); api.push(id); },
    toast(msg) { s.toast = msg; },
  };
  const text = (label) => (typeof label === 'function' ? label(s.vars) : label);
  const run = (act) => (typeof act === 'string' ? api.push(act) : act(api));

  // 當前畫面下按鍵 k（如 'UP' 或 'UP:hold'）會做什麼；無作用時返回 null。
  // 提示面板與實際執行共用這一份邏輯。
  function resolve(k) {
    const scr = cur(), id = curId();
    if (scr.on && scr.on[k]) return { label: text(scr.on[k].label), run: () => run(scr.on[k].do) };
    const g = model.global[k];
    if (g && g.do !== id) return { label: g.label, run: () => run(g.do) };
    if (scr.type === 'list') {
      const n = scr.items.length, c = s.cursor[id] || 0;
      const move = (d) => () => {
        if (scr.wrapHome && (c + d < 0 || c + d >= n)) api.home();
        else s.cursor[id] = (c + d + n) % n;
      };
      if (k === 'UP') return { label: scr.wrapHome && c === 0 ? '回到錶面' : '上一項', run: move(-1) };
      if (k === 'DOWN') return { label: scr.wrapHome && c === n - 1 ? '回到錶面' : '下一項', run: move(1) };
      if (k === 'START') {
        const it = scr.items[c];
        return { label: `選擇「${it.label}」`, run: () => (it.do ? run(it.do) : api.toast(`「${it.label}」模擬器尚未實作`)) };
      }
    }
    if (k === 'BACK' && s.stack.length > 1) return { label: '返回上一畫面', run: api.pop };
    if (k === 'LIGHT') return { label: '開啟背光', run: flash };
    return null;
  }

  function flash() {
    $('screen').classList.add('lit');
    setTimeout(() => $('screen').classList.remove('lit'), 1500);
  }

  function press(btn, hold) {
    const k = hold ? btn + ':hold' : btn;
    const r = resolve(k);
    s.toast = '';
    if (r) r.run();
    s.log = `${hold ? '長按' : '短按'} ${btn} → ${r ? r.label : '此畫面無作用'}${s.toast ? '（' + s.toast + '）' : ''}`;
    render();
  }

  function renderScreen() {
    const scr = cur(), id = curId();
    if (scr.render) return scr.render(s.vars);
    if (scr.type === 'list') {
      const n = scr.items.length, c = s.cursor[id] || 0;
      const row = (i, cls) => {
        const it = scr.items[i];
        return it ? `<div class="row ${cls}"><span>${it.icon || ''}</span>${it.label}</div>` : `<div class="row ${cls}"></div>`;
      };
      const at = (d) => (scr.wrapHome ? c + d : (c + d + n) % n);
      return `<div class="list"><div class="title">${scr.title}</div>${row(at(-1), 'dim')}${row(c, 'sel')}${row(at(1), 'dim')}<div class="pos">${c + 1}/${n}</div></div>`;
    }
    const body = typeof scr.body === 'function' ? scr.body(s.vars) : scr.body;
    return `<div class="info"><div class="title">${scr.title}</div><div class="body">${body.replace(/\n/g, '<br>')}</div></div>`;
  }

  function render() {
    $('screen').innerHTML = renderScreen();
    $('path').textContent = s.stack.map((id) => model.screens[id].title).join(' › ');
    $('log').textContent = s.log;
    // 每顆鍵旁邊的說明：當前畫面下短按／長按各會做什麼
    model.buttons.forEach((b) => {
      const line = (name, k) => { const r = resolve(k); return `<div class="${r ? '' : 'none'}"><span>${name}</span>${r ? r.label : '無作用'}</div>`; };
      tips[b.id].innerHTML = `<b>${b.label || b.id}</b>${line('短按', b.id)}${line('長按', b.id + ':hold')}`;
    });
  }
  const tips = {};

  // 依型號資料把按鍵擺到錶圈上
  function buildButtons() {
    const watch = $('watch');
    model.buttons.forEach((b) => {
      const rad = (b.angle * Math.PI) / 180;
      const at = (r) => `left:calc(50% + ${Math.cos(rad) * r}px);top:calc(50% + ${Math.sin(rad) * r}px);`;
      const el = document.createElement('button');
      el.className = 'btn';
      el.style.cssText = at(175) +`transform:translate(-50%,-50%) rotate(${b.angle}deg);` + (b.color ? `background:${b.color};` : '');
      el.setAttribute('aria-label', b.id);
      // 標示印在錶圈內側、沿圓弧排列；下半圈的字翻轉 180° 以保持可讀
      const label = document.createElement('div');
      label.className = 'btn-label';
      const rot = b.angle + 90 - (Math.sin(rad) > 0.01 ? 180 : 0);
      label.style.cssText = at(136) + `transform:translate(-50%,-50%) rotate(${rot}deg);`;
      label.innerHTML = b.label || b.id;
      const tip = document.createElement('div');
      tip.className = 'tip';
      // 說明框排在手錶左右兩側，縱向比按鍵稍微拉開以免互相重疊
      tip.style.cssText = `${Math.cos(rad) < 0 ? 'right' : 'left'}:calc(50% + 194px);top:calc(50% + ${Math.sin(rad) * 250}px);`;
      tips[b.id] = tip;
      watch.append(el, label, tip);

      let timer = null;
      const cancel = () => { clearTimeout(timer); timer = null; el.classList.remove('down'); };
      el.addEventListener('pointerdown', () => {
        el.classList.add('down');
        timer = setTimeout(() => { cancel(); press(b.id, true); }, HOLD_MS);
      });
      el.addEventListener('pointerup', () => { if (timer) { cancel(); press(b.id, false); } });
      el.addEventListener('pointerleave', cancel);
    });
    // 鍵盤：按鍵首字母為短按，Shift+字母為長按
    document.addEventListener('keydown', (e) => {
      const b = model.buttons.find((x) => x.key === e.key.toLowerCase());
      if (b && !e.repeat) press(b.id, e.shiftKey);
    });
  }

  const pick = $('model');
  Object.entries(window.WATCH_MODELS).forEach(([id, m]) => pick.add(new Option(m.name, id, false, m === model)));
  pick.addEventListener('change', () => { location.search = '?model=' + pick.value; });
  $('watch').classList.add(Object.keys(window.WATCH_MODELS).find((id) => window.WATCH_MODELS[id] === model));
  buildButtons();
  render();
  setInterval(() => { model.tick(s.vars); render(); }, 1000);
})();
