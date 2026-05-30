import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { ConversationItem } from "@/types";
import type { ThreadAction } from "@/features/threads/hooks/useThreadsReducer";
import { listChatAgentRunsForThread } from "../chatAgentRunLookup";
import {
  loadChatAgentThreadItems,
  saveChatAgentThreadItems,
} from "../chatAgentThreadItemsStorage";

type UseChatAgentThreadItemsPersistenceOptions = {
  activeThreadId: string | null;
  itemsByThread: Record<string, ConversationItem[]>;
  dispatch: Dispatch<ThreadAction>;
};

export function useChatAgentThreadItemsPersistence({
  activeThreadId,
  itemsByThread,
  dispatch,
}: UseChatAgentThreadItemsPersistenceOptions) {
  const restoredThreadsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    if (restoredThreadsRef.current.has(activeThreadId)) {
      return;
    }
    restoredThreadsRef.current.add(activeThreadId);

    const stored = loadChatAgentThreadItems(activeThreadId);
    if (stored.length === 0) {
      return;
    }
    const current = itemsByThread[activeThreadId] ?? [];
    if (current.length > 0) {
      return;
    }
    dispatch({
      type: "setThreadItems",
      threadId: activeThreadId,
      items: stored,
    });
  }, [activeThreadId, dispatch, itemsByThread]);

  useEffect(() => {
    for (const [threadId, items] of Object.entries(itemsByThread)) {
      if (items.length === 0) {
        continue;
      }
      const hasRuns = listChatAgentRunsForThread(threadId).length > 0;
      const hadStored = loadChatAgentThreadItems(threadId).length > 0;
      if (!hasRuns && !hadStored) {
        continue;
      }
      saveChatAgentThreadItems(threadId, items);
    }
  }, [itemsByThread]);
}
