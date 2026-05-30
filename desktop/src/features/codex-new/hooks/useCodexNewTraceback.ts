import { useCallback, useEffect, useState } from "react";
import { listCodexNewTracebackBackend } from "@/services/tauri";
import { restoreCodexNewTraceback } from "../state";
import type { CodexNewTracebackEntry, CodexNewTracebackRestoreTarget } from "../types";

export function useCodexNewTraceback(
  workspaceId: string | null,
  refreshToken: number,
  enabled: boolean,
) {
  const [entries, setEntries] = useState<CodexNewTracebackEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const reload = useCallback(async () => {
    if (!workspaceId || !enabled) {
      setEntries([]);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const next = await listCodexNewTracebackBackend(workspaceId);
      setEntries(next);
    } catch (error) {
      setEntries([]);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshToken]);

  const restore = useCallback(
    async (path: string, target: CodexNewTracebackRestoreTarget) => {
      if (!workspaceId) {
        return;
      }
      setIsRestoring(true);
      try {
        await restoreCodexNewTraceback(workspaceId, path, target);
        await reload();
      } finally {
        setIsRestoring(false);
      }
    },
    [reload, workspaceId],
  );

  return {
    entries,
    isLoading,
    loadError,
    isRestoring,
    reload,
    restore,
  };
}
