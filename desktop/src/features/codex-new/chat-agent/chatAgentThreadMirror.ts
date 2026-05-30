import type { Dispatch } from "react";
import type { ThreadAction } from "@/features/threads/hooks/useThreadsReducer";
import {
  recordChatAgentMirrorKey,
  wasChatAgentMirrorKeyRecorded,
} from "./chatAgentMirrorLedger";
import { listChatAgentRunsForThread } from "./chatAgentRunLookup";
import type {
  ChatAgentAwaitingUserEvent,
  ChatAgentFinishedEvent,
  ChatAgentRunState,
  ChatAgentStep,
} from "./types";

export function mirrorChatAgentUserMessage(
  dispatch: Dispatch<ThreadAction>,
  threadId: string,
  runId: string,
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  const key = `user:${runId}:${trimmed.length}:${hashText(trimmed)}`;
  if (wasChatAgentMirrorKeyRecorded(key)) {
    return;
  }
  recordChatAgentMirrorKey(runId, key);
  dispatch({
    type: "addUserMessage",
    threadId,
    text: trimmed,
  });
}

export function mirrorChatAgentAssistantMessage(
  dispatch: Dispatch<ThreadAction>,
  threadId: string,
  runId: string,
  mirrorKey: string,
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  const contentKey = assistantContentMirrorKey(runId, trimmed);
  if (
    wasChatAgentMirrorKeyRecorded(contentKey) ||
    wasChatAgentMirrorKeyRecorded(mirrorKey)
  ) {
    return;
  }
  recordChatAgentMirrorKey(runId, contentKey);
  recordChatAgentMirrorKey(runId, mirrorKey);
  dispatch({
    type: "addAssistantMessage",
    threadId,
    text: trimmed,
  });
}

export function mirrorChatAgentAwaitingUser(
  dispatch: Dispatch<ThreadAction>,
  event: ChatAgentAwaitingUserEvent,
  threadId: string,
) {
  mirrorChatAgentAssistantMessage(
    dispatch,
    threadId,
    event.runId,
    `assistant:awaiting:${event.runId}`,
    event.question,
  );
}

export function mirrorChatAgentFinished(
  dispatch: Dispatch<ThreadAction>,
  event: ChatAgentFinishedEvent,
  threadId: string,
) {
  if (event.summary?.trim()) {
    mirrorChatAgentAssistantMessage(
      dispatch,
      threadId,
      event.runId,
      `assistant:finished:${event.runId}`,
      event.summary,
    );
    return;
  }
  if (event.error?.trim()) {
    mirrorChatAgentAssistantMessage(
      dispatch,
      threadId,
      event.runId,
      `assistant:error:${event.runId}`,
      event.error,
    );
  }
}

export function mirrorChatAgentAskStep(
  dispatch: Dispatch<ThreadAction>,
  runId: string,
  threadId: string,
  step: ChatAgentStep,
) {
  const text = extractAssistantTextFromStep(step);
  if (!text) {
    return;
  }
  mirrorChatAgentAssistantMessage(
    dispatch,
    threadId,
    runId,
    `assistant:ask:${runId}:${step.id}`,
    text,
  );
}

function assistantContentMirrorKey(runId: string, text: string): string {
  return `assistant:content:${runId}:${hashText(text)}`;
}

export function hydrateChatAgentThreadHistory(
  dispatch: Dispatch<ThreadAction>,
  threadId: string,
) {
  const runs = listChatAgentRunsForThread(threadId);
  for (const run of runs) {
    hydrateRunIntoThread(dispatch, threadId, run);
  }
}

function hydrateRunIntoThread(
  dispatch: Dispatch<ThreadAction>,
  threadId: string,
  run: ChatAgentRunState,
) {
  if (run.prompt?.trim()) {
    mirrorChatAgentUserMessage(dispatch, threadId, run.runId, run.prompt);
  }

  for (const step of run.steps) {
    if (step.action.type === "ask_user") {
      mirrorChatAgentAskStep(dispatch, run.runId, threadId, step);
    }
  }

  if (
    run.awaitingUserQuestion?.trim() &&
    run.status === "awaiting_user"
  ) {
    mirrorChatAgentAssistantMessage(
      dispatch,
      threadId,
      run.runId,
      `assistant:awaiting:${run.runId}`,
      run.awaitingUserQuestion,
    );
  }

  if (run.summary?.trim()) {
    mirrorChatAgentAssistantMessage(
      dispatch,
      threadId,
      run.runId,
      `assistant:finished:${run.runId}`,
      run.summary,
    );
  } else if (run.error?.trim() && run.status === "failed") {
    mirrorChatAgentAssistantMessage(
      dispatch,
      threadId,
      run.runId,
      `assistant:error:${run.runId}`,
      run.error,
    );
  }
}

function extractAssistantTextFromStep(step: ChatAgentStep): string | null {
  if (step.action.type === "ask_user") {
    return (
      step.action.question?.trim() ||
      step.observation.summary?.trim() ||
      null
    );
  }
  if (step.action.type === "finalize") {
    return (
      step.action.summary?.trim() ||
      step.observation.summary?.trim() ||
      null
    );
  }
  return null;
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}
