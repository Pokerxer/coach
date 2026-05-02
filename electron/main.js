const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, systemPreferences, desktopCapturer, shell } = require('electron');
const path = require('path');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Must be called before app is ready — enables webkitSpeechRecognition audio stream
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI');
app.commandLine.appendSwitch('enable-speech-dispatcher');

let mainWindow = null;
let overlayWindow = null;

// ─── Main app window ────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0A0A0F',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Required for webkitSpeechRecognition to access the microphone
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Invisible overlay window ────────────────────────────────────────────────
function createOverlayWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 460,
    height: 640,
    x: width - 480,       // Start top-right corner
    y: 20,
    show: false,           // Hidden until user requests it
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // ── THE KEY FEATURE ──────────────────────────────────────
  // Prevents this window from appearing in any screen capture,
  // screen recording, or screen-sharing tool (Zoom, Meet, Teams, OBS…)
  overlayWindow.setContentProtection(true);

  // Stay visible even when a full-screen app is active
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');   // Highest z-order

  overlayWindow.loadURL(APP_URL + '/float');
  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// ─── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.handle('show-overlay', () => {
  overlayWindow?.show();
  overlayWindow?.focus();
});

ipcMain.handle('hide-overlay', () => {
  overlayWindow?.hide();
});

ipcMain.handle('toggle-overlay', () => {
  if (!overlayWindow) return;
  overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
});

// Click-through: true = clicks pass through to app below; false = interactive
ipcMain.handle('set-clickthrough', (_, enable) => {
  overlayWindow?.setIgnoreMouseEvents(enable, { forward: true });
});

// Overlay renderer tells main it's loaded and ready
ipcMain.handle('overlay-ready', () => {
  // Could trigger initial state broadcast here if needed
});

// ─── Screen capture (Electron-native via desktopCapturer) ────────────────────

// Check / request screen recording permission on macOS
function ensureScreenPermission() {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status !== 'granted') {
    // Open Privacy > Screen Recording so the user can grant access
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    return false;
  }
  return true;
}

// List available screens/windows for the user to pick from
ipcMain.handle('list-sources', async () => {
  if (!ensureScreenPermission()) {
    throw new Error('SCREEN_PERMISSION_DENIED');
  }
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  }));
});

// Capture a specific source at full resolution → returns base64 PNG
ipcMain.handle('capture-source', async (_, sourceId) => {
  if (!ensureScreenPermission()) {
    throw new Error('SCREEN_PERMISSION_DENIED');
  }
  const { width, height } = screen.getPrimaryDisplay().size;
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width, height },
  });
  const source = sources.find((s) => s.id === sourceId);
  if (!source) return null;
  return source.thumbnail.toPNG().toString('base64');
});

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // ── Microphone permission ────────────────────────────────────────────────
  // On macOS, ask the OS for microphone access before the renderer tries to use it.
  // Without this, webkitSpeechRecognition silently fails or gets blocked.
  if (process.platform === 'darwin') {
    const micStatus = await systemPreferences.askForMediaAccess('microphone');
    if (!micStatus) {
      console.warn('[Electron] Microphone permission denied by macOS. Speech recognition will not work.');
    }
  }

  // Grant media/microphone permission requests from renderer pages
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'geolocation'];
    callback(allowed.includes(permission));
  });

  // Also handle permission checks (Electron 15+)
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture'];
    return allowed.includes(permission);
  });

  createMainWindow();
  createOverlayWindow();

  // Toggle overlay: Cmd/Ctrl + Shift + Space
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!overlayWindow) return;
    overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
  });

  // Quick hide (panic key): Cmd/Ctrl + Shift + H
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    overlayWindow?.hide();
  });

  // Trigger exam capture from anywhere: Cmd/Ctrl + Shift + C
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (!overlayWindow || !overlayWindow.isVisible()) return;
    overlayWindow.webContents.send('trigger-capture');
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// Keep running when all windows are closed (macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createMainWindow();
});
