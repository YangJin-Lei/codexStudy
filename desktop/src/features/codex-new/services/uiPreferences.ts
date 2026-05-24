const TERMINAL_DOCK_REQUEST_KEY = "codex-new-terminal-dock-request";
const TERMINAL_DOCK_HEIGHT_KEY = "codex-new-terminal-dock-height";

const DEFAULT_TERMINAL_DOCK_HEIGHT = 280;
const MIN_TERMINAL_DOCK_HEIGHT = 140;
const MAX_TERMINAL_DOCK_HEIGHT = 720;

export function requestCodexNewTerminalDockOpen() {
  try {
    sessionStorage.setItem(TERMINAL_DOCK_REQUEST_KEY, "1");
  } catch {
    // ignore
  }
}

export function consumeCodexNewTerminalDockRequest() {
  try {
    const requested = sessionStorage.getItem(TERMINAL_DOCK_REQUEST_KEY) === "1";
    sessionStorage.removeItem(TERMINAL_DOCK_REQUEST_KEY);
    return requested;
  } catch {
    return false;
  }
}

export function readCodexNewTerminalDockHeight() {
  try {
    const raw = localStorage.getItem(TERMINAL_DOCK_HEIGHT_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      return DEFAULT_TERMINAL_DOCK_HEIGHT;
    }
    return Math.min(MAX_TERMINAL_DOCK_HEIGHT, Math.max(MIN_TERMINAL_DOCK_HEIGHT, parsed));
  } catch {
    return DEFAULT_TERMINAL_DOCK_HEIGHT;
  }
}

export function writeCodexNewTerminalDockHeight(height: number) {
  try {
    const clamped = Math.min(
      MAX_TERMINAL_DOCK_HEIGHT,
      Math.max(MIN_TERMINAL_DOCK_HEIGHT, Math.round(height)),
    );
    localStorage.setItem(TERMINAL_DOCK_HEIGHT_KEY, String(clamped));
  } catch {
    // ignore
  }
}
