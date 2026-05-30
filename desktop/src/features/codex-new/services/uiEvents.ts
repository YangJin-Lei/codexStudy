export const CODEX_NEW_SESSION_NAV_PREV_EVENT = "codex-new:session-nav-prev";
export const CODEX_NEW_SESSION_NAV_NEXT_EVENT = "codex-new:session-nav-next";
export const CODEX_NEW_FOCUS_CONFLICT_FILTER_EVENT = "codex-new:focus-conflict-filter";
export const CODEX_NEW_PROCESS_TAB_EVENT = "codex-new:process-tab";

export type CodexNewProcessTab = "timeline" | "changes" | "review" | "summary";

export function requestCodexNewConflictFilterFocus() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(CODEX_NEW_FOCUS_CONFLICT_FILTER_EVENT));
}

export function requestCodexNewSessionNavPrev() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(CODEX_NEW_SESSION_NAV_PREV_EVENT));
}

export function requestCodexNewSessionNavNext() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(CODEX_NEW_SESSION_NAV_NEXT_EVENT));
}

export function requestCodexNewProcessTab(tab: CodexNewProcessTab) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(CODEX_NEW_PROCESS_TAB_EVENT, { detail: { tab } }),
  );
}
