import type { WorkspaceInfo } from "@/types";
import {
  disableCodexNewSecurityBackend,
  enableCodexNewSecurityBackend,
  focusCodexNewSessionBackend,
  syncCodexNewThreadTitlesBackend,
  syncCodexNewViewingContextBackend,
  getCodexNewState,
  mergeCodexNewChangesBackend,
  refreshCodexNewChangesBackend,
  rollbackCodexNewTaskBackend,
  restoreCodexNewTracebackBackend,
  runCodexNewReviewBackend,
  runCodexNewTestBackend,
  writeCodexNewSummaryBackend,
} from "@/services/tauri";
import type {
  CodexNewFrontendState,
  CodexNewProcessEntry,
  CodexNewSession,
  CodexNewTerminalRun,
  CodexNewTracebackRestoreTarget,
} from "./types";

export const CODEX_NEW_STORAGE_KEY = "codex-new.frontend.state.v1";
export const CODEX_NEW_STATE_EVENT = "codex-new:state";

export const emptyCodexNewDataPaths: CodexNewFrontendState["dataPaths"] = {
  codexHome: "",
  codexNewRoot: "",
  desktopStatePath: "",
  legacyCodexHomes: [],
};

const emptyState: CodexNewFrontendState = {
  activeSession: null,
  activeTask: null,
  workspaceSecurity: {},
  threadRegistry: {},
  dataPaths: emptyCodexNewDataPaths,
  processEntries: [],
  terminalRuns: [],
  lastUpdatedAt: 0,
};

function cloneState(state: CodexNewFrontendState): CodexNewFrontendState {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as CodexNewFrontendState;
}

function normalizeState(value: unknown): CodexNewFrontendState {
  if (!value || typeof value !== "object") {
    return cloneState(emptyState);
  }
  const candidate = value as Partial<CodexNewFrontendState>;
  return {
    activeSession:
      candidate.activeSession && typeof candidate.activeSession === "object"
        ? {
            workspaceId: candidate.activeSession.workspaceId ?? "",
            workspaceName: candidate.activeSession.workspaceName ?? "",
            workspacePath: candidate.activeSession.workspacePath ?? "",
            threadId: candidate.activeSession.threadId ?? null,
            enabledAt:
              typeof candidate.activeSession.enabledAt === "number"
                ? candidate.activeSession.enabledAt
                : 0,
            source: candidate.activeSession.source ?? "frontend-placeholder",
          }
        : null,
    activeTask:
      candidate.activeTask && typeof candidate.activeTask === "object"
        ? (candidate.activeTask as CodexNewFrontendState["activeTask"])
        : null,
    workspaceSecurity:
      candidate.workspaceSecurity && typeof candidate.workspaceSecurity === "object"
        ? candidate.workspaceSecurity
        : {},
    threadRegistry:
      candidate.threadRegistry && typeof candidate.threadRegistry === "object"
        ? Object.fromEntries(
            Object.entries(candidate.threadRegistry).map(([threadId, entry]) => {
              const record = entry && typeof entry === "object" ? entry : {};
              const typed = record as Partial<
                CodexNewFrontendState["threadRegistry"][string]
              >;
              return [
                threadId,
                {
                  threadId: typed.threadId ?? threadId,
                  workspaceId: typed.workspaceId ?? "",
                  workspaceName: typed.workspaceName ?? "",
                  originalRoot: typed.originalRoot ?? "",
                  isolatedRoot:
                    typeof typed.isolatedRoot === "string" ? typed.isolatedRoot : null,
                  threadTitle:
                    typeof typed.threadTitle === "string" ? typed.threadTitle : null,
                  localFolderName:
                    typeof typed.localFolderName === "string"
                      ? typed.localFolderName
                      : null,
                  updatedAt: typeof typed.updatedAt === "number" ? typed.updatedAt : 0,
                },
              ];
            }),
          )
        : {},
    dataPaths:
      candidate.dataPaths && typeof candidate.dataPaths === "object"
        ? {
            codexHome:
              typeof candidate.dataPaths.codexHome === "string"
                ? candidate.dataPaths.codexHome
                : "",
            codexNewRoot:
              typeof candidate.dataPaths.codexNewRoot === "string"
                ? candidate.dataPaths.codexNewRoot
                : "",
            desktopStatePath:
              typeof candidate.dataPaths.desktopStatePath === "string"
                ? candidate.dataPaths.desktopStatePath
                : "",
            legacyCodexHomes: Array.isArray(candidate.dataPaths.legacyCodexHomes)
              ? candidate.dataPaths.legacyCodexHomes.filter(
                  (entry): entry is string => typeof entry === "string",
                )
              : [],
          }
        : emptyCodexNewDataPaths,
    processEntries: Array.isArray(candidate.processEntries)
      ? candidate.processEntries.map((entry) => ({
          ...entry,
          files: Array.isArray(entry?.files)
            ? entry.files
                .filter((file) => Boolean(file) && typeof file === "object")
                .map((file) => ({
                  path: typeof file.path === "string" ? file.path : "",
                }))
                .filter((file) => file.path.length > 0)
            : [],
        }))
      : [],
    terminalRuns: Array.isArray(candidate.terminalRuns) ? candidate.terminalRuns : [],
    lastUpdatedAt: typeof candidate.lastUpdatedAt === "number" ? candidate.lastUpdatedAt : 0,
  };
}

