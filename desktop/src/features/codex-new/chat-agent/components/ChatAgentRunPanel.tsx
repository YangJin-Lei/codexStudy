import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { cancelChatAgentRun, startChatAgentRun } from "../state";
import { useChatAgentRun } from "../hooks/useChatAgentRun";
import { ChatAgentAwaitingUserReply } from "./ChatAgentAwaitingUserReply";
import { ChatAgentCodexNewBridgePanel } from "./ChatAgentCodexNewBridgePanel";
import { ChatAgentEngineBadge } from "./ChatAgentEngineBadge";
import { ChatAgentRunStepsSection } from "./ChatAgentRunStepsSection";
import { ChatAgentSettingsPanel } from "./ChatAgentSettingsPanel";

type ChatAgentRunPanelProps = {
  workspaceId: string;
  threadId?: string | null;
  securityMode?: boolean;
  taskPrompt?: string;
};

export function ChatAgentRunPanel({
  workspaceId,
  threadId,
  securityMode = false,
  taskPrompt,
}: ChatAgentRunPanelProps) {
  const { t } = useI18n();
  const { run, settings } = useChatAgentRun();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeForWorkspace = run?.workspaceId === workspaceId ? run : null;
  const canCancel =
    activeForWorkspace &&
    !["completed", "cancelled", "failed"].includes(activeForWorkspace.status);

  const handleStart = async () => {
    if (!taskPrompt?.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startChatAgentRun({
        workspaceId,
        prompt: taskPrompt.trim(),
        threadId: threadId ?? undefined,
        securityMode,
        maxTurns: settings.maxTurns,
      });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : String(startError));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!activeForWorkspace) {
      return;
    }
    setBusy(true);
    try {
      await cancelChatAgentRun(activeForWorkspace.runId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chat-agent-run-panel">
      <header className="chat-agent-run-panel__header">
        <h3>{t("codexNew.chatAgent.panelTitle", "Chat Agent")}</h3>
        {activeForWorkspace ? (
          <ChatAgentEngineBadge engine={activeForWorkspace.engine} />
        ) : (
          <ChatAgentEngineBadge engine="chat_agent" />
        )}
      </header>

      {error ? <p className="chat-agent-run-panel__error">{error}</p> : null}

      <ChatAgentSettingsPanel settings={settings} />

      <ChatAgentCodexNewBridgePanel
        workspaceId={workspaceId}
        securityMode={securityMode}
        run={activeForWorkspace}
      />

      {!activeForWorkspace && taskPrompt ? (
        <button
          type="button"
          className="chat-agent-run-panel__primary"
          disabled={busy}
          onClick={() => void handleStart()}
        >
          {t("codexNew.chatAgent.startRun", "Run with Chat Agent")}
        </button>
      ) : null}

      {activeForWorkspace ? (
        <>
          <ChatAgentRunStepsSection run={activeForWorkspace} settings={settings} />

          {activeForWorkspace.status === "awaiting_user" ? (
            <ChatAgentAwaitingUserReply
              runId={activeForWorkspace.runId}
              question={activeForWorkspace.awaitingUserQuestion}
            />
          ) : null}

          {canCancel ? (
            <button
              type="button"
              className="chat-agent-run-panel__secondary"
              disabled={busy}
              onClick={() => void handleCancel()}
            >
              {t("codexNew.chatAgent.cancelRun", "Cancel run")}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
