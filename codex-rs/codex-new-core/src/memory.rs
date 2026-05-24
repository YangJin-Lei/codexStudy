//! Task summaries, candidate memory extraction, and project memory application.

use crate::Result;
use crate::activity;
use crate::manifest::TaskManifest;
use crate::models::CandidateMemory;
use crate::models::CandidateMemoryRecord;
use crate::models::CandidateMemoryStatus;
use crate::models::CommandExecutionKind;
use crate::models::CommandRunStatus;
use crate::models::MemoryApplyOutcome;
use crate::models::ProjectMemoryRecord;
use crate::models::ReviewDisposition;
use crate::models::StructuredTaskSummary;
use crate::models::TaskStatus;
use chrono::Utc;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use uuid::Uuid;

const CANDIDATE_MEMORY_FILE: &str = "candidate-memory.json";
const PROJECT_MEMORY_FILE: &str = "memory/project-memory.json";

pub(crate) fn build_structured_summary(
    manifest: &TaskManifest,
    user_goal: &str,
    ai_result: &str,
    task_root: &Path,
) -> Result<StructuredTaskSummary> {
    let command_runs = activity::list_command_runs(task_root, 50)?;
    let tests: Vec<String> = command_runs
        .iter()
        .filter(|run| run.kind == CommandExecutionKind::Test)
        .map(|run| {
            let status = match run.status {
                CommandRunStatus::Succeeded => "passed",
                CommandRunStatus::Failed => "failed",
                CommandRunStatus::Running => "running",
            };
            format!("{} ({status})", run.command)
        })
        .collect();

    let review_path = task_root.join("review").join("latest-review.json");
    let (decisions, risks, blockers) = if review_path.exists() {
        let report =
            serde_json::from_slice::<crate::models::ReviewReport>(&fs::read(&review_path)?)?;
        let decisions = vec![report.summary.clone()];
        let risks: Vec<String> = report
            .issues
            .iter()
            .map(|issue| issue.message.clone())
            .collect();
        let blockers = if matches!(report.disposition, ReviewDisposition::Blocked) {
            risks.clone()
        } else {
            Vec::new()
        };
        (decisions, risks, blockers)
    } else {
        (
            vec!["Pending user review.".to_string()],
            vec!["Review required before merge.".to_string()],
            Vec::new(),
        )
    };

    let recovery_hints = recovery_hints_for_status(manifest.status);
    let candidate_memory = extract_candidate_memory(manifest, user_goal, ai_result, &tests);

    Ok(StructuredTaskSummary {
        task_id: manifest.task_id.clone(),
        user_goal: user_goal.to_string(),
        ai_result: ai_result.to_string(),
        files_changed: manifest
            .changed_files
            .iter()
            .map(|change| change.path.clone())
            .collect(),
        decisions,
        tests: if tests.is_empty() {
            vec!["Not run.".to_string()]
        } else {
            tests
        },
        risks,
        blockers,
        recovery_hints,
        candidate_memory,
    })
}

pub(crate) fn write_summary_artifacts(
    task_root: &Path,
    structured: &StructuredTaskSummary,
) -> Result<(PathBuf, PathBuf)> {
    let memory_root = task_root.join("memory");
    fs::create_dir_all(&memory_root)?;
    let markdown_path = memory_root.join("task-summary.md");
    let json_path = memory_root.join("task-summary.json");
    let files_changed = structured
        .files_changed
        .iter()
        .map(|path| format!("- `{path}`"))
        .collect::<Vec<_>>()
        .join("\n");
    let candidate_lines = structured
        .candidate_memory
        .iter()
        .map(|memory| format!("- **{}**: {}", memory.title, memory.detail))
        .collect::<Vec<_>>()
        .join("\n");
    let markdown = format!(
        "# Task Summary\n\n## User Goal\n\n{}\n\n## AI Result\n\n{}\n\n## Files Changed\n\n{}\n\n## Decisions\n\n{}\n\n## Tests\n\n{}\n\n## Risks\n\n{}\n\n## Blockers\n\n{}\n\n## Recovery Hints\n\n{}\n\n## Candidate Project Memory\n\n{}\n",
        structured.user_goal,
        structured.ai_result,
        files_changed,
        structured.decisions.join("\n"),
        structured.tests.join("\n"),
        structured.risks.join("\n"),
        structured.blockers.join("\n"),
        structured.recovery_hints.join("\n"),
        if candidate_lines.is_empty() {
            "- None proposed.".to_string()
        } else {
            candidate_lines
        }
    );
    fs::write(&markdown_path, markdown)?;
    fs::write(&json_path, serde_json::to_vec_pretty(structured)?)?;
    write_candidate_memory_file(task_root, structured)?;
    Ok((markdown_path, json_path))
}

