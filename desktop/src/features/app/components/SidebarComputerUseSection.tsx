import Monitor from "lucide-react/dist/esm/icons/monitor";
import Plus from "lucide-react/dist/esm/icons/plus";
import { useMemo, useState, type MouseEvent } from "react";
import type { ThreadSummary } from "@/types";
import type { ThreadStatusById } from "@/utils/threadStatus";
import { useI18n } from "@/i18n/I18nProvider";
import { ThreadList } from "./ThreadList";
import { useThreadRows } from "../hooks/useThreadRows";

type SidebarComputerUseSectionProps = {
  workspaceId: string | null;
  enabled: boolean;
  ready: boolean;
  statusLoading: boolean;
  starting: boolean;
  actionError: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadParentById: Record<string, string>;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  pinnedThreadsVersion: number;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys: Set<string>;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onStartSession: () => void | Promise<void>;
  onOpenSettings: () => void;
  onSelectWorkspace?: (workspaceId: string) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
};

export function SidebarComputerUseSection({
  workspaceId,
  enabled,
  ready,
  statusLoading,
  starting,
  actionError,
  threadsByWorkspace,
  threadParentById,
  threadListLoadingByWorkspace,
  threadListPagingByWorkspace,
  threadListCursorByWorkspace,
  pinnedThreadsVersion,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  getThreadTime,
  getThreadArgsBadge,
  getPinTimestamp,
  isThreadPinned,
  onStartSession,
  onOpenSettings,
  onSelectWorkspace,
  onSelectThread,
  onShowThreadMenu,
  onLoadOlderThreads,
}: SidebarComputerUseSectionProps) {
  const { t } = useI18n();
  const { getThreadRows } = useThreadRows(threadParentById);
  const [expanded, setExpanded] = useState(true);

  const threads = workspaceId ? (threadsByWorkspace[workspaceId] ?? []) : [];
  const { pinnedRows, unpinnedRows } = useMemo(() => {
    if (!workspaceId) {
      return { pinnedRows: [], unpinnedRows: [] };
    }
    return getThreadRows(
      threads,
      true,
      workspaceId,
      getPinTimestamp,
      pinnedThreadsVersion,
    );
  }, [getPinTimestamp, getThreadRows, pinnedThreadsVersion, threads, workspaceId]);

  const hasThreads = pinnedRows.length > 0 || unpinnedRows.length > 0;
  const canUseComputerUse = enabled && ready;
  const isActiveSection = Boolean(workspaceId && activeWorkspaceId === workspaceId);

  const statusLabel = statusLoading
    ? t("sidebar.computerUse.statusLoading", "Loading...")
    : !enabled
      ? t("sidebar.computerUse.statusDisabled", "Disabled in settings")
      : !ready
        ? t("sidebar.computerUse.statusNotReady", "Runtime not ready")
        : t("sidebar.computerUse.statusReady", "Ready");

  const handleOpenSettings = () => {
    if (starting) {
      return;
    }
    onOpenSettings();
  };

  const handleStartSession = () => {
    if (starting) {
      return;
    }
    if (canUseComputerUse) {
      void onStartSession();
      return;
    }
    onOpenSettings();
  };

  const handleSelectSection = () => {
    if (starting) {
      return;
    }
    if (!canUseComputerUse) {
      onOpenSettings();
      return;
    }
    if (workspaceId) {
      onSelectWorkspace?.(workspaceId);
      return;
    }
    void onStartSession();
  };

  return (
    <div
      className={`computer-use-section${isActiveSection ? " is-active" : ""}`}
      data-testid="sidebar-computer-use"
    >
      <div className="sidebar-section-header computer-use-section-header">
        <button
          type="button"
          className="computer-use-section-heading"
          onClick={handleSelectSection}
          disabled={starting}
          aria-label={t("sidebar.computerUse.title", "Computer Use")}
        >
          <Monitor className="computer-use-section-icon" aria-hidden />
          <span>{t("sidebar.computerUse.title", "Computer Use")}</span>
        </button>
        <button
          type="button"
          className="computer-use-add-button workspace-add"
          onClick={(event) => {
            event.stopPropagation();
            handleStartSession();
          }}
          disabled={starting}
          aria-label={t("sidebar.computerUse.newSession", "New computer-use session")}
          title={t("sidebar.computerUse.newChat", "New chat")}
        >
          <Plus aria-hidden />
        </button>
      </div>
      <div className={`computer-use-status${canUseComputerUse ? " is-ready" : ""}`}>
        {statusLabel}
      </div>
      {!canUseComputerUse ? (
        <button
          type="button"
          className="computer-use-settings-link"
          onClick={handleOpenSettings}
          disabled={starting}
        >
          {t("sidebar.computerUse.openSettings", "Open Computer Use settings")}
        </button>
      ) : (
        <button
          type="button"
          className="computer-use-new-chat"
          onClick={handleStartSession}
          disabled={starting}
        >
          <Plus aria-hidden />
          {starting
            ? t("sidebar.computerUse.starting", "Starting...")
            : t("sidebar.computerUse.newChat", "New chat")}
        </button>
      )}
      {actionError ? <div className="computer-use-error">{actionError}</div> : null}
      {workspaceId && hasThreads ? (
        <ThreadList
          workspaceId={workspaceId}
          pinnedRows={pinnedRows}
          unpinnedRows={unpinnedRows}
          totalThreadRoots={pinnedRows.length + unpinnedRows.length}
          isExpanded={expanded}
          showExpandToggle={false}
          nextCursor={threadListCursorByWorkspace[workspaceId] ?? null}
          isPaging={threadListPagingByWorkspace[workspaceId] ?? false}
          nested
          activeWorkspaceId={activeWorkspaceId}
          activeThreadId={activeThreadId}
          threadStatusById={threadStatusById}
          pendingUserInputKeys={pendingUserInputKeys}
          getThreadTime={getThreadTime}
          getThreadArgsBadge={getThreadArgsBadge}
          isThreadPinned={isThreadPinned}
          onToggleExpanded={() => setExpanded((current) => !current)}
          onLoadOlderThreads={onLoadOlderThreads}
          onSelectThread={onSelectThread}
          onShowThreadMenu={onShowThreadMenu}
        />
      ) : null}
      {threadListLoadingByWorkspace[workspaceId ?? ""] ? (
        <div className="computer-use-loading">
          {t("sidebar.computerUse.loadingThreads", "Loading conversations...")}
        </div>
      ) : null}
    </div>
  );
}
