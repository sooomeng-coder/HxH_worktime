const { contextBridge, ipcRenderer } = require('electron');
const wt = require('./core/worktime');

contextBridge.exposeInMainWorld('fairy', {
  getState: () => ipcRenderer.invoke('state:get'),
  getBootTime: () => ipcRenderer.invoke('boot:get'),
  setWorkType: (type, flexMinutes) => ipcRenderer.invoke('day:setWorkType', type, flexMinutes),
  setStart: (mode, manualMs) => ipcRenderer.invoke('day:setStart', mode, manualMs),
  onState: (cb) => ipcRenderer.on('state:changed', (_e, day) => cb(day)),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  openSettings: () => ipcRenderer.send('settings:open'),
  ignoreMouse: (ignore) => ipcRenderer.send('mouse:ignore', ignore),
  dragStart: () => ipcRenderer.send('drag:start'),
  dragEnd: () => ipcRenderer.send('drag:end'),
});

contextBridge.exposeInMainWorld('wt', {
  WORK_TYPES: wt.WORK_TYPES,
  START_MODES: wt.START_MODES,
  endTime: wt.endTime,
  remaining: wt.remaining,
  formatClock: wt.formatClock,
  formatDuration: wt.formatDuration,
  timeOnDay: wt.timeOnDay,
});