function dispatchStateEvent(next: CodexNewFrontendState) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<CodexNewFrontendState>(CODEX_NEW_STATE_EVENT, {
      detail: next,
    }),
  );
}

function codexNewStateContentKey(state: CodexNewFrontendState): string {
  const { lastUpdatedAt: _lastUpdatedAt, ...content } = state;
  return JSON.stringify(content);
}

function writeState(next: CodexNewFrontendState): CodexNewFrontendState {
  const normalized = {
    ...cloneState(next),
    lastUpdatedAt: Date.now(),
  };
  if (typeof window !== "undefined") {
    const current = readCodexNewState();
    if (codexNewStateContentKey(current) === codexNewStateContentKey(normalized)) {
      return current;
    }
    window.localStorage.setItem(CODEX_NEW_STORAGE_KEY, JSON.stringify(normalized));
    dispatchStateEvent(normalized);
  }
  return normalized;
}

export function setCodexNewState(next: CodexNewFrontendState): CodexNewFrontendState {
  return writeState(next);
}

function createSession(workspace: WorkspaceInfo, threadId: string | null): CodexNewSession {
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspacePath: workspace.path,
    threadId,
    enabledAt: Date.now(),
    source: "frontend-placeholder",
  };
}

function buildSeedProcessEntries(session: CodexNewSession): CodexNewProcessEntry[] {
  return [
    {
      id: `workspace-${session.enabledAt}`,
      kind: "workspace",
      title: "Security mode armed",
      detail: `The current workspace will switch to the isolated codex-new workflow scaffold for ${session.workspaceName}.`,
      files: [],
      status: "completed",
      createdAt: session.enabledAt,
    },
    {
      id: `plan-${session.enabledAt}`,
      kind: "plan",
      title: "Waiting for isolated workspace preparation",
      detail:
        "The desktop workbench is ready. Your backend bridge can create a worktree/copy session next and replace this placeholder event stream.",
      files: [],
      status: "running",
      createdAt: session.enabledAt + 1,
    },
    {
      id: `review-${session.enabledAt}`,
      kind: "review",
      title: "Review and selective merge remain gated",
      detail:
        "Once backend events arrive, this feed will show review checkpoints, test outcomes, selective merge decisions, and rollback markers.",
      files: [],
      status: "pending",
      createdAt: session.enabledAt + 2,
    },
    {
      id: `summary-${session.enabledAt}`,
      kind: "summary",
      title: "Task memory is reserved",
      detail:
        "Per-task summaries and memory files can be attached here after each round, matching the codex-new memory concept.",
      files: [],
      status: "pending",
      createdAt: session.enabledAt + 3,
    },
  ];
}

