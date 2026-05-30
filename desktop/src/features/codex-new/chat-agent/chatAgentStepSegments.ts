import type { ChatAgentStep } from "./types";

/** Split run steps into one segment per user turn (bounded by ask_user). */
export function segmentChatAgentStepsByUserTurns(
  steps: ChatAgentStep[],
): ChatAgentStep[][] {
  if (steps.length === 0) {
    return [];
  }

  const segments: ChatAgentStep[][] = [];
  let start = 0;
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index]?.action.type !== "ask_user") {
      continue;
    }
    segments.push(steps.slice(start, index + 1));
    start = index + 1;
  }
  if (start < steps.length) {
    segments.push(steps.slice(start));
  }
  if (segments.length === 0) {
    segments.push(steps);
  }
  return segments;
}

export function countUserTurnMessages(
  items: { kind: string; role?: string }[],
): number {
  return items.filter(
    (item) => item.kind === "message" && item.role === "user",
  ).length;
}
