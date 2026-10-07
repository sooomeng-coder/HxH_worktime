const $ = (id) => document.getElementById(id);
let day = null;

function showError(msg) {
  $('error').textContent = msg || '';
}

function render() {
  document.querySelector(`input[name="type"][value="${day.workType}"]`).checked = true;
  document.querySelector(`input[name="start"][value="${day.startMode}"]`).checked = true;
  $('flexH').value = Math.floor(day.flexMinutes / 60);
  $('flexM').value = day.flexMinutes % 60;
  $('bootLabel').textContent = `(${wt.formatClock(day.baseStart)})`;
  $('boot10Label').textContent = `(${wt.formatClock(day.baseStart + 10 * 60000)})`;
  if (document.activeElement !== $('manualTime')) $('manualTime').value = wt.formatClock(day.start);

  const left = wt.remaining(day, Date.now());
  $('summary').innerHTML =
    `<strong>${wt.formatClock(wt.endTime(day))} 퇴근 예정</strong><br>` +
    `${wt.START_MODES[day.startMode]} ${wt.formatClock(day.start)} 시작 + ` +
    `${wt.WORK_TYPES[day.workType].label} ${Math.floor(day.workMinutes / 60)}시간` +
    `${day.workMinutes % 60 ? ` ${day.workMinutes % 60}분` : ''}<br>` +
    (left > 0 ? `남은 시간 ${wt.formatDuration(left)}` : `퇴근 시각이 ${wt.formatDuration(left)} 지났어요`);
}

async function apply(promise) {
  const res = await promise;
  if (!res.ok) {
    showError(res.error);
    render(); // 실패하면 이전 선택으로 되돌림
    return;
  }
  showError('');
  day = res.day;
  render();
}

function flexMinutes() {
  return (parseInt($('flexH').value, 10) || 0) * 60 + (parseInt($('flexM').value, 10) || 0);
}

for (const r of document.querySelectorAll('input[name="type"]')) {
  r.addEventListener('change', () =>
    apply(fairy.setWorkType(r.value, r.value === 'flex' ? flexMinutes() : undefined)));
}
for (const id of ['flexH', 'flexM']) {
  $(id).addEventListener('change', () => apply(fairy.setWorkType('flex', flexMinutes())));
}

function applyManual() {
  const ms = wt.timeOnDay(day.baseStart, $('manualTime').value);
  if (Number.isNaN(ms)) return showError('시각을 HH:MM 형식으로 입력해 주세요.');
  apply(fairy.setStart('manual', ms));
}
for (const r of document.querySelectorAll('input[name="start"]')) {
  r.addEventListener('change', () => (r.value === 'manual' ? applyManual() : apply(fairy.setStart(r.value))));
}
$('manualTime').addEventListener('change', () => {
  document.querySelector('input[name="start"][value="manual"]').checked = true;
  applyManual();
});

fairy.onState((d) => { day = d; render(); });
fairy.getState().then((d) => { day = d; render(); });
setInterval(() => day && render(), 30000);

// ── 오늘의 할 일 ──
function renderTodos({ list }) {
  const done = list.filter((t) => t.done).length;
  $('todoCount').textContent = list.length ? `(${done}/${list.length} 완료)` : '';
  $('todoEmpty').hidden = list.length > 0;
  $('todoList').replaceChildren(...list.map((t) => {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = t.done;
    box.addEventListener('change', () => fairy.toggleTodo(t.id));
    const text = document.createElement('span');
    text.textContent = t.text;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = '삭제';
    del.addEventListener('click', () => fairy.removeTodo(t.id));
    li.append(box, text, del);
    return li;
  }));
}

$('todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fairy.addTodo($('todoInput').value);
  $('todoError').textContent = res.ok ? '' : res.error;
  if (res.ok) $('todoInput').value = '';
});

fairy.onTodos(renderTodos);
fairy.getTodos().then(renderTodos);
