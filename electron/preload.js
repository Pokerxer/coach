const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  showOverlay:     ()        => ipcRenderer.invoke('show-overlay'),
  hideOverlay:     ()        => ipcRenderer.invoke('hide-overlay'),
  toggleOverlay:   ()        => ipcRenderer.invoke('toggle-overlay'),
  setClickthrough: (enable)  => ipcRenderer.invoke('set-clickthrough', enable),
  overlayReady:    ()        => ipcRenderer.invoke('overlay-ready'),

  // Screen capture (Electron-native)
  listSources:     ()            => ipcRenderer.invoke('list-sources'),
  captureSource:   (sourceId)    => ipcRenderer.invoke('capture-source', sourceId),

  // Global shortcut: Cmd+Shift+C fires this from anywhere
  onCaptureShortcut: (cb) => ipcRenderer.on('trigger-capture', cb),
  offCaptureShortcut: (cb) => ipcRenderer.off('trigger-capture', cb),
});
