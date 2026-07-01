import { app, globalShortcut, ipcMain, screen, type BrowserWindow, type Rectangle } from 'electron';
import type { IpcResult, WindowMode, WindowModeState } from '../../types.js';

/**
 * Full ↔ popup presentation of the single app window ("Cluely-style" floating
 * Ana). The window is never recreated — recreating it would reload the renderer
 * and drop the live Tavus/Daily call — so we morph its bounds/chrome in place
 * and tell the renderer to re-skin via `window:mode-changed`.
 */

const POPUP_COLLAPSED = { width: 320, height: 360 };
const POPUP_EXPANDED = { width: 880, height: 560 };
const POPUP_MARGIN = 16;
const FULL_MIN = { width: 960, height: 640 };
const POPUP_SHORTCUT = 'CommandOrControl+Shift+A';

let mode: WindowMode = 'full';
let popupExpanded = false;
/** Bounds + maximized state of the full window, restored on popup exit. */
let savedFullBounds: Rectangle | null = null;
let savedFullMaximized = false;
/** Last collapsed-popup position, so expand/collapse and re-entry keep the spot. */
let savedPopupBounds: Rectangle | null = null;

function state(): WindowModeState {
  return { mode, popupExpanded };
}

function broadcast(win: BrowserWindow): void {
  if (!win.isDestroyed()) win.webContents.send('window:mode-changed', state());
}

/** Keep the rect inside the work area of whichever display it lands on. */
function clampToWorkArea(bounds: Rectangle): Rectangle {
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

/** Default popup spot: bottom-right of the display the window is currently on. */
function defaultPopupBounds(win: BrowserWindow): Rectangle {
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  return {
    x: area.x + area.width - POPUP_COLLAPSED.width - POPUP_MARGIN,
    y: area.y + area.height - POPUP_COLLAPSED.height - POPUP_MARGIN,
    ...POPUP_COLLAPSED,
  };
}

/** Grow/shrink the popup keeping its bottom-right corner anchored. */
function anchoredResize(from: Rectangle, size: { width: number; height: number }): Rectangle {
  return clampToWorkArea({
    x: from.x + from.width - size.width,
    y: from.y + from.height - size.height,
    ...size,
  });
}

function setPopupChrome(win: BrowserWindow, popup: boolean): void {
  if (process.platform === 'darwin') {
    win.setWindowButtonVisibility(!popup);
  } else {
    // The overlay can't be removed at runtime; shrink it in popup so the native
    // close button stays available without eating the small window.
    try {
      win.setTitleBarOverlay({ color: '#141417', symbolColor: '#e0e0e0', height: popup ? 32 : 48 });
    } catch (err) {
      console.warn('[window] setTitleBarOverlay failed', err);
    }
  }
}

async function enterPopup(win: BrowserWindow): Promise<void> {
  if (mode === 'popup') return;

  savedFullMaximized = win.isMaximized();
  if (win.isFullScreen()) {
    // Leaving macOS native fullscreen is async; bounds are only meaningful after.
    const left = new Promise<void>((resolve) => win.once('leave-full-screen', () => resolve()));
    win.setFullScreen(false);
    await left;
    savedFullMaximized = false;
  }
  if (win.isMaximized()) win.unmaximize();
  savedFullBounds = win.getBounds();

  // Min size must shrink BEFORE bounds, or setBounds is clamped to 960×640.
  win.setMinimumSize(POPUP_COLLAPSED.width, POPUP_COLLAPSED.height);
  win.setBounds(savedPopupBounds ? clampToWorkArea(savedPopupBounds) : defaultPopupBounds(win));
  win.setResizable(false);
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setPopupChrome(win, true);

  mode = 'popup';
  popupExpanded = false;
  broadcast(win);
}

function exitPopup(win: BrowserWindow): void {
  if (mode === 'full') return;

  // Remember the collapsed spot for the next pop-out.
  savedPopupBounds = popupExpanded
    ? anchoredResize(win.getBounds(), POPUP_COLLAPSED)
    : win.getBounds();

  win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(false);
  win.setResizable(true);
  if (savedFullBounds) win.setBounds(savedFullBounds);
  win.setMinimumSize(FULL_MIN.width, FULL_MIN.height);
  if (savedFullMaximized) win.maximize();
  setPopupChrome(win, false);
  win.show();
  win.focus();

  mode = 'full';
  popupExpanded = false;
  broadcast(win);
}

function setExpanded(win: BrowserWindow, expanded: boolean): void {
  if (mode !== 'popup' || popupExpanded === expanded) return;
  if (expanded) {
    savedPopupBounds = win.getBounds();
    win.setBounds(anchoredResize(win.getBounds(), POPUP_EXPANDED));
  } else {
    win.setBounds(
      savedPopupBounds
        ? clampToWorkArea(savedPopupBounds)
        : anchoredResize(win.getBounds(), POPUP_COLLAPSED),
    );
  }
  popupExpanded = expanded;
  broadcast(win);
}

async function applyMode(win: BrowserWindow, next: WindowMode): Promise<void> {
  if (next === 'popup') await enterPopup(win);
  else exitPopup(win);
}

/** Called from createWindow(): a fresh window always starts in full presentation. */
export function resetWindowMode(): void {
  mode = 'full';
  popupExpanded = false;
  savedFullBounds = null;
  savedFullMaximized = false;
}

export function registerWindowIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('window:setMode', async (_e, next: WindowMode): Promise<IpcResult<WindowModeState>> => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return { error: 'No app window.' };
    try {
      await applyMode(win, next);
      return state();
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not switch window mode.' };
    }
  });

  ipcMain.handle('window:getMode', (): WindowModeState => state());

  ipcMain.handle(
    'window:setPopupExpanded',
    (_e, expanded: boolean): IpcResult<WindowModeState> => {
      const win = getWindow();
      if (!win || win.isDestroyed()) return { error: 'No app window.' };
      try {
        setExpanded(win, expanded);
        return state();
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not resize the popup.' };
      }
    },
  );
}

/**
 * Cmd/Ctrl+Shift+A from anywhere: hidden/minimized → surface as popup;
 * otherwise toggle full ↔ popup.
 */
export function registerPopupShortcut(getWindow: () => BrowserWindow | null): void {
  const ok = globalShortcut.register(POPUP_SHORTCUT, () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    void (async () => {
      if (!win.isVisible() || win.isMinimized()) {
        if (win.isMinimized()) win.restore();
        await enterPopup(win);
        win.show();
        win.focus();
      } else if (mode === 'full') {
        await enterPopup(win);
      } else {
        exitPopup(win);
      }
    })();
  });
  if (!ok) console.warn(`[window] Could not register global shortcut ${POPUP_SHORTCUT}`);

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
