import { useEffect, useState } from "react";
import ClipboardCheck from "lucide-react/dist/esm/icons/clipboard-check";
import FileText from "lucide-react/dist/esm/icons/file-text";
import { useI18n } from "@/i18n/I18nProvider";
import {
  CODEX_NEW_STATE_EVENT,
  readCodexNewState,
  runCodexNewReview,
  writeCodexNewSummary,
} from "../../state";
import { requestCodexNewProcessTab } from "../../services/uiEvents";
import type { ChatAgentRunState } from "../types";

type ChatAgentCodexNewBridgePanelProps = {
  workspaceId: string;
  securityMode: boolean;
  run: ChatAgentRunState | null;
};

export function ChatAgentCodexNewBridgePanel({
  workspaceId,
  securityMode,
  run,
}: ChatAgentCodexNewBridgePanelProps) {
  const { t, resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const [busyAction, setBusyAction] = useState<"review" | "summary" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setCodexNewRevision] = useState(0);

  useEffect(() => {
    const sync = () => setCodexNewRevision((value) => value + 1);
    window.addEventListener(CODEX_NEW_STATE_EVENT, sync);
    return () => window.removeEventListener(CODEX_NEW_STATE_EVENT, sync);
  }, []);

  const codexNewState = readCodexNewState();
  const securityArmed =
    securityMode && Boolean(codexNewState.workspaceSecurity[workspaceId]?.enabledAt);
  const taskMatchesWorkspace =
    codexNewState.activeTask &&
    codexNewState.activeSession?.workspaceId === workspaceId;

  if (!securityArmed || !taskMatchesWorkspace) {
    return null;
  }

  const handleReview = async () => {
    setBusyAction("review");
    setError(null);
    try {
      await runCodexNewReview(workspaceId);
      requestCodexNewProcessTab("review");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : String(reviewError));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSummary = async () => {
    if (!run) {
      return;
    }
    setBusyAction("summary");
    setError(null);
    try {
      const goal =
        run.prompt.trim() ||
        codexNewState.activeTask?.title ||
        (isChinese ? "Chat Agent 任务" : "Chat Agent task");
      const result =
        run.summary?.trim() ||
        (isChinese
          ? `Chat Agent 运行结束，状态：${run.status}`
          : `Chat Agent run finished with status: ${run.status}`);
      await writeCodexNewSummary(workspaceId, goal, result);
      requestCodexNewProcessTab("summary");
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : String(summaryError));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="chat-agent-codexnew-bridge">
      <h4 className="chat-agent-codexnew-bridge__title">
        {isChinese ? "Codex New 工作流" : "Codex New workflow"}
      </h4>
      <p className="chat-agent-codexnew-bridge__hint">
        {isChinese
          ? "Review 与 Summary 走 Codex New 产品层，不占用 Agent 主循环。"
          : "Review and summary use the Codex New product layer, not the agent loop."}
      </p>
      {error ? <p className="chat-agent-run-panel__error">{error}</p> : null}
      <div className="chat-agent-codexnew-bridge__actions">
        <button
          type="button"
          className="chat-agent-run-panel__secondary"
          disabled={busyAction !== null}
          onClick={() => void handleReview()}
        >
          <ClipboardCheck size={14} aria-hidden />
          {busyAction === "review"
            ? isChinese
              ? "Review 中…"
              : "Running review…"
            : isChinese
              ? "运行 Review"
              : "Run review"}
        </button>
        <button
          type="button"
          className="chat-agent-run-panel__secondary"
          disabled={busyAction !== null || !run}
          onClick={() => void handleSummary()}
        >
          <FileText size={14} aria-hidden />
          {busyAction === "summary"
            ? isChinese
              ? "写入 Summary…"
              : "Writing summary…"
            : isChinese
              ? "写入 Summary"
              : "Write summary"}
        </button>
        <button
          type="button"
          className="chat-agent-codexnew-bridge__link"
          onClick={() => requestCodexNewProcessTab("changes")}
        >
          {t("codexNew.window.tabChanges", "Changes & merge")}
        </button>
      </div>
      {codexNewState.activeTask?.review ? (
        <p className="chat-agent-codexnew-bridge__meta">
          Review: {codexNewState.activeTask.review.summary}
        </p>
      ) : null}
    </section>
  );
}
