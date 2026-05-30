import { readChatAgentStore } from "./state";
import type { ChatAgentRunState, ChatAgentRunStatus } from "./types";

const TERMINAL_STATUSES = new Set<ChatAgentRunStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const IN_FLIGHT_STATUSES = new Set<ChatAgentRunStatus>([
  "pending",
  "preparing",
  "planning",
  "executing",
  "observing",
  "finalizing",
  "running",
  "awaiting_user",
]);

export function isTerminalChatAgentRunStatus(
  status: ChatAgentRunStatus,
): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isInFlightChatAgentRunStatus(
  status: ChatAgentRunStatus,
): boolean {
  return IN_FLIGHT_STATUSES.has(status);
}

/** Prefer the workspace active run, then the newest in-flight run for the thread. */
export function getChatAgentRunForThread(
  threadId: string,
): ChatAgentRunState | null {
  const store = readChatAgentStore();
  const matches = Object.values(store.runs).filter(
    (run) => run.threadId === threadId,
  );
  if (matches.length === 0) {
    return null;
  }

  if (store.activeRunId) {
    const active = matches.find((run) => run.runId === store.activeRunId);
    if (active) {
      return active;
    }
  }

  const inFlight = matches.filter((run) => !isTerminalChatAgentRunStatus(run.status));
  if (inFlight.length > 0) {
    return inFlight[inFlight.length - 1] ?? null;
  }

  return matches[matches.length - 1] ?? null;
}

export function getInFlightChatAgentRunForThread(
  threadId: string,
): ChatAgentRunState | null {
  const run = getChatAgentRunForThread(threadId);
  if (!run || isTerminalChatAgentRunStatus(run.status)) {
    return null;
  }
  return run;
}

export function listInFlightChatAgentRunsForThread(
  threadId: string,
): ChatAgentRunState[] {
  const store = readChatAgentStore();
  return Object.values(store.runs).filter(
    (run) =>
      run.threadId === threadId && !isTerminalChatAgentRunStatus(run.status),
  );
}

/** All runs for a thread in insertion order (local store order). */
export function listChatAgentRunsForThread(
  threadId: string,
): ChatAgentRunState[] {
  const store = readChatAgentStore();
  return Object.values(store.runs).filter((run) => run.threadId === threadId);
}
