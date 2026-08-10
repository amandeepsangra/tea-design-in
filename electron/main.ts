import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - System.Environment.name
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;
// Set true right before we programmatically close the window after the renderer has
// confirmed it's safe to do so — lets the 'close' listener below tell "real" close
// requests apart from our own follow-up call.
let forceClose = false;

// ─── .tea file-association support ───
// Holds a file path that arrived before the window/renderer was ready to receive it
// (cold launch by double-clicking a .tea file). Flushed once the page finishes loading.
let pendingFilePath: string | null = null;
// process.argv never changes during the process's lifetime, so its launch-time .tea
// path (if any) must only be consumed once — otherwise every subsequent 'did-finish-load'
// (e.g. a new window via 'activate') would re-open the same file again.
let launchArgvChecked = false;

function extractTeaPathFromArgv(argv: string[]): string | null {
  const found = argv.find(a => /\.tea$/i.test(a) || /\.te$/i.test(a));
  return found || null;
}

function openTeaFile(filePath: string) {
  if (win && win.webContents && !win.webContents.isLoadingMainFrame()) {
    sendTeaFileToRenderer(filePath);
  } else {
    pendingFilePath = filePath;
  }
}

function sendTeaFileToRenderer(filePath: string) {
  fs.readFile(filePath, 'utf-8', (err, content) => {
    if (err) {
      console.error('Failed to read .tea file:', err);
      return;
    }
    win?.webContents.send('file:open-path', { name: path.basename(filePath), content });
  });
}

// macOS: fired when a .tea file is double-clicked (both cold launch and already-running).
// Must be registered before app is ready.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openTeaFile(filePath);
});

// Windows/Linux have no 'open-file' event — the OS instead launches a new process with
// the file path as an argv entry. We use a single-instance lock so double-clicking a
// .tea file while the app is already running re-uses the existing window instead of
// spawning a second one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const filePath = extractTeaPathFromArgv(argv);
    if (filePath) openTeaFile(filePath);
  });
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,        // Remove OS title bar completely
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    title: 'Tea Design In',
    backgroundColor: '#1a1a1a',
  });

  // Window control IPC handlers
  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:maximize', () => {
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on('window:close', () => win?.close());
  ipcMain.handle('window:isMaximized', () => win?.isMaximized());

  // Unsaved-changes guard: intercept the close request, ask the renderer whether it's
  // safe to close. The renderer replies via 'app:confirm-close' once the user has
  // confirmed (or if there was nothing to confirm).
  win.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    win?.webContents.send('app:before-close');
  });
  ipcMain.on('app:confirm-close', () => {
    forceClose = true;
    win?.close();
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());

    // Flush a file-association open request that arrived before the page was ready
    // (cold launch via double-click), plus this process's own launch argv on
    // Windows/Linux (the OS passes the double-clicked file as an argv entry there) —
    // the argv check only ever runs once per app launch, see launchArgvChecked above.
    let launchFilePath = pendingFilePath;
    pendingFilePath = null;
    if (!launchFilePath && !launchArgvChecked) {
      launchFilePath = extractTeaPathFromArgv(process.argv);
    }
    launchArgvChecked = true;
    if (launchFilePath) sendTeaFileToRenderer(launchFilePath);
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);
