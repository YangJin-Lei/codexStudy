use crate::Result;
use crate::fsx;
use crate::git;
use crate::manifest::TaskManifest;
use crate::models::ProjectRecord;
use crate::models::TaskStatus;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;

pub(crate) fn recover_manifest(mut manifest: TaskManifest) -> TaskManifest {
    let workspace_exists = manifest.workspace_root.exists();
    if !workspace_exists {
        manifest.status = TaskStatus::WorkspaceConflict;
    } else if let Some(binding) = &manifest.environment_binding
        && !binding.validation.is_valid
    {
        manifest.status = TaskStatus::EnvironmentBroken;
    } else if matches!(
        manifest.status,
        TaskStatus::AgentInterrupted
            | TaskStatus::AgentFailed
            | TaskStatus::TestingFailed
            | TaskStatus::WorkspaceConflict
            | TaskStatus::EnvironmentBroken
            | TaskStatus::MergeConflict
            | TaskStatus::RollbackFailed
    ) {
        manifest.status = if manifest.changed_files.is_empty() {
            TaskStatus::WorkspaceReady
        } else {
            TaskStatus::ChangesDetected
        };
    }
    manifest
}

pub(crate) fn recover_task_workspace(
    project: &ProjectRecord,
    manifest: &mut TaskManifest,
    workspaces_root: &Path,
) -> Result<()> {
    if manifest.workspace_root.exists() {
        return Ok(());
    }
    let task_root = manifest
        .workspace_root
        .parent()
        .map(Path::to_path_buf)
        .filter(|path| path.as_path() != manifest.workspace_root.as_path())
        .unwrap_or_else(|| {
            crate::workspace::workspace_task_root(
                workspaces_root,
                project,
                &manifest.task_id,
                manifest.created_at,
            )
        });
    if project.git_root.is_some() {
        if let Some(git_root) = &project.git_root {
            let worktree_root = if manifest
                .workspace_root
                .file_name()
                .is_some_and(|name| name == "worktree")
            {
                manifest.workspace_root.clone()
            } else {
                task_root.join("worktree")
            };
            let branch = format!("codex-new/task/{}", short_task_id(&manifest.task_id));
            if git::create_worktree(git_root, &worktree_root, &branch).is_ok() {
                manifest.workspace_root = worktree_root;
                manifest.status = TaskStatus::WorkspaceReady;
                return Ok(());
            }
            git::prune_worktrees(git_root)?;
            if git::create_worktree(git_root, &worktree_root, &branch).is_ok() {
                manifest.workspace_root = worktree_root;
                manifest.status = TaskStatus::WorkspaceReady;
                return Ok(());
            }
        }
    }
    let copy_root = if manifest
        .workspace_root
        .file_name()
        .is_some_and(|name| name == "copy")
    {
        manifest.workspace_root.clone()
    } else {
        task_root.join("copy")
    };
    if let Some(parent) = copy_root.parent() {
        fs::create_dir_all(parent)?;
    }
    fsx::copy_project(&project.root_path, &copy_root)?;
    manifest.workspace_root = copy_root;
    manifest.status = TaskStatus::WorkspaceReady;
    Ok(())
}

pub(crate) struct MergeLockGuard {
    lock_path: PathBuf,
}

impl MergeLockGuard {
    pub(crate) fn acquire(project_root: &Path, task_id: &str) -> Result<Self> {
        let locks_root = project_root.join("locks");
        fs::create_dir_all(&locks_root)?;
        let lock_path = locks_root.join(format!("merge-{task_id}.lock"));
        if lock_path.exists() {
            return Err(crate::CodexNewError::Other(anyhow::anyhow!(
                "merge lock already held for task {task_id}"
            )));
        }
        let mut file = fs::File::create(&lock_path)?;
        writeln!(file, "{task_id}")?;
        Ok(Self { lock_path })
    }

    pub(crate) fn acquire_path(project_root: &Path, path: &str) -> Result<PathLockGuard> {
        let locks_root = project_root.join("locks");
        fs::create_dir_all(&locks_root)?;
        let encoded = encode_path(path);
        let lock_path = locks_root.join(format!("path-{encoded}.lock"));
        if lock_path.exists() {
            return Err(crate::CodexNewError::Other(anyhow::anyhow!(
                "path lock already held for {path}"
            )));
        }
        let mut file = fs::File::create(&lock_path)?;
        writeln!(file, "{path}")?;
        Ok(PathLockGuard { lock_path })
    }
}

impl Drop for MergeLockGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.lock_path);
    }
}

pub(crate) struct PathLockGuard {
    lock_path: PathBuf,
}

impl Drop for PathLockGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.lock_path);
    }
}

fn short_task_id(task_id: &str) -> &str {
    task_id.get(..8).unwrap_or(task_id)
}

fn encode_path(path: &str) -> String {
    path.replace('\\', "__").replace('/', "__")
}