function buildSeedTerminalRuns(session: CodexNewSession): CodexNewTerminalRun[] {
  return [
    {
      id: `terminal-${session.enabledAt}`,
      title: "CLI bridge standby",
      command: "codex-new backend bridge pending",
      cwd: session.workspacePath,
      status: "pending",
      startedAt: session.enabledAt,
      completedAt: null,
      exitCode: null,
      stdoutExcerpt:
        "This window is ready for streamed CLI commands, stdout, stderr, cwd, exit codes, and retry annotations.",
      stderrExcerpt: "",
    },
  ];
}

export function readCodexNewState(): CodexNewFrontendState {
  if (typeof window === "undefined") {
    return cloneState(emptyState);
  }
  const raw = window.localStorage.getItem(CODEX_NEW_STORAGE_KEY);
  if (!raw) {
    return cloneState(emptyState);
  }
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return cloneState(emptyState);
  }
}

export function updateCodexNewState(
  updater: (current: CodexNewFrontendState) => CodexNewFrontendState,
): CodexNewFrontendState {
  const current = readCodexNewState();
  return writeState(updater(current));
}

function enableCodexNewSecurityFallback(
  workspace: WorkspaceInfo,
  threadId: string | null,
): CodexNewFrontendState {
  return updateCodexNewState((current) => {
    const next = cloneState(current);
    const session = createSession(workspace, threadId);
    next.workspaceSecurity[workspace.id] = {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      enabledAt: session.enabledAt,
      pathAliases: [workspace.path],
    };
    next.activeSession = session;
    next.activeTask = null;
    next.processEntries = buildSeedProcessEntries(session);
    next.terminalRuns = buildSeedTerminalRuns(session);
    return next;
  });
}

function disableCodexNewSecurityFallback(workspaceId: string): CodexNewFrontendState {
  return updateCodexNewState((current) => {
    const next = cloneState(current);
    delete next.workspaceSecurity[workspaceId];
    if (next.activeSession?.workspaceId === workspaceId) {
      next.activeSession = null;
      next.activeTask = null;
    }
    return next;
  });
}

function focusCodexNewSessionFallback(
  workspace: WorkspaceInfo,
  threadId: string | null,
): CodexNewFrontendState {
  return updateCodexNewState((current) => {
    const next = cloneState(current);
    const enabledState = next.workspaceSecurity[workspace.id];
    if (!enabledState) {
      return next;
    }
    next.activeSession = {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspacePath: workspace.path,
      threadId,
      enabledAt: enabledState.enabledAt,
      source: current.activeSession?.source ?? "frontend-placeholder",
    };
    if (current.activeSession?.workspaceId !== workspace.id) {
      next.activeTask = null;
    }
    return next;
  });
}

export async function refreshCodexNewState(): Promise<CodexNewFrontendState> {
  try {
    const incoming = await getCodexNewState();
    const current = readCodexNewState();
    if (codexNewStateContentKey(current) === codexNewStateContentKey(incoming)) {
      return current;
    }
    return setCodexNewState(incoming);
  } catch (error) {
    console.warn("Failed to refresh codex-new backend state.", { error });
    return readCodexNewState();
  }
}

export async function enableCodexNewSecurity(
  workspace: WorkspaceInfo,
  threadId: string | null,
  threadTitle: string | null = null,
): Promise<CodexNewFrontendState> {
  try {
    return setCodexNewState(
      await enableCodexNewSecurityBackend(workspace.id, threadId, threadTitle),
    );
  } catch (error) {
    console.warn("Failed to enable codex-new backend state, using fallback.", { error });
    return enableCodexNewSecurityFallback(workspace, threadId);
  }
}

export async function disableCodexNewSecurity(
  workspaceId: string,
): Promise<CodexNewFrontendState> {
  try {
    return setCodexNewState(await disableCodexNewSecurityBackend(workspaceId));
  } catch (error) {
    console.warn("Failed to disable codex-new backend state, using fallback.", { error });
    return disableCodexNewSecurityFallback(workspaceId);
  }
}

