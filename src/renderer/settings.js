const $ = (id) => document.getElementById(id);
let day = null;

const showError = (msg) => { $('error').textContent = msg || ''; fitWindow(); };

// 내용 높이에 맞춰 창 크기 조절 (위젯 설정을 펼치고 접을 때 등)
function fitWindow() {
  requestAnimationFrame(() => fairy.fitSettings(Math.ceil(document.body.scrollHeight)));
}

// ── 근무 유형·시작 시각 ──
function render() {
  $('half').checked = day.workType === 'half';
  $('flex').checked = day.workType === 'flex';
  $('flexTime').hidden = day.workType !== 'flex';
  $('flexH').value = Math.floor(day.flexMinutes / 60);
  $('flexM').value = String(day.flexMinutes % 60).padStart(2, '0');

  $('startClock').textContent = day.waiting ? '--:--' : wt.formatClock(day.start);
  $('useBoot').textContent = `부팅 시각 ${wt.formatClock(day.baseStart)}`;
  $('useBoot10').textContent = `부팅 10분 후 ${wt.formatClock(day.baseStart + 10 * 60000)}`;
  $('endLine').textContent = day.waiting
    ? '컴퓨터를 쓰기 시작하면 타이머가 켜져요'
    : `→ ${wt.formatClock(wt.endTime(day))} 퇴근 예정 (개인 참고용)`;
  fitWindow();
}

async function apply(promise) {
  const res = await promise;
  showError(res.ok ? '' : res.error);
  if (res.ok) {
    day = res.day;
    $('startEditor').hidden = true;
  }
  render(); // 실패하면 이전 값으로 되돌림
}

const flexMinutes = () => (parseInt($('flexH').value, 10) || 0) * 60 + (parseInt($('flexM').value, 10) || 0);

// 반차·유연근무는 하나만 선택, 둘 다 해제하면 일반근무
$('half').addEventListener('change', () => apply(fairy.setWorkType($('half').checked ? 'half' : 'normal')));
$('flex').addEventListener('change', () =>
  apply($('flex').checked ? fairy.setWorkType('flex', flexMinutes()) : fairy.setWorkType('normal')));
for (const id of ['flexH', 'flexM']) {
  $(id).addEventListener('change', () => apply(fairy.setWorkType('flex', flexMinutes())));
}

$('editStart').addEventListener('click', () => {
  $('startEditor').hidden = !$('startEditor').hidden;
  $('manualTime').value = wt.formatClock(day.waiting ? Date.now() : day.start);
  if (!$('startEditor').hidden) $('manualTime').focus();
  fitWindow();
});
$('saveStart').addEventListener('click', () => {
  const ms = wt.timeOnDay(day.baseStart, $('manualTime').value);
  if (Number.isNaN(ms)) return showError('시각을 HH:MM 형식으로 입력해 주세요.');
  apply(fairy.setStart('manual', ms));
});
$('manualTime').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('saveStart').click(); });
$('useBoot').addEventListener('click', () => apply(fairy.setStart('boot')));
$('useBoot10').addEventListener('click', () => apply(fairy.setStart('boot_plus_10')));

// ── 체크리스트 ──
function renderTodos({ list, nudge }) {
  $('nudgeFreq').value = nudge.freq;
  $('nudgeOn').hidden = !(nudge.offToday && nudge.freq !== 'off');
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
  fitWindow();
}

$('todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fairy.addTodo($('todoInput').value);
  $('todoError').textContent = res.ok ? '' : res.error;
  if (res.ok) $('todoInput').value = '';
  fitWindow();
});

// ── 위젯 설정 ──
function renderPrefs(p) {
  $('scale').value = Math.round(p.scale * 100);
  $('scaleOut').textContent = `${Math.round(p.scale * 100)}%`;
  $('opacity').value = Math.round(p.opacity * 100);
  $('opacityOut').textContent = `${Math.round(p.opacity * 100)}%`;
  $('mouseReact').checked = p.mouseReact;
  $('hidden').checked = p.hidden;
}
$('scale').addEventListener('change', () => fairy.setPrefs({ scale: $('scale').value / 100 }));
$('opacity').addEventListener('input', () => fairy.setPrefs({ opacity: $('opacity').value / 100 }));
$('mouseReact').addEventListener('change', () => fairy.setPrefs({ mouseReact: $('mouseReact').checked }));
$('hidden').addEventListener('change', () => fairy.setPrefs({ hidden: $('hidden').checked }));
$('nudgeFreq').addEventListener('change', () => fairy.setNudgeFreq($('nudgeFreq').value));
$('nudgeOn').addEventListener('click', () => fairy.turnOnNudge());
$('shortcut').textContent = navigator.platform.startsWith('Mac') ? '⌘⌥H' : 'Ctrl+Alt+H';
$('widget').addEventListener('toggle', fitWindow);

fairy.onState((d) => { day = d; render(); });
fairy.getState().then((d) => { day = d; render(); });
fairy.onTodos(renderTodos);
fairy.getTodos().then(renderTodos);
fairy.onPrefs(renderPrefs);
fairy.getPrefs().then(renderPrefs);
setInterval(() => day && render(), 30000);
