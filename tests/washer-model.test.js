// 洗衣機狀態機自動測試：node --test tests/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const W = require('../washer-model.js');

const fresh = () => W.createWasher();
const send = (m, ev) => W.dispatch(m, ev);
const cycleIdx = (name) => W.CYCLES.findIndex((c) => c.name === name);

test('示範起始設定：標準行程、標準髒度、自來水、一次洗清；上蓋關閉、未啟動', () => {
  const m = fresh();
  assert.equal(m.state, 'idle');
  assert.equal(W.KNOBS.cycle.options[m.knobs.cycle], '標準');
  assert.equal(W.KNOBS.soil.options[m.knobs.soil], '標準');
  assert.equal(W.KNOBS.temp.options[m.knobs.temp], '自來水');
  assert.equal(m.knobs.rinse, 0);
  assert.equal(m.lidOpen, false);
  assert.equal(m.doorLocked, false);
});

test('喚醒：第一次短按啟動／暫停只進入可設定，不開始洗衣', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  assert.equal(m.state, 'settable');
  // 喚醒燈號組合暫不映射：進度燈全滅
  const L = W.lights(m);
  ['進水', '洗衣', '洗清', '脫水', '完成', '門上鎖'].forEach((k) => assert.equal(L[k], 'off'));
});

test('喚醒：待機時轉動行程旋鈕也只進入可設定', () => {
  const m = fresh();
  send(m, { type: 'turnKnob', knob: 'cycle', value: cycleIdx('柔洗') });
  assert.equal(m.state, 'settable');
  assert.equal(W.KNOBS.cycle.options[m.knobs.cycle], '柔洗');
});

test('標準行程：進水→洗衣→洗清→脫水→完成；進水時門未鎖、其後上鎖', () => {
  const m = fresh();
  send(m, { type: 'pressStart' }); // 喚醒
  send(m, { type: 'pressStart' }); // 開始
  assert.equal(m.state, 'running');
  assert.deepEqual(m.phases, ['進水', '洗衣', '洗清', '脫水']);
  assert.equal(m.doorLocked, false);
  assert.equal(W.lights(m)['進水'], 'on');
  send(m, { type: 'advance' });
  assert.equal(m.phases[m.phaseIndex], '洗衣');
  assert.equal(m.doorLocked, true);
  assert.equal(W.lights(m)['洗衣'], 'on');
  assert.equal(W.lights(m)['門上鎖'], 'on');
  send(m, { type: 'advance' });
  send(m, { type: 'advance' });
  assert.equal(m.phases[m.phaseIndex], '脫水');
  send(m, { type: 'advance' });
  assert.equal(m.state, 'complete');
  assert.equal(W.lights(m)['完成'], 'on');
  assert.equal(m.doorLocked, false);
});

test('二次洗清檔位會產生兩個洗清階段', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  send(m, { type: 'turnKnob', knob: 'rinse', value: 1 }); // 二次洗清（自動偵測水位）
  send(m, { type: 'pressStart' });
  assert.deepEqual(m.phases, ['進水', '洗衣', '洗清', '洗清', '脫水']);
});

test('單獨浸泡：進水→浸泡→排水，不進入脫水；浸泡階段燈號查無則不點進度燈', () => {
  const m = fresh();
  send(m, { type: 'turnKnob', knob: 'cycle', value: cycleIdx('單獨浸泡') });
  send(m, { type: 'pressStart' });
  assert.deepEqual(m.phases, ['進水', '浸泡', '排水']);
  assert.ok(!m.phases.includes('脫水'));
  send(m, { type: 'advance' }); // 浸泡
  const L = W.lights(m);
  ['進水', '洗衣', '洗清', '脫水', '完成'].forEach((k) => assert.equal(L[k], 'off'));
  send(m, { type: 'advance' }); // 排水
  send(m, { type: 'advance' });
  assert.equal(m.state, 'complete');
});

