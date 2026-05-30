import Shield from "lucide-react/dist/esm/icons/shield";
import Workflow from "lucide-react/dist/esm/icons/workflow";
import { useI18n } from "@/i18n/I18nProvider";
import type { ThreadSummary, WorkspaceInfo } from "@/types";
import type { CodexNewSession, CodexNewThreadRegistryEntry } from "../types";
import { resolveThreadTitle } from "../utils/threadLabels";

type CodexNewStatusCardProps = {
  hasWorkspace: boolean;
  securityEnabled: boolean;
  securityToggleDisabled?: boolean;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  activeSession: CodexNewSession | null;
  activeThreadRegistryEntry?: CodexNewThreadRegistryEntry | null;
  onOpenWorkbench: () => void | Promise<void>;
};

export function CodexNewStatusCard({
  hasWorkspace,
  securityEnabled,
  securityToggleDisabled = false,
  activeWorkspace,
  activeThreadId,
  threadsByWorkspace,
  activeSession,
  onOpenWorkbench,
}: CodexNewStatusCardProps) {
  const { t, resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const displayWorkspaceName =
    activeWorkspace?.name ??
    activeSession?.workspaceName ??
    t("codexNew.status.awaitingSession", "No armed workspace");
  const displayThreadTitle =
    (activeWorkspace
      ? resolveThreadTitle(threadsByWorkspace, activeWorkspace.id, activeThreadId)
      : null) ||
    (activeThreadId ? activeThreadId.slice(0, 8) : null) ||
    t("codexNew.status.noThread", "No active thread");

  return (
    <section className="codex-new-status-card is-sidebar-compact">
      <div className="codex-new-status-card-top">
        <div className="codex-new-status-card-title-group">
          <div className="codex-new-status-card-title">{t("codexNew.status.title", "codex-new")}</div>
          <div className="codex-new-status-card-subtitle">
            {securityToggleDisabled
              ? t(
                  "codexNew.status.computerUseHelp",
                  "Computer control runs on your real desktop. Safe mode is disabled here until a dedicated isolated runtime is available.",
                )
              : securityEnabled
                ? isChinese
                  ? "已开启。目录与数据路径请在工作台查看。"
                  : "Enabled. Open the workbench for folders and data paths."
                : hasWorkspace
                  ? t(
                      "codexNew.status.inactiveHelp",
                      "Turn on Security mode for this conversation to use an isolated workspace.",
                    )
                  : t("codexNew.status.noWorkspace", "Select a workspace to arm Security mode.")}
          </div>
        </div>
        <span
          className={`codex-new-status-badge${
            securityEnabled ? " is-active" : ""
          }${securityToggleDisabled ? " is-disabled" : ""}`}
          aria-disabled={securityToggleDisabled}
        >
          <Shield size={12} aria-hidden />
          {securityToggleDisabled
            ? t("codexNew.unavailable", "Unavailable")
            : securityEnabled
              ? t("codexNew.active", "Active")
              : t("codexNew.inactive", "Inactive")}
        </span>
      </div>

      {securityEnabled ? (
        <div className="codex-new-status-card-meta">
          <div className="codex-new-status-meta-row">
            <span className="codex-new-status-meta-label">{t("codexNew.window.workspace", "Workspace")}</span>
            <span className="codex-new-status-meta-value">{displayWorkspaceName}</span>
          </div>
          <div className="codex-new-status-meta-row">
            <span className="codex-new-status-meta-label">
              {isChinese ? "对话" : "Conversation"}
            </span>
            <span className="codex-new-status-meta-value">{displayThreadTitle}</span>
          </div>
        </div>
      ) : null}

      {securityEnabled ? (
        <div className="codex-new-status-card-actions">
          <button type="button" className="codex-new-mini-button" onClick={() => void onOpenWorkbench()}>
            <Workflow size={13} aria-hidden />
            {isChinese ? "工作台" : "Workbench"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
