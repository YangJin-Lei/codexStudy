import type { DualTreeFileNode } from "../utils/dualTreeModel";
import { VirtualizedExplorerTree } from "./VirtualizedExplorerTree";

type DualTreeSectionProps = {
  treeId: string;
  title: string;
  subtitle: string;
  subtitleTitle?: string;
  fileTree: DualTreeFileNode[];
  onFileClick: (path: string) => void;
  emptyLabel: string;
  expandedNodes: Set<string>;
  onToggleNode: (nodeKey: string) => void;
  childRenderLimit: Record<string, number>;
  onLoadMoreChildren: (nodeKey: string) => void;
  loadMoreLabel: string;
};

export function DualTreeSection({
  treeId,
  title,
  subtitle,
  subtitleTitle,
  fileTree,
  onFileClick,
  emptyLabel,
  expandedNodes,
  onToggleNode,
  childRenderLimit,
  onLoadMoreChildren,
  loadMoreLabel,
}: DualTreeSectionProps) {
  return (
    <section className="dual-tree-section">
      <div className="dual-tree-section-header">
        <div className="dual-tree-section-title">{title}</div>
        <div className="dual-tree-section-subtitle" title={subtitleTitle ?? subtitle}>
          {subtitle}
        </div>
      </div>
      <VirtualizedExplorerTree
        treeId={treeId}
        fileTree={fileTree}
        emptyLabel={emptyLabel}
        expandedNodes={expandedNodes}
        childRenderLimit={childRenderLimit}
        onToggleNode={onToggleNode}
        onLoadMoreChildren={onLoadMoreChildren}
        onFileClick={onFileClick}
        loadMoreLabel={loadMoreLabel}
      />
    </section>
  );
}
