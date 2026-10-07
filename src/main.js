const {
  app, BrowserWindow, ipcMain, screen, powerMonitor, Tray, Menu, globalShortcut, nativeImage,
} = require('electron');
const os = require('os');
const path = require('path');
const store = require('./store');
const wt = require('./core/worktime');
const td = require('./core/todos');
const ng = require('./core/nudge');
const { normalizePrefs } = require('./core/prefs');

const FAIRY_SIZE = { width: 200, height: 300 };

const TOGGLE_SHORTCUT = 'CommandOrControl+Alt+H';
const CLOCK_JUMP_MS = 2 * 60 * 1000;
const SETTINGS_WIDTH = 270;

let state; // { day, todos, nudge, prefs, widget: { x, y } }
let fairyWin = null;
let settingsWin = null;
let tray = null;
let dragOffset = null;
let clockJump = null; // { delta } 시스템 시계 변경이 감지되어 사용자 확인을 기다리는 중
let clockBase = null; // { wall, mono } 시계 변경 감지 기준점

const bootTime = () => Date.now() - os.uptime() * 1000;

// initial: 앱을 막 켰을 때는 부팅/실행 시각으로 오늘을 시작.
// 실행 중 날짜가 바뀌면 사용자가 돌아올 때까지 기다리는 새 근무일을 만든다
function refreshDay(initial = false) {
  const now = Date.now();
  let day = state.day;
  if (initial) day = wt.ensureToday(day, bootTime(), now);
  else if (wt.shouldRollOver(day, now)) day = wt.createWaitingDay(now);
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
  const today = state.day.date;
  const list = td.todayTodos(state.todos, today);
  const { freq, offDate, todoId } = state.nudge;
  return {
    list,
    leftovers: td.leftovers(state.todos, today),
    nudge: {
      freq,
      offToday: offDate === today,
      todo: list.find((t) => t.id === todoId && !t.done) ?? null,
    },
  };
}

// 할 일 확인 말풍선을 띄울 때인지 확인 (퇴근 후나 이월 질문 중에는 쉼)
function nudgeTick() {
  const today = state.day.date;
  if (state.day.waiting || state.day.endedAt || td.leftovers(state.todos, today).length) return;
  const next = ng.tick(state.nudge, td.todayTodos(state.todos, today), today, Date.now());
  if (JSON.stringify(next) === JSON.stringify(state.nudge)) return;
  state.nudge = next;
  store.save(state);
  broadcast();
}

