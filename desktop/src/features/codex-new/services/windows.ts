export type CodexNewWindowLabel = "codex-new-process" | "codex-new-terminal";

const windowTitles: Record<CodexNewWindowLabel, string> = {
  "codex-new-process": "codex-new Process",
  "codex-new-terminal": "codex-new Terminal",
};

const windowSizes: Record<
  CodexNewWindowLabel,
  { width: number; height: number; minWidth: number; minHeight: number }
> = {
  "codex-new-process": {
    width: 920,
    height: 760,
    minWidth: 760,
    minHeight: 560,
  },
  "codex-new-terminal": {
    width: 960,
    height: 720,
    minWidth: 760,
    minHeight: 520,
  },
};

async function focusExistingWindow(label: CodexNewWindowLabel) {
  const module = await import("@tauri-apps/api/webviewWindow");
  const windows = await Promise.resolve(module.getAllWebviewWindows?.() ?? []);
  const existing = windows.find((entry) => entry.label === label);
  if (!existing) {
    return null;
  }
  await existing.show?.();
  await existing.unminimize?.();
  await existing.setFocus?.();
  return existing;
}

export async function openCodexNewWindow(label: CodexNewWindowLabel) {
  try {
    const existing = await focusExistingWindow(label);
    if (existing) {
      return existing;
    }
    const module = await import("@tauri-apps/api/webviewWindow");
    const size = windowSizes[label];
    return new module.WebviewWindow(label, {
      title: windowTitles[label],
      url: "index.html",
      width: size.width,
      height: size.height,
      minWidth: size.minWidth,
      minHeight: size.minHeight,
      resizable: true,
      center: true,
      focus: true,
    });
  } catch (error) {
    console.warn(`Unable to open ${label}.`, error);
    return null;
  }
}

export async function ensureCodexNewWorkbenchWindows() {
  await openCodexNewWindow("codex-new-process");
}

