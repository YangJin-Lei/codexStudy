//! Stable DTOs for CLI, desktop bridges, and agent resume injection.

use crate::manifest::TaskManifest;
use crate::models::ChangedFile;
use crate::models::CommandRunRecord;
use crate::models::DiffBundle;
use crate::models::EnvironmentBinding;
use crate::models::ReviewIssue;
use crate::models::ReviewReport;
use crate::models::StructuredTaskSummary;
use crate::models::TaskOverview;
use crate::models::TaskRecord;
use crate::models::TestOutcome;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDescriptor {
    pub task_id: String,
    pub original_root: String,
    pub workspace_root: String,
    pub strategy: String,
    pub branch_name: Option<String>,
    pub base_revision: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentDescriptor {
    pub profile_id: String,
    pub fingerprint: String,
    pub environment_root: String,
    pub is_valid: bool,
    pub detected_tools: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDescriptor {
    pub disposition: String,
    pub summary: String,
    pub issue_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResumeContext {
    pub task_id: String,
    pub summary: Option<StructuredTaskSummary>,
    pub changed_files: Vec<ChangedFile>,
    pub pending_reviews: Vec<ReviewIssue>,
    pub latest_test: Option<TestOutcome>,
    pub environment_binding: Option<EnvironmentBinding>,
    pub workspace: WorkspaceDescriptor,
    pub review: Option<ReviewDescriptor>,
    pub diff: DiffBundle,
}

pub fn workspace_descriptor(task: &TaskRecord, manifest: &TaskManifest) -> WorkspaceDescriptor {
    let strategy = if manifest.workspace_root.join(".git").exists() {
        "worktree"
    } else {
        "copy"
    };
    WorkspaceDescriptor {
        task_id: task.id.clone(),
        original_root: manifest.original_root.to_string_lossy().to_string(),
        workspace_root: manifest.workspace_root.to_string_lossy().to_string(),
        strategy: strategy.to_string(),
        branch_name: None,
        base_revision: manifest.base_revision.clone(),
    }
}

pub fn environment_descriptor(binding: &EnvironmentBinding) -> EnvironmentDescriptor {
    EnvironmentDescriptor {
        profile_id: binding.profile_id.clone(),
        fingerprint: binding.fingerprint.clone(),
        environment_root: binding.environment_root.to_string_lossy().to_string(),
        is_valid: binding.validation.is_valid,
        detected_tools: binding
            .detected_tools
            .iter()
            .map(|tool| format!("{}:{}", tool.ecosystem, tool.name))
            .collect(),
    }
}

pub fn review_descriptor(report: &ReviewReport) -> ReviewDescriptor {
    ReviewDescriptor {
        disposition: format!("{:?}", report.disposition),
        summary: report.summary.clone(),
        issue_count: report.issues.len(),
    }
}

pub fn latest_test_from_runs(runs: &[CommandRunRecord]) -> Option<TestOutcome> {
    runs.iter()
        .rev()
        .find(|run| matches!(run.kind, crate::models::CommandExecutionKind::Test))
        .map(|run| TestOutcome {
            command_run_id: run.id.clone(),
            command: run.command.clone(),
            environment: run
                .environment_profile
                .clone()
                .unwrap_or_else(|| "local".to_string()),
            status: if matches!(run.status, crate::models::CommandRunStatus::Succeeded) {
                "passed".to_string()
            } else {
                "failed".to_string()
            },
            exit_code: run.exit_code,
            stdout_path: run.stdout_path.clone(),
            stderr_path: run.stderr_path.clone(),
        })
}

pub fn build_task_resume_context(overview: &TaskOverview) -> TaskResumeContext {
    let pending_reviews = overview
        .review
        .as_ref()
        .map(|report| report.issues.clone())
        .unwrap_or_default();
    let latest_test = latest_test_from_runs(&overview.command_runs);
    TaskResumeContext {
        task_id: overview.task.id.clone(),
        summary: overview.latest_summary.clone(),
        changed_files: overview.manifest.changed_files.clone(),
        pending_reviews,
        latest_test,
        environment_binding: overview.environment.clone(),
        workspace: workspace_descriptor(&overview.task, &overview.manifest),
        review: overview.review.as_ref().map(review_descriptor),
        diff: overview.diff.clone(),
    }
}