export async function focusCodexNewSession(
  workspace: WorkspaceInfo,
  threadId: string | null,
  threadTitle: string | null = null,
): Promise<CodexNewFrontendState> {
  try {
    return setCodexNewState(
      await focusCodexNewSessionBackend(workspace.id, threadId, threadTitle),
    );
  } catch (error) {
    console.warn("Failed to focus codex-new backend session, using fallback.", { error });
    return focusCodexNewSessionFallback(workspace, threadId);
  }
}

export async function syncCodexNewViewingContext(
  workspace: WorkspaceInfo,
  threadId: string | null,
  threadTitle: string | null = null,
): Promise<CodexNewFrontendState> {
  try {
    return setCodexNewState(
      await syncCodexNewViewingContextBackend(workspace.id, threadId, threadTitle),
    );
  } catch (error) {
    console.warn("Failed to sync codex-new viewing context.", { error });
    return readCodexNewState();
  }
}

export async function syncCodexNewThreadTitles(
  workspaceId: string,
  entries: { threadId: string; threadTitle: string | null }[],
): Promise<CodexNewFrontendState> {
  if (entries.length === 0) {
    return readCodexNewState();
  }
  try {
    return setCodexNewState(await syncCodexNewThreadTitlesBackend(workspaceId, entries));
  } catch (error) {
    console.warn("Failed to sync codex-new thread titles.", { error });
    return readCodexNewState();
  }
}

export async function refreshCodexNewChanges(
  workspaceId: string,
): Promise<CodexNewFrontendState> {
  return setCodexNewState(await refreshCodexNewChangesBackend(workspaceId));
}

export async function runCodexNewReview(
  workspaceId: string,
): Promise<CodexNewFrontendState> {
  return setCodexNewState(await runCodexNewReviewBackend(workspaceId));
}

export async function restoreCodexNewTraceback(
  workspaceId: string,
  path: string,
  target: CodexNewTracebackRestoreTarget,
): Promise<CodexNewFrontendState> {
  return setCodexNewState(await restoreCodexNewTracebackBackend(workspaceId, path, target));
}

export async function mergeCodexNewChanges(
  workspaceId: string,
  options?: {
    paths?: string[];
    hunks?: { path: string; hunkIndex: number }[];
  },
): Promise<CodexNewFrontendState> {
  return setCodexNewState(await mergeCodexNewChangesBackend(workspaceId, options));
}

export async function rollbackCodexNewTask(
  workspaceId: string,
  options?: {
    paths?: string[];
    hunks?: { path: string; hunkIndex: number }[];
  },
): Promise<CodexNewFrontendState> {
  return setCodexNewState(await rollbackCodexNewTaskBackend(workspaceId, options));
}

export async function writeCodexNewSummary(
  workspaceId: string,
  goal?: string,
  result?: string,
): Promise<CodexNewFrontendState> {
  return setCodexNewState(await writeCodexNewSummaryBackend(workspaceId, goal, result));
}

export async function runCodexNewTest(
  workspaceId: string,
  command: string,
): Promise<CodexNewFrontendState> {
  return setCodexNewState(
    await runCodexNewTestBackend(workspaceId, command, {
      useEnvironmentBinding: true,
      title: "Test run",
    }),
  );
}

export function appendCodexNewProcessEntry(entry: CodexNewProcessEntry): CodexNewFrontendState {
  return updateCodexNewState((current) => ({
    ...cloneState(current),
    processEntries: [...current.processEntries, entry].sort((left, right) => left.createdAt - right.createdAt),
  }));
}

export function upsertCodexNewTerminalRun(run: CodexNewTerminalRun): CodexNewFrontendState {
  return updateCodexNewState((current) => {
    const nextRuns = current.terminalRuns.filter((entry) => entry.id !== run.id);
    nextRuns.push(run);
    nextRuns.sort((left, right) => left.startedAt - right.startedAt);
    return {
      ...cloneState(current),
      terminalRuns: nextRuns,
    };
  });
}
