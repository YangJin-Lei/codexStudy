import { useCallback } from "react";
import { useTauriEvent } from "@/features/app/hooks/useTauriEvent";
import {
  subscribeChatAgentAwaitingUser,
  subscribeChatAgentFinished,
  subscribeChatAgentRunUpdated,
  subscribeChatAgentStepAdded,
  subscribeChatAgentToolApprovalRequired,
} from "@/services/events";
import {
  appendChatAgentStep,
  normalizeRunStatus,
  patchChatAgentRun,
  readChatAgentStore,
} from "../state";
import type {
  ChatAgentAwaitingUserEvent,
  ChatAgentFinishedEvent,
  ChatAgentRunUpdatedEvent,
  ChatAgentStepAddedEvent,
  ChatAgentToolApprovalRequiredEvent,
} from "../types";

const IDLE_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "awaiting_user",
  "awaiting_tool_approval",
]);

type UseChatAgentThreadLifecycleOptions = {
  markProcessing: (threadId: string, isProcessing: boolean) => void;
};

export function useChatAgentThreadLifecycle({
  markProcessing,
}: UseChatAgentThreadLifecycleOptions) {
  const onRunUpdated = useCallback(
    (event: ChatAgentRunUpdatedEvent) => {
      const existing = readChatAgentStore().runs[event.runId];
      if (
        existing &&
        ["cancelled", "completed", "failed"].includes(existing.status)
      ) {
        return;
      }
      const run = getChatAgentRunForThreadByRunId(event.runId);
      if (!run?.threadId) {
        return;
      }
      patchChatAgentRun(event.runId, {
        status: normalizeRunStatus(event.status),
        currentStep: event.currentStep,
      });
      const processing = !IDLE_STATUSES.has(normalizeRunStatus(event.status));
      markProcessing(run.threadId, processing);
    },
    [markProcessing],
  );

  const onStepAdded = useCallback((event: ChatAgentStepAddedEvent) => {
    appendChatAgentStep(event.runId, event.step);
  }, []);

  const onToolApprovalRequired = useCallback(
    (event: ChatAgentToolApprovalRequiredEvent) => {
      patchChatAgentRun(event.runId, {
        status: "awaiting_tool_approval",
        awaitingToolApproval: {
          toolName: event.toolName,
          summary: event.summary,
        },
      });
      const run = getChatAgentRunForThreadByRunId(event.runId);
      if (run?.threadId) {
        markProcessing(run.threadId, false);
      }
    },
    [markProcessing],
  );

  const onAwaitingUser = useCallback(
    (event: ChatAgentAwaitingUserEvent) => {
      patchChatAgentRun(event.runId, {
        status: "awaiting_user",
        awaitingUserQuestion: event.question,
      });
      const run = getChatAgentRunForThreadByRunId(event.runId);
      if (run?.threadId) {
        markProcessing(run.threadId, false);
      }
    },
    [markProcessing],
  );

  const onFinished = useCallback(
    (event: ChatAgentFinishedEvent) => {
      patchChatAgentRun(event.runId, {
        status: normalizeRunStatus(event.status),
        summary: event.summary,
        error: event.error,
        awaitingUserQuestion: undefined,
        awaitingToolApproval: undefined,
      });
      const run = getChatAgentRunForThreadByRunId(event.runId);
      if (!run?.threadId) {
        return;
      }
      markProcessing(run.threadId, false);
    },
    [markProcessing],
  );

  useTauriEvent(subscribeChatAgentRunUpdated, onRunUpdated);
  useTauriEvent(subscribeChatAgentStepAdded, onStepAdded);
  useTauriEvent(subscribeChatAgentAwaitingUser, onAwaitingUser);
  useTauriEvent(subscribeChatAgentToolApprovalRequired, onToolApprovalRequired);
  useTauriEvent(subscribeChatAgentFinished, onFinished);
}

function getChatAgentRunForThreadByRunId(runId: string) {
  return readChatAgentStore().runs[runId] ?? null;
}
