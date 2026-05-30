import { useEffect, useState } from "react";
import { CHAT_AGENT_STATE_EVENT, getChatAgentRunForThread } from "../state";
import type { ChatAgentRunState } from "../types";

export function useChatAgentThreadRun(threadId: string | null): ChatAgentRunState | null {
  const [run, setRun] = useState<ChatAgentRunState | null>(() =>
    threadId ? getChatAgentRunForThread(threadId) : null,
  );

  useEffect(() => {
    setRun(threadId ? getChatAgentRunForThread(threadId) : null);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      return;
    }
    const sync = () => {
      setRun(getChatAgentRunForThread(threadId));
    };
    window.addEventListener("storage", sync);
    window.addEventListener(CHAT_AGENT_STATE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHAT_AGENT_STATE_EVENT, sync);
    };
  }, [threadId]);

  return run;
}
