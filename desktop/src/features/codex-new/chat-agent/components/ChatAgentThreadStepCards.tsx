import { useI18n } from "@/i18n/I18nProvider";
import { useChatAgentThreadRun } from "../hooks/useChatAgentThreadRun";
import { readChatAgentStore } from "../state";
import { ChatAgentStepList } from "./ChatAgentStepList";

const IN_FLIGHT_STATUSES = new Set([
  "pending",
  "preparing",
  "planning",
  "executing",
  "observing",
  "finalizing",
  "running",
]);

type ChatAgentThreadStepCardsProps = {
  threadId: string | null;
};

/** Compact in-thread step progress only — full panel lives in Codex New Timeline. */
export function ChatAgentThreadStepCards({ threadId }: ChatAgentThreadStepCardsProps) {
  const { t } = useI18n();
  const run = useChatAgentThreadRun(threadId);

  if (!threadId || !run) {
    return null;
  }

  const inFlight = IN_FLIGHT_STATUSES.has(run.status);
  if (!inFlight || run.steps.length === 0) {
    return null;
  }

  return (
    <section className="chat-agent-thread-strip" aria-label={t("codexNew.chatAgent.panelTitle", "Chat Agent")}>
      <ChatAgentStepList
        steps={run.steps}
        showThoughts={readChatAgentStore().settings.showThoughts}
        emptyLabel=""
      />
    </section>
  );
}
