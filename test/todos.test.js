const test = require('node:test');
const assert = require('node:assert/strict');
const td = require('../src/core/todos');

const TODAY = '2026-10-07';
const YESTERDAY = '2026-10-06';

test('할 일 추가: 개수 제한 없음, 빈 값·너무 긴 값 거부', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = td.addTodo(list, `  일 ${i} `, TODAY, 1000 + i);
  assert.equal(list.length, 12);
  assert.equal(list[0].text, '일 0');
  assert.equal(list[0].done, false);
  assert.equal(new Set(list.map((t) => t.id)).size, 12);
  assert.throws(() => td.addTodo(list, '   ', TODAY, 1));
  assert.throws(() => td.addTodo(list, 'x'.repeat(101), TODAY, 1));
});

test('완료 ↔ 미완료 전환, 삭제', () => {
  let list = td.addTodo([], '보고서', TODAY, 1);
  const id = list[0].id;
  list = td.toggleTodo(list, id);
  assert.equal(list[0].done, true);
  list = td.toggleTodo(list, id);
  assert.equal(list[0].done, false);
  assert.deepEqual(td.removeTodo(list, id), []);
});

test('다음 근무일: 못 끝낸 일만 후보, 가져오기/새로 시작', () => {
  let list = td.addTodo([], '어제 끝냄', YESTERDAY, 1);
  list = td.toggleTodo(list, list[0].id);
  list = td.addTodo(list, '어제 못 끝냄', YESTERDAY, 2);
  list = td.addTodo(list, '오늘 일', TODAY, 3);

  assert.deepEqual(td.leftovers(list, TODAY).map((t) => t.text), ['어제 못 끝냄']);

  const carried = td.startNewDay(list, TODAY, true);
  assert.deepEqual(carried.map((t) => t.text), ['어제 못 끝냄', '오늘 일']);
  assert.ok(carried.every((t) => t.date === TODAY));
  assert.deepEqual(td.leftovers(carried, TODAY), []);

  const fresh = td.startNewDay(list, TODAY, false);
  assert.deepEqual(fresh.map((t) => t.text), ['오늘 일']);
});
