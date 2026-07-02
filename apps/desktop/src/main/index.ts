import { app, BrowserWindow, session, systemPreferences } from 'electron';
import { join } from 'node:path';
import { handleAuthCallback } from './github/oauth.js';
import { registerAuthIpc } from './ipc/auth.js';
import { registerRepoIpc } from './ipc/repo.js';
import {
  registerConversationIpc,
  endActiveConversation,
  hasActiveConversation,
  startPanelStream,
} from './ipc/conversation.js';
import { registerFilesystemIpc } from './ipc/filesystem.js';
import { registerGitIpc } from './ipc/git.js';
import { registerBuildIpc } from './ipc/build.js';
import { registerWindowIpc, registerPopupShortcut, resetWindowMode } from './ipc/window.js';
import { registerProjectIpc } from './ipc/project.js';
import { registerRunIpc, stopAllRuns } from './ipc/run.js';

// Vite-plugin-electron injects these env vars in dev.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

const PROTOCOL = 'ana';

function registerDeepLink(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    // Dev on Windows: register with the explicit path to the electron binary.
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [join(process.argv[1] ?? '')]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

/** Pull an ana:// URL out of argv (Windows/Linux deep-link delivery). */
function deepLinkFromArgv(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
}

/**
 * Grant camera/microphone to the renderer so the Tavus (Daily) iframe can join
 * the call. Without this, Electron denies getUserMedia by default and Tavus ends
 * the conversation on its absent-participant timeout. On macOS we also trigger
 * the OS-level media prompts.
 */
async function setupMediaPermissions(): Promise<void> {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('microphone').catch(() => false);
    await systemPreferences.askForMediaAccess('camera').catch(() => false);
  }
}

function createWindow(): void {
  // A fresh window always starts in the full presentation.
  resetWindowMode();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#131316',
    // Integrated, frameless title bar (Cursor/VS Code style): the app's own top
    // bar becomes the window chrome. macOS insets the traffic lights over it;
    // Windows/Linux overlay the native min/max/close controls so we don't have
    // to reimplement them. The renderer marks the bar as a drag region.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 18 } }
      : {
          titleBarOverlay: {
            color: '#141417',
            symbolColor: '#e0e0e0',
            height: 48,
          },
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Let Ana's audio (rendered by DailyAudio in our page) play without a
      // per-element user gesture — otherwise the call connects but is silent.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  // Relay backend panel updates (from voice turns) to this window's renderer.
  startPanelStream(mainWindow);
}

// Single-instance lock so deep links reach the running app (Windows/Linux).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = deepLinkFromArgv(argv);
    if (url) handleAuthCallback(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS deep-link delivery.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleAuthCallback(url);
  });

  app.whenReady().then(async () => {
    registerDeepLink();
    await setupMediaPermissions();
    registerAuthIpc();
    registerRepoIpc();
    registerConversationIpc();
    registerFilesystemIpc();
    registerGitIpc();
    registerBuildIpc();
    registerWindowIpc(() => mainWindow);
    registerProjectIpc(() => mainWindow);
    registerRunIpc(() => mainWindow);
    createWindow();
    registerPopupShortcut(() => mainWindow);

    // Handle a deep link present at first launch (Windows/Linux).
    const initialUrl = deepLinkFromArgv(process.argv);
    if (initialUrl) handleAuthCallback(initialUrl);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // End the active Tavus conversation before quitting so it doesn't linger and
  // consume one of the account's concurrent-conversation slots.
  let cleaningUp = false;
  app.on('before-quit', (event) => {
    // Kill any dev servers Ana launched so they don't outlive the app.
    stopAllRuns();
    if (cleaningUp || !hasActiveConversation()) return;
    event.preventDefault();
    cleaningUp = true;
    void endActiveConversation().finally(() => app.quit());
  });
}
