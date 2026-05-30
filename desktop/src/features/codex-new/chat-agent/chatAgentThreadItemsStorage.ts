import type { ConversationItem } from "@/types";

const STORAGE_KEY = "chat-agent.thread-items.v1";
const MAX_ITEMS_PER_THREAD = 200;

type ThreadItemsStore = Record<string, ConversationItem[]>;

function readStore(): ThreadItemsStore {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ThreadItemsStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: ThreadItemsStore) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Best-effort persistence.
  }
}

export function loadChatAgentThreadItems(threadId: string): ConversationItem[] {
  return readStore()[threadId] ?? [];
}

export function saveChatAgentThreadItems(
  threadId: string,
  items: ConversationItem[],
) {
  if (!threadId || items.length === 0) {
    return;
  }
  const store = readStore();
  store[threadId] = items.slice(-MAX_ITEMS_PER_THREAD);
  writeStore(store);
}

export function removeChatAgentThreadItems(threadId: string) {
  const store = readStore();
  if (!store[threadId]) {
    return;
  }
  delete store[threadId];
  writeStore(store);
}
