import { useCallback, useEffect, useState } from "react";
import { useTauriEvent } from "@/features/app/hooks/useTauriEvent";
import {
  subscribeChatAgentAwaitingUser,
  subscribeChatAgentFinished,
  subscribeChatAgentRunUpdated,
  subscribeChatAgentStepAdded,
} from "@/services/events";
import {
  appendChatAgentStep,
  CHAT_AGENT_STATE_EVENT,
  patchChatAgentRun,
  refreshChatAgentSettings,
  readActiveChatAgentRun,
  readChatAgentStore,
  normalizeRunStatus,
} from "../state";
import type {
  ChatAgentAwaitingUserEvent,
  ChatAgentFinishedEvent,
  ChatAgentRunState,
  ChatAgentRunUpdatedEvent,
  ChatAgentStepAddedEvent,
} from "../types";

export function useChatAgentRun() {
  const [run, setRun] = useState<ChatAgentRunState | null>(() => readActiveChatAgentRun());
  const [settings, setSettings] = useState(() => readChatAgentStore().settings);

  const syncFromStore = useCallback(() => {
    setRun(readActiveChatAgentRun());
    setSettings(readChatAgentStore().settings);
  }, []);

  useEffect(() => {
    const onStorage = () => syncFromStore();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHAT_AGENT_STATE_EVENT, onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHAT_AGENT_STATE_EVENT, onStorage);
    };
  }, [syncFromStore]);

  useEffect(() => {
    void refreshChatAgentSettings()
      .then(() => {
        syncFromStore();
      })
      .catch(() => {
        // Keep local settings when backend fetch fails.
      });
  }, [syncFromStore]);

  useTauriEvent(
    subscribeChatAgentRunUpdated,
    useCallback((event: ChatAgentRunUpdatedEvent) => {
      patchChatAgentRun(event.runId, {
        status: normalizeRunStatus(event.status),
        currentStep: event.currentStep,
      });
      syncFromStore();
    }, [syncFromStore]),
  );

  useTauriEvent(
    subscribeChatAgentStepAdded,
    useCallback((event: ChatAgentStepAddedEvent) => {
      appendChatAgentStep(event.runId, event.step);
      syncFromStore();
    }, [syncFromStore]),
  );

  useTauriEvent(
    subscribeChatAgentAwaitingUser,
    useCallback((event: ChatAgentAwaitingUserEvent) => {
      patchChatAgentRun(event.runId, {
        status: "awaiting_user",
        awaitingUserQuestion: event.question,
      });
      syncFromStore();
    }, [syncFromStore]),
  );

  useTauriEvent(
    subscribeChatAgentFinished,
    useCallback((event: ChatAgentFinishedEvent) => {
      patchChatAgentRun(event.runId, {
        status: normalizeRunStatus(event.status),
        summary: event.summary,
        error: event.error,
        awaitingUserQuestion: undefined,
      });
      syncFromStore();
    }, [syncFromStore]),
  );

  return { run, settings, syncFromStore };
}
