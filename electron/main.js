const {
  app, BrowserWindow, ipcMain, globalShortcut,
  screen, session, systemPreferences, desktopCapturer, shell,
} = require('electron');
const path = require('path');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── 1. Process stealth ───────────────────────────────────────────────────────
try { process.title = 'coreaudiod'; } catch {}
app.setName('System Audio');

app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI');
app.commandLine.appendSwitch('enable-speech-dispatcher');

// ─── 2. Dock / Taskbar stealth ────────────────────────────────────────────────
if (process.platform === 'darwin') app.dock.hide();

let mainWindow    = null;
let overlayWindow = null;
let stealthInterval      = null;
let captureCheckInterval = null;

// ─── Main window ──────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600,
    backgroundColor: '#0A0A0F',
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      allowRunningInsecureContent: false,
    },
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── 3. Stealth enforcement ───────────────────────────────────────────────────
//
// KEY RULES for reliable content protection:
//
//  1. setContentProtection(true) MUST be called before the window is shown.
//     Once shown without it, macOS may cache the sharingType = ReadOnly forever
//     until the process restarts.
//
//  2. NEVER call setLevel() after setAlwaysOnTop() — setLevel resets the
//     CGWindowLevel to whatever integer you pass, blowing away the 'screen-saver'
//     level (≈2003 on macOS). Use ONLY setAlwaysOnTop with the level string.
//
//  3. Re-apply on show/focus/restore ONLY — not on move/resize. Those fire
//     constantly and race with the window manager, causing flicker and
//     occasionally resetting sharingType to ReadOnly.
//
//  4. transparent:false + solid backgroundColor is REQUIRED for reliable
//     content protection on macOS 13+. Transparent windows can fall back to
//     a different compositor path that ignores NSWindowSharingNone on some
//     GPU configurations.
//
function applyStealthMode(win) {
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  // Additional macOS-specific stealth
  if (process.platform === 'darwin') {
    win.setHiddenInMissionControl(true);
  }
}
}

// ─── 4. Overlay window ────────────────────────────────────────────────────────
function createOverlayWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 460, height: 640,
    x: width - 480, y: 20,
    show: false,
    frame: false,

    // MUST be false for reliable content protection on macOS 13+ Ventura/Sonoma.
    // Transparent windows use a separate compositor path that can ignore
    // NSWindowSharingNone on certain GPU drivers / SCK versions.
    transparent: false,
    backgroundColor: '#0A0A0F',

    alwaysOnTop: true,
    hasShadow: true,    // true keeps the window in the standard compositor path
    resizable: true,
    skipTaskbar: true,
    focusable: true,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  // Apply stealth BEFORE loadURL — window is protected from frame 0.
  // If you call setContentProtection after show(), macOS may not honour it
  // until the next window recreation.
  applyStealthMode(overlayWindow);

  // Re-enforce on events that can reset NSWindow sharingType.
  // Deliberately NOT on 'move' or 'resize' — those fire continuously and
  // racing setAlwaysOnTop with the window manager causes flicker.
  overlayWindow.on('show',    () => applyStealthMode(overlayWindow));
  overlayWindow.on('focus',   () => applyStealthMode(overlayWindow));
  overlayWindow.on('restore', () => applyStealthMode(overlayWindow));
  overlayWindow.on('blur',    () => applyStealthMode(overlayWindow));

  overlayWindow.loadURL(APP_URL + '/float');

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    if (stealthInterval)      { clearInterval(stealthInterval);      stealthInterval      = null; }
    if (captureCheckInterval) { clearInterval(captureCheckInterval); captureCheckInterval = null; }
  });

  // ── Belt-and-suspenders: re-enforce content protection every 2 s ──────────
  // Catches cases where an OS update, Accessibility API call, or Electron
  // internal event silently resets the NSWindow sharingType back to ReadOnly.
  stealthInterval = setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      try { overlayWindow.setContentProtection(true); } catch {}
    }
  }, 2000);

  // ── Detect active screen sharing (heuristic) ─────────────────────────────
  // desktopCapturer.getSources fires the same OS permission prompt as Zoom.
  // If sources are available, a capture session is likely active — we keep
  // stealth enforced and don't auto-show the overlay without user intent.
  captureCheckInterval = setInterval(async () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    try {
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      // Sources available = screen capture permission granted. Stealth is handled
      // by content protection, not by hiding, so no action needed here.
    } catch { /* permission denied or no sources — fine */ }
  }, 5000);
}

// ─── IPC: window control ──────────────────────────────────────────────────────
ipcMain.handle('show-overlay', () => {
  if (!overlayWindow) return;
  applyStealthMode(overlayWindow); // always re-enforce before showing
  overlayWindow.show();
  overlayWindow.focus();
});

ipcMain.handle('hide-overlay',     () => { overlayWindow?.hide(); });
ipcMain.handle('minimize-overlay', () => { overlayWindow?.minimize(); });

ipcMain.handle('toggle-overlay', () => {
  if (!overlayWindow) return;
  overlayWindow.isVisible() ? overlayWindow.hide() : (applyStealthMode(overlayWindow), overlayWindow.show());
});

