import { useMemo } from "react";
import { useCodexNewState } from "./useCodexNewState";
import {
  getCodexNewConflictPaths,
  hasCodexNewMergeConflict,
  readRememberedMergeConflictPath,
} from "../utils/conflictFiles";

export function useCodexNewConflicts() {
  const state = useCodexNewState();
  const workspaceId = state.activeSession?.workspaceId ?? null;

  const pinnedPath = useMemo(() => {
    if (!workspaceId) {
      return null;
    }
    return readRememberedMergeConflictPath(workspaceId);
  }, [workspaceId, state.activeTask?.status, state.lastUpdatedAt]);

  const conflictPaths = useMemo(
    () => getCodexNewConflictPaths(state.activeTask, { pinnedPath }),
    [pinnedPath, state.activeTask],
  );

  const hasMergeConflict = useMemo(
    () => hasCodexNewMergeConflict(state.activeTask),
    [state.activeTask],
  );

  return {
    conflictPaths,
    hasMergeConflict,
    pinnedPath,
    conflictCount: conflictPaths.length,
  };
}
