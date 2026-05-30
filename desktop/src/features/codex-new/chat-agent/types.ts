export type ChatAgentActionType =
  | "read_file"
  | "search_code"
  | "edit_file"
  | "run_command"
  | "ask_user"
  | "finalize";

export type ChatAgentAction = {
  type: ChatAgentActionType;
  path?: string;
  lineStart?: number;
  lineEnd?: number;
  pattern?: string;
  pathFilter?: string;
  oldStr?: string;
  newStr?: string;
  command?: string;
  cwd?: string;
  timeoutSecs?: number;
  question?: string;
  options?: string[];
  summary?: string;
  nextSteps?: string[];
};

export type ChatAgentArtifact = {
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type ChatAgentObservation = {
  actionType: string;
  ok: boolean;
  summary: string;
  details?: Record<string, unknown>;
  artifacts?: ChatAgentArtifact[];
};

export type ChatAgentStep = {
  id: string;
  thought: string;
  action: ChatAgentAction;
  observation: ChatAgentObservation;
  startedAt: number;
  completedAt?: number;
};

export type ChatAgentRunStatus =
  | "pending"
  | "preparing"
  | "planning"
  | "executing"
  | "observing"
  | "awaiting_user"
  | "awaiting_tool_approval"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled"
  | "running";

export type ChatAgentRunState = {
  runId: string;
  workspaceId: string;
  threadId?: string;
  status: ChatAgentRunStatus;
  currentStep: number;
  totalSteps: number;
  steps: ChatAgentStep[];
  error?: string;
  awaitingUserQuestion?: string;
  awaitingToolApproval?: {
    toolName: string;
    summary: string;
  };
  engine: "chat_agent" | "codex_core" | "hybrid";
  prompt: string;
  summary?: string;
};

export type ChatAgentSettings = {
  enginePreference: "auto" | "codex_core" | "chat_agent" | "hybrid";
  maxTurns: number;
  showThoughts: boolean;
};

export type ModelCapabilityDto = {
  toolCallReliable: boolean;
  supportsResponsesApi: boolean;
  maxContextTokens: number;
  recommendedEngine: string;
};

export type ChatAgentRunUpdatedEvent = {
  runId: string;
  status: string;
  currentStep: number;
};

export type ChatAgentStepAddedEvent = {
  runId: string;
  step: ChatAgentStep;
};

export type ChatAgentAwaitingUserEvent = {
  runId: string;
  question: string;
  options?: string[];
};

export type ChatAgentToolApprovalRequiredEvent = {
  runId: string;
  toolName: string;
  summary: string;
};

export type ChatAgentFinishedEvent = {
  runId: string;
  status: string;
  summary: string;
  error?: string;
};
