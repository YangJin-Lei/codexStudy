import { ChatAgentStepCard } from "./ChatAgentStepCard";
import type { ChatAgentStep } from "../types";

type ChatAgentStepListProps = {
  steps: ChatAgentStep[];
  showThoughts: boolean;
  emptyLabel: string;
};

export function ChatAgentStepList({
  steps,
  showThoughts,
  emptyLabel,
}: ChatAgentStepListProps) {
  if (steps.length === 0) {
    return <p className="chat-agent-step-list__empty">{emptyLabel}</p>;
  }

  return (
    <div className="chat-agent-step-list">
      {steps.map((step) => (
        <ChatAgentStepCard key={step.id} step={step} showThought={showThoughts} />
      ))}
    </div>
  );
}
