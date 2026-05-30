import { useState, useCallback, useEffect } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Workflow from "lucide-react/dist/esm/icons/workflow";
import { useCodexNewState } from "../hooks/useCodexNewState";
import { useWorkbenchHotkeys } from "../hooks/useWorkbenchHotkeys";
import { refreshCodexNewChanges } from "../state";
import { DualTreePanel } from "./DualTreePanel";
import { SessionWorkbench } from "./SessionWorkbench";
import { SandboxTerminal } from "./SandboxTerminal";
import { WorkbenchPanelErrorBoundary } from "./workbench/WorkbenchPanelErrorBoundary";
import { WorkbenchRefreshErrorBanner } from "./workbench/WorkbenchRefreshErrorBanner";
import "./workbench/workbench-controls.css";
import "./workbench-surfaces.css";
import "./WorkbenchShell.css";

export function WorkbenchShell() {
  const { t } = useI18n();
  const state = useCodexNewState();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // 同步激活的 thread
  useEffect(() => {
    if (state.activeSession?.threadId) {
      setActiveThreadId(state.activeSession.threadId);
    }
  }, [state.activeSession?.threadId]);

  const clampPanelWidths = useCallback(
    (left: number, right: number) => {
      const viewportWidth = window.innerWidth;
      const minimumCenterWidth = 520;
      const availableForSidePanels = Math.max(300, viewportWidth - minimumCenterWidth);
      const maxEachSide = Math.max(220, Math.floor(availableForSidePanels / 2));
      const clampedLeft = Math.max(220, Math.min(maxEachSide, left));
      const clampedRight = Math.max(260, Math.min(maxEachSide + 120, right));
      if (clampedLeft + clampedRight > availableForSidePanels) {
        const overflow = clampedLeft + clampedRight - availableForSidePanels;
        const nextRight = Math.max(260, clampedRight - overflow);
        return { left: clampedLeft, right: nextRight };
      }
      return { left: clampedLeft, right: clampedRight };
    },
    [],
  );

  // 从 localStorage 恢复窗口布局
  useEffect(() => {
    const savedLayout = localStorage.getItem("codex-new:workbench:layout");
    if (savedLayout) {
      try {
        const { leftPanelWidth: left, rightPanelWidth: right } = JSON.parse(savedLayout);
        if (typeof left === "number" && left > 0 && typeof right === "number" && right > 0) {
          const clamped = clampPanelWidths(left, right);
          setLeftPanelWidth(clamped.left);
          setRightPanelWidth(clamped.right);
        }
      } catch {
        // 忽略解析错误
      }
    }
  }, [clampPanelWidths]);

  useEffect(() => {
    const onResize = () => {
      const clamped = clampPanelWidths(leftPanelWidth, rightPanelWidth);
      if (clamped.left !== leftPanelWidth) {
        setLeftPanelWidth(clamped.left);
      }
      if (clamped.right !== rightPanelWidth) {
        setRightPanelWidth(clamped.right);
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [clampPanelWidths, leftPanelWidth, rightPanelWidth]);

  // 保存窗口布局到 localStorage
  const saveLayout = useCallback(() => {
    localStorage.setItem(
      "codex-new:workbench:layout",
      JSON.stringify({ leftPanelWidth, rightPanelWidth })
    );
  }, [leftPanelWidth, rightPanelWidth]);

  useEffect(() => {
    saveLayout();
  }, [saveLayout]);

  const handleThreadActivate = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
  }, []);

  const handleLeftPanelWidthChange = useCallback(
    (nextWidth: number) => {
      const clamped = clampPanelWidths(nextWidth, rightPanelWidth);
      setLeftPanelWidth(clamped.left);
      if (clamped.right !== rightPanelWidth) {
        setRightPanelWidth(clamped.right);
      }
    },
    [clampPanelWidths, rightPanelWidth],
  );

  const handleRightPanelWidthChange = useCallback(
    (nextWidth: number) => {
      const clamped = clampPanelWidths(leftPanelWidth, nextWidth);
      setRightPanelWidth(clamped.right);
      if (clamped.left !== leftPanelWidth) {
        setLeftPanelWidth(clamped.left);
      }
    },
    [clampPanelWidths, leftPanelWidth],
  );

  const handleFileSelect = useCallback((path: string | null) => {
    setSelectedFilePath(path);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!state.activeSession || isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    try {
      await refreshCodexNewChanges(state.activeSession.workspaceId);
      setRefreshError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRefreshError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, state.activeSession]);

  useWorkbenchHotkeys({
    selectedFilePath,
    onCloseDiff: () => setSelectedFilePath(null),
    onRefreshAll: () => {
      void handleRefresh();
    },
  });

  return (
    <div className="workbench-shell">
      <header className="workbench-header">
        <div className="workbench-header-content editor-like">
          <div className="workbench-eyebrow">
            <Workflow size={12} />
            {t("codexNew.workbench.eyebrow", "codex-new workbench")}
          </div>
          <h1 className="workbench-title">
            {t("codexNew.workbench.title", "Security Mode Workbench")}
          </h1>
          <p className="workbench-subtitle">
            {state.activeSession
              ? t(
                  "codexNew.workbench.subtitleActive",
                  "Review, merge, rollback, and manage AI changes in isolated workspace",
                )
              : t(
                  "codexNew.workbench.subtitleInactive",
                  "Enable security mode in a workspace to start",
                )}
          </p>
        </div>
        <span
          className={`workbench-status-badge${state.activeSession ? " is-active" : ""}`}
        >
          {state.activeSession
            ? t("codexNew.active", "Active")
            : t("codexNew.inactive", "Inactive")}
        </span>
        <button
          className="workbench-refresh-button"
          onClick={() => void handleRefresh()}
          disabled={!state.activeSession || isRefreshing}
          title={t("codexNew.workbench.refreshTitle", "Refresh changes")}
        >
          <RefreshCw size={14} className={isRefreshing ? "spinning" : ""} />
          {isRefreshing
            ? t("codexNew.workbench.refreshing", "Refreshing")
            : t("codexNew.workbench.refresh", "Refresh")}
        </button>
      </header>

      {refreshError ? (
        <WorkbenchRefreshErrorBanner
          message={refreshError}
          isRetrying={isRefreshing}
          onRetry={() => void handleRefresh()}
          onDismiss={() => setRefreshError(null)}
        />
      ) : null}

      <div className="workbench-body">
        <WorkbenchPanelErrorBoundary
          panelLabel={t("codexNew.workbench.panelExplorer", "Explorer")}
        >
          <DualTreePanel
            width={leftPanelWidth}
            onWidthChange={handleLeftPanelWidthChange}
            activeThreadId={activeThreadId}
            onFileSelect={handleFileSelect}
          />
        </WorkbenchPanelErrorBoundary>

        <WorkbenchPanelErrorBoundary
          panelLabel={t("codexNew.workbench.panelSessions", "Sessions")}
        >
          <SessionWorkbench
            activeThreadId={activeThreadId}
            onThreadActivate={handleThreadActivate}
            selectedFilePath={selectedFilePath}
            onFileSelect={handleFileSelect}
          />
        </WorkbenchPanelErrorBoundary>

        <WorkbenchPanelErrorBoundary
          panelLabel={t("codexNew.workbench.panelTerminal", "Terminal")}
        >
          <SandboxTerminal
            width={rightPanelWidth}
            onWidthChange={handleRightPanelWidthChange}
            activeThreadId={activeThreadId}
          />
        </WorkbenchPanelErrorBoundary>
      </div>
    </div>
  );
}
