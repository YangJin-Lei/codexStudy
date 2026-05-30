import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { resumeChatAgentRun } from "../state";

type ChatAgentAwaitingUserReplyProps = {
  runId: string;
  question?: string;
  onResumed?: () => void;
};

export function ChatAgentAwaitingUserReply({
  runId,
  question,
  onResumed,
}: ChatAgentAwaitingUserReplyProps) {
  const { t, resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const [userReply, setUserReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResume = async () => {
    setBusy(true);
    setError(null);
    try {
      await resumeChatAgentRun(runId, userReply.trim());
      setUserReply("");
      onResumed?.();
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : String(resumeError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-agent-awaiting-reply">
      {question ? <p className="chat-agent-awaiting-reply__question">{question}</p> : null}
      {error ? <p className="chat-agent-run-panel__error">{error}</p> : null}
      <textarea
        value={userReply}
        onChange={(event) => setUserReply(event.target.value)}
        rows={3}
        placeholder={t(
          "codexNew.chatAgent.userReplyPlaceholder",
          "Reply to the agent…",
        )}
      />
      <button
        type="button"
        className="chat-agent-run-panel__primary"
        disabled={busy || !userReply.trim()}
        onClick={() => void handleResume()}
      >
        {busy
          ? isChinese
            ? "发送中…"
            : "Sending…"
          : t("codexNew.chatAgent.sendReply", "Send reply")}
      </button>
    </div>
  );
}