pub(crate) fn read_candidate_memory_records(
    task_root: &Path,
) -> Result<Vec<CandidateMemoryRecord>> {
    let path = task_root.join("memory").join(CANDIDATE_MEMORY_FILE);
    if !path.exists() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub(crate) fn apply_candidate_memory(
    project_root: &Path,
    task_root: &Path,
    candidate_ids: &[String],
) -> Result<MemoryApplyOutcome> {
    let candidates = read_candidate_memory_records(task_root)?;
    let project_memory_path = project_root.join(PROJECT_MEMORY_FILE);
    let mut project_memory = read_project_memory(&project_memory_path)?;
    let mut applied = Vec::new();
    let mut skipped = Vec::new();
    let mut conflicts = Vec::new();

    for candidate_id in candidate_ids {
        let Some(record) = candidates.iter().find(|record| record.id == *candidate_id) else {
            skipped.push(candidate_id.clone());
            continue;
        };
        if matches!(record.status, CandidateMemoryStatus::Conflict) {
            conflicts.push(candidate_id.clone());
            continue;
        }
        let key = memory_key(&record.candidate);
        if let Some(existing) = project_memory.get(&key) {
            if existing.detail == record.candidate.detail {
                skipped.push(candidate_id.clone());
                continue;
            }
            conflicts.push(candidate_id.clone());
            continue;
        }
        project_memory.insert(
            key,
            ProjectMemoryRecord {
                id: Uuid::new_v4().to_string(),
                kind: record.candidate.kind.clone(),
                title: record.candidate.title.clone(),
                detail: record.candidate.detail.clone(),
                evidence_paths: record.candidate.evidence_paths.clone(),
                updated_at: Utc::now(),
            },
        );
        applied.push(candidate_id.clone());
    }

    write_project_memory(&project_memory_path, &project_memory)?;
    Ok(MemoryApplyOutcome {
        applied,
        skipped,
        conflicts,
    })
}

fn write_candidate_memory_file(task_root: &Path, structured: &StructuredTaskSummary) -> Result<()> {
    let records = structured
        .candidate_memory
        .iter()
        .map(|candidate| CandidateMemoryRecord {
            id: Uuid::new_v4().to_string(),
            candidate: candidate.clone(),
            status: CandidateMemoryStatus::Pending,
        })
        .collect::<Vec<_>>();
    let path = task_root.join("memory").join(CANDIDATE_MEMORY_FILE);
    fs::write(path, serde_json::to_vec_pretty(&records)?)?;
    Ok(())
}

fn read_project_memory(path: &Path) -> Result<BTreeMap<String, ProjectMemoryRecord>> {
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_project_memory(
    path: &Path,
    records: &BTreeMap<String, ProjectMemoryRecord>,
) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(records)?)?;
    Ok(())
}

fn memory_key(candidate: &CandidateMemory) -> String {
    format!("{}::{}", candidate.kind, candidate.title)
}

fn recovery_hints_for_status(status: TaskStatus) -> Vec<String> {
    match status {
        TaskStatus::WorkspaceConflict => {
            vec!["Re-run resume to rebuild or validate the isolated workspace.".to_string()]
        }
        TaskStatus::EnvironmentBroken => {
            vec!["Re-inspect the environment binding before running tests.".to_string()]
        }
        TaskStatus::MergeConflict => {
            vec!["Refresh changes and resolve conflicts before merging again.".to_string()]
        }
        TaskStatus::TestingFailed => {
            vec!["Review the latest test logs and retry with a narrower command.".to_string()]
        }
        TaskStatus::ReviewBlocked => {
            vec!["Address review blockers before requesting merge.".to_string()]
        }
        _ => Vec::new(),
    }
}

fn extract_candidate_memory(
    manifest: &TaskManifest,
    user_goal: &str,
    ai_result: &str,
    tests: &[String],
) -> Vec<CandidateMemory> {
    let mut candidates = Vec::new();
    for change in &manifest.changed_files {
        if is_ephemeral_path(&change.path) {
            continue;
        }
        candidates.push(CandidateMemory {
            kind: "architectureFact".to_string(),
            title: format!("Changed {}", change.path),
            detail: format!(
                "Task modified {:?} in `{}` while pursuing: {user_goal}",
                change.status, change.path
            ),
            evidence_paths: vec![change.path.clone()],
        });
    }
    if let Some(command) = tests.first() {
        candidates.push(CandidateMemory {
            kind: "workflowRule".to_string(),
            title: "Observed test command".to_string(),
            detail: format!("This task executed `{command}` successfully or unsuccessfully."),
            evidence_paths: Vec::new(),
        });
    }
    if !ai_result.trim().is_empty() && ai_result.len() < 400 {
        candidates.push(CandidateMemory {
            kind: "constraint".to_string(),
            title: "Task outcome note".to_string(),
            detail: ai_result.to_string(),
            evidence_paths: Vec::new(),
        });
    }
    candidates
}

fn is_ephemeral_path(path: &str) -> bool {
    path.contains("/tmp/")
        || path.contains("\\Temp\\")
        || path.contains("target/debug/deps")
        || path.contains("node_modules/")
}