test('單獨脫水：只有脫水階段，不加洗衣或洗清', () => {
  const m = fresh();
  send(m, { type: 'turnKnob', knob: 'cycle', value: cycleIdx('單獨脫水') });
  send(m, { type: 'pressStart' });
  assert.deepEqual(m.phases, ['脫水']);
});

test('洗清&脫水：不加洗衣步驟；二次洗清也適用', () => {
  const m = fresh();
  send(m, { type: 'turnKnob', knob: 'cycle', value: cycleIdx('洗清&脫水') });
  send(m, { type: 'turnKnob', knob: 'rinse', value: 3 });
  send(m, { type: 'pressStart' });
  assert.deepEqual(m.phases, ['進水', '洗清', '洗清', '脫水']);
});

test('冷水洗衣：水溫不是冷水時不執行（面板外說明，不編造錯誤）', () => {
  const m = fresh();
  send(m, { type: 'turnKnob', knob: 'cycle', value: cycleIdx('冷水洗衣') });
  send(m, { type: 'pressStart' }); // 水溫仍是示範設定的自來水
  assert.equal(m.state, 'settable');
  assert.match(m.message, /僅允許冷水/);
  send(m, { type: 'turnKnob', knob: 'temp', value: W.KNOBS.temp.options.indexOf('冷水') });
  send(m, { type: 'pressStart' });
  assert.equal(m.state, 'running');
});

test('上蓋未關不能啟動：門上鎖燈閃爍', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  send(m, { type: 'lid', open: true });
  send(m, { type: 'pressStart' });
  assert.equal(m.state, 'settable');
  assert.equal(W.lights(m)['門上鎖'], 'flash');
  send(m, { type: 'lid', open: false }); // 關蓋後閃爍解除
  assert.equal(W.lights(m)['門上鎖'], 'off');
});

test('暫停與繼續：進度燈閃爍；鎖住時門上鎖閃爍、槽停止後才解鎖；繼續不從頭重跑', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  send(m, { type: 'pressStart' });
  send(m, { type: 'advance' }); // 洗衣（已上鎖）
  send(m, { type: 'advance' }); // 洗清
  send(m, { type: 'pressStart' }); // 暫停
  assert.equal(m.state, 'paused');
  assert.equal(W.lights(m)['洗清'], 'flash');
  assert.equal(W.lights(m)['門上鎖'], 'flash'); // 暫停後仍在旋轉
  assert.equal(m.doorLocked, true);
  send(m, { type: 'lid', open: true }); // 未解鎖不可開蓋
  assert.equal(m.lidOpen, false);
  send(m, { type: 'drumStopped' });
  assert.equal(m.doorLocked, false);
  assert.equal(W.lights(m)['門上鎖'], 'off');
  // 添加柔軟精流程：開蓋、關蓋、再短按繼續
  send(m, { type: 'lid', open: true });
  assert.equal(m.lidOpen, true);
  send(m, { type: 'pressStart' }); // 開蓋時按鍵不會續行
  assert.equal(m.state, 'paused');
  send(m, { type: 'lid', open: false });
  send(m, { type: 'pressStart' });
  assert.equal(m.state, 'running');
  assert.equal(m.phases[m.phaseIndex], '洗清'); // 從暫停前階段續行
});

test('進水階段開蓋會暫停、關蓋自動續行；達10分鐘排水後停住', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  send(m, { type: 'pressStart' }); // 進水中、門未鎖
  send(m, { type: 'lid', open: true });
  assert.equal(m.state, 'lidPaused');
  assert.equal(W.lights(m)['進水'], 'flash');
  send(m, { type: 'lid', open: false });
  assert.equal(m.state, 'running');
  assert.equal(m.phases[m.phaseIndex], '進水');
  // 再開蓋並達10分鐘
  send(m, { type: 'lid', open: true });
  send(m, { type: 'lidOpen10Min' });
  assert.equal(m.state, 'drained');
  assert.notEqual(m.state, 'complete'); // 不自動視為完成
});

