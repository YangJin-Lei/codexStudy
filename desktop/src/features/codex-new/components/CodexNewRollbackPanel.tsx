import { useCallback, useMemo, useState } from "react";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import FileCode from "lucide-react/dist/esm/icons/file-code";
import FilePlus from "lucide-react/dist/esm/icons/file-plus";
import FileMinus from "lucide-react/dist/esm/icons/file-minus";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Square from "lucide-react/dist/esm/icons/square";
import CheckSquare from "lucide-react/dist/esm/icons/check-square";
import MinusSquare from "lucide-react/dist/esm/icons/minus-square";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import type {
  CodexNewActiveTask,
  CodexNewChangedFile,
  CodexNewDiffFile,
  CodexNewDiffHunk,
  CodexNewHunkSelection,
} from "../types";
import {
  describeFileRollbackImpact,
  formatHunkRange,
  formatHunkStats,
} from "../utils/changeImpact";
import { CodexNewOperationImpactSummary } from "./CodexNewOperationImpactSummary";

type CodexNewRollbackPanelProps = {
  task: CodexNewActiveTask;
  isChinese: boolean;
  selectedPaths: string[];
  selectedHunks: CodexNewHunkSelection[];
  onTogglePath: (path: string) => void;
  onToggleHunk: (path: string, hunkIndex: number) => void;
  onRollback: () => void | Promise<void>;
  pending: boolean;
};

function getFileIcon(status: CodexNewChangedFile["status"]) {
  switch (status) {
    case "added":
      return FilePlus;
    case "deleted":
      return FileMinus;
    case "modified":
      return FileCode;
    default:
      return FileCode;
  }
}

function getFileStatusColor(status: CodexNewChangedFile["status"]) {
  switch (status) {
    case "added":
      return "#22c55e";
    case "deleted":
      return "#ef4444";
    case "modified":
      return "#f59e0b";
    default:
      return "var(--text-muted)";
  }
}

function getFileStatusLabel(status: CodexNewChangedFile["status"], isChinese: boolean) {
  switch (status) {
    case "added":
      return isChinese ? "新增" : "Added";
    case "deleted":
      return isChinese ? "删除" : "Deleted";
    case "modified":
      return isChinese ? "修改" : "Modified";
    default:
      return "";
  }
}

type RollbackFileItemProps = {
  file: CodexNewChangedFile;
  diffFile: CodexNewDiffFile | undefined;
  isChinese: boolean;
  isSelected: boolean;
  selectedHunks: number[];
  onTogglePath: () => void;
  onToggleHunk: (hunkIndex: number) => void;
};

