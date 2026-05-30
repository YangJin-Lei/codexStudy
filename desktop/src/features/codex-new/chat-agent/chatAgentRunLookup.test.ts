/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  getChatAgentRunForThread,
  getInFlightChatAgentRunForThread,
} from "./chatAgentRunLookup";
import type { ChatAgentRunState } from "./types";

const STORAGE_KEY = "chat-agent.runs.v1";

function seedRuns(runs: Record<string, ChatAgentRunState>, activeRunId: string | null) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeRunId,
      runs,
      settings: { enginePreference: "auto", maxTurns: 20, showThoughts: true },
    }),
  );
  window.dispatchEvent(new CustomEvent("chat-agent:state"));
}

describe("chatAgentRunLookup", () => {
  it("prefers the active in-flight run for a thread", () => {
    seedRuns(
      {
        "run-old": {
          runId: "run-old",
          workspaceId: "ws-1",
          threadId: "thread-1",
          status: "running",
          currentStep: 1,
          totalSteps: 1,
          steps: [],
          engine: "chat_agent",
          prompt: "old",
        },
        "run-new": {
          runId: "run-new",
          workspaceId: "ws-1",
          threadId: "thread-1",
          status: "running",
          currentStep: 2,
          totalSteps: 2,
          steps: [],
          engine: "chat_agent",
          prompt: "new",
        },
      },
      "run-new",
    );

    expect(getChatAgentRunForThread("thread-1")?.runId).toBe("run-new");
    expect(getInFlightChatAgentRunForThread("thread-1")?.runId).toBe("run-new");
  });

  it("ignores terminal runs when resolving in-flight state", () => {
    seedRuns(
      {
        "run-done": {
          runId: "run-done",
          workspaceId: "ws-1",
          threadId: "thread-2",
          status: "cancelled",
          currentStep: 0,
          totalSteps: 0,
          steps: [],
          engine: "chat_agent",
          prompt: "done",
        },
      },
      "run-done",
    );

    expect(getInFlightChatAgentRunForThread("thread-2")).toBeNull();
  });
});
