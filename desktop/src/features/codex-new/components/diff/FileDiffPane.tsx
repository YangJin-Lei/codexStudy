import { useState, useCallback, useMemo, useEffect } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { useCodexNewState } from "../../hooks/useCodexNewState";
import { useCodexNewConflicts } from "../../hooks/useCodexNewConflicts";
import { isCodexNewFileInConflict } from "../../utils/conflictFiles";
import { readDiffPaneMode, writeDiffPaneMode, type DiffPaneMode } from "../../services/diffPanePreferences";
import X from "lucide-react/dist/esm/icons/x";
import type { CodexNewHunkSelection } from "../../types";
import { formatWorkbenchFileLabel } from "../../utils/displayPath";
import { WorkbenchSelect } from "../workbench/WorkbenchSelect";
import { DiffHunkList } from "./DiffHunkList";
import { ThreeWayMergeView } from "./ThreeWayMergeView";
import "../FileDiffPane.css";

type FileDiffPaneProps = {
  filePath: string | null;
  onClose: () => void;
  onHunkToggle?: (path: string, hunkIndex: number) => void;
  selectedHunks?: CodexNewHunkSelection[];
};

type DiffMode = DiffPaneMode;

export function FileDiffPane({
  filePath,
  onClose,
  onHunkToggle,
  selectedHunks = [],
}: FileDiffPaneProps) {
  const { t } = useI18n();
  const state = useCodexNewState();
  const { pinnedPath } = useCodexNewConflicts();
  const workspaceId = state.activeSession?.workspaceId ?? null;
  const [diffMode, setDiffMode] = useState<DiffMode>(() => readDiffPaneMode());

  const diffFile = useMemo(() => {
    if (!filePath || !state.activeTask) {
      return null;
    }
    return state.activeTask.diff.files.find((file) => file.path === filePath) || null;
  }, [filePath, state.activeTask]);

  const changedFile = useMemo(() => {
    if (!filePath || !state.activeTask) {
      return null;
    }
    return state.activeTask.changedFiles.find((file) => file.path === filePath) || null;
  }, [filePath, state.activeTask]);

  const isConflictFile = useMemo(
    () =>
      filePath
        ? isCodexNewFileInConflict(filePath, state.activeTask, { pinnedPath })
        : false,
    [filePath, pinnedPath, state.activeTask],
  );

  useEffect(() => {
    writeDiffPaneMode(diffMode);
  }, [diffMode]);

  useEffect(() => {
    if (isConflictFile) {
      setDiffMode("three-way");
    }
  }, [filePath, isConflictFile]);

  const isHunkSelected = useCallback(
    (hunkIndex: number) => {
      if (!filePath) {
        return false;
      }
      return selectedHunks.some(
        (selection) => selection.path === filePath && selection.hunkIndex === hunkIndex,
      );
    },
    [filePath, selectedHunks],
  );

  const handleSelectAll = useCallback(() => {
    if (!filePath || !diffFile || !onHunkToggle) {
      return;
    }
    diffFile.hunks.forEach((_, idx) => {
      if (!isHunkSelected(idx)) {
        onHunkToggle(filePath, idx);
      }
    });
  }, [filePath, diffFile, onHunkToggle, isHunkSelected]);

  const handleDeselectAll = useCallback(() => {
    if (!filePath || !diffFile || !onHunkToggle) {
      return;
    }
    diffFile.hunks.forEach((_, idx) => {
      if (isHunkSelected(idx)) {
        onHunkToggle(filePath, idx);
      }
    });
  }, [filePath, diffFile, onHunkToggle, isHunkSelected]);

  if (!filePath || !diffFile) {
    return null;
  }

  const fileStatus = changedFile?.status || "modified";
  const isAccepted = changedFile?.accepted || false;
  const showThreeWay = diffMode === "three-way";
  const fileLabel = formatWorkbenchFileLabel(filePath);
  const diffModeOptions = [
    {
      value: "original-vs-clone" as const,
      label: t("codexNew.workbench.diff.modeOriginalVsClone", "Original vs Clone"),
    },
    {
      value: "clone-history" as const,
      label: t("codexNew.workbench.diff.modeCloneHistory", "Clone History"),
    },
    {
      value: "three-way" as const,
      label: t("codexNew.workbench.diff.modeThreeWay", "Three-way merge"),
    },
  ];

  return (
    <div className="file-diff-pane">
      <div className="file-diff-header">
        <div className="file-diff-title-row">
          <div className="file-diff-title">
            <span className={`file-status-badge status-${fileStatus}`}>
              {fileStatus === "added" ? "+" : fileStatus === "modified" ? "M" : "D"}
            </span>
            <span className="file-path" title={filePath}>
              {fileLabel}
            </span>
            {isConflictFile ? (
              <span className="file-conflict-badge">
                {t("codexNew.workbench.conflicts.fileBadge", "Conflict")}
              </span>
            ) : null}
            {isAccepted ? (
              <span className="file-merged-badge">
                {t("codexNew.workbench.diff.mergedBadge", "Merged")}
              </span>
            ) : null}
          </div>
          <button className="file-diff-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="file-diff-controls">
          <WorkbenchSelect value={diffMode} options={diffModeOptions} onChange={setDiffMode} />

          {!showThreeWay && onHunkToggle && diffFile.hunks.length > 0 ? (
            <div className="hunk-selection-controls">
              <button
                type="button"
                className="wb-btn-ghost"
                onClick={handleSelectAll}
                title={t("codexNew.workbench.diff.selectAllHunks", "Select all hunks")}
              >
                {t("codexNew.workbench.diff.selectAll", "Select All")}
              </button>
              <button
                type="button"
                className="wb-btn-ghost"
                onClick={handleDeselectAll}
                title={t("codexNew.workbench.diff.deselectAllHunks", "Deselect all hunks")}
              >
                {t("codexNew.workbench.diff.deselectAll", "Deselect All")}
              </button>
              <span className="hunk-selection-count">
                {selectedHunks.filter((selection) => selection.path === filePath).length} /{" "}
                {diffFile.hunks.length}{" "}
                {t("codexNew.workbench.diff.selectedCount", "selected")}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="file-diff-content">
        {showThreeWay ? (
          <ThreeWayMergeView
            workspaceId={workspaceId}
            filePath={filePath}
            diffFile={diffFile}
            selectedHunks={selectedHunks}
            onHunkToggle={onHunkToggle}
          />
        ) : fileStatus === "added" ? (
          <div className="file-diff-new">
            <div className="file-diff-notice">
              {t("codexNew.workbench.diff.newFile", "New file")}
            </div>
            <DiffHunkList
              filePath={filePath}
              hunks={diffFile.hunks}
              isHunkSelected={isHunkSelected}
              onHunkToggle={onHunkToggle}
            />
          </div>
        ) : fileStatus === "deleted" ? (
          <div className="file-diff-deleted">
            <div className="file-diff-notice">
              {t("codexNew.workbench.diff.deletedFile", "Deleted file")}
            </div>
            <DiffHunkList
              filePath={filePath}
              hunks={diffFile.hunks}
              isHunkSelected={isHunkSelected}
              onHunkToggle={onHunkToggle}
            />
          </div>
        ) : diffFile.isBinary ? (
          <div className="file-diff-binary">
            <div className="file-diff-notice">
              {t("codexNew.workbench.diff.binaryFile", "Binary file")}
            </div>
          </div>
        ) : diffFile.hunks.length === 0 ? (
          <div className="file-diff-empty">
            <div className="file-diff-notice">
              {t("codexNew.workbench.diff.noChanges", "No changes")}
            </div>
          </div>
        ) : (
          <DiffHunkList
            filePath={filePath}
            hunks={diffFile.hunks}
            isHunkSelected={isHunkSelected}
            onHunkToggle={onHunkToggle}
          />
        )}
      </div>
    </div>
  );
}
