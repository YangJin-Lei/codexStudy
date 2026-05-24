use chrono::DateTime;
use chrono::Utc;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceStrategy {
    Auto,
    Worktree,
    Copy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub workspace_strategy: WorkspaceStrategy,
    pub keep_days: u32,
    pub require_review: bool,
    pub require_tests: bool,
    pub protect_sensitive_files: bool,
    pub default_test_commands: Vec<String>,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            workspace_strategy: WorkspaceStrategy::Auto,
            keep_days: 30,
            require_review: true,
            require_tests: false,
            protect_sensitive_files: true,
            default_test_commands: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub root_path: PathBuf,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub git_root: Option<PathBuf>,
    pub default_branch: Option<String>,
    pub settings: ProjectSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    Created,
    PreparingWorkspace,
    WorkspaceReady,
    AgentQueued,
    AgentRunning,
    AgentInterrupted,
    AgentFailed,
    ChangesDetected,
    SummaryReady,
    ReviewPending,
    Reviewing,
    ReviewBlocked,
    ReviewPassed,
    ReviewFailed,
    TestingPending,
    TestingRunning,
    TestingPassed,
    TestingFailed,
    MergeQueued,
    MergeReady,
    Merging,
    Merged,
    RollbackAvailable,
    RollingBack,
    RollbackFailed,
    WorkspaceConflict,
    MergeConflict,
    EnvironmentBroken,
    Superseded,
    Abandoned,
    Archived,
}

