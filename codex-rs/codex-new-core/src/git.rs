use crate::CodexNewError;
use crate::Result;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

pub(crate) fn git_root(path: &Path) -> Option<std::path::PathBuf> {
    codex_git_utils::get_git_repo_root(path)
}

pub(crate) fn head_revision(path: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let hash = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if hash.is_empty() { None } else { Some(hash) }
}

pub(crate) fn branch_name(path: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let branch = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if branch.is_empty() || branch == "HEAD" {
        None
    } else {
        Some(branch)
    }
}

pub(crate) fn has_changes(path: &Path) -> bool {
    Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(path)
        .output()
        .ok()
        .is_some_and(|output| output.status.success() && !output.stdout.is_empty())
}

pub(crate) fn create_worktree(repo: &Path, destination: &Path, branch: &str) -> Result<()> {
    if destination.exists() {
        return Ok(());
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if branch_exists(repo, branch)? && worktree_for_branch(repo, branch).is_some() {
        return Err(CodexNewError::Git {
            message: format!("branch {branch} is already checked out elsewhere"),
        });
    }
    let status = Command::new("git")
        .args(["worktree", "add", "-B", branch])
        .arg(destination)
        .current_dir(repo)
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(CodexNewError::Git {
            message: format!("git worktree add failed with status {status}"),
        })
    }
}

pub(crate) fn prune_worktrees(repo: &Path) -> Result<()> {
    let status = Command::new("git")
        .args(["worktree", "prune"])
        .current_dir(repo)
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(CodexNewError::Git {
            message: format!("git worktree prune failed with status {status}"),
        })
    }
}

pub(crate) fn branch_exists(repo: &Path, branch: &str) -> Result<bool> {
    let output = Command::new("git")
        .args([
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ])
        .current_dir(repo)
        .output()?;
    Ok(output.status.success())
}

fn worktree_for_branch(repo: &Path, branch: &str) -> Option<PathBuf> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut current_path = None;
    for line in text.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            current_path = Some(PathBuf::from(path));
            continue;
        }
        if let Some(branch_ref) = line.strip_prefix("branch ")
            && branch_ref.strip_prefix("refs/heads/") == Some(branch)
        {
            return current_path;
        }
    }
    None
}

pub(crate) fn workspace_diff(workspace: &Path) -> Result<String> {
    let output = Command::new("git")
        .args(["diff", "--binary", "HEAD"])
        .current_dir(workspace)
        .output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(output.stdout.as_slice()).into_owned())
    } else {
        Err(CodexNewError::Git {
            message: String::from_utf8_lossy(output.stderr.as_slice()).into_owned(),
        })
    }
}
