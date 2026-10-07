const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');

// 어디서든 위젯을 불러오는 단축키
const HOTKEY = 'CommandOrControl+Shift+Space';
const DEFAULT_SIZE = { width: 340, height: 500 };

let win = null;
let tray = null;
let isQuitting = false;
let settings = { alwaysOnTop: true, bounds: null };

const dataPath = (name) => path.join(app.getPath('userData'), name);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// 임시 파일에 쓴 뒤 교체해서, 저장 도중 꺼져도 기존 데이터가 깨지지 않게 한다
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function saveSettings() {
  writeJson(dataPath('settings.json'), settings);
}

// 모니터 구성이 바뀌어 저장된 위치가 화면 밖이면 기본 위치로 되돌린다
function initialBounds() {
  const saved = settings.bounds;
  if (saved) {
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      saved.x < a.x + a.width && saved.x + saved.width > a.x &&
      saved.y < a.y + a.height && saved.y + saved.height > a.y);
    if (visible) return saved;
  }
  const { workArea } = screen.getPrimaryDisplay();
  return {
    ...DEFAULT_SIZE,
    x: workArea.x + workArea.width - DEFAULT_SIZE.width - 20,
    y: workArea.y + 20,
  };
}

function createWindow() {
  win = new BrowserWindow({
    ...initialBounds(),
    minWidth: 260,
    minHeight: 220,
    frame: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    backgroundColor: '#1c1d22',
    title: '끄적',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => showWidget());

  const rememberBounds = () => {
    if (!win.isMinimized()) {
      settings.bounds = win.getBounds();
      saveSettings();
    }
  };
  win.on('moved', rememberBounds);
  win.on('resized', rememberBounds);

  // 닫기 버튼은 숨기기로 동작하고, 종료는 트레이 메뉴에서 한다
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function showWidget() {
  if (!win) return;
  win.show();
  win.focus();
  win.webContents.send('focus-input');
}

function toggleWidget() {
  if (win.isVisible() && win.isFocused()) win.hide();
  else showWidget();
}

function setAlwaysOnTop(value) {
  settings.alwaysOnTop = value;
  saveSettings();
  win.setAlwaysOnTop(value);
  win.webContents.send('pin-changed', value);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const openAtLogin = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `끄적 열기  (${HOTKEY.replace('CommandOrControl', 'Ctrl')})`, click: showWidget },
    { type: 'separator' },
    {
      label: '항상 위에 표시',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => setAlwaysOnTop(item.checked),
    },
    {
      label: '컴퓨터 켜면 자동 실행',
      type: 'checkbox',
      checked: openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('끄적');
  tray.on('click', toggleWidget);
  refreshTrayMenu();
}

ipcMain.handle('notes:load', () => readJson(dataPath('notes.json'), []));
ipcMain.handle('notes:save', (_e, notes) => {
  writeJson(dataPath('notes.json'), notes);
});
ipcMain.handle('win:get-pin', () => settings.alwaysOnTop);
ipcMain.handle('win:toggle-pin', () => {
  setAlwaysOnTop(!settings.alwaysOnTop);
  return settings.alwaysOnTop;
});
ipcMain.on('win:hide', () => win && win.hide());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWidget);

  app.whenReady().then(() => {
    settings = { ...settings, ...readJson(dataPath('settings.json'), {}) };
    if (process.platform === 'darwin' && app.dock) app.dock.hide();
    createWindow();
    createTray();
    if (!globalShortcut.register(HOTKEY, toggleWidget)) {
      console.warn(`단축키 ${HOTKEY} 등록 실패 (다른 프로그램이 사용 중일 수 있음)`);
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
