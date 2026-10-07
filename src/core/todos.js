// 오늘의 할 일 순수 로직 (Electron 의존성 없음)
// 할 일: { id, text, done, createdAt, date }  date = 근무일 'YYYY-MM-DD'

const MAX_TEXT = 100;

function addTodo(todos, text, today, nowMs) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('할 일을 입력해 주세요.');
  if (t.length > MAX_TEXT) throw new Error(`할 일은 ${MAX_TEXT}자까지 쓸 수 있어요.`);
  const id = `${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return [...todos, { id, text: t, done: false, createdAt: nowMs, date: today }];
}

function toggleTodo(todos, id) {
  return todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

function removeTodo(todos, id) {
  return todos.filter((t) => t.id !== id);
}

function todayTodos(todos, today) {
  return todos.filter((t) => t.date === today);
}

// 지난 근무일에 끝내지 못한 할 일 (오늘로 가져올지 물어볼 후보)
function leftovers(todos, today) {
  return todos.filter((t) => t.date !== today && !t.done);
}

// 새 근무일 정리: carry=true면 못 끝낸 일을 오늘로 가져오고, 지난 기록은 비운다
function startNewDay(todos, today, carry) {
  return todos.flatMap((t) => {
    if (t.date === today) return [t];
    if (carry && !t.done) return [{ ...t, date: today }];
    return [];
  });
}

module.exports = { addTodo, toggleTodo, removeTodo, todayTodos, leftovers, startNewDay };