test('按住3秒取消：行程清除；取消後可重新喚醒設定', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  send(m, { type: 'pressStart' });
  send(m, { type: 'advance' }); // 洗衣（上鎖）
  send(m, { type: 'holdStart' });
  assert.equal(m.state, 'cancelled');
  assert.equal(m.phases.length, 0);
  assert.equal(W.lights(m)['洗衣'], 'off'); // 進度燈熄滅
  assert.equal(W.lights(m)['門上鎖'], 'flash'); // 仍待槽停止
  send(m, { type: 'drumStopped' });
  assert.equal(m.doorLocked, false);
  send(m, { type: 'pressStart' }); // 取消後重新喚醒
  assert.equal(m.state, 'settable');
});

test('長按取消後不可再觸發一次短按（按壓判定器）', () => {
  const t = W.createPressTracker(3000);
  t.down(0);
  assert.equal(t.tick(3000), 'hold'); // 滿3秒觸發長按
  assert.equal(t.up(3500), null); // 放開不得再算一次短按
  t.down(10000);
  assert.equal(t.tick(10500), null);
  assert.equal(t.up(11000), 'short'); // 未滿3秒放開＝短按
});

test('運轉中變更設定不實作：旋鈕維持原位', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  send(m, { type: 'pressStart' });
  const before = m.knobs.temp;
  send(m, { type: 'turnKnob', knob: 'temp', value: 0 });
  assert.equal(m.knobs.temp, before);
  assert.match(m.message, /不實作/);
});

test('水位選擇旋鈕：可轉動但明示效果未實作，不改變行程', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  send(m, { type: 'turnKnob', knob: 'level', value: 1 });
  assert.match(m.message, /未實作/);
  send(m, { type: 'pressStart' });
  assert.deepEqual(m.phases, ['進水', '洗衣', '洗清', '脫水']); // 與自動偵測相同
});

test('異常：無法正常注水→洗衣燈亮；10分鐘內無法排水→脫水燈一直亮；不自動恢復', () => {
  const m = fresh();
  send(m, { type: 'pressStart' });
  send(m, { type: 'pressStart' }); // 進水
  send(m, { type: 'anomaly', kind: 'drain' }); // 階段不符，不得注入
  assert.equal(m.anomaly, null);
  send(m, { type: 'anomaly', kind: 'fill' });
  assert.equal(m.anomaly, 'fill');
  assert.equal(W.lights(m)['洗衣'], 'on');
  send(m, { type: 'pressStart' }); // 異常中按鍵不恢復
  assert.equal(m.anomaly, 'fill');

  const m2 = fresh();
  send(m2, { type: 'pressStart' });
  send(m2, { type: 'turnKnob', knob: 'cycle', value: cycleIdx('單獨脫水') });
  send(m2, { type: 'pressStart' }); // 脫水
  send(m2, { type: 'anomaly', kind: 'drain' });
  assert.equal(W.lights(m2)['脫水'], 'on');
});

test('行程表全列：12個手冊行程都可選、都能啟動並走到完成', () => {
  assert.equal(W.CYCLES.length, 12);
  W.CYCLES.forEach((c, i) => {
    const m = fresh();
    send(m, { type: 'turnKnob', knob: 'cycle', value: i });
    if (c.coldOnly) send(m, { type: 'turnKnob', knob: 'temp', value: W.KNOBS.temp.options.indexOf('冷水') });
    send(m, { type: 'pressStart' });
    assert.equal(m.state, 'running', c.name + ' 應可啟動');
    for (let g = 0; g < 10 && m.state === 'running'; g++) send(m, { type: 'advance' });
    assert.equal(m.state, 'complete', c.name + ' 應可走到完成');
  });
});

test('不存在「白色」行程檔位（未實作，不以其他行程代換）', () => {
  assert.ok(!W.KNOBS.cycle.options.includes('白色'));
});
