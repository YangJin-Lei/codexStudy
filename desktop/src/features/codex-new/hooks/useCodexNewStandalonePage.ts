import { useEffect } from "react";

/** Lock the standalone workbench window to a fixed viewport; scrolling lives in {@link CodexNewWorkbenchScroll}. */
export function useCodexNewStandalonePage() {
  useEffect(() => {
    document.documentElement.classList.add("codex-new-standalone-page");
    return () => {
      document.documentElement.classList.remove("codex-new-standalone-page");
    };
  }, []);
}
