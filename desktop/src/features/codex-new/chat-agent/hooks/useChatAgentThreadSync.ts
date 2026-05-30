import { useEffect } from "react";
import { syncChatAgentThreadRuns } from "../chatAgentThreadSync";

export function useChatAgentThreadSync(threadId: string | null) {
  useEffect(() => {
    if (!threadId) {
      return;
    }
    void syncChatAgentThreadRuns(threadId).catch(() => {
      // Best-effort reattach when backend registry has active runs.
    });
  }, [threadId]);
}
