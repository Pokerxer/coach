const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  showOverlay:     ()        => ipcRenderer.invoke('show-overlay'),
  hideOverlay:     ()        => ipcRenderer.invoke('hide-overlay'),
  minimizeOverlay: ()        => ipcRenderer.invoke('minimize-overlay'),
  toggleOverlay:   ()        => ipcRenderer.invoke('toggle-overlay'),
  showMain:        ()        => ipcRenderer.invoke('show-main'),
  panicHide:       ()        => ipcRenderer.invoke('panic-hide'),
  verifyStealth:   ()        => ipcRenderer.invoke('verify-stealth'),
  setClickthrough: (enable)  => ipcRenderer.invoke('set-clickthrough', enable),
  getClickthrough: ()        => ipcRenderer.invoke('get-clickthrough'),
  onClickthroughChanged: (cb) => ipcRenderer.on('clickthrough-changed', (_, val) => cb(val)),
  offClickthroughChanged: (cb) => ipcRenderer.off('clickthrough-changed', cb),
  overlayReady:    ()        => ipcRenderer.invoke('overlay-ready'),

  // Screen capture (Electron-native)
  listSources:     ()            => ipcRenderer.invoke('list-sources'),
  captureSource:   (sourceId)    => ipcRenderer.invoke('capture-source', sourceId),

  // Global shortcut: Cmd+Shift+C fires this from anywhere
  onCaptureShortcut: (cb) => ipcRenderer.on('trigger-capture', cb),
  offCaptureShortcut: (cb) => ipcRenderer.off('trigger-capture', cb),
});