function updateNudge(fn) {
  try {
    state.nudge = fn(state.nudge);
    store.save(state);
    broadcast();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function broadcast() {
  for (const win of [fairyWin, settingsWin]) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.send('state:changed', state.day);
    win.webContents.send('todos:changed', todosView());
    win.webContents.send('prefs:changed', state.prefs);
    win.webContents.send('clock:jump', clockJump);
  }
  updateTray();
}

// ── 요정 표시 설정 ──
function applyPrefs() {
  if (!fairyWin || fairyWin.isDestroyed()) return;
  const { scale, hidden } = state.prefs;
  // 크기를 바꿔도 요정 발밑(오른쪽 아래)을 기준으로 두고, 화면 밖으로 나가지 않게
  const old = fairyWin.getBounds();
  const width = Math.round(FAIRY_SIZE.width * scale);
  const height = Math.round(FAIRY_SIZE.height * scale);
  const area = screen.getDisplayMatching(old).workArea;
  const x = Math.min(Math.max(old.x + old.width - width, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(old.y + old.height - height, area.y), area.y + area.height - height);
  fairyWin.setResizable(true);
  fairyWin.setBounds({ x, y, width, height });
  fairyWin.setResizable(false);
  fairyWin.webContents.setZoomFactor(scale);
  // 설치된 앱만 로그인 시 자동 실행 설정 (부팅 시각 기준 계산을 위해 기본 켜짐)
  if (app.isPackaged && !process.env.FAIRY_SKIP_LOGIN_ITEM
    && app.getLoginItemSettings().openAtLogin !== state.prefs.autoStart) {
    app.setLoginItemSettings({ openAtLogin: state.prefs.autoStart });
  }
  if (hidden && fairyWin.isVisible()) fairyWin.hide();
  if (!hidden && !fairyWin.isVisible()) fairyWin.showInactive();
}

function setPrefs(partial) {
  state.prefs = normalizePrefs({ ...state.prefs, ...partial });
  store.save(state);
  applyPrefs();
  broadcast();
  return state.prefs;
}

const toggleHidden = () => setPrefs({ hidden: !state.prefs.hidden });

// ── 트레이 아이콘 ──
function updateTray() {
  if (!tray || !state.day) return;
  const day = state.day;
  const left = wt.remaining(day, Date.now());
  tray.setToolTip(day.endedAt ? '퇴근 요정 · 오늘 근무 끝!'
    : left > 0 ? `퇴근 요정 · 퇴근까지 ${wt.formatDuration(left)}`
      : `퇴근 요정 · 추가 근무 ${wt.formatDuration(left).replace('+', '')}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: state.prefs.hidden ? '요정 보이기' : '요정 숨기기', accelerator: TOGGLE_SHORTCUT, click: toggleHidden },
    { label: '설정 열기', click: openSettings },
    { type: 'separator' },
    { label: '퇴근 요정 종료', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')));
  tray.on('click', toggleHidden); // Windows: 아이콘 클릭으로 바로 숨기기/보이기
  updateTray();
}

// ── 주기 점검: 자정 넘김, 시스템 시계 변경 ──
function resetClockBase() {
  clockBase = { wall: Date.now(), mono: performance.now() };
}

function checkClock() {
  const wall = Date.now();
  const mono = performance.now();
  if (clockBase) {
    // 실제로 흐른 시간(mono)과 시계 변화(wall)가 크게 다르면 사용자가 시계를 바꾼 것
    const delta = (wall - clockBase.wall) - (mono - clockBase.mono);
    if (Math.abs(delta) > CLOCK_JUMP_MS && !clockJump) clockJump = { delta };
  }
  clockBase = { wall, mono };
}

function periodicCheck() {
  checkClock();
  refreshDay();
  // 1분 안에 키보드·마우스 입력이 있었으면 출근한 것으로 보고 타이머 시작
  if (state.day.waiting && powerMonitor.getSystemIdleTime() < 60) {
    state.day = wt.startWhenActive(state.day, Date.now());
    store.save(state);
  }
  nudgeTick();
  broadcast();
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
  fairyWin.once('ready-to-show', () => { if (!state.prefs.hidden) fairyWin.showInactive(); });
  fairyWin.on('closed', () => { fairyWin = null; });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: SETTINGS_WIDTH,
    height: 360, // 내용이 그려지면 renderer가 높이를 맞춤 (settings:fit)
    useContentSize: true,
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
    if (!fairyWin || fairyWin.isDestroyed() || !fairyWin.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = fairyWin.getBounds();
    if (dragOffset) {
      fairyWin.setPosition(p.x - dragOffset.x, p.y - dragOffset.y);
      return;
    }
    if (!state.prefs.mouseReact) return;
    // 확대/축소해도 요정 화면 좌표(CSS px) 기준으로 맞춤
    const k = state.prefs.scale;
    fairyWin.webContents.send('cursor', { x: (p.x - b.x) / k, y: (p.y - b.y) / k });
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

  ipcMain.handle('nudge:respond', (_e, choice) => {
    const id = state.nudge.todoId;
    if (choice === 'done' && id) {
      state.todos = state.todos.map((t) => (t.id === id ? { ...t, done: true } : t));
    }
    return updateNudge((n) => ng.respond(n, choice, state.day.date, Date.now()));
  });
  ipcMain.handle('nudge:setFreq', (_e, freq) => updateNudge((n) => ng.setFreq(n, freq, Date.now())));
  ipcMain.handle('nudge:turnOn', () => updateNudge((n) => ng.turnOnToday(n, Date.now())));

  ipcMain.handle('prefs:get', () => state.prefs);
  ipcMain.handle('prefs:set', (_e, partial) => setPrefs(partial));
  ipcMain.handle('clock:get', () => clockJump);
  ipcMain.handle('clock:respond', (_e, recalc) => {
    if (clockJump && recalc) {
      state.day = wt.shiftDay(state.day, clockJump.delta);
      store.save(state);
    }
    clockJump = null;
    broadcast();
    return { ok: true };
  });

  ipcMain.on('settings:open', openSettings);
  ipcMain.on('settings:fit', (_e, height) => {
    if (!settingsWin || settingsWin.isDestroyed()) return;
    const max = screen.getDisplayMatching(settingsWin.getBounds()).workArea.height - 60;
    settingsWin.setContentSize(SETTINGS_WIDTH, Math.max(200, Math.min(max, Math.round(height))));
  });
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
    state.prefs = normalizePrefs(state.prefs);
    refreshDay(true);


    registerIpc();
    createFairyWindow();
    fairyWin.webContents.once('did-finish-load', applyPrefs);
    createTray();
    startCursorFeed();
    // 발표·영상 시청 중 바로 숨기기/보이기
    globalShortcut.register(TOGGLE_SHORTCUT, toggleHidden);

    resetClockBase();
    nudgeTick();
    setInterval(periodicCheck, 30 * 1000);

    // 절전 중엔 시계와 실제 경과시간이 어긋나므로 기준점을 다시 잡음
    powerMonitor.on('suspend', () => { clockBase = null; });
    // 절전 복귀·잠금 해제 시 날짜 확인 후 화면 갱신
    for (const ev of ['resume', 'unlock-screen']) {
      powerMonitor.on(ev, () => { resetClockBase(); refreshDay(); periodicCheck(); });
    }
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());

  // 설정 창을 닫아도 요정은 계속 떠 있어야 하므로 종료하지 않음
  app.on('window-all-closed', () => {});
}
