import Shield from "lucide-react/dist/esm/icons/shield";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import Workflow from "lucide-react/dist/esm/icons/workflow";
import { useI18n } from "@/i18n/I18nProvider";
import type { ThreadSummary, WorkspaceInfo } from "@/types";
import type { CodexNewSession, CodexNewThreadRegistryEntry } from "../types";
import { resolveThreadTitle } from "../utils/threadLabels";
import { CodexNewDataPathsPanel } from "./CodexNewDataPathsPanel";

type CodexNewStatusCardProps = {
  hasWorkspace: boolean;
  securityEnabled: boolean;
  securityToggleDisabled?: boolean;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  activeSession: CodexNewSession | null;
  activeThreadRegistryEntry?: CodexNewThreadRegistryEntry | null;
  onOpenProcessWindow: () => void | Promise<void>;
  onOpenTerminalWindow: () => void | Promise<void>;
};

export function CodexNewStatusCard({
  hasWorkspace,
  securityEnabled,
  securityToggleDisabled = false,
  activeWorkspace,
  activeThreadId,
  threadsByWorkspace,
  activeSession,
  activeThreadRegistryEntry = null,
  onOpenProcessWindow,
  onOpenTerminalWindow,
}: CodexNewStatusCardProps) {
  const { t, resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const displayWorkspaceName =
    activeWorkspace?.name ??
    activeSession?.workspaceName ??
    t("codexNew.status.awaitingSession", "No armed workspace");
  const displayThreadTitle =
    activeThreadRegistryEntry?.threadTitle?.trim() ||
    (activeWorkspace
      ? resolveThreadTitle(threadsByWorkspace, activeWorkspace.id, activeThreadId)
      : null) ||
    (activeThreadId ? activeThreadId.slice(0, 8) : null) ||
    t("codexNew.status.noThread", "No active thread");

  return (
    <section className="codex-new-status-card">
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
                ? t("codexNew.status.activeHelp", "Security mode is armed for this conversation.")
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
        {activeThreadRegistryEntry?.localFolderName ? (
          <div className="codex-new-status-meta-row">
            <span className="codex-new-status-meta-label">
              {isChinese ? "本地目录" : "Local folder"}
            </span>
            <span
              className="codex-new-status-meta-value"
              title={activeThreadRegistryEntry.isolatedRoot ?? undefined}
            >
              <code className="codex-new-window-path-inline">
                codex-new/workspaces/{activeThreadRegistryEntry.localFolderName}
              </code>
            </span>
          </div>
        ) : null}
      </div>

      {securityEnabled ? <CodexNewDataPathsPanel isChinese={isChinese} /> : null}

      <div className="codex-new-status-card-actions">
        <button type="button" className="codex-new-mini-button" onClick={() => void onOpenProcessWindow()}>
          <Workflow size={13} aria-hidden />
          {t("codexNew.openProcess", "Process")}
        </button>
        <button type="button" className="codex-new-mini-button" onClick={() => void onOpenTerminalWindow()}>
          <TerminalSquare size={13} aria-hidden />
          {t("codexNew.openTerminal", "Terminal")}
        </button>
      </div>
    </section>
  );
}