ipcMain.handle('show-main', () => {
  if (!mainWindow) createMainWindow();
  mainWindow.show(); mainWindow.focus();
});

ipcMain.handle('overlay-ready', () => {});

// ─── IPC: click-through ───────────────────────────────────────────────────────
let clickthroughEnabled = false;

ipcMain.handle('set-clickthrough', (_, enable) => {
  clickthroughEnabled = enable;
  overlayWindow?.setIgnoreMouseEvents(enable, { forward: true });
});

ipcMain.handle('get-clickthrough', () => clickthroughEnabled);

// ─── IPC: panic ───────────────────────────────────────────────────────────────
ipcMain.handle('panic-hide', () => {
  overlayWindow?.hide();
  mainWindow?.hide();
});

// ─── 5. Stealth verification ──────────────────────────────────────────────────
//
// Strategy: ask the OS for all capturable WINDOW sources (same API path as
// Zoom / Meet / Teams / OBS on macOS via ScreenCaptureKit), then check whether
// any source matches our overlay by title or process name.
//
// We deliberately avoid getMediaSourceId() because on macOS 13+ with content
// protection active, the OS refuses to vend a media source ID for the window,
// which means it returns '' — so matching by ID always appears invisible even
// when the window IS leaking via a legacy CGWindowListCreateImage path.
//
// Title-based matching is more reliable: if the OS returns a window named
// 'float', 'System Audio', or our app name, the window is exposed.
//
ipcMain.handle('verify-stealth', async () => {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible()) {
    return { invisible: true, details: 'Overlay not active / not visible' };
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 32, height: 32 }, // small = fast
      fetchWindowIcons: false,
    });

    // Names / substrings that would indicate our window is exposed
    const suspectNames = ['system audio', 'float', 'parakeet', 'coreaudiod'];

    const exposed = sources.find(s => {
      const name = (s.name || '').toLowerCase();
      return suspectNames.some(n => name.includes(n));
    });

    // Also cross-check by native window ID if available
    let exposedById = false;
    try {
      const nativeId = overlayWindow.getNativeWindowHandle().readBigUInt64LE(0).toString();
      // desktopCapturer source IDs are like "window:12345:0" on macOS
      exposedById = sources.some(s => s.id.includes(`:${nativeId}:`));
    } catch { /* getNativeWindowHandle not available on all platforms */ }

    if (!exposed && !exposedById) {
      return {
        invisible: true,
        details: `Verified — not found among ${sources.length} capturable windows`,
      };
    }

    return {
      invisible: false,
      details: exposed
        ? `EXPOSED — window "${exposed.name}" found in capturable sources (id: ${exposed.id})`
        : 'EXPOSED — matched by native window handle in capture sources',
    };
  } catch (err) {
    // If getSources itself throws, screen permission is denied — which means
    // Zoom/Meet also cannot capture our window. Treat as invisible.
    if (err.message?.includes('permission') || err.message?.includes('denied')) {
      return { invisible: true, details: 'Screen capture permission denied — capture impossible' };
    }
    return { invisible: false, details: `Verification error: ${err.message}` };
  }
});

// ─── Screen capture (Electron-native via desktopCapturer) ────────────────────
function ensureScreenPermission() {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status !== 'granted') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    return false;
  }
  return true;
}

ipcMain.handle('list-sources', async () => {
  if (!ensureScreenPermission()) throw new Error('SCREEN_PERMISSION_DENIED');
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });
  return sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
});

ipcMain.handle('capture-source', async (_, sourceId) => {
  if (!ensureScreenPermission()) throw new Error('SCREEN_PERMISSION_DENIED');
  const { width, height } = screen.getPrimaryDisplay().size;
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width, height },
  });
  const source = sources.find(s => s.id === sourceId);
  if (!source) return null;
  return source.thumbnail.toPNG().toString('base64');
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    const micStatus = await systemPreferences.askForMediaAccess('microphone');
    if (!micStatus) console.warn('[Electron] Microphone permission denied.');
  }

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(['media', 'microphone', 'audioCapture', 'geolocation'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'microphone', 'audioCapture'].includes(permission);
  });

  createMainWindow();
  createOverlayWindow();

  // ── Global shortcuts ───────────────────────────────────────────────────────
  // Toggle overlay
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!overlayWindow) return;
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    } else {
      applyStealthMode(overlayWindow);
      overlayWindow.show();
    }
  });

  // Panic: hide everything
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    overlayWindow?.hide();
    mainWindow?.hide();
  });

  // Show main window
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (!mainWindow) createMainWindow();
    mainWindow.show(); mainWindow.focus();
  });

  // Exam capture from anywhere
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (!overlayWindow || !overlayWindow.isVisible()) return;
    overlayWindow.webContents.send('trigger-capture');
  });

  // Toggle click-through from anywhere
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (!overlayWindow || !overlayWindow.isVisible()) return;
    clickthroughEnabled = !clickthroughEnabled;
    overlayWindow.setIgnoreMouseEvents(clickthroughEnabled, { forward: true });
    overlayWindow.webContents.send('clickthrough-changed', clickthroughEnabled);
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createMainWindow(); });