import { emit } from "@tauri-apps/api/event";
import type { CodexNewFocusThreadPayload } from "@/types";

export const CODEX_NEW_FOCUS_THREAD_EVENT = "codex-new-focus-thread";

export async function requestCodexNewFocusThread(payload: CodexNewFocusThreadPayload) {
  await emit(CODEX_NEW_FOCUS_THREAD_EVENT, payload);
}

export type { CodexNewFocusThreadPayload };
