const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, systemPreferences, desktopCapturer, shell } = require('electron');
const path = require('path');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── 1. Process stealth — must run before anything else ─────────────────────
// Rename the process title so Activity Monitor / ps / top show a benign name
// that blends in with legitimate macOS audio/system services.
try { process.title = 'coreaudiod'; } catch {}

// Rename the Electron app name (affects some system dialogs & crash reports)
app.setName('System Audio');

// Must be called before app is ready — enables webkitSpeechRecognition audio stream
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI');
app.commandLine.appendSwitch('enable-speech-dispatcher');

// ─── 2. Dock / Taskbar stealth ───────────────────────────────────────────────
// Hide from macOS Dock AND Cmd+Tab application switcher. Must be called before
// the app is ready. On Windows, skipTaskbar on the windows handles taskbar hiding.
if (process.platform === 'darwin') {
  app.dock.hide();
}

let mainWindow = null;
let overlayWindow = null;
let stealthInterval = null;

// ─── Main app window ─────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0A0A0F',
    // skipTaskbar keeps it off the Windows taskbar; macOS handled by dock.hide()
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── 3. Overlay window — invisible to all screen capture paths ───────────────
//
// How capture exclusion works on each platform:
//
//  macOS 12.3+  — ScreenCaptureKit (used by Zoom, Meet, Teams, OBS, QuickTime)
//    setContentProtection(true) → NSWindowSharingNone
//    SCK reads the sharing type before compositing; windows with SharingNone
//    are replaced with a black rect then excluded entirely from the stream.
//
//  macOS legacy — CGWindowListCreateImage (older Zoom, some 3rd-party recorders)
//    Also respects NSWindowSharingNone; window is excluded from the snapshot.
//
//  Windows — SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
//    setContentProtection(true) → WDA_EXCLUDEFROMCAPTURE via DwmSetWindowAttribute
//    Supported by all DirectX/GDI capture paths including OBS, ShareX, Teams.
//
// Re-applying stealth on show/focus/restore is essential — some Electron
// internals and OS events reset NSWindow sharingType between events.

function applyStealthMode(win) {
  win.setContentProtection(true);
  // 'screen-saver' level floats above full-screen apps including Zoom/Meet in FS mode.
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Also set the window level explicitly
  win.setLevel(1); // CGWindowLevelForKey('screenSaverWindow')
}

function createOverlayWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 460,
    height: 640,
    x: width - 480,
    y: 20,
    show: false,
    frame: false,
    // Opaque windows go through the standard compositor where
    // setContentProtection(true) reliably excludes the window from ALL capture
    // paths on macOS 12-14: SCK (Zoom/Meet/Teams), CGWindowListCreateImage, QuickTime.
    transparent: false,
    backgroundColor: '#0A0A0F',
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    focusable: true,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  // Apply stealth before loadURL — the window is protected from frame 0
  applyStealthMode(overlayWindow);

  // Re-enforce on every event that could reset NSWindow sharingType
  overlayWindow.on('show',    () => applyStealthMode(overlayWindow));
  overlayWindow.on('focus',   () => applyStealthMode(overlayWindow));
  overlayWindow.on('restore', () => applyStealthMode(overlayWindow));
  overlayWindow.on('move',    () => applyStealthMode(overlayWindow));
  overlayWindow.on('resize',  () => applyStealthMode(overlayWindow));
  overlayWindow.on('blur',    () => applyStealthMode(overlayWindow));

  overlayWindow.loadURL(APP_URL + '/float');
  overlayWindow.on('closed', () => { overlayWindow = null; clearInterval(stealthInterval); });

  // ── Periodic stealth re-enforcement ──────────────────────────────────────
  // Belt-and-suspenders: every 2 s, silently re-apply content protection
  // in case an OS update, Electron internal, or Accessibility API reset it.
  stealthInterval = setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      try { overlayWindow.setContentProtection(true); } catch {}
    }
  }, 2000);

  // ── Screen share detection ────────────────────────────────────────────────
  // Poll to detect if screen is being captured (e.g., Zoom/Meet share started)
  const captureCheckInterval = setInterval(async () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
      });
      
      // If there are multiple screens being captured, user likely started sharing
      // This is a heuristic - we can't directly detect Zoom's capture state
      const screenSources = sources.filter(s => s.id.startsWith('screen:'));
      if (screenSources.length > 0) {
        // User might be sharing - keep overlay hidden, show only when explicitly shown
        // Don't auto-show during potential share
      }
    } catch (e) {
      // Ignore errors in capture check
    }
  }, 3000);
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('show-overlay', () => {
  if (!overlayWindow) return;
  applyStealthMode(overlayWindow);   // always re-enforce before showing
  overlayWindow.show();
  overlayWindow.focus();
});

ipcMain.handle('hide-overlay', () => {
  overlayWindow?.hide();
});

ipcMain.handle('minimize-overlay', () => {
  overlayWindow?.minimize();
});

ipcMain.handle('toggle-overlay', () => {
  if (!overlayWindow) return;
  overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
});

