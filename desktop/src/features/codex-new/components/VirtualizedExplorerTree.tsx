import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import {
  DUAL_TREE_ROW_HEIGHT_PX,
  DUAL_TREE_VIRTUAL_OVERSCAN,
  flattenDualTreeRows,
  type DualTreeFlatRow,
} from "../utils/dualTreeFlatten";
import { getDualTreeFileIcon, type DualTreeFileNode } from "../utils/dualTreeModel";

type VirtualizedExplorerTreeProps = {
  treeId: string;
  fileTree: DualTreeFileNode[];
  emptyLabel: string;
  expandedNodes: Set<string>;
  childRenderLimit: Record<string, number>;
  onToggleNode: (nodeKey: string) => void;
  onLoadMoreChildren: (nodeKey: string) => void;
  onFileClick: (path: string) => void;
  loadMoreLabel: string;
};

function ExplorerTreeRow({
  row,
  expandedNodes,
  onToggleNode,
  onLoadMoreChildren,
  onFileClick,
  loadMoreLabel,
}: {
  row: DualTreeFlatRow;
  expandedNodes: Set<string>;
  onToggleNode: (nodeKey: string) => void;
  onLoadMoreChildren: (nodeKey: string) => void;
  onFileClick: (path: string) => void;
  loadMoreLabel: string;
}) {
  if (row.kind === "load-more") {
    return (
      <button
        type="button"
        className="file-tree-node-content dual-tree-load-more"
        style={{ paddingLeft: `${row.depth * 1.25}rem` }}
        onClick={() => onLoadMoreChildren(row.nodeKey)}
      >
        <span className="file-tree-name">
          {loadMoreLabel.replace("{count}", String(row.remainingCount))}
        </span>
      </button>
    );
  }

  const { node, depth, nodeKey } = row;
  const iconInfo = getDualTreeFileIcon(node.status, node.accepted, node.hasConflict);
  const expanded = expandedNodes.has(nodeKey);

  return (
    <div
      className="file-tree-node-content"
      style={{ paddingLeft: `${depth * 1.25}rem` }}
      onClick={() => {
        if (node.isDirectory) {
          onToggleNode(nodeKey);
        } else {
          onFileClick(node.path);
        }
      }}
    >
      {node.isDirectory ? (
        <span className="file-tree-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      ) : null}
      {iconInfo ? (
        <span className="file-tree-icon" style={{ color: iconInfo.color }}>
          {iconInfo.icon}
        </span>
      ) : null}
      <span className="file-tree-name">{node.name}</span>
    </div>
  );
}

export function VirtualizedExplorerTree({
  treeId,
  fileTree,
  emptyLabel,
  expandedNodes,
  childRenderLimit,
  onToggleNode,
  onLoadMoreChildren,
  onFileClick,
  loadMoreLabel,
}: VirtualizedExplorerTreeProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const flatRows = useMemo(
    () => flattenDualTreeRows(treeId, fileTree, expandedNodes, childRenderLimit),
    [childRenderLimit, expandedNodes, fileTree, treeId],
  );

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => DUAL_TREE_ROW_HEIGHT_PX,
    overscan: DUAL_TREE_VIRTUAL_OVERSCAN,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  if (fileTree.length === 0) {
    return (
      <div className="dual-tree-empty dual-tree-section-empty">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      className="file-tree file-tree-virtual-host"
      ref={listRef}
      style={{ ["--dual-tree-row-height" as string]: `${DUAL_TREE_ROW_HEIGHT_PX}px` }}
    >
      <div
        className="file-tree-virtual"
        style={{ height: rowVirtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const row = flatRows[virtualRow.index];
          if (!row) {
            return null;
          }
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="file-tree-virtual-row"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ExplorerTreeRow
                row={row}
                expandedNodes={expandedNodes}
                onToggleNode={onToggleNode}
                onLoadMoreChildren={onLoadMoreChildren}
                onFileClick={onFileClick}
                loadMoreLabel={loadMoreLabel}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
