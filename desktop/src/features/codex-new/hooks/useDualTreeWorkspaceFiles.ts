import { useCallback, useEffect, useRef, useState } from "react";
import { dedupeDualTreePaths } from "../utils/dualTreeModel";
import { fetchWorkspaceFilesWithTimeout } from "../services/explorerFiles";

/**
 * Loads workspace file paths for the explorer "All" mode.
 * Does not depend on codex-new poll ticks — that caused perpetual loading.
 */
export function useDualTreeWorkspaceFiles(
  workspaceId: string | null,
  taskId: string | null,
) {
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackgroundRefresh, setIsBackgroundRefresh] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const cachedFilesRef = useRef<string[]>([]);

  cachedFilesRef.current = workspaceFiles;

  const reload = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceFiles([]);
      setLoadError(null);
      setIsLoading(false);
      setIsBackgroundRefresh(false);
      cachedFilesRef.current = [];
      return;
    }

    let aborted = false;
    const cachedFiles = cachedFilesRef.current;
    const hasCachedFiles = cachedFiles.length > 0;

    if (hasCachedFiles) {
      setIsBackgroundRefresh(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    void fetchWorkspaceFilesWithTimeout(workspaceId)
      .then((paths) => {
        if (aborted) {
          return;
        }
        setWorkspaceFiles(dedupeDualTreePaths(Array.isArray(paths) ? paths : []));
      })
      .catch((error) => {
        if (aborted) {
          return;
        }
        if (!hasCachedFiles) {
          setWorkspaceFiles([]);
        }
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!aborted) {
          setIsLoading(false);
          setIsBackgroundRefresh(false);
        }
      });

    return () => {
      aborted = true;
    };
  }, [reloadNonce, taskId, workspaceId]);

  return {
    workspaceFiles,
    isLoading,
    isBackgroundRefresh,
    loadError,
    reload,
    hasCachedFiles: workspaceFiles.length > 0,
  };
}
