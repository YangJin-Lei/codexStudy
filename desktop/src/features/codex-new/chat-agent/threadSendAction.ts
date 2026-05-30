import { getChatAgentRunForThread } from "./chatAgentRunLookup";
import type { ChatAgentRunState, ChatAgentRunStatus } from "./types";

const IN_FLIGHT_STATUSES: ChatAgentRunStatus[] = [
  "pending",
  "preparing",
  "planning",
  "executing",
  "observing",
  "finalizing",
  "running",
];

export type ChatAgentThreadSendAction =
  | { kind: "start" }
  | { kind: "resume"; run: ChatAgentRunState }
  | { kind: "blocked"; reason: string };

export function resolveChatAgentThreadSend(
  threadId: string,
): ChatAgentThreadSendAction {
  const run = getChatAgentRunForThread(threadId);
  if (!run) {
    return { kind: "start" };
  }
  if (
    run.status === "awaiting_tool_approval" ||
    Boolean(run.awaitingToolApproval)
  ) {
    return {
      kind: "blocked",
      reason:
        "Chat Agent is waiting for tool approval. Allow or deny the pending tool first.",
    };
  }
  if (
    run.status === "awaiting_user" ||
    Boolean(run.awaitingUserQuestion?.trim())
  ) {
    return {
      kind: "resume",
      run:
        run.status === "awaiting_user"
          ? run
          : { ...run, status: "awaiting_user" },
    };
  }
  if (IN_FLIGHT_STATUSES.includes(run.status)) {
    return {
      kind: "blocked",
      reason:
        "Chat Agent is still running on this thread. Cancel the run or wait for it to finish.",
    };
  }
  return { kind: "start" };
}
