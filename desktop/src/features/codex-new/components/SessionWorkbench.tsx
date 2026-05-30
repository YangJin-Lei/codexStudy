import { useState, useCallback, useMemo, useEffect } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import Workflow from "lucide-react/dist/esm/icons/workflow";
import { WorkbenchPanelHeader } from "./workbench/WorkbenchPanelHeader";
import { useCodexNewState } from "../hooks/useCodexNewState";
import {
  focusCodexNewSession,
  mergeCodexNewChanges,
  refreshCodexNewChanges,
  rollbackCodexNewTask,
  runCodexNewReview,
  runCodexNewTest,
} from "../state";
import { useCodexNewConflicts } from "../hooks/useCodexNewConflicts";
import { useCodexNewTraceback } from "../hooks/useCodexNewTraceback";
import { getCodexNewMergeGateReason } from "../utils/reviewGate";
import {
  clearRememberedMergeConflictPath,
  parseMergeConflictPath,
  rememberMergeConflictPath,
} from "../utils/conflictFiles";
import { requestCodexNewConflictFilterFocus } from "../services/uiEvents";
import type { WorkspaceInfo } from "@/types";
import type { CodexNewHunkSelection } from "../types";
import { FileDiffPane } from "./FileDiffPane";
import { ToastContainer, type ToastMessage } from "./Toast";
import { SessionWorkbenchItem } from "./SessionWorkbenchItem";
import { CodexNewConflictBanner } from "./CodexNewConflictBanner";
import { SessionWorkbenchSidePanel } from "./session/SessionWorkbenchSidePanel";
import { SessionTracebackPanel } from "./session/SessionTracebackPanel";
import { SessionReviewPanel } from "./session/SessionReviewPanel";
import { SessionConfirmDialog } from "./session/SessionConfirmDialog";
import {
  CODEX_NEW_SESSION_NAV_NEXT_EVENT,
  CODEX_NEW_SESSION_NAV_PREV_EVENT,
} from "../services/uiEvents";
import "./SessionWorkbench.css";

type SessionSidePanel = "traceback" | "review" | null;

type SessionWorkbenchProps = {
  activeThreadId: string | null;
  onThreadActivate: (threadId: string) => void;
  selectedFilePath: string | null;
  onFileSelect: (path: string | null) => void;
};

