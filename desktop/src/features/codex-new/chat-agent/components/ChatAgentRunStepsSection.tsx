import { useI18n } from "@/i18n/I18nProvider";
import { ChatAgentStepList } from "./ChatAgentStepList";
import type { ChatAgentRunState, ChatAgentSettings } from "../types";

type ChatAgentRunStepsSectionProps = {
  run: ChatAgentRunState;
  settings: ChatAgentSettings;
};

export function ChatAgentRunStepsSection({ run, settings }: ChatAgentRunStepsSectionProps) {
  const { t } = useI18n();

  return (
    <>
      <p className="chat-agent-run-panel__status">
        {t("codexNew.chatAgent.statusLabel", "Status")}: {run.status}
        {" · "}
        {t("codexNew.chatAgent.stepCount", "Steps")}: {run.steps.length}
      </p>
      <ChatAgentStepList
        steps={run.steps}
        showThoughts={settings.showThoughts}
        emptyLabel={t("codexNew.chatAgent.noSteps", "Waiting for the first step…")}
      />
      {run.summary ? (
        <p className="chat-agent-run-panel__summary">{run.summary}</p>
      ) : null}
    </>
  );
}
