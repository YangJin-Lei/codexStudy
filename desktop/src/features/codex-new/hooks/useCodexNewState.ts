import { useEffect, useState } from "react";
import {
  CODEX_NEW_STATE_EVENT,
  CODEX_NEW_STORAGE_KEY,
  readCodexNewState,
  refreshCodexNewState,
} from "../state";
import type { CodexNewFrontendState } from "../types";

export function useCodexNewState() {
  const [state, setState] = useState<CodexNewFrontendState>(() => readCodexNewState());

  useEffect(() => {
    void refreshCodexNewState();
    const sync = () => {
      setState(readCodexNewState());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== CODEX_NEW_STORAGE_KEY) {
        return;
      }
      sync();
    };
    const handleLocalEvent = () => {
      sync();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CODEX_NEW_STATE_EVENT, handleLocalEvent as EventListener);
    const interval = window.setInterval(() => {
      void refreshCodexNewState();
    }, 2000);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CODEX_NEW_STATE_EVENT, handleLocalEvent as EventListener);
      window.clearInterval(interval);
    };
  }, []);

  return state;
}
