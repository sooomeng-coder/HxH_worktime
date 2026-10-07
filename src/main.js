const { app, BrowserWindow, ipcMain, screen, powerMonitor } = require('electron');
const os = require('os');
const path = require('path');
const store = require('./store');
const wt = require('./core/worktime');
const td = require('./core/todos');

const FAIRY_SIZE = { width: 200, height: 270 };

let state; // { day, todos, widget: { x, y } }
let fairyWin = null;
let settingsWin = null;
let dragOffset = null;

const bootTime = () => Date.now() - os.uptime() * 1000;

function refreshDay() {
  const day = wt.ensureToday(state.day, bootTime(), Date.now());
  if (day !== state.day) {
    state.day = day;
    store.save(state);
  }
  // 지난 할 일 중 못 끝낸 게 없으면 묻지 않고 정리 (있으면 요정이 가져올지 물어봄)
  const today = state.day.date;
  if (!td.leftovers(state.todos, today).length && state.todos.some((t) => t.date !== today)) {
    state.todos = td.startNewDay(state.todos, today, false);
    store.save(state);
  }
}

function todosView() {
  return {
    list: td.todayTodos(state.todos, state.day.date),
    leftovers: td.leftovers(state.todos, state.day.date),
  };
}

function broadcast() {
  for (const win of [fairyWin, settingsWin]) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.send('state:changed', state.day);
    win.webContents.send('todos:changed', todosView());
  }
}

function defaultWidgetPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - FAIRY_SIZE.width - 16,
    y: workArea.y + workArea.height - FAIRY_SIZE.height - 16,
  };
}

// 저장된 위치가 연결 해제된 모니터 밖이면 기본 위치로
function widgetPosition() {
  const pos = state.widget;
  if (pos) {
    const inside = screen.getAllDisplays().some(({ workArea: a }) =>
      pos.x >= a.x - 50 && pos.y >= a.y - 50 &&
      pos.x + FAIRY_SIZE.width <= a.x + a.width + 50 &&
      pos.y + FAIRY_SIZE.height <= a.y + a.height + 50);
    if (inside) return pos;
  }
  return defaultWidgetPosition();
}

const webPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false, // preload에서 core/worktime.js 를 require 하기 위해
};

function createFairyWindow() {
  fairyWin = new BrowserWindow({
    ...FAIRY_SIZE,
    ...widgetPosition(),
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences,
  });
  fairyWin.setAlwaysOnTop(true, 'floating');
  fairyWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  // 투명한 영역은 클릭이 아래 창으로 통과 (요정 위에 올라가면 renderer가 해제)
  fairyWin.setIgnoreMouseEvents(true, { forward: true });
  fairyWin.loadFile(path.join(__dirname, 'renderer', 'fairy.html'));
  // 포커스를 뺏지 않고 표시
  fairyWin.once('ready-to-show', () => fairyWin.showInactive());
  fairyWin.on('closed', () => { fairyWin = null; });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 320,
    height: 640,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    title: '퇴근 요정 설정',
    autoHideMenuBar: true,
    webPreferences,
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// 마우스 포인터 위치를 요정에게 전달 (눈이 포인터를 따라감). 입력은 가로채지 않음
function startCursorFeed() {
  setInterval(() => {
    if (!fairyWin || fairyWin.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = fairyWin.getBounds();
    if (dragOffset) {
      fairyWin.setPosition(p.x - dragOffset.x, p.y - dragOffset.y);
      return;
    }
    fairyWin.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 50);
}

function update(fn) {
  try {
    state.day = fn(state.day);
    store.save(state);
    broadcast();
    return { ok: true, day: state.day };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function updateTodos(fn) {
  try {
    state.todos = fn(state.todos);
    store.save(state);
    broadcast();
    return { ok: true, todos: todosView() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function registerIpc() {
  ipcMain.handle('state:get', () => {
    refreshDay();
    return state.day;
  });
  ipcMain.handle('day:setWorkType', (_e, type, flexMinutes) =>
    update((day) => wt.setWorkType(day, type, flexMinutes)));
  ipcMain.handle('day:setStart', (_e, mode, manualMs) =>
    update((day) => wt.setStart(day, mode, Date.now(), manualMs)));
  ipcMain.handle('alert:respond', (_e, choice) =>
    update((day) => wt.respondAlert(day, choice, Date.now())));
  ipcMain.handle('day:resume', () => update(wt.resume));
  ipcMain.handle('boot:get', () => bootTime());

  ipcMain.handle('todos:get', () => {
    refreshDay();
    return todosView();
  });
  ipcMain.handle('todos:add', (_e, text) =>
    updateTodos((list) => td.addTodo(list, text, state.day.date, Date.now())));
  ipcMain.handle('todos:toggle', (_e, id) => updateTodos((list) => td.toggleTodo(list, id)));
  ipcMain.handle('todos:remove', (_e, id) => updateTodos((list) => td.removeTodo(list, id)));
  ipcMain.handle('todos:carry', (_e, carry) =>
    updateTodos((list) => td.startNewDay(list, state.day.date, !!carry)));

  ipcMain.on('settings:open', openSettings);
  ipcMain.on('mouse:ignore', (_e, ignore) => {
    if (fairyWin && !dragOffset) fairyWin.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.on('drag:start', () => {
    if (!fairyWin) return;
    const p = screen.getCursorScreenPoint();
    const b = fairyWin.getBounds();
    dragOffset = { x: p.x - b.x, y: p.y - b.y };
  });
  ipcMain.on('drag:end', () => {
    if (!fairyWin || !dragOffset) return;
    dragOffset = null;
    const [x, y] = fairyWin.getPosition();
    state.widget = { x, y };
    store.save(state);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openSettings);

  app.whenReady().then(() => {
    store.init(app.getPath('userData'));
    state = store.load();
    refreshDay();

    // 설치된 앱은 로그인 시 자동 실행 (부팅 시각 기준 계산을 위해)
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

    registerIpc();
    createFairyWindow();
    startCursorFeed();

    // 절전 복귀·잠금 해제 시 날짜 확인 후 화면 갱신
    for (const ev of ['resume', 'unlock-screen']) {
      powerMonitor.on(ev, () => { refreshDay(); broadcast(); });
    }
  });

  // 설정 창을 닫아도 요정은 계속 떠 있어야 하므로 종료하지 않음
  app.on('window-all-closed', () => {});
}
