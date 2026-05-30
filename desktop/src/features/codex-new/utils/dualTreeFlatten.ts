import type { DualTreeFileNode } from "./dualTreeModel";

export type DualTreeFlatRow =
  | {
      kind: "node";
      treeId: string;
      node: DualTreeFileNode;
      depth: number;
      nodeKey: string;
    }
  | {
      kind: "load-more";
      treeId: string;
      nodeKey: string;
      depth: number;
      remainingCount: number;
    };

export const DUAL_TREE_ROW_HEIGHT_PX = 28;
export const DUAL_TREE_INITIAL_CHILD_BATCH = 120;
export const DUAL_TREE_CHILD_BATCH_STEP = 120;
export const DUAL_TREE_VIRTUAL_OVERSCAN = 10;

export function flattenDualTreeRows(
  treeId: string,
  nodes: DualTreeFileNode[],
  expandedNodes: Set<string>,
  childRenderLimit: Record<string, number>,
  initialChildBatch: number = DUAL_TREE_INITIAL_CHILD_BATCH,
): DualTreeFlatRow[] {
  const rows: DualTreeFlatRow[] = [];

  const walk = (node: DualTreeFileNode, depth: number) => {
    const nodeKey = `${treeId}:${node.path}`;
    rows.push({ kind: "node", treeId, node, depth, nodeKey });

    if (!node.isDirectory || !expandedNodes.has(nodeKey)) {
      return;
    }

    const children = node.children ?? [];
    const limit = childRenderLimit[nodeKey] ?? initialChildBatch;
    const visibleChildren = children.slice(0, limit);

    for (const child of visibleChildren) {
      walk(child, depth + 1);
    }

    if (children.length > visibleChildren.length) {
      rows.push({
        kind: "load-more",
        treeId,
        nodeKey,
        depth: depth + 1,
        remainingCount: children.length - visibleChildren.length,
      });
    }
  };

  for (const node of nodes) {
    walk(node, 0);
  }

  return rows;
}