// ─── 4. Show main window (since it's hidden from dock / Cmd+Tab) ──────────────
ipcMain.handle('show-main', () => {
  if (!mainWindow) createMainWindow();
  mainWindow.show();
  mainWindow.focus();
});

// Click-through: true = clicks pass through to app below; false = interactive
let clickthroughEnabled = false;

ipcMain.handle('set-clickthrough', (_, enable) => {
  clickthroughEnabled = enable;
  overlayWindow?.setIgnoreMouseEvents(enable, { forward: true });
});

ipcMain.handle('get-clickthrough', () => clickthroughEnabled);

ipcMain.handle('overlay-ready', () => {});

// ─── 5. Stealth verification — self-test that overlay is truly invisible ─────
//
// Captures the screen via desktopCapturer (which uses the same CGWindow /
// ScreenCaptureKit path as Zoom, Meet, and Teams) and checks whether the
// overlay window appears.  If setContentProtection is working, the overlay
// will be absent from the window source list returned by the OS.
//
// Returns { invisible: bool, details: string }
ipcMain.handle('verify-stealth', async () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return { invisible: true, details: 'Overlay not active' };
  }
  if (!overlayWindow.isVisible()) {
    return { invisible: true, details: 'Overlay hidden' };
  }

  try {
    // Ask the OS for all capturable windows — identical API path that
    // Zoom / Meet / Teams use under the hood on macOS (ScreenCaptureKit).
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 160, height: 90 },
    });

    // If the overlay's native window ID appears in the source list, it is
    // visible to screen-sharing apps.  Content-protected windows are excluded.
    const overlayId = overlayWindow.getMediaSourceId();
    const found = sources.find(s => s.id === overlayId);

    // Also check by title / name as a fallback (some Electron versions
    // return a different ID format).
    const appName = 'System Audio';
    const foundByName = sources.find(s =>
      s.name === appName || s.name.includes('float') || s.name.includes('Parakeet')
    );

    if (!found && !foundByName) {
      return { invisible: true, details: `Verified — overlay excluded from ${sources.length} capturable sources` };
    }
    return {
      invisible: false,
      details: found
        ? `EXPOSED — overlay found in capture sources as "${found.name}" (${found.id})`
        : `EXPOSED — window matching "${foundByName.name}" found in capture sources`,
    };
  } catch (err) {
    return { invisible: false, details: `Verification error: ${err.message}` };
  }
});

// ─── Panic: hide ALL windows instantly ───────────────────────────────────────
ipcMain.handle('panic-hide', () => {
  overlayWindow?.hide();
  mainWindow?.hide();
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
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  }));
});

ipcMain.handle('capture-source', async (_, sourceId) => {
  if (!ensureScreenPermission()) throw new Error('SCREEN_PERMISSION_DENIED');
  const { width, height } = screen.getPrimaryDisplay().size;
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width, height },
  });
  const source = sources.find((s) => s.id === sourceId);
  if (!source) return null;
  return source.thumbnail.toPNG().toString('base64');
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // ── Microphone permission ────────────────────────────────────────────────
  if (process.platform === 'darwin') {
    const micStatus = await systemPreferences.askForMediaAccess('microphone');
    if (!micStatus) {
      console.warn('[Electron] Microphone permission denied by macOS.');
    }
  }

  // Grant media/microphone permission requests from renderer pages
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(['media', 'microphone', 'audioCapture', 'geolocation'].includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'microphone', 'audioCapture'].includes(permission);
  });

  createMainWindow();
  createOverlayWindow();

  // ── Global shortcuts ─────────────────────────────────────────────────────

  // Toggle overlay: Cmd/Ctrl + Shift + Space
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!overlayWindow) return;
    overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
  });

  // Panic key: Cmd/Ctrl + Shift + H — instantly hides ALL windows
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    overlayWindow?.hide();
    mainWindow?.hide();
  });

  // Bring main window back (since dock is hidden): Cmd/Ctrl + Shift + M
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (!mainWindow) createMainWindow();
    mainWindow.show();
    mainWindow.focus();
  });

  // Trigger exam capture from anywhere: Cmd/Ctrl + Shift + C
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (!overlayWindow || !overlayWindow.isVisible()) return;
    overlayWindow.webContents.send('trigger-capture');
  });

  // Toggle click-through from anywhere (even when overlay is in passthru mode)
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (!overlayWindow || !overlayWindow.isVisible()) return;
    clickthroughEnabled = !clickthroughEnabled;
    overlayWindow.setIgnoreMouseEvents(clickthroughEnabled, { forward: true });
    overlayWindow.webContents.send('clickthrough-changed', clickthroughEnabled);
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// Keep running when all windows are closed (macOS) — app lives in background
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Don't recreate mainWindow on activate — app.dock is hidden, so this event
// only fires if the user somehow clicks the icon (shouldn't happen in stealth mode)
app.on('activate', () => {
  if (!mainWindow) createMainWindow();
});