function RollbackFileItem({
  file,
  diffFile,
  isChinese,
  isSelected,
  selectedHunks,
  onTogglePath,
  onToggleHunk,
}: RollbackFileItemProps) {
  const [expanded, setExpanded] = useState(false);

  const Icon = getFileIcon(file.status);
  const statusColor = getFileStatusColor(file.status);
  const statusLabel = getFileStatusLabel(file.status, isChinese);
  const impactDetail = describeFileRollbackImpact(file, isChinese);

  const mergedHunks = file.mergedHunks ?? [];
  const hasPartialMerge = mergedHunks.length > 0;
  const allHunksSelected = hasPartialMerge && selectedHunks.length === mergedHunks.length;
  const someHunksSelected = hasPartialMerge && selectedHunks.length > 0 && !allHunksSelected;

  const CheckIcon = isSelected
    ? CheckSquare
    : someHunksSelected
      ? MinusSquare
      : Square;

  const handleToggleExpand = useCallback(() => {
    if (hasPartialMerge) {
      setExpanded((prev) => !prev);
    }
  }, [hasPartialMerge]);

  return (
    <div className="codex-new-rollback-file-item">
      <div className="codex-new-rollback-file-header">
        <button
          type="button"
          className="codex-new-rollback-file-check"
          onClick={onTogglePath}
          title={isChinese ? "选择整个文件" : "Select entire file"}
        >
          <CheckIcon size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="codex-new-rollback-file-info"
          onClick={handleToggleExpand}
          disabled={!hasPartialMerge}
        >
          {hasPartialMerge && (
            <ChevronRight
              size={14}
              className={`codex-new-rollback-file-chevron${expanded ? " is-expanded" : ""}`}
              aria-hidden
            />
          )}
          <Icon size={16} style={{ color: statusColor }} aria-hidden />
          <span className="codex-new-rollback-file-copy">
            <span className="codex-new-rollback-file-path">{file.path}</span>
            <span className="codex-new-rollback-file-impact">{impactDetail}</span>
          </span>
          <span className="codex-new-rollback-file-status" style={{ color: statusColor }}>
            {statusLabel}
          </span>
          {hasPartialMerge ? (
            <span className="codex-new-rollback-file-badge is-partial">
              {isChinese
                ? `部分合并 (${mergedHunks.length} 块)`
                : `Partial (${mergedHunks.length} hunks)`}
            </span>
          ) : (
            <span className="codex-new-rollback-file-badge is-full">
              {isChinese ? "完整合并" : "Full merge"}
            </span>
          )}
        </button>
      </div>
      {expanded && hasPartialMerge && diffFile && (
        <div className="codex-new-rollback-file-hunks">
          {mergedHunks.map((hunkIndex) => {
            const hunk = diffFile.hunks[hunkIndex];
            if (!hunk) return null;
            return (
              <RollbackHunkItem
                key={hunkIndex}
                hunk={hunk}
                hunkIndex={hunkIndex}
                isChinese={isChinese}
                isSelected={selectedHunks.includes(hunkIndex)}
                onToggle={() => onToggleHunk(hunkIndex)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

type RollbackHunkItemProps = {
  hunk: CodexNewDiffHunk;
  hunkIndex: number;
  isChinese: boolean;
  isSelected: boolean;
  onToggle: () => void;
};

function RollbackHunkItem({
  hunk,
  hunkIndex,
  isChinese,
  isSelected,
  onToggle,
}: RollbackHunkItemProps) {
  const CheckIcon = isSelected ? CheckSquare : Square;

  return (
    <div className="codex-new-rollback-hunk-item">
      <button
        type="button"
        className="codex-new-rollback-hunk-header"
        onClick={onToggle}
      >
        <CheckIcon size={16} aria-hidden />
        <span className="codex-new-rollback-hunk-copy">
          <span className="codex-new-rollback-hunk-label">
            {isChinese ? `代码段 ${hunkIndex + 1}` : `Block ${hunkIndex + 1}`}
          </span>
          <span className="codex-new-rollback-hunk-range">{formatHunkRange(hunk, isChinese)}</span>
          <span className="codex-new-rollback-hunk-stats">{formatHunkStats(hunk, isChinese)}</span>
        </span>
      </button>
      {isSelected && (
        <div className="codex-new-rollback-hunk-preview">
          {hunk.preview.slice(0, 10).map((line, idx) => (
            <div
              key={idx}
              className={`codex-new-rollback-hunk-line${
                line.startsWith("+")
                  ? " is-add"
                  : line.startsWith("-")
                    ? " is-del"
                    : ""
              }`}
            >
              {line}
            </div>
          ))}
          {hunk.preview.length > 10 && (
            <div className="codex-new-rollback-hunk-more">
              {isChinese
                ? `... 还有 ${hunk.preview.length - 10} 行`
                : `... ${hunk.preview.length - 10} more lines`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CodexNewRollbackPanel({
  task,
  isChinese,
  selectedPaths,
  selectedHunks,
  onTogglePath,
  onToggleHunk,
  onRollback,
  pending,
}: CodexNewRollbackPanelProps) {
  const mergedFiles = useMemo(
    () => task.changedFiles.filter((f) => f.accepted),
    [task.changedFiles],
  );

  const diffFilesByPath = useMemo(
    () => new Map(task.diff.files.map((f) => [f.path, f])),
    [task.diff.files],
  );

  const selectedHunksByPath = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const selection of selectedHunks) {
      const existing = map.get(selection.path) ?? [];
      existing.push(selection.hunkIndex);
      map.set(selection.path, existing);
    }
    return map;
  }, [selectedHunks]);

  const stats = useMemo(() => {
    const totalFiles = mergedFiles.length;
    const selectedFiles = selectedPaths.length;
    const selectedHunkCount = selectedHunks.length;
    const partialMergeCount = mergedFiles.filter(
      (f) => f.mergedHunks && f.mergedHunks.length > 0,
    ).length;
    return { totalFiles, selectedFiles, selectedHunkCount, partialMergeCount };
  }, [mergedFiles, selectedPaths.length, selectedHunks.length]);

  const handleSelectAll = useCallback(() => {
    if (selectedPaths.length === mergedFiles.length) {
      // 全部取消
      mergedFiles.forEach((file) => {
        if (selectedPaths.includes(file.path)) {
          onTogglePath(file.path);
        }
      });
    } else {
      // 全部选择
      mergedFiles.forEach((file) => {
        if (!selectedPaths.includes(file.path)) {
          onTogglePath(file.path);
        }
      });
    }
  }, [mergedFiles, selectedPaths, onTogglePath]);

  const allSelected = selectedPaths.length === mergedFiles.length && mergedFiles.length > 0;
  const someSelected = selectedPaths.length > 0 && !allSelected;

  const SelectAllIcon = allSelected ? CheckSquare : someSelected ? MinusSquare : Square;

  const filesByPath = useMemo(
    () => new Map(task.changedFiles.map((file) => [file.path, file])),
    [task.changedFiles],
  );

  return (
    <div className="codex-new-rollback-panel">
      <div className="codex-new-rollback-panel-header">
        <div className="codex-new-rollback-panel-title">
          <RotateCcw size={16} aria-hidden />
          {isChinese ? "回滚已合并文件" : "Rollback Merged Files"}
        </div>
        <div className="codex-new-rollback-panel-stats">
          {stats.selectedFiles > 0 && (
            <span className="codex-new-rollback-stat">
              {isChinese
                ? `${stats.selectedFiles} 个文件`
                : `${stats.selectedFiles} file${stats.selectedFiles === 1 ? "" : "s"}`}
            </span>
          )}
          {stats.selectedHunkCount > 0 && (
            <span className="codex-new-rollback-stat">
              {isChinese
                ? `${stats.selectedHunkCount} 个代码块`
                : `${stats.selectedHunkCount} hunk${stats.selectedHunkCount === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
      </div>

      {mergedFiles.length === 0 ? (
        <div className="codex-new-rollback-panel-empty">
          {isChinese ? "还没有已合并的文件" : "No merged files yet"}
        </div>
      ) : (
        <>
          <div className="codex-new-rollback-panel-warning">
            <AlertTriangle size={16} aria-hidden />
            <span>
              {isChinese
                ? "回滚会将选中的文件恢复到合并前的状态。此操作会修改原项目文件。"
                : "Rollback will restore selected files to their pre-merge state. This will modify your original project files."}
            </span>
          </div>

          <CodexNewOperationImpactSummary
            mode="rollback"
            isChinese={isChinese}
            selectedPaths={selectedPaths}
            selectedHunks={selectedHunks}
            filesByPath={filesByPath}
            diffFilesByPath={diffFilesByPath}
          />

          <div className="codex-new-rollback-panel-actions">
            <button
              type="button"
              className="codex-new-rollback-select-all"
              onClick={handleSelectAll}
            >
              <SelectAllIcon size={16} aria-hidden />
              {allSelected
                ? isChinese
                  ? "取消全选"
                  : "Deselect all"
                : isChinese
                  ? "全选"
                  : "Select all"}
            </button>
            <button
              type="button"
              className="codex-new-rollback-apply-button"
              onClick={() => void onRollback()}
              disabled={
                pending || (stats.selectedFiles === 0 && stats.selectedHunkCount === 0)
              }
            >
              <RotateCcw size={16} aria-hidden />
              {isChinese ? "执行回滚" : "Execute rollback"}
            </button>
          </div>

          {stats.partialMergeCount > 0 && (
            <div className="codex-new-rollback-panel-info">
              {isChinese
                ? `${stats.partialMergeCount} 个文件是部分合并的，可以选择回滚特定代码块。`
                : `${stats.partialMergeCount} file${stats.partialMergeCount === 1 ? " is" : "s are"} partially merged. You can rollback specific hunks.`}
            </div>
          )}

          <div className="codex-new-rollback-panel-list">
            {mergedFiles.map((file) => (
              <RollbackFileItem
                key={file.path}
                file={file}
                diffFile={diffFilesByPath.get(file.path)}
                isChinese={isChinese}
                isSelected={selectedPaths.includes(file.path)}
                selectedHunks={selectedHunksByPath.get(file.path) ?? []}
                onTogglePath={() => onTogglePath(file.path)}
                onToggleHunk={(hunkIndex) => onToggleHunk(file.path, hunkIndex)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
