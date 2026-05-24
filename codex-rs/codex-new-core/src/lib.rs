//! Core primitives for the codex-new isolated task workflow.
//!
//! This crate intentionally contains no desktop UI code. It owns the local
//! safety workflow described by `codex-new.md`: project registration, isolated
//! task workspaces, audit artifacts, reviewable diffs, merge records, rollback
//! snapshots, task summaries, and local test records.

mod activity;
mod diff;
mod engine;
mod environment;
mod error;
mod fsx;
mod git;
mod manifest;
mod memory;
mod models;
mod policy;
mod protocol;
mod recovery;
mod review;
mod sessions;
mod test_commands;
mod traceback;
mod workspace;

pub use test_commands::detect_test_commands;

pub use engine::CodexNewCore;
pub use error::CodexNewError;
pub use error::Result;
pub use manifest::TaskManifest;
pub use models::AgentNoteKind;
pub use models::CandidateMemoryRecord;
pub use models::ChangedFile;
pub use models::ChangedFileStatus;
pub use models::CommandExecutionKind;
pub use models::CommandExecutionRequest;
pub use models::CommandOutputStream;
pub use models::CommandRunRecord;
pub use models::CommandRunStatus;
pub use models::ConversationBinding;
pub use models::DiffBundle;
pub use models::EnvironmentBinding;
pub use models::HunkSelection;
pub use models::LineSelection;
pub use models::MemoryApplyOutcome;
pub use models::MergeOutcome;
pub use models::MergePolicy;
pub use models::MergeRequest;
pub use models::MergeSelection;
pub use models::ProjectMemoryRecord;
pub use models::ProjectRecord;
pub use models::ProjectSettings;
pub use models::ResolveTaskRequest;
pub use models::ResolveTaskResponse;
pub use models::ReviewDisposition;
pub use models::ReviewIssue;
pub use models::ReviewReport;
pub use models::RollbackOutcome;
pub use models::RollbackRequest;
pub use models::RollbackSelection;
pub use models::StructuredTaskSummary;
pub use models::TaskActivityFeed;
pub use models::TaskOverview;
pub use models::TaskRecord;
pub use models::TaskReusePolicy;
pub use models::TaskStatus;
pub use models::TestExecutionRequest;
pub use models::TestOutcome;
pub use models::TimelineEvent;
pub use models::TimelineEventKind;
pub use models::WorkspaceStrategy;
pub use protocol::TaskResumeContext;
pub use protocol::build_task_resume_context;
pub use traceback::TracebackEntry;
pub use traceback::TracebackRestoreOutcome;
pub use traceback::TracebackRestoreTarget;
pub use workspace::PreparedWorkspace;
