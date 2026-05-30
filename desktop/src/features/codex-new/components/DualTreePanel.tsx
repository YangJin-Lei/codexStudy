import { useState, useCallback, useEffect } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { useCodexNewState } from "../hooks/useCodexNewState";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useDualTreeExpansion } from "../hooks/useDualTreeExpansion";
import { useDualTreeWorkspaceFiles } from "../hooks/useDualTreeWorkspaceFiles";
import { useDualTreeData } from "../hooks/useDualTreeData";
import {
  readDualTreeFilterMode,
  writeDualTreeFilterMode,
  type DualTreeFilterMode,
} from "../services/dualTreePreferences";
import Search from "lucide-react/dist/esm/icons/search";
import FolderTree from "lucide-react/dist/esm/icons/folder-tree";
import { WorkbenchPanelHeader } from "./workbench/WorkbenchPanelHeader";
import { WorkbenchFilterPills } from "./workbench/WorkbenchFilterPills";
import { formatWorkbenchPath } from "../utils/displayPath";
import { DualTreeSection } from "./DualTreeSection";
import { ConflictStatsStrip } from "./ConflictStatsStrip";
import { ExplorerLoadErrorBanner } from "./explorer/ExplorerLoadErrorBanner";
import { ExplorerLoadingIndicator } from "./explorer/ExplorerLoadingIndicator";
import { useCodexNewConflicts } from "../hooks/useCodexNewConflicts";
import {
  CODEX_NEW_FOCUS_CONFLICT_FILTER_EVENT,
  requestCodexNewConflictFilterFocus,
} from "../services/uiEvents";
import "./DualTreePanel.css";

type DualTreePanelProps = {
  width: number;
  onWidthChange: (width: number) => void;
  activeThreadId: string | null;
  onFileSelect: (path: string) => void;
};

