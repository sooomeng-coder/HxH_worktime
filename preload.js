const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('notes:load'),
  save: (notes) => ipcRenderer.invoke('notes:save', notes),
  hide: () => ipcRenderer.send('win:hide'),
  getPin: () => ipcRenderer.invoke('win:get-pin'),
  togglePin: () => ipcRenderer.invoke('win:toggle-pin'),
  onFocusInput: (cb) => ipcRenderer.on('focus-input', () => cb()),
  onPinChanged: (cb) => ipcRenderer.on('pin-changed', (_e, value) => cb(value)),
});
