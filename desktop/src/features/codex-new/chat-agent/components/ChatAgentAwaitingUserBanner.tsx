import { useI18n } from "@/i18n/I18nProvider";
import type { ChatAgentRunState } from "../types";

type ChatAgentAwaitingUserBannerProps = {
  run: ChatAgentRunState;
};

export function ChatAgentAwaitingUserBanner({ run }: ChatAgentAwaitingUserBannerProps) {
  const { t, resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";

  if (run.status !== "awaiting_user" && !run.awaitingUserQuestion?.trim()) {
    return null;
  }

  return (
    <section className="chat-agent-awaiting-banner" role="status">
      <p className="chat-agent-awaiting-banner__title">
        {isChinese ? "Chat Agent 等待你的回复" : "Chat Agent is waiting for your reply"}
      </p>
      <p className="chat-agent-awaiting-banner__hint">
        {t(
          "codexNew.chatAgent.awaitingComposerHint",
          "Send a message in the composer below to continue this run.",
        )}
      </p>
    </section>
  );
}
