import { useEffect, useState } from "react";
import {
  CODEX_NEW_STATE_EVENT,
  CODEX_NEW_STORAGE_KEY,
  readCodexNewState,
  refreshCodexNewState,
} from "../state";
import type { CodexNewFrontendState } from "../types";

type CodexNewStateListener = () => void;

let refreshIntervalId: number | null = null;
let refreshInFlight = false;
const listeners = new Set<CodexNewStateListener>();

function notifyListeners() {
  listeners.forEach((listener) => {
    listener();
  });
}

function startSharedRefreshLoop() {
  if (typeof window === "undefined" || refreshIntervalId !== null) {
    return;
  }
  refreshIntervalId = window.setInterval(() => {
    if (refreshInFlight) {
      return;
    }
    refreshInFlight = true;
    void refreshCodexNewState()
      .then(() => {
        notifyListeners();
      })
      .finally(() => {
        refreshInFlight = false;
      });
  }, 2000);
}

function stopSharedRefreshLoop() {
  if (typeof window === "undefined" || refreshIntervalId === null) {
    return;
  }
  if (listeners.size > 0) {
    return;
  }
  window.clearInterval(refreshIntervalId);
  refreshIntervalId = null;
}

export function useCodexNewState() {
  const [state, setState] = useState<CodexNewFrontendState>(() => readCodexNewState());

  useEffect(() => {
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

    listeners.add(sync);
    startSharedRefreshLoop();
    if (!refreshInFlight) {
      refreshInFlight = true;
      void refreshCodexNewState()
        .then(sync)
        .finally(() => {
          refreshInFlight = false;
        });
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CODEX_NEW_STATE_EVENT, handleLocalEvent as EventListener);
    return () => {
      listeners.delete(sync);
      stopSharedRefreshLoop();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CODEX_NEW_STATE_EVENT, handleLocalEvent as EventListener);
    };
  }, []);

  return state;
}