export function DualTreePanel({
  width,
  onWidthChange,
  activeThreadId: _activeThreadId,
  onFileSelect,
}: DualTreePanelProps) {
  const { t } = useI18n();
  const state = useCodexNewState();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [filterMode, setFilterMode] = useState<DualTreeFilterMode>(readDualTreeFilterMode);
  const [isResizing, setIsResizing] = useState(false);

  const activeTask = state.activeTask;
  const activeWorkspaceId = state.activeSession?.workspaceId ?? null;
  const { conflictPaths, conflictCount } = useCodexNewConflicts();

  const {
    workspaceFiles,
    isLoading: isLoadingWorkspaceFiles,
    isBackgroundRefresh,
    loadError: workspaceFileLoadError,
    reload: reloadWorkspaceFiles,
    hasCachedFiles,
  } = useDualTreeWorkspaceFiles(activeWorkspaceId, activeTask?.taskId ?? null);

  const {
    expandedNodes,
    childRenderLimit,
    toggleNode,
    loadMoreChildren,
    ensureRootFoldersExpanded,
  } = useDualTreeExpansion(activeWorkspaceId, filterMode);

  const { originalTree, isolatedTree } = useDualTreeData({
    activeTask,
    filterMode,
    debouncedSearchQuery,
    workspaceFiles,
    conflictPaths,
  });

  useEffect(() => {
    const onFocusConflictFilter = () => {
      setFilterMode("conflict");
    };
    window.addEventListener(CODEX_NEW_FOCUS_CONFLICT_FILTER_EVENT, onFocusConflictFilter);
    return () => {
      window.removeEventListener(CODEX_NEW_FOCUS_CONFLICT_FILTER_EVENT, onFocusConflictFilter);
    };
  }, []);

  useEffect(() => {
    writeDualTreeFilterMode(filterMode);
  }, [filterMode]);

  useEffect(() => {
    if (filterMode !== "all" || isLoadingWorkspaceFiles) {
      return;
    }
    ensureRootFoldersExpanded([
      { treeId: "original", nodes: originalTree },
      { treeId: "isolated", nodes: isolatedTree },
    ]);
  }, [
    ensureRootFoldersExpanded,
    filterMode,
    isolatedTree,
    isLoadingWorkspaceFiles,
    originalTree,
  ]);

  const handleFileClick = useCallback(
    (path: string) => {
      onFileSelect(path);
    },
    [onFileSelect],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  const loadMoreLabel = t(
    "codexNew.workbench.explorer.loadMoreChildren",
    "Load {count} more...",
  );

  const filterOptions: { value: DualTreeFilterMode; label: string }[] = [
    { value: "all", label: t("codexNew.workbench.explorer.filterAll", "All") },
    { value: "changed", label: t("codexNew.workbench.explorer.filterChanged", "Changed") },
    { value: "pending", label: t("codexNew.workbench.explorer.filterPending", "Pending") },
    { value: "conflict", label: t("codexNew.workbench.explorer.filterConflicts", "Conflicts") },
  ];

  const renderTreeBody = () => {
    if (!activeTask) {
      return (
        <div className="dual-tree-empty">
          <p>{t("codexNew.workbench.explorer.emptyNoTask", "No active task")}</p>
        </div>
      );
    }
    const blockingLoad = isLoadingWorkspaceFiles && filterMode === "all" && !hasCachedFiles;
    if (blockingLoad) {
      return (
        <div className="dual-tree-empty">
          <ExplorerLoadingIndicator isBlocking isBackgroundRefresh={false} />
        </div>
      );
    }
    if (workspaceFileLoadError && filterMode === "all") {
      return (
        <ExplorerLoadErrorBanner
          message={workspaceFileLoadError}
          isRetrying={isLoadingWorkspaceFiles}
          onRetry={reloadWorkspaceFiles}
        />
      );
    }
    if (originalTree.length === 0 && isolatedTree.length === 0) {
      return (
        <div className="dual-tree-empty">
          <p>{t("codexNew.workbench.explorer.emptyNoMatch", "No files match the current filter")}</p>
        </div>
      );
    }

    return (
      <div className="dual-tree-sections">
        <DualTreeSection
          treeId="original"
          title={t("codexNew.workbench.explorer.sectionOriginal", "Original Project")}
          subtitle={formatWorkbenchPath(activeTask.originalRoot)}
          subtitleTitle={activeTask.originalRoot}
          fileTree={originalTree}
          onFileClick={handleFileClick}
          emptyLabel={t("codexNew.workbench.explorer.sectionEmpty", "No files in this view")}
          expandedNodes={expandedNodes}
          onToggleNode={toggleNode}
          childRenderLimit={childRenderLimit}
          onLoadMoreChildren={loadMoreChildren}
          loadMoreLabel={loadMoreLabel}
        />
        <DualTreeSection
          treeId="isolated"
          title={t("codexNew.workbench.explorer.sectionClone", "Isolated Clone")}
          subtitle={formatWorkbenchPath(activeTask.workspaceRoot)}
          subtitleTitle={activeTask.workspaceRoot}
          fileTree={isolatedTree}
          onFileClick={handleFileClick}
          emptyLabel={t("codexNew.workbench.explorer.sectionEmpty", "No files in this view")}
          expandedNodes={expandedNodes}
          onToggleNode={toggleNode}
          childRenderLimit={childRenderLimit}
          onLoadMoreChildren={loadMoreChildren}
          loadMoreLabel={loadMoreLabel}
        />
      </div>
    );
  };

  return (
    <div className="dual-tree-panel" style={{ width: `${width}px` }} tabIndex={-1}>
      <WorkbenchPanelHeader
        icon={<FolderTree size={14} />}
        title={t("codexNew.workbench.explorer.title", "Explorer")}
      >
        <div className="dual-tree-search">
          <Search size={14} />
          <input
            type="text"
            placeholder={t("codexNew.workbench.explorer.searchPlaceholder", "Search files...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="dual-tree-search-input"
          />
        </div>
        <WorkbenchFilterPills value={filterMode} options={filterOptions} onChange={setFilterMode} />
        <ConflictStatsStrip
          conflictCount={conflictCount}
          onViewConflicts={requestCodexNewConflictFilterFocus}
        />
        <ExplorerLoadingIndicator
          isBlocking={false}
          isBackgroundRefresh={isBackgroundRefresh && filterMode === "all"}
        />
      </WorkbenchPanelHeader>

      <div className="dual-tree-content">{renderTreeBody()}</div>

      <div
        className="dual-tree-resizer"
        onMouseDown={handleMouseDown}
        style={{ cursor: isResizing ? "col-resize" : "ew-resize" }}
      />
    </div>
  );
}
