const TYPES = {
  memo: { icon: '📝', label: '메모' },
  todo: { icon: '✅', label: '할 일' },
  idea: { icon: '💡', label: '아이디어' },
};
const TYPE_ORDER = ['memo', 'todo', 'idea'];
// 입력 앞에 붙이면 종류를 바로 지정하는 단축 접두어
const PREFIXES = { '/t': 'todo', '/i': 'idea', '/m': 'memo' };

const $ = (id) => document.getElementById(id);
const els = {
  list: $('list'),
  empty: $('empty'),
  input: $('input'),
  chip: $('type-chip'),
  tabs: $('tabs'),
  pin: $('pin'),
  clearDone: $('clear-done'),
  toast: $('toast'),
};

let notes = [];
let filter = 'all';
let inputType = 'memo';
let lastDeleted = null;
let toastTimer = null;

const persist = () => window.api.save(notes);
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 2) return '어제';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function setInputType(type) {
  inputType = type;
  els.chip.textContent = `${TYPES[type].icon} ${TYPES[type].label}`;
  els.chip.dataset.type = type;
}

function addNote(raw) {
  let text = raw.trim();
  let type = inputType;
  const match = text.match(/^(\/[tim])\s+/);
  if (match) {
    type = PREFIXES[match[1]];
    text = text.slice(match[0].length).trim();
  }
  if (!text) return;
  notes.unshift({ id: newId(), text, type, done: false, createdAt: Date.now() });
  persist();
  render();
}

function updateNote(id, patch) {
  const note = notes.find((n) => n.id === id);
  if (!note) return;
  Object.assign(note, patch);
  if (patch.type && patch.type !== 'todo') note.done = false;
  persist();
  render();
}

function deleteNote(id) {
  const index = notes.findIndex((n) => n.id === id);
  if (index < 0) return;
  lastDeleted = { items: [notes[index]], indexes: [index] };
  notes.splice(index, 1);
  persist();
  render();
  showToast('삭제했어요');
}

function clearDone() {
  const indexes = [];
  const items = [];
  notes.forEach((n, i) => {
    if (n.type === 'todo' && n.done) {
      indexes.push(i);
      items.push(n);
    }
  });
  if (!items.length) return;
  lastDeleted = { items, indexes };
  notes = notes.filter((n) => !(n.type === 'todo' && n.done));
  persist();
  render();
  showToast(`완료한 할 일 ${items.length}개를 지웠어요`);
}

function undoDelete() {
  if (!lastDeleted) return;
  lastDeleted.indexes.forEach((idx, i) => notes.splice(idx, 0, lastDeleted.items[i]));
  lastDeleted = null;
  persist();
  render();
  hideToast();
}

function showToast(message) {
  els.toast.querySelector('span').textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  els.toast.hidden = true;
}

function startEdit(li, note) {
  const textEl = li.querySelector('.text');
  const editor = document.createElement('input');
  editor.className = 'editor';
  editor.value = note.text;
  textEl.replaceWith(editor);
  editor.focus();
  editor.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const value = editor.value.trim();
    if (!commit) render();
    else if (!value) deleteNote(note.id);
    else updateNote(note.id, { text: value });
  };
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) finish(true);
    if (e.key === 'Escape') {
      e.stopPropagation();
      finish(false);
    }
  });
  editor.addEventListener('blur', () => finish(true));
}

function renderItem(note) {
  const li = document.createElement('li');
  li.className = `item type-${note.type}${note.done ? ' done' : ''}`;

  if (note.type === 'todo') {
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = note.done;
    check.addEventListener('change', () => updateNote(note.id, { done: check.checked }));
    li.append(check);
  } else {
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = TYPES[note.type].icon;
    li.append(icon);
  }

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = note.text;
  text.title = '더블클릭해서 수정';
  text.addEventListener('dblclick', () => startEdit(li, note));
  li.append(text);

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = timeAgo(note.createdAt);
  li.append(meta);

  // 마우스를 올리면 나오는 분류 바꾸기 / 삭제 버튼
  const actions = document.createElement('span');
  actions.className = 'actions';
  TYPE_ORDER.filter((t) => t !== note.type).forEach((t) => {
    const btn = document.createElement('button');
    btn.textContent = TYPES[t].icon;
    btn.title = `${TYPES[t].label}(으)로 옮기기`;
    btn.addEventListener('click', () => updateNote(note.id, { type: t }));
    actions.append(btn);
  });
  const del = document.createElement('button');
  del.textContent = '🗑';
  del.title = '삭제';
  del.addEventListener('click', () => deleteNote(note.id));
  actions.append(del);
  li.append(actions);

  return li;
}

function render() {
  const visible = notes
    .filter((n) => filter === 'all' || n.type === filter)
    // 완료한 할 일은 아래로 내린다 (sort는 안정 정렬이라 나머지 순서는 유지)
    .sort((a, b) => Number(a.done) - Number(b.done));

  els.list.replaceChildren(...visible.map(renderItem));
  els.empty.hidden = visible.length > 0;

  const counts = { all: notes.length, todo: 0, idea: 0, memo: 0 };
  notes.forEach((n) => {
    if (!(n.type === 'todo' && n.done)) counts[n.type] += 1;
  });
  els.tabs.querySelectorAll('button').forEach((btn) => {
    const f = btn.dataset.filter;
    btn.classList.toggle('active', f === filter);
    btn.querySelector('.count').textContent = counts[f] || '';
  });

  const hasDone = notes.some((n) => n.type === 'todo' && n.done);
  els.clearDone.hidden = !hasDone || !(filter === 'all' || filter === 'todo');
}

els.input.addEventListener('keydown', (e) => {
  if (e.isComposing) return; // 한글 조합 중 Enter 중복 입력 방지
  if (e.key === 'Enter') {
    addNote(els.input.value);
    els.input.value = '';
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const next = TYPE_ORDER[(TYPE_ORDER.indexOf(inputType) + (e.shiftKey ? 2 : 1)) % 3];
    setInputType(next);
  }
});

els.chip.addEventListener('click', () => {
  setInputType(TYPE_ORDER[(TYPE_ORDER.indexOf(inputType) + 1) % 3]);
  els.input.focus();
});

els.tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  filter = btn.dataset.filter;
  if (filter !== 'all') setInputType(filter);
  render();
  els.input.focus();
});

els.clearDone.addEventListener('click', clearDone);
$('undo').addEventListener('click', undoDelete);
$('close').addEventListener('click', () => window.api.hide());

const showPin = (on) => els.pin.classList.toggle('on', on);
els.pin.addEventListener('click', async () => showPin(await window.api.togglePin()));
window.api.onPinChanged(showPin);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.hide();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && document.activeElement !== els.input) {
    undoDelete();
  }
});

window.api.onFocusInput(() => {
  els.input.focus();
  render(); // '3분 전' 같은 시간 표시 갱신
});

(async () => {
  notes = await window.api.load();
  showPin(await window.api.getPin());
  setInputType('memo');
  render();
  els.input.focus();
})();
