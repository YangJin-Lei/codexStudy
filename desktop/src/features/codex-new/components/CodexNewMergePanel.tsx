import { useCallback, useMemo, useState } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import FileCode from "lucide-react/dist/esm/icons/file-code";
import FilePlus from "lucide-react/dist/esm/icons/file-plus";
import FileMinus from "lucide-react/dist/esm/icons/file-minus";
import GitMerge from "lucide-react/dist/esm/icons/git-merge";
import Square from "lucide-react/dist/esm/icons/square";
import CheckSquare from "lucide-react/dist/esm/icons/check-square";
import MinusSquare from "lucide-react/dist/esm/icons/minus-square";
import type {
  CodexNewActiveTask,
  CodexNewChangedFile,
  CodexNewDiffFile,
  CodexNewDiffHunk,
  CodexNewHunkSelection,
} from "../types";
import {
  describeFileMergeImpact,
  formatHunkRange,
  formatHunkStats,
} from "../utils/changeImpact";
import { CodexNewOperationImpactSummary } from "./CodexNewOperationImpactSummary";

type CodexNewMergePanelProps = {
  task: CodexNewActiveTask;
  isChinese: boolean;
  selectedPaths: string[];
  selectedHunks: CodexNewHunkSelection[];
  onTogglePath: (path: string) => void;
  onToggleHunk: (path: string, hunkIndex: number) => void;
  onMerge: () => void | Promise<void>;
  mergeBlocked: boolean;
  mergeBlockedReason: string | null;
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

type MergeFileItemProps = {
  file: CodexNewChangedFile;
  diffFile: CodexNewDiffFile | undefined;
  isChinese: boolean;
  isSelected: boolean;
  selectedHunks: number[];
  onTogglePath: () => void;
  onToggleHunk: (hunkIndex: number) => void;
};

function MergeFileItem({
  file,
  diffFile,
  isChinese,
  isSelected,
  selectedHunks,
  onTogglePath,
  onToggleHunk,
}: MergeFileItemProps) {
  const [expanded, setExpanded] = useState(false);

  const Icon = getFileIcon(file.status);
  const statusColor = getFileStatusColor(file.status);
  const statusLabel = getFileStatusLabel(file.status, isChinese);
  const impactDetail = describeFileMergeImpact(file, isChinese);

  const hasHunks = diffFile && diffFile.hunks.length > 0;
  const allHunksSelected = hasHunks && selectedHunks.length === diffFile.hunks.length;
  const someHunksSelected = hasHunks && selectedHunks.length > 0 && !allHunksSelected;

  const CheckIcon = isSelected
    ? CheckSquare
    : someHunksSelected
      ? MinusSquare
      : Square;

  const handleToggleExpand = useCallback(() => {
    if (hasHunks) {
      setExpanded((prev) => !prev);
    }
  }, [hasHunks]);

  return (
    <div className="codex-new-merge-file-item">
      <div className="codex-new-merge-file-header">
        <button
          type="button"
          className="codex-new-merge-file-check"
          onClick={onTogglePath}
          title={isChinese ? "选择整个文件" : "Select entire file"}
        >
          <CheckIcon size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="codex-new-merge-file-info"
          onClick={handleToggleExpand}
          disabled={!hasHunks}
        >
          {hasHunks && (
            <ChevronRight
              size={14}
              className={`codex-new-merge-file-chevron${expanded ? " is-expanded" : ""}`}
              aria-hidden
            />
          )}
          <Icon size={16} style={{ color: statusColor }} aria-hidden />
          <span className="codex-new-merge-file-copy">
            <span className="codex-new-merge-file-path">{file.path}</span>
            <span className="codex-new-merge-file-impact">{impactDetail}</span>
          </span>
          <span className="codex-new-merge-file-status" style={{ color: statusColor }}>
            {statusLabel}
          </span>
          {diffFile?.isBinary && (
            <span className="codex-new-merge-file-badge">
              {isChinese ? "二进制" : "Binary"}
            </span>
          )}
          {diffFile?.isLockfile && (
            <span className="codex-new-merge-file-badge">
              {isChinese ? "锁文件" : "Lockfile"}
            </span>
          )}
        </button>
      </div>
      {expanded && hasHunks && (
        <div className="codex-new-merge-file-hunks">
          {diffFile.hunks.map((hunk, index) => (
            <MergeHunkItem
              key={index}
              hunk={hunk}
              hunkIndex={index}
              isChinese={isChinese}
              isSelected={selectedHunks.includes(index)}
              onToggle={() => onToggleHunk(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type MergeHunkItemProps = {
  hunk: CodexNewDiffHunk;
  hunkIndex: number;
  isChinese: boolean;
  isSelected: boolean;
  onToggle: () => void;
};

function MergeHunkItem({ hunk, hunkIndex, isChinese, isSelected, onToggle }: MergeHunkItemProps) {
  const CheckIcon = isSelected ? CheckSquare : Square;

  return (
    <div className="codex-new-merge-hunk-item">
      <button
        type="button"
        className="codex-new-merge-hunk-header"
        onClick={onToggle}
      >
        <CheckIcon size={16} aria-hidden />
        <span className="codex-new-merge-hunk-copy">
          <span className="codex-new-merge-hunk-label">
            {isChinese ? `代码段 ${hunkIndex + 1}` : `Block ${hunkIndex + 1}`}
          </span>
          <span className="codex-new-merge-hunk-range">{formatHunkRange(hunk, isChinese)}</span>
          <span className="codex-new-merge-hunk-stats">{formatHunkStats(hunk, isChinese)}</span>
        </span>
      </button>
      {isSelected && (
        <div className="codex-new-merge-hunk-preview">
          {hunk.preview.slice(0, 10).map((line, idx) => (
            <div
              key={idx}
              className={`codex-new-merge-hunk-line${
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
            <div className="codex-new-merge-hunk-more">
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

export function CodexNewMergePanel({
  task,
  isChinese,
  selectedPaths,
  selectedHunks,
  onTogglePath,
  onToggleHunk,
  onMerge,
  mergeBlocked,
  mergeBlockedReason,
  pending,
}: CodexNewMergePanelProps) {
  const mergeableFiles = useMemo(
    () => task.changedFiles.filter((f) => !f.accepted),
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
    const totalFiles = mergeableFiles.length;
    const selectedFiles = selectedPaths.length;
    const selectedHunkCount = selectedHunks.length;
    return { totalFiles, selectedFiles, selectedHunkCount };
  }, [mergeableFiles.length, selectedPaths.length, selectedHunks.length]);

  const handleSelectAll = useCallback(() => {
    if (selectedPaths.length === mergeableFiles.length) {
      // 全部取消
      mergeableFiles.forEach((file) => {
        if (selectedPaths.includes(file.path)) {
          onTogglePath(file.path);
        }
      });
    } else {
      // 全部选择
      mergeableFiles.forEach((file) => {
        if (!selectedPaths.includes(file.path)) {
          onTogglePath(file.path);
        }
      });
    }
  }, [mergeableFiles, selectedPaths, onTogglePath]);

  const allSelected = selectedPaths.length === mergeableFiles.length && mergeableFiles.length > 0;
  const someSelected = selectedPaths.length > 0 && !allSelected;

  const SelectAllIcon = allSelected ? CheckSquare : someSelected ? MinusSquare : Square;

  const filesByPath = useMemo(
    () => new Map(task.changedFiles.map((file) => [file.path, file])),
    [task.changedFiles],
  );

  return (
    <div className="codex-new-merge-panel">
      <div className="codex-new-merge-panel-header">
        <div className="codex-new-merge-panel-title">
          <GitMerge size={16} aria-hidden />
          {isChinese ? "选择性合并" : "Selective Merge"}
        </div>
        <div className="codex-new-merge-panel-stats">
          {stats.selectedFiles > 0 && (
            <span className="codex-new-merge-stat">
              {isChinese
                ? `${stats.selectedFiles} 个文件`
                : `${stats.selectedFiles} file${stats.selectedFiles === 1 ? "" : "s"}`}
            </span>
          )}
          {stats.selectedHunkCount > 0 && (
            <span className="codex-new-merge-stat">
              {isChinese
                ? `${stats.selectedHunkCount} 个代码块`
                : `${stats.selectedHunkCount} hunk${stats.selectedHunkCount === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
      </div>

      {mergeableFiles.length === 0 ? (
        <div className="codex-new-merge-panel-empty">
          {isChinese ? "所有文件都已合并" : "All files have been merged"}
        </div>
      ) : (
        <>
          <CodexNewOperationImpactSummary
            mode="merge"
            isChinese={isChinese}
            selectedPaths={selectedPaths}
            selectedHunks={selectedHunks}
            filesByPath={filesByPath}
            diffFilesByPath={diffFilesByPath}
          />

          <div className="codex-new-merge-panel-actions">
            <button
              type="button"
              className="codex-new-merge-select-all"
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
              className="codex-new-merge-apply-button"
              onClick={() => void onMerge()}
              disabled={
                mergeBlocked ||
                pending ||
                (stats.selectedFiles === 0 && stats.selectedHunkCount === 0)
              }
              title={mergeBlockedReason ?? undefined}
            >
              <Check size={16} aria-hidden />
              {isChinese ? "合并到原项目" : "Merge to project"}
            </button>
          </div>

          {mergeBlockedReason && (
            <div className="codex-new-merge-panel-warning">
              {mergeBlockedReason}
            </div>
          )}

          <div className="codex-new-merge-panel-list">
            {mergeableFiles.map((file) => (
              <MergeFileItem
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
