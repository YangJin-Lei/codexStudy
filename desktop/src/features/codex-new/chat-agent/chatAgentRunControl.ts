import { cancelChatAgentRunBackend } from "@/services/tauri";
import { listInFlightChatAgentRunsForThread } from "./chatAgentRunLookup";
import { patchChatAgentRun } from "./state";

export async function cancelInFlightChatAgentRunsForThread(
  threadId: string,
): Promise<string[]> {
  const inFlight = listInFlightChatAgentRunsForThread(threadId);
  const cancelledRunIds: string[] = [];

  await Promise.all(
    inFlight.map(async (run) => {
      try {
        await cancelChatAgentRunBackend(run.runId);
      } catch {
        // Best-effort cancel; still patch local state so UI can recover.
      }
      patchChatAgentRun(run.runId, { status: "cancelled" });
      cancelledRunIds.push(run.runId);
    }),
  );

  return cancelledRunIds;
}
