const test = require('node:test');
const assert = require('node:assert/strict');
const ng = require('../src/core/nudge');

const MIN = 60 * 1000;
const TODAY = '2026-10-07';
const T0 = new Date(2026, 9, 7, 9, 0).getTime();
const half = () => 0.5; // 무작위 값을 고정해 테스트
const todo = (id, done = false) => ({ id, text: id, done, date: TODAY });

test('빈도별 무작위 간격: 보통은 90~120분, 끄기는 예약 안 함', () => {
  const n = ng.tick(ng.createNudge(), [todo('a')], TODAY, T0, half);
  assert.equal(n.nextAt, T0 + 105 * MIN);
  assert.equal(ng.setFreq(n, 'high', T0, () => 0).nextAt, T0 + 60 * MIN);
  assert.equal(ng.setFreq(n, 'low', T0, () => 1).nextAt, T0 + 180 * MIN);
  assert.equal(ng.setFreq(n, 'off', T0, half).nextAt, null);
});

test('시간이 되면 미완료 할 일 중 하나를 고르고, 완료된 일은 고르지 않음', () => {
  const list = [todo('done', true), todo('a'), todo('b')];
  let n = ng.tick(ng.createNudge(), list, TODAY, T0, half);
  assert.equal(ng.tick(n, list, TODAY, n.nextAt - 1, half).todoId, null);
  n = ng.tick(n, list, TODAY, n.nextAt, () => 0.99);
  assert.equal(n.todoId, 'b');
  // 보여주는 동안은 그대로 유지
  assert.equal(ng.tick(n, list, TODAY, n.nextAt + 10 * MIN, half).todoId, 'b');
});

test('미완료 할 일이 없으면 말풍선 없이 다음 간격까지 기다림', () => {
  let n = ng.tick(ng.createNudge(), [], TODAY, T0, half);
  n = ng.tick(n, [todo('x', true)], TODAY, n.nextAt, half);
  assert.equal(n.todoId, null);
  assert.ok(n.nextAt > T0 + 105 * MIN);
});

test('보여주던 할 일을 설정 창에서 완료하면 말풍선이 사라짐', () => {
  const n = { ...ng.createNudge(), todoId: 'a', nextAt: T0 };
  assert.equal(ng.tick(n, [todo('a', true)], TODAY, T0, half).todoId, null);
});

test('나중에: 30분 뒤 같은 할 일을 다시 물어봄', () => {
  const list = [todo('a'), todo('b'), todo('c')];
  const showing = { ...ng.createNudge(), todoId: 'b', nextAt: T0 };
  let n = ng.respond(showing, 'later', TODAY, T0, half);
  assert.equal(n.todoId, null);
  assert.equal(n.nextAt, T0 + 30 * MIN);
  n = ng.tick(n, list, TODAY, T0 + 30 * MIN, () => 0);
  assert.equal(n.todoId, 'b');
});

test('숨기기: 할 일은 그대로 미완료, 다음 정기 간격에 다시 후보', () => {
  const list = [todo('a')];
  const showing = { ...ng.createNudge(), todoId: 'a', nextAt: T0 };
  let n = ng.respond(showing, 'hide', TODAY, T0, half);
  assert.equal(n.todoId, null);
  assert.equal(n.nextAt, T0 + 105 * MIN);
  n = ng.tick(n, list, TODAY, n.nextAt, half);
  assert.equal(n.todoId, 'a');
});

test('오늘 끄기: 그날은 안 뜨고, 다음 날이나 다시 켜면 뜸', () => {
  const list = [todo('a')];
  const showing = { ...ng.createNudge(), todoId: 'a', nextAt: T0 };
  const off = ng.respond(showing, 'off', TODAY, T0, half);
  assert.equal(ng.tick(off, list, TODAY, T0 + 600 * MIN, half).todoId, null);
  assert.equal(ng.tick({ ...off, nextAt: T0 }, list, '2026-10-08', T0 + 1440 * MIN, half).todoId, 'a');
  const on = ng.turnOnToday(off, T0, half);
  assert.equal(on.offDate, null);
  assert.equal(on.nextAt, T0 + 105 * MIN);
});
