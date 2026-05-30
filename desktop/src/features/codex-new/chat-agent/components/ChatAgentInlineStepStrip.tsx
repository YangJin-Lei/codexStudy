import { useI18n } from "@/i18n/I18nProvider";
import { readChatAgentStore } from "../state";
import type { ChatAgentStep } from "../types";
import { ChatAgentStepList } from "./ChatAgentStepList";

type ChatAgentInlineStepStripProps = {
  steps: ChatAgentStep[];
  isActiveTurn?: boolean;
};

/** Step progress anchored after a user turn — not pinned to the top of the thread. */
export function ChatAgentInlineStepStrip({
  steps,
  isActiveTurn = false,
}: ChatAgentInlineStepStripProps) {
  const { t } = useI18n();

  if (steps.length === 0) {
    return null;
  }

  return (
    <section
      className={`chat-agent-inline-strip${isActiveTurn ? " chat-agent-inline-strip--active" : ""}`}
      aria-label={t("codexNew.chatAgent.panelTitle", "Chat Agent")}
    >
      <ChatAgentStepList
        steps={steps}
        showThoughts={readChatAgentStore().settings.showThoughts}
        emptyLabel=""
      />
    </section>
  );
}
