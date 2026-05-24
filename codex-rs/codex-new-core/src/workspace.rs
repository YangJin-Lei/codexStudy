use crate::Result;
use crate::fsx;
use crate::git;
use crate::models::ProjectRecord;
use crate::models::WorkspaceStrategy;
use chrono::DateTime;
use chrono::Utc;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedWorkspace {
    pub task_id: String,
    pub workspace_root: PathBuf,
    pub strategy: WorkspaceStrategy,
    pub branch_name: Option<String>,
    pub base_revision: Option<String>,
}

pub(crate) fn prepare_workspace(
    project: &ProjectRecord,
    task_id: &str,
    workspaces_root: PathBuf,
    created_at: DateTime<Utc>,
) -> Result<PreparedWorkspace> {
    let task_root = workspace_task_root(&workspaces_root, project, task_id, created_at);
    let preferred = project.settings.workspace_strategy;
    let use_worktree = match preferred {
        WorkspaceStrategy::Worktree => true,
        WorkspaceStrategy::Copy => false,
        WorkspaceStrategy::Auto => {
            project.git_root.is_some() && !git::has_changes(&project.root_path)
        }
    };

    if use_worktree && let Some(git_root) = &project.git_root {
        let workspace_root = task_root.join("worktree");
        let branch = format!("codex-new/task/{}", short_task_id(task_id));
        if workspace_root.exists() {
            return Ok(PreparedWorkspace {
                task_id: task_id.to_string(),
                workspace_root,
                strategy: WorkspaceStrategy::Worktree,
                branch_name: Some(branch),
                base_revision: git::head_revision(git_root),
            });
        }
        if let Ok(()) = git::create_worktree(git_root, &workspace_root, &branch) {
            return Ok(PreparedWorkspace {
                task_id: task_id.to_string(),
                workspace_root,
                strategy: WorkspaceStrategy::Worktree,
                branch_name: Some(branch),
                base_revision: git::head_revision(git_root),
            });
        }
        let unique_branch = format!("{branch}-{}", &task_id[..8.min(task_id.len())]);
        let _ = git::prune_worktrees(git_root);
        if git::create_worktree(git_root, &workspace_root, &unique_branch).is_ok() {
            return Ok(PreparedWorkspace {
                task_id: task_id.to_string(),
                workspace_root,
                strategy: WorkspaceStrategy::Worktree,
                branch_name: Some(unique_branch),
                base_revision: git::head_revision(git_root),
            });
        }
    }

    let workspace_root = task_root.join("copy");
    fsx::copy_project(&project.root_path, &workspace_root)?;
    Ok(PreparedWorkspace {
        task_id: task_id.to_string(),
        workspace_root,
        strategy: WorkspaceStrategy::Copy,
        branch_name: None,
        base_revision: project.git_root.as_deref().and_then(git::head_revision),
    })
}

pub(crate) fn workspace_task_root(
    workspaces_root: &Path,
    project: &ProjectRecord,
    task_id: &str,
    created_at: DateTime<Utc>,
) -> PathBuf {
    let legacy = workspaces_root.join(&project.id).join(task_id);
    if legacy.exists() {
        return legacy;
    }
    workspaces_root
        .join(sanitize_path_component(&project.name))
        .join(format!(
            "{}_{}",
            created_at.format("%Y-%m-%d_%H%M"),
            short_task_id(task_id)
        ))
}

fn sanitize_path_component(value: &str) -> String {
    let mut sanitized = String::new();
    for ch in value.chars() {
        let next = match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        };
        sanitized.push(next);
    }
    let trimmed = sanitized.trim_matches('_').trim();
    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed.to_string()
    }
}

fn short_task_id(task_id: &str) -> &str {
    task_id.get(..8).unwrap_or(task_id)
}
