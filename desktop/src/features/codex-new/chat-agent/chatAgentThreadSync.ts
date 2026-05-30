import {
  confirmChatAgentToolBackend,
  listChatAgentThreadRunsBackend,
} from "@/services/tauri";
import { getInFlightChatAgentRunForThread } from "./chatAgentRunLookup";
import {
  normalizeRunStatus,
  patchChatAgentRun,
  readChatAgentStore,
} from "./state";
import type { ChatAgentRunState } from "./types";

export async function confirmChatAgentTool(runId: string, approved: boolean) {
  const state = await confirmChatAgentToolBackend(runId, approved);
  patchChatAgentRun(runId, mapBackendRunPatch(state));
}

export async function syncChatAgentThreadRuns(threadId: string) {
  const remoteRuns = await listChatAgentThreadRunsBackend(threadId);
  const store = readChatAgentStore();
  for (const run of remoteRuns) {
    if (!store.runs[run.runId]) {
      continue;
    }
    patchChatAgentRun(run.runId, mapBackendRunPatch(run));
  }
  return getInFlightChatAgentRunForThread(threadId);
}

function mapBackendRunPatch(
  state: ChatAgentRunState,
): Partial<ChatAgentRunState> {
  return {
    status: normalizeRunStatus(state.status),
    currentStep: state.currentStep,
    totalSteps: state.totalSteps,
    steps: state.steps,
    error: state.error,
    awaitingUserQuestion: state.awaitingUserQuestion,
    awaitingToolApproval: state.awaitingToolApproval,
  };
}
