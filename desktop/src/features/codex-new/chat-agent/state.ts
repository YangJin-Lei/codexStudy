import {
  cancelChatAgentRunBackend,
  getChatAgentSettingsBackend,
  getChatAgentRunStateBackend,
  resumeChatAgentRunBackend,
  setChatAgentSettingsBackend,
  startChatAgentRunBackend,
} from "@/services/tauri";
import {
  getChatAgentRunForThread as lookupChatAgentRunForThread,
} from "./chatAgentRunLookup";
import type {
  ChatAgentRunState,
  ChatAgentRunStatus,
  ChatAgentSettings,
  ChatAgentStep,
} from "./types";

const STORAGE_KEY = "chat-agent.runs.v1";
export const CHAT_AGENT_STATE_EVENT = "chat-agent:state";

type ChatAgentStore = {
  activeRunId: string | null;
  runs: Record<string, ChatAgentRunState>;
  settings: ChatAgentSettings;
};

const DEFAULT_SETTINGS: ChatAgentSettings = {
  enginePreference: "auto",
  maxTurns: 20,
  showThoughts: true,
};

function readStore(): ChatAgentStore {
  if (typeof window === "undefined") {
    return { activeRunId: null, runs: {}, settings: DEFAULT_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { activeRunId: null, runs: {}, settings: DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw) as ChatAgentStore;
    return {
      activeRunId: parsed.activeRunId ?? null,
      runs: parsed.runs ?? {},
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    return { activeRunId: null, runs: {}, settings: DEFAULT_SETTINGS };
  }
}

function writeStore(store: ChatAgentStore) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(CHAT_AGENT_STATE_EVENT));
}

export function readChatAgentStore(): ChatAgentStore {
  return readStore();
}

export function readActiveChatAgentRun(): ChatAgentRunState | null {
  const store = readStore();
  if (!store.activeRunId) {
    return null;
  }
  return store.runs[store.activeRunId] ?? null;
}

export function updateChatAgentStore(updater: (store: ChatAgentStore) => ChatAgentStore) {
  writeStore(updater(readStore()));
}

export function patchChatAgentSettings(settings: Partial<ChatAgentSettings>) {
  updateChatAgentStore((store) => ({
    ...store,
    settings: { ...store.settings, ...settings },
  }));
}

export function upsertChatAgentRun(run: ChatAgentRunState) {
  updateChatAgentStore((store) => ({
    ...store,
    activeRunId: run.runId,
    runs: {
      ...store.runs,
      [run.runId]: run,
    },
  }));
}

export function patchChatAgentRun(
  runId: string,
  patch: Partial<ChatAgentRunState>,
) {
  updateChatAgentStore((store) => {
    const existing = store.runs[runId];
    if (!existing) {
      return store;
    }
    const nextRun = { ...existing, ...patch };
    const terminalStatuses: ChatAgentRunStatus[] = [
      "completed",
      "failed",
      "cancelled",
    ];
    const shouldClearActive =
      store.activeRunId === runId && terminalStatuses.includes(nextRun.status);

    return {
      ...store,
      activeRunId: shouldClearActive ? null : store.activeRunId,
      runs: {
        ...store.runs,
        [runId]: nextRun,
      },
    };
  });
}

export function appendChatAgentStep(runId: string, step: ChatAgentStep) {
  updateChatAgentStore((store) => {
    const existing = store.runs[runId];
    if (!existing) {
      return store;
    }
    const steps = [...existing.steps, step];
    return {
      ...store,
      runs: {
        ...store.runs,
        [runId]: {
          ...existing,
          steps,
          currentStep: steps.length,
          totalSteps: steps.length,
        },
      },
    };
  });
}

export function normalizeRunStatus(status: string): ChatAgentRunStatus {
  const normalized = status.trim().toLowerCase();
  if (normalized === "running") {
    return "running";
  }
  const allowed: ChatAgentRunStatus[] = [
    "pending",
    "preparing",
    "planning",
    "executing",
    "observing",
    "awaiting_user",
    "finalizing",
    "awaiting_tool_approval",
    "completed",
    "failed",
    "cancelled",
  ];
  return (allowed.includes(normalized as ChatAgentRunStatus)
    ? normalized
    : "running") as ChatAgentRunStatus;
}

export function getChatAgentRunForThread(threadId: string): ChatAgentRunState | null {
  return lookupChatAgentRunForThread(threadId);
}
export function getActiveChatAgentRunIdForThread(threadId: string): string | null {
  return getChatAgentRunForThread(threadId)?.runId ?? null;
}

export async function startChatAgentRun(input: {
  workspaceId: string;
  prompt: string;
  threadId?: string;
  model?: string;
  securityMode?: boolean;
  maxTurns?: number;
  accessMode?: "read-only" | "current" | "full-access";
}) {
  const result = await startChatAgentRunBackend(input);
  const run: ChatAgentRunState = {
    runId: result.runId,
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    status: normalizeRunStatus(result.status),
    currentStep: 0,
    totalSteps: 0,
    steps: [],
    engine:
      result.engine === "codex_core"
        ? "codex_core"
        : result.engine === "hybrid"
          ? "hybrid"
          : "chat_agent",
    prompt: input.prompt,
  };
  upsertChatAgentRun(run);
  return run;
}

export async function refreshChatAgentRun(runId: string) {
  const state = await getChatAgentRunStateBackend(runId);
  patchChatAgentRun(runId, {
    status: normalizeRunStatus(state.status),
    currentStep: state.currentStep,
    totalSteps: state.totalSteps,
    steps: state.steps,
    error: state.error,
    awaitingUserQuestion: state.awaitingUserQuestion,
  });
}

export async function cancelChatAgentRun(runId: string) {
  await cancelChatAgentRunBackend(runId);
  patchChatAgentRun(runId, { status: "cancelled" });
}

export async function resumeChatAgentRun(
  runId: string,
  response: string,
  accessMode?: "read-only" | "current" | "full-access",
) {
  patchChatAgentRun(runId, {
    status: "running",
    awaitingUserQuestion: undefined,
  });
  await resumeChatAgentRunBackend(runId, response, accessMode);
  await refreshChatAgentRun(runId);
}

export async function refreshChatAgentSettings() {
  const settings = await getChatAgentSettingsBackend();
  patchChatAgentSettings(settings);
  return settings;
}

export async function saveChatAgentSettings(settings: ChatAgentSettings) {
  await setChatAgentSettingsBackend(settings);
  patchChatAgentSettings(settings);
}
