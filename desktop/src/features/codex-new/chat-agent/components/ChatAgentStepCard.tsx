import { ChatAgentActionBadge } from "./ChatAgentActionBadge";
import { ChatAgentObservationView } from "./ChatAgentObservationView";
import type { ChatAgentStep } from "../types";

type ChatAgentStepCardProps = {
  step: ChatAgentStep;
  showThought: boolean;
};

export function ChatAgentStepCard({ step, showThought }: ChatAgentStepCardProps) {
  const actionType =
    typeof step.action === "object" && step.action && "type" in step.action
      ? String((step.action as { type: string }).type)
      : "unknown";

  return (
    <article className="chat-agent-step-card">
      <header className="chat-agent-step-card__header">
        <ChatAgentActionBadge actionType={actionType} />
        <span
          className={
            step.observation.ok
              ? "chat-agent-step-card__status chat-agent-step-card__status--ok"
              : "chat-agent-step-card__status chat-agent-step-card__status--fail"
          }
        >
          {step.observation.ok ? "OK" : "Failed"}
        </span>
      </header>
      {showThought && step.thought ? (
        <p className="chat-agent-step-card__thought">{step.thought}</p>
      ) : null}
      <p className="chat-agent-step-card__summary">{step.observation.summary}</p>
      <ChatAgentObservationView observation={step.observation} />
    </article>
  );
}
