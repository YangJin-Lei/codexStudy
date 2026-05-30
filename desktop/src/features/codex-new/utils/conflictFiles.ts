import type { CodexNewActiveTask } from "../types";
import { normalizeDualTreePath } from "./dualTreeModel";

const LAST_MERGE_CONFLICT_PATH_PREFIX = "codex-new:last-merge-conflict-path:";

function sortConflictPaths(paths: string[], pinnedPath?: string | null): string[] {
  const unique = [...new Set(paths.map((path) => normalizeDualTreePath(path)).filter(Boolean))];
  unique.sort((left, right) => left.localeCompare(right));
  if (!pinnedPath) {
    return unique;
  }
  const normalizedPinned = normalizeDualTreePath(pinnedPath);
  const pinnedIndex = unique.indexOf(normalizedPinned);
  if (pinnedIndex <= 0) {
    return unique;
  }
  return [normalizedPinned, ...unique.filter((path) => path !== normalizedPinned)];
}

export function parseMergeConflictPath(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/merge conflict for ([^:]+):/i);
  return match?.[1]?.trim() ?? null;
}

export function rememberMergeConflictPath(workspaceId: string, path: string | null) {
  if (!path || typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(`${LAST_MERGE_CONFLICT_PATH_PREFIX}${workspaceId}`, path);
}

export function readRememberedMergeConflictPath(workspaceId: string): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  return sessionStorage.getItem(`${LAST_MERGE_CONFLICT_PATH_PREFIX}${workspaceId}`);
}

export function clearRememberedMergeConflictPath(workspaceId: string) {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.removeItem(`${LAST_MERGE_CONFLICT_PATH_PREFIX}${workspaceId}`);
}

export function hasCodexNewMergeConflict(task: CodexNewActiveTask | null): boolean {
  if (!task) {
    return false;
  }
  if (task.status === "mergeConflict") {
    return true;
  }
  return task.changedFiles.some((file) => file.mergeStatus === "conflict");
}

export function getCodexNewConflictPaths(
  task: CodexNewActiveTask | null,
  options?: { pinnedPath?: string | null },
): string[] {
  if (!task) {
    return [];
  }

  const explicitConflicts = task.changedFiles
    .filter((file) => file.mergeStatus === "conflict")
    .map((file) => file.path);
  if (explicitConflicts.length > 0) {
    return sortConflictPaths(explicitConflicts, options?.pinnedPath);
  }

  if (task.status !== "mergeConflict") {
    return [];
  }

  const pendingPaths = task.changedFiles.filter((file) => !file.accepted).map((file) => file.path);
  return sortConflictPaths(pendingPaths, options?.pinnedPath);
}

export function isCodexNewFileInConflict(
  path: string,
  task: CodexNewActiveTask | null,
  options?: { pinnedPath?: string | null },
): boolean {
  const normalized = normalizeDualTreePath(path);
  return getCodexNewConflictPaths(task, options).some(
    (conflictPath) => normalizeDualTreePath(conflictPath) === normalized,
  );
}