impl TaskStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Merged | Self::Superseded | Self::Abandoned | Self::Archived
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: TaskStatus,
    pub original_root: PathBuf,
    pub workspace_root: PathBuf,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub manifest_path: PathBuf,
    pub summary_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ChangedFileStatus {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: ChangedFileStatus,
    pub before_hash: Option<String>,
    pub after_ai_hash: Option<String>,
    pub after_merge_hash: Option<String>,
    /// When set, only these diff hunk indices were merged into the project file.
    #[serde(default)]
    pub merged_hunks: Option<Vec<usize>>,
    pub accepted: bool,
    pub merge_status: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TimelineEventKind {
    WorkspaceCreated,
    AgentStarted,
    AgentCompleted,
    AgentPlan,
    AgentNote,
    FileRead,
    FileEditStarted,
    FileEditCompleted,
    DiffGenerated,
    DiffUpdated,
    CommandStarted,
    CommandOutput,
    CommandCompleted,
    ReviewCompleted,
    TestStarted,
    TestCompleted,
    MergeStarted,
    MergeCompleted,
    RollbackCompleted,
    Error,
    SummaryGenerated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: String,
    pub task_id: String,
    pub seq: u64,
    pub kind: TimelineEventKind,
    pub created_at: DateTime<Utc>,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskActivityFeed {
    pub task_id: String,
    pub latest_seq: u64,
    pub events: Vec<TimelineEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HunkSelection {
    pub path: String,
    pub hunk_index: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineSelection {
    pub path: String,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MergeSelection {
    All,
    Files(Vec<String>),
    Hunks(Vec<HunkSelection>),
    Lines(Vec<LineSelection>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeRequest {
    pub selection: MergeSelection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RollbackSelection {
    All,
    Files(Vec<String>),
    Hunks(Vec<HunkSelection>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackRequest {
    pub selection: RollbackSelection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeOutcome {
    pub task_id: String,
    pub accepted_paths: Vec<String>,
    pub skipped_paths: Vec<String>,
    pub changed_files: Vec<ChangedFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackOutcome {
    pub task_id: String,
    pub restored_paths: Vec<String>,
    pub skipped_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestOutcome {
    pub command_run_id: String,
    pub command: String,
    pub environment: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout_path: PathBuf,
    pub stderr_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentNoteKind {
    Plan,
    Diagnosis,
    NextStep,
    Observation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskReusePolicy {
    ReuseActive,
    ForceNew,
    ForkFromTask { task_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBinding {
    pub project_id: String,
    pub conversation_id: String,
    pub active_task_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentStrategy {
    InheritProject,
    InheritTask,
    RebindAuto,
    ManualProfile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SharedPathKind {
    VirtualEnv,
    NodeModules,
    Toolchain,
    Cache,
    Wrapper,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedPathMount {
    pub kind: SharedPathKind,
    pub source: PathBuf,
    pub target_hint: Option<PathBuf>,
    pub read_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTool {
    pub ecosystem: String,
    pub name: String,
    pub executable: PathBuf,
    pub version_hint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentValidation {
    pub is_valid: bool,
    pub checked_at: DateTime<Utc>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentBinding {
    pub profile_id: String,
    pub project_id: String,
    pub workspace_root: PathBuf,
    pub environment_root: PathBuf,
    pub strategy: EnvironmentStrategy,
    pub fingerprint: String,
    pub detected_at: DateTime<Utc>,
    pub env_vars: BTreeMap<String, String>,
    pub path_entries: Vec<PathBuf>,
    pub shared_paths: Vec<SharedPathMount>,
    pub detected_tools: Vec<DetectedTool>,
    pub validation: EnvironmentValidation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMemory {
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub evidence_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredTaskSummary {
    pub task_id: String,
    pub user_goal: String,
    pub ai_result: String,
    pub files_changed: Vec<String>,
    pub decisions: Vec<String>,
    pub tests: Vec<String>,
    pub risks: Vec<String>,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub recovery_hints: Vec<String>,
    pub candidate_memory: Vec<CandidateMemory>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CandidateMemoryStatus {
    Pending,
    Same,
    CompatibleUpdate,
    Conflict,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMemoryRecord {
    pub id: String,
    pub candidate: CandidateMemory,
    pub status: CandidateMemoryStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryRecord {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub evidence_paths: Vec<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryApplyOutcome {
    pub applied: Vec<String>,
    pub skipped: Vec<String>,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub changed_files: usize,
    pub added_files: usize,
    pub modified_files: usize,
    pub deleted_files: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub before_start: usize,
    pub before_lines: usize,
    pub after_start: usize,
    pub after_lines: usize,
    pub preview: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub status: ChangedFileStatus,
    pub is_binary: bool,
    pub is_lockfile: bool,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskMarker {
    pub kind: String,
    pub path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffBundle {
    pub files: Vec<FileDiff>,
    pub stats: DiffStats,
    pub risk_markers: Vec<RiskMarker>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewSeverity {
    Info,
    Warning,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewDisposition {
    Informational,
    NeedsUserApproval,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewIssue {
    pub severity: ReviewSeverity,
    pub path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewReport {
    pub disposition: ReviewDisposition,
    pub issues: Vec<ReviewIssue>,
    pub summary: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CommandExecutionKind {
    Generic,
    Test,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CommandRunStatus {
    Running,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CommandOutputStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecutionRequest {
    pub command: String,
    pub use_environment_binding: bool,
    pub env_overrides: BTreeMap<String, String>,
    pub profile_id: Option<String>,
    pub title: Option<String>,
    pub kind: CommandExecutionKind,
    pub retry_of: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRunRecord {
    pub id: String,
    pub task_id: String,
    pub kind: CommandExecutionKind,
    pub title: Option<String>,
    pub command: String,
    pub cwd: PathBuf,
    pub environment_profile: Option<String>,
    pub environment_fingerprint: Option<String>,
    pub retry_of: Option<String>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub status: CommandRunStatus,
    pub exit_code: Option<i32>,
    pub stdout_path: PathBuf,
    pub stderr_path: PathBuf,
    pub stdout_bytes: u64,
    pub stderr_bytes: u64,
    pub diagnosis: Option<String>,
    pub failure_summary: Option<String>,
    pub next_step: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePolicy {
    pub require_user_approval: bool,
    pub require_clean_review: bool,
    pub require_test_pass: bool,
    pub blocked_file_patterns: Vec<String>,
    pub sensitive_file_patterns: Vec<String>,
    pub max_auto_merge_files: u32,
    pub allow_lockfile_merge_without_reason: bool,
    pub allow_binary_merge: bool,
}

impl Default for MergePolicy {
    fn default() -> Self {
        Self {
            require_user_approval: true,
            require_clean_review: true,
            require_test_pass: false,
            blocked_file_patterns: Vec::new(),
            sensitive_file_patterns: vec![
                ".env".to_string(),
                ".env.local".to_string(),
                ".env.production".to_string(),
            ],
            max_auto_merge_files: 25,
            allow_lockfile_merge_without_reason: false,
            allow_binary_merge: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveTaskRequest {
    pub project_id: String,
    pub title: String,
    pub conversation_id: Option<String>,
    pub reuse_policy: TaskReusePolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveTaskResponse {
    pub task: TaskRecord,
    pub manifest: crate::manifest::TaskManifest,
    pub reused_existing: bool,
    pub conversation_binding: Option<ConversationBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskOverview {
    pub task: TaskRecord,
    pub manifest: crate::manifest::TaskManifest,
    pub environment: Option<EnvironmentBinding>,
    pub latest_summary: Option<StructuredTaskSummary>,
    pub diff: DiffBundle,
    pub review: Option<ReviewReport>,
    pub latest_event_seq: u64,
    pub recent_activity: Vec<TimelineEvent>,
    pub command_runs: Vec<CommandRunRecord>,
    pub timeline_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestExecutionRequest {
    pub command: String,
    pub use_environment_binding: bool,
    pub env_overrides: BTreeMap<String, String>,
    pub profile_id: Option<String>,
    pub retry_of: Option<String>,
    pub title: Option<String>,
}

pub(crate) type HashIndex = BTreeMap<String, Option<String>>;
