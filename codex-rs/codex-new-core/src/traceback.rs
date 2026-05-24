//! Per-file traceback pairs: original project snapshot vs latest isolated workspace copy.
//!
//! Recorded whenever a file change is detected during AI work (not only at merge time).
//! Lets users restore the original project file after a mistaken merge, or reset the
//! isolated workspace copy back to a saved workspace snapshot.

use crate::Result;
use crate::fsx;
use crate::manifest::TaskManifest;
use crate::models::ChangedFile;
use chrono::Utc;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

const TRACEBACK_DIR: &str = "traceback";
const ORIGINAL_SUBDIR: &str = "original";
const WORKSPACE_SUBDIR: &str = "workspace";
const INDEX_FILE: &str = "index.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TracebackEntry {
    pub path: String,
    pub original_hash: Option<String>,
    pub workspace_hash: Option<String>,
    pub revision: u64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TracebackRestoreTarget {
    Project,
    Workspace,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TracebackIndex {
    entries: BTreeMap<String, TracebackEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TracebackRestoreOutcome {
    pub path: String,
    pub target: TracebackRestoreTarget,
    pub revision: u64,
}

pub(crate) fn ensure_traceback_dirs(task_root: &Path) -> Result<()> {
    let root = traceback_root(task_root);
    fs::create_dir_all(root.join(ORIGINAL_SUBDIR))?;
    fs::create_dir_all(root.join(WORKSPACE_SUBDIR))?;
    Ok(())
}

pub(crate) fn record_edit_traceback(
    manifest: &TaskManifest,
    task_root: &Path,
    changed: &ChangedFile,
) -> Result<TracebackEntry> {
    ensure_traceback_dirs(task_root)?;
    let root = traceback_root(task_root);
    let original_snap = root.join(ORIGINAL_SUBDIR);
    let workspace_snap = root.join(WORKSPACE_SUBDIR);

    let mut index = read_index(&root)?;
    let now = Utc::now().timestamp();
    if !index.entries.contains_key(&changed.path) {
        fsx::snapshot_file(&manifest.original_root, &original_snap, &changed.path)?;
        let original_hash = changed.before_hash.clone().or_else(|| {
            fsx::checked_join(&manifest.original_root, &changed.path)
                .ok()
                .and_then(|path| fsx::file_hash(&path).ok().flatten())
        });
        index.entries.insert(
            changed.path.clone(),
            TracebackEntry {
                path: changed.path.clone(),
                original_hash,
                workspace_hash: None,
                revision: 0,
                created_at: now,
                updated_at: now,
            },
        );
    }

    fsx::snapshot_file(&manifest.workspace_root, &workspace_snap, &changed.path)?;
    let entry = index
        .entries
        .get_mut(&changed.path)
        .expect("traceback entry must exist after insert");
    entry.workspace_hash = changed.after_ai_hash.clone().or_else(|| {
        fsx::checked_join(&manifest.workspace_root, &changed.path)
            .ok()
            .and_then(|path| fsx::file_hash(&path).ok().flatten())
    });
    entry.revision = entry.revision.saturating_add(1);
    entry.updated_at = now;
    let saved = entry.clone();
    write_index(&root, &index)?;
    Ok(saved)
}

pub(crate) fn list_traceback_entries(task_root: &Path) -> Result<Vec<TracebackEntry>> {
    let index = read_index(&traceback_root(task_root))?;
    Ok(index.entries.into_values().collect())
}

pub(crate) fn restore_file(
    manifest: &TaskManifest,
    task_root: &Path,
    path: &str,
    target: TracebackRestoreTarget,
) -> Result<TracebackRestoreOutcome> {
    let root = traceback_root(task_root);
    let index = read_index(&root)?;
    let entry = index.entries.get(path).ok_or_else(|| {
        crate::CodexNewError::Other(anyhow::anyhow!("no traceback entry for {path}"))
    })?;

    match target {
        TracebackRestoreTarget::Project => {
            fsx::restore_snapshot(&root.join(ORIGINAL_SUBDIR), &manifest.original_root, path)?;
        }
        TracebackRestoreTarget::Workspace => {
            fsx::restore_snapshot(&root.join(WORKSPACE_SUBDIR), &manifest.workspace_root, path)?;
        }
    }

    Ok(TracebackRestoreOutcome {
        path: path.to_string(),
        target,
        revision: entry.revision,
    })
}

pub(crate) fn restore_project_file(
    manifest: &TaskManifest,
    task_root: &Path,
    path: &str,
) -> Result<TracebackRestoreOutcome> {
    restore_file(manifest, task_root, path, TracebackRestoreTarget::Project)
}

pub(crate) fn has_original_traceback(task_root: &Path, path: &str) -> bool {
    let blob = traceback_root(task_root)
        .join(ORIGINAL_SUBDIR)
        .join(format!("{}.blob", encode_path(path)));
    blob.exists()
}

fn traceback_root(task_root: &Path) -> PathBuf {
    task_root.join("snapshots").join(TRACEBACK_DIR)
}

fn read_index(root: &Path) -> Result<TracebackIndex> {
    let path = root.join(INDEX_FILE);
    if !path.exists() {
        return Ok(TracebackIndex::default());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_index(root: &Path, index: &TracebackIndex) -> Result<()> {
    fs::create_dir_all(root)?;
    fs::write(root.join(INDEX_FILE), serde_json::to_vec_pretty(index)?)?;
    Ok(())
}

fn encode_path(path: &str) -> String {
    path.replace('\\', "__").replace('/', "__")
}
