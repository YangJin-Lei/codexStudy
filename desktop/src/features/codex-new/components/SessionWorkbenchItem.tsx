import { useCallback, useEffect, useMemo, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { useI18n } from "@/i18n/I18nProvider";
import type { CodexNewActiveTask, CodexNewThreadRegistryEntry } from "../types";
import type { CodexNewMergeGateReason } from "../utils/reviewGate";
import { SessionChangedFileRow } from "./session/SessionChangedFileRow";
import { SessionGateStatusRow } from "./session/SessionGateStatusRow";
import { LoadingSpinner } from "./LoadingSpinner";

type SessionWorkbenchItemProps = {
  threadEntry: CodexNewThreadRegistryEntry;
  activeTask: CodexNewActiveTask | null;
  isActive: boolean;
  selectedFilePath: string | null;
  onActivate: () => void;
  onFileClick: (path: string) => void;
  onMerge: () => void;
  onRollback: () => void;
  onOpenTraceback: () => void;
  onOpenReview: () => void;
  isMerging: boolean;
  isRollingBack: boolean;
  mergeGateReason: CodexNewMergeGateReason | null;
  sidePanel: "traceback" | "review" | null;
};

export function SessionWorkbenchItem({
  threadEntry,
  activeTask,
  isActive,
  selectedFilePath,
  onActivate,
  onFileClick,
  onMerge,
  onRollback,
  onOpenTraceback,
  onOpenReview,
  isMerging,
  isRollingBack,
  mergeGateReason,
  sidePanel,
}: SessionWorkbenchItemProps) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsExpanded(true);
    }
  }, [isActive]);

  useEffect(() => {
    const savedState = localStorage.getItem(
      `codex-new:session:${threadEntry.threadId}:expanded`,
    );
    if (savedState === "true") {
      setIsExpanded(true);
    }
  }, [threadEntry.threadId]);

  useEffect(() => {
    localStorage.setItem(
      `codex-new:session:${threadEntry.threadId}:expanded`,
      String(isExpanded),
    );
  }, [threadEntry.threadId, isExpanded]);

  const pendingCount = useMemo(
    () => activeTask?.changedFiles.filter((f) => !f.accepted).length ?? 0,
    [activeTask],
  );
  const addedCount = useMemo(
    () => activeTask?.changedFiles.filter((f) => f.status === "added").length ?? 0,
    [activeTask],
  );
  const modifiedCount = useMemo(
    () => activeTask?.changedFiles.filter((f) => f.status === "modified").length ?? 0,
    [activeTask],
  );
  const deletedCount = useMemo(
    () => activeTask?.changedFiles.filter((f) => f.status === "deleted").length ?? 0,
    [activeTask],
  );

  const handleToggleExpand = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const handleHeaderClick = useCallback(() => {
    if (!isActive) {
      onActivate();
      setIsExpanded(true);
      return;
    }
    setIsExpanded((expanded) => !expanded);
  }, [isActive, onActivate]);

  return (
    <div className={`session-item${isActive ? " is-active" : ""}${isExpanded ? " is-expanded" : ""}`}>
      <div
        className="session-item-header"
        onClick={handleHeaderClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleHeaderClick();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <button
          className="session-expand-button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleExpand();
          }}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="session-item-info">
          <div className="session-item-title">
            {threadEntry.threadTitle || t("codexNew.workbench.sessionItem.untitled", "Untitled conversation")}
          </div>
          <div className="session-item-meta">
            <span className="session-workspace-name">{threadEntry.workspaceName}</span>
            {pendingCount > 0 && (
              <span className="session-pending-badge">
                {t("codexNew.workbench.sessionItem.pending", "{count} pending").replace(
                  "{count}",
                  String(pendingCount),
                )}
              </span>
            )}
          </div>
        </div>

        {isActive && <div className="session-active-indicator" />}
      </div>

      {isExpanded && (
        <div className="session-item-body">
          {!activeTask ? (
            <div className="session-no-task">
              <p>{t("codexNew.workbench.sessionItem.noActiveTask", "No active task in this session")}</p>
            </div>
          ) : (
            <>
              <SessionGateStatusRow task={activeTask} />

              <div className="session-stats">
                <div className="session-stat-item">
                  <span className="session-stat-label">{t("codexNew.workbench.sessionItem.changes", "Changes:")}</span>
                  <span className="session-stat-value">
                    {addedCount > 0 && (
                      <span className="stat-added">
                        {t("codexNew.workbench.sessionItem.added", "{count} added").replace(
                          "{count}",
                          String(addedCount),
                        )}
                      </span>
                    )}
                    {modifiedCount > 0 && (
                      <span className="stat-modified">
                        {t("codexNew.workbench.sessionItem.modified", "{count} modified").replace(
                          "{count}",
                          String(modifiedCount),
                        )}
                      </span>
                    )}
                    {deletedCount > 0 && (
                      <span className="stat-deleted">
                        {t("codexNew.workbench.sessionItem.deleted", "{count} deleted").replace(
                          "{count}",
                          String(deletedCount),
                        )}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="session-file-list">
                <div className="session-file-list-header">{t("codexNew.workbench.sessionItem.files", "Files")}</div>
                {activeTask.changedFiles.length === 0 ? (
                  <div className="session-file-list-empty">
                    {t("codexNew.workbench.sessionItem.noChangedFiles", "No changed files")}
                  </div>
                ) : (
                  <div className="session-file-items">
                    {activeTask.changedFiles.slice(0, 10).map((file) => (
                      <SessionChangedFileRow
                        key={file.path}
                        file={file}
                        isSelected={selectedFilePath === file.path}
                        onSelect={() => onFileClick(file.path)}
                      />
                    ))}
                    {activeTask.changedFiles.length > 10 && (
                      <div className="session-file-more">
                        {t("codexNew.workbench.sessionItem.moreFiles", "{count} more files...").replace(
                          "{count}",
                          String(activeTask.changedFiles.length - 10),
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="session-actions">
                <button
                  className="session-action-button primary"
                  data-codex-action="merge"
                  onClick={onMerge}
                  disabled={
                    isMerging ||
                    isRollingBack ||
                    pendingCount === 0 ||
                    mergeGateReason !== null
                  }
                  title={
                    mergeGateReason?.kind === "reviewMissing"
                      ? t("codexNew.workbench.gates.runReviewBeforeMerge", "Run review before merging.")
                      : mergeGateReason?.kind === "testsBlocked"
                        ? t("codexNew.workbench.gates.testsBeforeMerge", "A passing test run is required before merge.")
                        : undefined
                  }
                >
                  {isMerging ? (
                    <>
                      <LoadingSpinner size="small" inline />
                      <span>{t("codexNew.workbench.sessionItem.merging", "Merging...")}</span>
                    </>
                  ) : (
                    t("codexNew.workbench.sessionItem.mergeToProject", "Merge to project")
                  )}
                </button>
                <button
                  className="session-action-button"
                  data-codex-action="rollback"
                  onClick={onRollback}
                  disabled={isMerging || isRollingBack}
                >
                  {isRollingBack ? (
                    <>
                      <LoadingSpinner size="small" inline />
                      <span>{t("codexNew.workbench.sessionItem.rollingBack", "Rolling back...")}</span>
                    </>
                  ) : (
                    t("codexNew.workbench.sessionItem.rollbackMerged", "Rollback merged")
                  )}
                </button>
                <button
                  type="button"
                  className={`session-action-button${sidePanel === "traceback" ? " is-active" : ""}`}
                  onClick={onOpenTraceback}
                >
                  {t("codexNew.workbench.sessionItem.traceback", "Traceback")}
                </button>
                {(activeTask.projectSettings.requireReview ||
                  activeTask.projectSettings.requireTests) && (
                  <button
                    type="button"
                    className={`session-action-button${sidePanel === "review" ? " is-active" : ""}`}
                    onClick={onOpenReview}
                  >
                    {t("codexNew.workbench.sessionItem.review", "Review")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
