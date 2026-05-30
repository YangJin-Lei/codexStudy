import { useMemo } from "react";
import type { CodexNewActiveTask } from "../types";
import {
  buildDualTreeFromPaths,
  dedupeDualTreePaths,
  normalizeDualTreePath,
  type DualTreeFileNode,
} from "../utils/dualTreeModel";
import type { DualTreeFilterMode } from "../services/dualTreePreferences";

type UseDualTreeDataArgs = {
  activeTask: CodexNewActiveTask | null;
  filterMode: DualTreeFilterMode;
  debouncedSearchQuery: string;
  workspaceFiles: string[];
  conflictPaths: string[];
};

function filterPathsByQuery(paths: string[], query: string) {
  if (!query) {
    return paths;
  }
  const normalized = query.toLowerCase();
  return paths.filter((path) => path.toLowerCase().includes(normalized));
}

export function useDualTreeData({
  activeTask,
  filterMode,
  debouncedSearchQuery,
  workspaceFiles,
  conflictPaths,
}: UseDualTreeDataArgs) {
  const conflictPathSet = useMemo(
    () => new Set(conflictPaths.map(normalizeDualTreePath)),
    [conflictPaths],
  );
  const changedFileMap = useMemo(() => {
    const map = new Map<string, CodexNewActiveTask["changedFiles"][number]>();
    for (const file of activeTask?.changedFiles ?? []) {
      map.set(normalizeDualTreePath(file.path), file);
    }
    return map;
  }, [activeTask?.changedFiles]);

  const filteredChangedFiles = useMemo(() => {
    if (!activeTask) {
      return [];
    }

    let files = activeTask.changedFiles;
    if (filterMode === "pending") {
      files = files.filter((file) => !file.accepted);
    } else if (filterMode === "conflict") {
      files = files.filter((file) => conflictPathSet.has(normalizeDualTreePath(file.path)));
    } else if (filterMode === "all") {
      return files;
    }

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      files = files.filter((file) => file.path.toLowerCase().includes(query));
    }

    return files;
  }, [activeTask, conflictPathSet, debouncedSearchQuery, filterMode]);

  const originalTree = useMemo((): DualTreeFileNode[] => {
    if (!activeTask) {
      return [];
    }
    if (filterMode === "all") {
      return buildDualTreeFromPaths(
        filterPathsByQuery(workspaceFiles, debouncedSearchQuery),
        changedFileMap,
        conflictPathSet,
      );
    }
    return buildDualTreeFromPaths(
      dedupeDualTreePaths(filteredChangedFiles.map((file) => file.path)),
      changedFileMap,
      conflictPathSet,
    );
  }, [
    activeTask,
    changedFileMap,
    conflictPathSet,
    debouncedSearchQuery,
    filterMode,
    filteredChangedFiles,
    workspaceFiles,
  ]);

  const isolatedTree = useMemo((): DualTreeFileNode[] => {
    if (!activeTask) {
      return [];
    }
    if (filterMode === "all") {
      const paths = dedupeDualTreePaths([
        ...workspaceFiles,
        ...activeTask.changedFiles.map((file) => file.path),
      ]);
      return buildDualTreeFromPaths(
        filterPathsByQuery(paths, debouncedSearchQuery),
        changedFileMap,
        conflictPathSet,
      );
    }
    return buildDualTreeFromPaths(
      dedupeDualTreePaths(filteredChangedFiles.map((file) => file.path)),
      changedFileMap,
      conflictPathSet,
    );
  }, [
    activeTask,
    changedFileMap,
    conflictPathSet,
    debouncedSearchQuery,
    filterMode,
    filteredChangedFiles,
    workspaceFiles,
  ]);

  return { originalTree, isolatedTree };
}