export function SessionWorkbench({ activeThreadId, onThreadActivate, selectedFilePath, onFileSelect }: SessionWorkbenchProps) {
  const state = useCodexNewState();
  const { t } = useI18n();
  // Hunk 选择状态 (存储在 sessionStorage)
  const [selectedHunks, setSelectedHunks] = useState<CodexNewHunkSelection[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isRefreshingConflicts, setIsRefreshingConflicts] = useState(false);
  const [isReviewRunning, setIsReviewRunning] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [sidePanel, setSidePanel] = useState<SessionSidePanel>(null);
  const [rollbackConfirmThreadId, setRollbackConfirmThreadId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const { conflictPaths, pinnedPath } = useCodexNewConflicts();
  const workspaceId = state.activeSession?.workspaceId ?? null;
  const mergeGateReason = useMemo(
    () => getCodexNewMergeGateReason(state.activeTask),
    [state.activeTask],
  );
  const traceback = useCodexNewTraceback(
    workspaceId,
    state.lastUpdatedAt,
    sidePanel === "traceback",
  );

  // Toast 辅助函数
  const showToast = useCallback((type: ToastMessage["type"], message: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const closeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 从 sessionStorage 恢复 hunk 选择状态
  useEffect(() => {
    if (!activeThreadId) return;
    const key = `codex-new:hunks:${activeThreadId}`;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        setSelectedHunks(JSON.parse(saved));
      } catch {
        // 忽略解析错误
      }
    }
  }, [activeThreadId]);

  // 保存 hunk 选择状态到 sessionStorage
  useEffect(() => {
    if (!activeThreadId) return;
    const key = `codex-new:hunks:${activeThreadId}`;
    sessionStorage.setItem(key, JSON.stringify(selectedHunks));
  }, [activeThreadId, selectedHunks]);

  // 切换 hunk 选择
  const handleHunkToggle = useCallback((path: string, hunkIndex: number) => {
    setSelectedHunks((prev) => {
      const exists = prev.some((h) => h.path === path && h.hunkIndex === hunkIndex);
      if (exists) {
        return prev.filter((h) => !(h.path === path && h.hunkIndex === hunkIndex));
      } else {
        return [...prev, { path, hunkIndex }];
      }
    });
  }, []);

  // 关闭 diff 面板
  const handleCloseDiff = useCallback(() => {
    onFileSelect(null);
  }, [onFileSelect]);

  // 获取当前工作区的所有会话
  const workspaceSessions = useMemo(() => {
    if (!state.activeSession?.workspaceId) {
      return [];
    }
    return Object.values(state.threadRegistry)
      .filter((entry) => entry.workspaceId === state.activeSession!.workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.activeSession?.workspaceId, state.threadRegistry]);
  const activateThreadById = useCallback(
    async (threadId: string) => {
      const entry = state.threadRegistry[threadId];
      if (!entry) return;

      const workspace: WorkspaceInfo = {
        id: entry.workspaceId,
        name: entry.workspaceName,
        path: entry.originalRoot,
        connected: true,
        settings: { sidebarCollapsed: false },
      };

      await focusCodexNewSession(workspace, threadId, entry.threadTitle);
      onThreadActivate(threadId);
    },
    [state.threadRegistry, onThreadActivate],
  );

  useEffect(() => {
    const activateRelativeSession = (delta: -1 | 1) => {
      if (workspaceSessions.length === 0) {
        return;
      }
      const currentIndex = workspaceSessions.findIndex(
        (entry) => entry.threadId === activeThreadId,
      );
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        (safeIndex + delta + workspaceSessions.length) % workspaceSessions.length;
      const nextThreadId = workspaceSessions[nextIndex]?.threadId;
      if (!nextThreadId || nextThreadId === activeThreadId) {
        return;
      }
      void activateThreadById(nextThreadId);
    };

    const onPrev = () => activateRelativeSession(-1);
    const onNext = () => activateRelativeSession(1);

    window.addEventListener(CODEX_NEW_SESSION_NAV_PREV_EVENT, onPrev);
    window.addEventListener(CODEX_NEW_SESSION_NAV_NEXT_EVENT, onNext);
    return () => {
      window.removeEventListener(CODEX_NEW_SESSION_NAV_PREV_EVENT, onPrev);
      window.removeEventListener(CODEX_NEW_SESSION_NAV_NEXT_EVENT, onNext);
    };
  }, [activeThreadId, activateThreadById, workspaceSessions]);

  const mergeGateToastMessage = useCallback(() => {
    if (!mergeGateReason) {
      return null;
    }
    switch (mergeGateReason.kind) {
      case "noTask":
        return t("codexNew.workbench.gates.noTask", "No active task.");
      case "reviewMissing":
        return t("codexNew.workbench.gates.runReviewBeforeMerge", "Run review before merging.");
      case "reviewBlocked":
        return (
          mergeGateReason.summary ??
          t("codexNew.workbench.gates.reviewBlockedDetail", "Review blocked this merge.")
        );
      case "testsBlocked":
        return t("codexNew.workbench.gates.testsBeforeMerge", "A passing test run is required before merge.");
      default:
        return null;
    }
  }, [mergeGateReason, t]);

  const handleOpenTraceback = useCallback(() => {
    setSidePanel((current) => (current === "traceback" ? null : "traceback"));
  }, []);

  const handleOpenReview = useCallback(() => {
    setSidePanel((current) => (current === "review" ? null : "review"));
  }, []);

  const handleRunReview = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setIsReviewRunning(true);
    try {
      await runCodexNewReview(workspaceId);
      showToast("success", t("codexNew.workbench.review.completed", "Review completed"));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showToast(
        "error",
        t("codexNew.workbench.review.failed", "Review failed: {message}").replace("{message}", errorMsg),
        5000,
      );
    } finally {
      setIsReviewRunning(false);
    }
  }, [showToast, t, workspaceId]);

  const handleRunTest = useCallback(
    async (command: string) => {
      if (!workspaceId) {
        return;
      }
      setIsTestRunning(true);
      try {
        await runCodexNewTest(workspaceId, command);
        showToast("success", t("codexNew.workbench.review.testStarted", "Test run started"));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        showToast(
          "error",
          t("codexNew.workbench.review.testFailed", "Test failed: {message}").replace("{message}", errorMsg),
          5000,
        );
      } finally {
        setIsTestRunning(false);
      }
    },
    [showToast, t, workspaceId],
  );

  const handleTracebackRestore = useCallback(
    async (path: string, target: "project" | "workspace") => {
      try {
        await traceback.restore(path, target);
        showToast(
          "success",
          target === "project"
            ? t("codexNew.workbench.traceback.restoredProject", "Restored {path} on the project").replace(
                "{path}",
                path,
              )
            : t("codexNew.workbench.traceback.restoredWorkspace", "Reset {path} in the isolated workspace").replace(
                "{path}",
                path,
              ),
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        showToast(
          "error",
          t("codexNew.workbench.traceback.restoreFailed", "Restore failed: {message}").replace(
            "{message}",
            errorMsg,
          ),
          5000,
        );
      }
    },
    [showToast, t, traceback],
  );

  // 合并操作
  const handleMerge = useCallback(async (threadId: string) => {
    const entry = state.threadRegistry[threadId];
    if (!entry) return;
    const gateMessage = mergeGateToastMessage();
    if (gateMessage) {
      showToast("error", gateMessage, 5000);
      setSidePanel("review");
      return;
    }
    if (conflictPaths.length > 0) {
      showToast(
        "error",
        t(
          "codexNew.workbench.sessions.mergeBlockedByConflicts",
          `Resolve ${conflictPaths.length} conflicted file(s) before merge`,
        ).replace("{count}", String(conflictPaths.length)),
        5000,
      );
      return;
    }
    if (selectedHunks.length === 0) {
      const pendingCount = (state.activeTask?.changedFiles ?? []).filter(
        (file) => !file.accepted,
      ).length;
      if (pendingCount > 10) {
        const confirmed = window.confirm(
          t(
            "codexNew.workbench.sessions.mergeBulkConfirm",
            `You are about to merge ${pendingCount} files. Continue?`,
          ).replace("{count}", String(pendingCount)),
        );
        if (!confirmed) {
          return;
        }
      }
    }

    setIsMerging(true);
    try {
      // 如果有选中的 hunks，使用 hunk 级别合并
      const options = selectedHunks.length > 0 ? { hunks: selectedHunks } : undefined;
      await mergeCodexNewChanges(entry.workspaceId, options);
      
      // 清空选中的 hunks
      setSelectedHunks([]);
      
      // 显示成功提示
      clearRememberedMergeConflictPath(entry.workspaceId);
      showToast(
        "success",
        t("codexNew.workbench.sessions.mergeSuccess", "Merge successful"),
      );
    } catch (error) {
      console.error("Merge failed:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      const conflictPath = parseMergeConflictPath(error);
      rememberMergeConflictPath(entry.workspaceId, conflictPath);
      if (conflictPath) {
        onFileSelect(conflictPath);
      }
      showToast(
        "error",
        t("codexNew.workbench.sessions.mergeFailed", "Merge failed: {message}").replace(
          "{message}",
          errorMsg,
        ),
        5000,
      );
    } finally {
      setIsMerging(false);
    }
  }, [
    conflictPaths.length,
    mergeGateToastMessage,
    onFileSelect,
    selectedHunks,
    showToast,
    state.activeTask?.changedFiles,
    state.threadRegistry,
    t,
  ]);

  const handleRefreshConflicts = useCallback(async () => {
    const workspaceId = state.activeSession?.workspaceId;
    if (!workspaceId) {
      return;
    }
    setIsRefreshingConflicts(true);
    try {
      await refreshCodexNewChanges(workspaceId);
      showToast(
        "success",
        t("codexNew.workbench.conflicts.refreshSuccess", "Changes refreshed"),
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showToast(
        "error",
        t("codexNew.workbench.conflicts.refreshFailed", "Refresh failed: {message}").replace(
          "{message}",
          errorMsg,
        ),
        5000,
      );
    } finally {
      setIsRefreshingConflicts(false);
    }
  }, [showToast, state.activeSession?.workspaceId, t]);

  useEffect(() => {
    const workspaceId = state.activeSession?.workspaceId;
    if (!workspaceId || conflictPaths.length > 0) {
      return;
    }
    clearRememberedMergeConflictPath(workspaceId);
  }, [conflictPaths.length, state.activeSession?.workspaceId]);

  const rollbackPreviewPaths = useMemo(() => {
    if (!rollbackConfirmThreadId || !state.activeTask) {
      return [];
    }
    return state.activeTask.changedFiles.filter((file) => file.accepted).map((file) => file.path);
  }, [rollbackConfirmThreadId, state.activeTask]);

  const requestRollback = useCallback((threadId: string) => {
    setRollbackConfirmThreadId(threadId);
  }, []);

  const cancelRollbackConfirm = useCallback(() => {
    if (isRollingBack) {
      return;
    }
    setRollbackConfirmThreadId(null);
  }, [isRollingBack]);

  // 回滚操作
  const handleRollback = useCallback(async (threadId: string) => {
    const entry = state.threadRegistry[threadId];
    if (!entry) return;

    setIsRollingBack(true);
    try {
      const options = selectedHunks.length > 0 ? { hunks: selectedHunks } : undefined;
      await rollbackCodexNewTask(entry.workspaceId, options);
      setSelectedHunks([]);
      setRollbackConfirmThreadId(null);
      showToast("success", t("codexNew.workbench.sessions.rollbackSuccess", "Rollback successful"));
    } catch (error) {
      console.error("Rollback failed:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      showToast(
        "error",
        t("codexNew.workbench.sessions.rollbackFailed", "Rollback failed: {message}").replace(
          "{message}",
          errorMsg,
        ),
        5000,
      );
    } finally {
      setIsRollingBack(false);
    }
  }, [selectedHunks, showToast, state.threadRegistry, t]);

  const sessionCountMeta =
    workspaceSessions.length === 0
      ? t("codexNew.workbench.sessions.emptyWorkspace", "No conversations in this workspace")
      : t("codexNew.workbench.sessions.count", "{count} conversation(s)").replace(
          "{count}",
          String(workspaceSessions.length),
        );

  return (
    <div className="session-workbench" tabIndex={-1}>
      <WorkbenchPanelHeader
        icon={<Workflow size={14} />}
        title={t("codexNew.workbench.sessions.title", "Conversations")}
        meta={sessionCountMeta}
      />

      <div className="session-workbench-body">
        <div className="session-workbench-scroll">
          <CodexNewConflictBanner
            conflictPaths={conflictPaths}
            pinnedPath={pinnedPath}
            onOpenFile={onFileSelect}
            onViewConflicts={requestCodexNewConflictFilterFocus}
            onRefreshChanges={() => void handleRefreshConflicts()}
            isRefreshing={isRefreshingConflicts}
          />
          {workspaceSessions.length === 0 ? (
            <div className="session-workbench-empty">
              <p>{t("codexNew.workbench.sessions.emptyStart", "Start a conversation to see it here")}</p>
            </div>
          ) : (
            <div className="session-list">
              {workspaceSessions.map((entry) => (
                <SessionWorkbenchItem
                  key={entry.threadId}
                  threadEntry={entry}
                  activeTask={entry.threadId === activeThreadId ? state.activeTask : null}
                  isActive={entry.threadId === activeThreadId}
                  selectedFilePath={selectedFilePath}
                  onActivate={() => activateThreadById(entry.threadId)}
                  onFileClick={onFileSelect}
                  onMerge={() => handleMerge(entry.threadId)}
                  onRollback={() => requestRollback(entry.threadId)}
                  onOpenTraceback={handleOpenTraceback}
                  onOpenReview={handleOpenReview}
                  isMerging={isMerging}
                  isRollingBack={isRollingBack}
                  mergeGateReason={entry.threadId === activeThreadId ? mergeGateReason : null}
                  sidePanel={entry.threadId === activeThreadId ? sidePanel : null}
                />
              ))}
            </div>
          )}

          {sidePanel && state.activeTask ? (
            <SessionWorkbenchSidePanel
              title={
                sidePanel === "traceback"
                  ? t("codexNew.workbench.sessionItem.traceback", "Traceback")
                  : t("codexNew.workbench.sessionItem.review", "Review")
              }
              onClose={() => setSidePanel(null)}
            >
              {sidePanel === "traceback" ? (
                <SessionTracebackPanel
                  entries={traceback.entries}
                  isLoading={traceback.isLoading}
                  loadError={traceback.loadError}
                  isRestoring={traceback.isRestoring}
                  hasActiveSession={Boolean(workspaceId)}
                  onReload={traceback.reload}
                  onRestore={handleTracebackRestore}
                />
              ) : (
                <SessionReviewPanel
                  task={state.activeTask}
                  isReviewRunning={isReviewRunning}
                  isTestRunning={isTestRunning}
                  onRefresh={handleRefreshConflicts}
                  onRunReview={handleRunReview}
                  onRunTest={handleRunTest}
                />
              )}
            </SessionWorkbenchSidePanel>
          ) : null}
        </div>

        {selectedFilePath ? (
          <div className="session-workbench-diff-dock">
            <FileDiffPane
              filePath={selectedFilePath}
              onClose={handleCloseDiff}
              onHunkToggle={handleHunkToggle}
              selectedHunks={selectedHunks}
            />
          </div>
        ) : null}
      </div>

      <SessionConfirmDialog
        isOpen={rollbackConfirmThreadId !== null}
        title={t("codexNew.workbench.confirm.rollbackTitle", "Rollback merged changes?")}
        description={t(
          "codexNew.workbench.confirm.rollbackDescription",
          "This will undo merged changes in the original project. This action cannot be undone.",
        )}
        confirmLabel={t("codexNew.workbench.confirm.rollbackConfirm", "Confirm rollback")}
        cancelLabel={t("codexNew.workbench.confirm.cancel", "Cancel")}
        isConfirming={isRollingBack}
        onCancel={cancelRollbackConfirm}
        onConfirm={() => {
          if (rollbackConfirmThreadId) {
            void handleRollback(rollbackConfirmThreadId);
          }
        }}
      >
        {rollbackPreviewPaths.length > 0 ? (
          <ul className="session-confirm-file-list">
            {rollbackPreviewPaths.slice(0, 8).map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
            {rollbackPreviewPaths.length > 8 ? (
              <li className="session-confirm-file-more">
                {t("codexNew.workbench.confirm.moreFiles", "{count} more files...").replace(
                  "{count}",
                  String(rollbackPreviewPaths.length - 8),
                )}
              </li>
            ) : null}
          </ul>
        ) : null}
      </SessionConfirmDialog>

      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onClose={closeToast} />
    </div>
  );
}
