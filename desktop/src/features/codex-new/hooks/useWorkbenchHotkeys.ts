import { useEffect } from "react";
import {
  requestCodexNewSessionNavNext,
  requestCodexNewSessionNavPrev,
} from "../services/uiEvents";

type UseWorkbenchHotkeysArgs = {
  selectedFilePath: string | null;
  onCloseDiff: () => void;
  onRefreshAll?: () => void;
};

export function useWorkbenchHotkeys({
  selectedFilePath,
  onCloseDiff,
  onRefreshAll,
}: UseWorkbenchHotkeysArgs) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedFilePath) {
        e.preventDefault();
        onCloseDiff();
        return;
      }

      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        const searchInput = document.querySelector(
          ".dual-tree-search-input",
        ) as HTMLInputElement | null;
        searchInput?.focus();
        return;
      }

      if (e.ctrlKey && e.key === "1") {
        e.preventDefault();
        const leftPanel = document.querySelector(".dual-tree-panel") as HTMLElement | null;
        leftPanel?.focus();
        return;
      }

      if (e.ctrlKey && e.key === "2") {
        e.preventDefault();
        const middlePanel = document.querySelector(
          ".session-workbench",
        ) as HTMLElement | null;
        middlePanel?.focus();
        return;
      }

      if (e.ctrlKey && e.key === "3") {
        e.preventDefault();
        const rightPanel = document.querySelector(
          ".sandbox-terminal",
        ) as HTMLElement | null;
        rightPanel?.focus();
        return;
      }

      if (e.ctrlKey && e.key === "ArrowUp") {
        e.preventDefault();
        requestCodexNewSessionNavPrev();
        return;
      }

      if (e.ctrlKey && e.key === "ArrowDown") {
        e.preventDefault();
        requestCodexNewSessionNavNext();
        return;
      }

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        onRefreshAll?.();
        return;
      }

      if (e.ctrlKey && e.key === "m" && !e.shiftKey) {
        e.preventDefault();
        const mergeButton = document.querySelector(
          '[data-codex-action="merge"]',
        ) as HTMLButtonElement | null;
        if (mergeButton && !mergeButton.disabled) {
          mergeButton.click();
        }
        return;
      }

      if (e.ctrlKey && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        const rollbackButton = document.querySelector(
          '[data-codex-action="rollback"]',
        ) as HTMLButtonElement | null;
        if (rollbackButton && !rollbackButton.disabled) {
          rollbackButton.click();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCloseDiff, onRefreshAll, selectedFilePath]);
}
