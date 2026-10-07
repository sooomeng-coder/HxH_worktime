// 무작위 할 일 확인 말풍선 순수 로직 (Electron 의존성 없음)
// nudge 상태: { freq, nextAt, todoId, preferId, offDate }

const MINUTE = 60 * 1000;
const LATER_MINUTES = 30;

// 빈도별 무작위 간격(분)
const FREQS = {
  off: { label: '끄기', range: null },
  low: { label: '낮음', range: [120, 180] },
  normal: { label: '보통', range: [90, 120] },
  high: { label: '높음', range: [60, 90] },
};

function createNudge() {
  return { freq: 'normal', nextAt: null, todoId: null, preferId: null, offDate: null };
}

function randomGap(freq, rand = Math.random) {
  const [min, max] = FREQS[freq].range;
  return Math.round((min + (max - min) * rand()) * MINUTE);
}

function schedule(nudge, nowMs, rand) {
  const range = FREQS[nudge.freq].range;
  return { ...nudge, nextAt: range ? nowMs + randomGap(nudge.freq, rand) : null };
}

function setFreq(nudge, freq, nowMs, rand) {
  if (!FREQS[freq]) throw new Error(`알 수 없는 빈도: ${freq}`);
  return schedule({ ...nudge, freq, todoId: null }, nowMs, rand);
}

// 다음 말풍선을 띄울 할 일을 고른다. '나중에'를 고른 할 일이 남아 있으면 그것 먼저
function pickTodo(list, preferId, rand = Math.random) {
  const open = list.filter((t) => !t.done);
  if (!open.length) return null;
  return open.find((t) => t.id === preferId) ?? open[Math.floor(rand() * open.length)];
}

// 매 tick마다 호출: 말풍선을 띄울 때가 되면 할 일을 하나 골라 todoId에 넣는다
function tick(nudge, list, today, nowMs, rand) {
  let n = nudge;
  // 보여주던 할 일이 완료·삭제됐으면 정리
  if (n.todoId && !list.some((t) => t.id === n.todoId && !t.done)) n = { ...n, todoId: null };
  if (n.todoId || n.freq === 'off' || n.offDate === today) return n;
  if (n.nextAt == null) return schedule(n, nowMs, rand);
  if (nowMs < n.nextAt) return n;
  const todo = pickTodo(list, n.preferId, rand);
  // 미완료 할 일이 없으면 다음 간격까지 기다림
  if (!todo) return schedule(n, nowMs, rand);
  return { ...n, todoId: todo.id, preferId: null };
}

// 말풍선 응답: 'done' 완료 | 'later' 30분 뒤 같은 일 다시 | 'hide' 이번만 닫기 | 'off' 오늘 끄기
function respond(nudge, choice, today, nowMs, rand) {
  const closed = { ...nudge, todoId: null };
  if (choice === 'done' || choice === 'hide') return schedule(closed, nowMs, rand);
  if (choice === 'later') {
    return { ...closed, preferId: nudge.todoId, nextAt: nowMs + LATER_MINUTES * MINUTE };
  }
  if (choice === 'off') return { ...closed, offDate: today };
  throw new Error(`알 수 없는 응답: ${choice}`);
}

// 오늘 꺼둔 알림 다시 켜기
function turnOnToday(nudge, nowMs, rand) {
  return schedule({ ...nudge, offDate: null }, nowMs, rand);
}

module.exports = { FREQS, createNudge, setFreq, pickTodo, tick, respond, turnOnToday };
