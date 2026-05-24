export type CodexNewSecuritySource = "frontend-placeholder" | "backend";

export type CodexNewProcessStatus = "pending" | "running" | "completed" | "blocked";

export type CodexNewTaskStatus = string;

export type CodexNewProcessKind =
  | "workspace"
  | "plan"
  | "edit"
  | "review"
  | "summary"
  | "notice";

export type CodexNewTerminalStatus = "pending" | "running" | "succeeded" | "failed";

export type CodexNewFilePreviewStatus = "ready" | "binary" | "missing";

export type CodexNewWorkspaceStrategy = "auto" | "worktree" | "copy";

export type CodexNewChangedFileStatus = "added" | "modified" | "deleted";

export type CodexNewReviewSeverity = "info" | "warning" | "high";

export type CodexNewReviewDisposition = "informational" | "needsUserApproval" | "blocked";

export type CodexNewCommandRunStatus = "running" | "succeeded" | "failed";

export type CodexNewProcessFileRef = {
  path: string;
};

export type CodexNewFilePreview = {
  path: string;
  status: CodexNewFilePreviewStatus;
  content: string;
  truncated: boolean;
};

export type CodexNewSession = {
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
  threadId: string | null;
  enabledAt: number;
  source: CodexNewSecuritySource;
};

export type CodexNewWorkspaceSecurityState = {
  workspaceId: string;
  workspaceName: string;
  enabledAt: number;
  pathAliases: string[];
};

export type CodexNewProjectSettings = {
  workspaceStrategy: CodexNewWorkspaceStrategy;
  keepDays: number;
  requireReview: boolean;
  requireTests: boolean;
  protectSensitiveFiles: boolean;
  defaultTestCommands: string[];
};

export type CodexNewChangedFile = {
  path: string;
  status: CodexNewChangedFileStatus;
  beforeHash: string | null;
  afterAiHash: string | null;
  afterMergeHash: string | null;
  mergedHunks: number[] | null;
  accepted: boolean;
  mergeStatus: string;
};

export type CodexNewDiffHunk = {
  header: string;
  beforeStart: number;
  beforeLines: number;
  afterStart: number;
  afterLines: number;
  preview: string[];
};

export type CodexNewDiffFile = {
  path: string;
  status: CodexNewChangedFileStatus;
  isBinary: boolean;
  isLockfile: boolean;
  hunks: CodexNewDiffHunk[];
};

export type CodexNewRiskMarker = {
  kind: string;
  path: string | null;
  message: string;
};

export type CodexNewDiffBundle = {
  files: CodexNewDiffFile[];
  stats: {
    changedFiles: number;
    addedFiles: number;
    modifiedFiles: number;
    deletedFiles: number;
  };
  riskMarkers: CodexNewRiskMarker[];
};

export type CodexNewReviewIssue = {
  severity: CodexNewReviewSeverity;
  path: string | null;
  message: string;
};

export type CodexNewReviewReport = {
  disposition: CodexNewReviewDisposition;
  issues: CodexNewReviewIssue[];
  summary: string;
};

export type CodexNewCandidateMemory = {
  kind: string;
  title: string;
  detail: string;
  evidencePaths: string[];
};

export type CodexNewHunkSelection = {
  path: string;
  hunkIndex: number;
};

export type CodexNewTracebackEntry = {
  path: string;
  originalHash: string | null;
  workspaceHash: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type CodexNewTracebackRestoreTarget = "project" | "workspace";

export type CodexNewCandidateMemoryStatus =
  | "pending"
  | "same"
  | "compatibleUpdate"
  | "conflict";

export type CodexNewCandidateMemoryRecord = {
  id: string;
  candidate: CodexNewCandidateMemory;
  status: CodexNewCandidateMemoryStatus;
};

export type CodexNewMemoryApplyOutcome = {
  applied: string[];
  skipped: string[];
  conflicts: string[];
};

export type CodexNewStructuredTaskSummary = {
  taskId: string;
  userGoal: string;
  aiResult: string;
  filesChanged: string[];
  decisions: string[];
  tests: string[];
  risks: string[];
  candidateMemory: CodexNewCandidateMemory[];
};

export type CodexNewLatestTest = {
  commandRunId: string;
  command: string;
  status: CodexNewCommandRunStatus;
  exitCode: number | null;
  startedAt: number;
  completedAt: number | null;
  stdoutExcerpt: string;
  stderrExcerpt: string;
  failureSummary: string | null;
};

export type CodexNewActiveTask = {
  projectId: string;
  taskId: string;
  title: string;
  status: CodexNewTaskStatus;
  originalRoot: string;
  workspaceRoot: string;
  environmentSummary: string | null;
  projectSettings: CodexNewProjectSettings;
  changedFiles: CodexNewChangedFile[];
  diff: CodexNewDiffBundle;
  review: CodexNewReviewReport | null;
  latestSummary: CodexNewStructuredTaskSummary | null;
  latestTest: CodexNewLatestTest | null;
  hasPassingTest: boolean;
  suggestedTestCommands: string[];
};

export type CodexNewThreadRegistryEntry = {
  threadId: string;
  workspaceId: string;
  workspaceName: string;
  originalRoot: string;
  isolatedRoot: string | null;
  threadTitle: string | null;
  localFolderName: string | null;
  updatedAt: number;
};

export type CodexNewDataPaths = {
  codexHome: string;
  codexNewRoot: string;
  desktopStatePath: string;
  legacyCodexHomes: string[];
};

export type CodexNewProcessEntry = {
  id: string;
  kind: CodexNewProcessKind;
  title: string;
  detail: string;
  files: CodexNewProcessFileRef[];
  status: CodexNewProcessStatus;
  createdAt: number;
};

export type CodexNewTerminalRun = {
  id: string;
  title: string;
  command: string;
  cwd: string;
  status: CodexNewTerminalStatus;
  startedAt: number;
  completedAt: number | null;
  exitCode: number | null;
  stdoutExcerpt: string;
  stderrExcerpt: string;
};

export type CodexNewFrontendState = {
  activeSession: CodexNewSession | null;
  activeTask: CodexNewActiveTask | null;
  workspaceSecurity: Record<string, CodexNewWorkspaceSecurityState>;
  threadRegistry: Record<string, CodexNewThreadRegistryEntry>;
  dataPaths: CodexNewDataPaths;
  processEntries: CodexNewProcessEntry[];
  terminalRuns: CodexNewTerminalRun[];
  lastUpdatedAt: number;
};
