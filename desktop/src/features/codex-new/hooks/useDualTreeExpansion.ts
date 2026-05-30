import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DUAL_TREE_CHILD_BATCH_STEP,
  DUAL_TREE_INITIAL_CHILD_BATCH,
} from "../utils/dualTreeFlatten";
import type { DualTreeFileNode } from "../utils/dualTreeModel";
import {
  dualTreeExpansionStorageKey,
  readDualTreeExpansionSnapshot,
  writeDualTreeExpansionSnapshot,
  type DualTreeFilterMode,
} from "../services/dualTreePreferences";

export function useDualTreeExpansion(
  workspaceId: string | null,
  filterMode: DualTreeFilterMode,
) {
  const storageKey = useMemo(
    () => dualTreeExpansionStorageKey(workspaceId, filterMode),
    [filterMode, workspaceId],
  );
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [childRenderLimit, setChildRenderLimit] = useState<Record<string, number>>({});

  useEffect(() => {
    const snapshot = readDualTreeExpansionSnapshot(storageKey);
    setExpandedNodes(new Set(snapshot.expandedNodes));
    setChildRenderLimit(snapshot.childRenderLimit);
  }, [storageKey]);

  useEffect(() => {
    writeDualTreeExpansionSnapshot(storageKey, {
      expandedNodes: Array.from(expandedNodes),
      childRenderLimit,
    });
  }, [childRenderLimit, expandedNodes, storageKey]);

  const toggleNode = useCallback((nodeKey: string) => {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
    setChildRenderLimit((current) => {
      if (current[nodeKey]) {
        return current;
      }
      return {
        ...current,
        [nodeKey]: DUAL_TREE_INITIAL_CHILD_BATCH,
      };
    });
  }, []);

  const loadMoreChildren = useCallback((nodeKey: string) => {
    setChildRenderLimit((current) => ({
      ...current,
      [nodeKey]: (current[nodeKey] ?? DUAL_TREE_INITIAL_CHILD_BATCH) + DUAL_TREE_CHILD_BATCH_STEP,
    }));
  }, []);

  const ensureRootFoldersExpanded = useCallback(
    (trees: { treeId: string; nodes: DualTreeFileNode[] }[]) => {
      setExpandedNodes((current) => {
        if (current.size > 0) {
          return current;
        }
        const next = new Set(current);
        for (const { treeId, nodes } of trees) {
          for (const node of nodes) {
            if (node.isDirectory) {
              next.add(`${treeId}:${node.path}`);
            }
          }
        }
        return next;
      });
    },
    [],
  );

  return {
    expandedNodes,
    childRenderLimit,
    toggleNode,
    loadMoreChildren,
    ensureRootFoldersExpanded,
  };
}
