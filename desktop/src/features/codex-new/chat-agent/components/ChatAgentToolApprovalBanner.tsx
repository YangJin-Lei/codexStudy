import { useI18n } from "@/i18n/I18nProvider";
import type { ChatAgentRunState } from "../types";

type ChatAgentToolApprovalBannerProps = {
  run: ChatAgentRunState;
  onAllow: () => void;
  onDeny: () => void;
  busy?: boolean;
};

export function ChatAgentToolApprovalBanner({
  run,
  onAllow,
  onDeny,
  busy = false,
}: ChatAgentToolApprovalBannerProps) {
  const { resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const request = run.awaitingToolApproval;

  if (run.status !== "awaiting_tool_approval" || !request) {
    return null;
  }

  return (
    <section className="chat-agent-tool-approval-banner" role="region">
      <p className="chat-agent-tool-approval-banner__title">
        {isChinese ? "Chat Agent 请求执行工具" : "Chat Agent requests tool access"}
      </p>
      <p className="chat-agent-tool-approval-banner__tool">{request.toolName}</p>
      <p className="chat-agent-tool-approval-banner__summary">{request.summary}</p>
      <div className="chat-agent-tool-approval-banner__actions">
        <button type="button" disabled={busy} onClick={onAllow}>
          {isChinese ? "允许一次" : "Allow once"}
        </button>
        <button type="button" disabled={busy} onClick={onDeny}>
          {isChinese ? "拒绝" : "Deny"}
        </button>
      </div>
    </section>
  );
}
