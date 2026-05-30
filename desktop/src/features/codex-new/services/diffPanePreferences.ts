export type DiffPaneMode = "original-vs-clone" | "clone-history" | "three-way";

const DIFF_MODE_STORAGE_KEY = "codex-new:diff-pane:mode";

export function readDiffPaneMode(): DiffPaneMode {
  if (typeof window === "undefined") {
    return "original-vs-clone";
  }
  const saved = localStorage.getItem(DIFF_MODE_STORAGE_KEY);
  if (saved === "original-vs-clone" || saved === "clone-history" || saved === "three-way") {
    return saved;
  }
  return "original-vs-clone";
}

export function writeDiffPaneMode(mode: DiffPaneMode) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(DIFF_MODE_STORAGE_KEY, mode);
}
