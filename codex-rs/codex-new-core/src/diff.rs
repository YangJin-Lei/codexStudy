use crate::Result;
use crate::fsx;
use crate::git;
use crate::manifest::TaskManifest;
use crate::models::ChangedFile;
use crate::models::ChangedFileStatus;
use crate::models::DiffBundle;
use crate::models::DiffHunk;
use crate::models::DiffStats;
use crate::models::FileDiff;
use crate::models::HunkSelection;
use crate::models::RiskMarker;
use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::path::Path;

pub(crate) fn build_diff_bundle(manifest: &TaskManifest) -> Result<DiffBundle> {
    let unified = load_unified_diff(manifest)?;
    let parsed = parse_unified_diff(&unified);
    let mut files = Vec::new();
    let mut risk_markers = Vec::new();
    let mut added_files = 0;
    let mut modified_files = 0;
    let mut deleted_files = 0;

    for changed in &manifest.changed_files {
        let is_lockfile = is_lockfile(&changed.path);
        let parsed_file = parsed.get(&changed.path);
        let is_binary = parsed_file.is_some_and(|file| file.is_binary);
        let hunks = if let Some(parsed_file) = parsed_file {
            parsed_file
                .hunks
                .iter()
                .enumerate()
                .map(|(index, hunk)| DiffHunk {
                    header: hunk.header.clone(),
                    before_start: hunk.old_start,
                    before_lines: hunk.old_lines,
                    after_start: hunk.new_start,
                    after_lines: hunk.new_lines,
                    preview: hunk.preview.clone(),
                })
                .collect::<Vec<_>>()
        } else {
            let before_text = read_preview(&manifest.original_root, &changed.path)?;
            let after_text = read_preview(&manifest.workspace_root, &changed.path)?;
            vec![DiffHunk {
                header: format!("{:?} {}", changed.status, changed.path),
                before_start: 1,
                before_lines: before_text.len(),
                after_start: 1,
                after_lines: after_text.len(),
                preview: build_preview_lines(&before_text, &after_text),
            }]
        };

        match changed.status {
            ChangedFileStatus::Added => added_files += 1,
            ChangedFileStatus::Modified => modified_files += 1,
            ChangedFileStatus::Deleted => deleted_files += 1,
        }

        if is_lockfile {
            risk_markers.push(RiskMarker {
                kind: "lockfile".to_string(),
                path: Some(changed.path.clone()),
                message: "Dependency lockfile changed.".to_string(),
            });
        }

        files.push(FileDiff {
            path: changed.path.clone(),
            status: changed.status,
            is_binary,
            is_lockfile,
            hunks,
        });
    }

    Ok(DiffBundle {
        stats: DiffStats {
            changed_files: files.len(),
            added_files,
            modified_files,
            deleted_files,
        },
        files,
        risk_markers,
    })
}

pub(crate) fn apply_selected_hunks(
    original_root: &Path,
    workspace_root: &Path,
    path: &str,
    selections: &[HunkSelection],
) -> Result<()> {
    let selected_indices = selections
        .iter()
        .filter(|selection| selection.path == path)
        .map(|selection| selection.hunk_index)
        .collect::<BTreeSet<_>>();
    if selected_indices.is_empty() {
        return Ok(());
    }

    let original_path = fsx::checked_join(original_root, path)?;
    let workspace_path = fsx::checked_join(workspace_root, path)?;
    if !workspace_path.exists() {
        if original_path.exists() {
            std::fs::remove_file(&original_path)?;
        }
        return Ok(());
    }

    let unified = if workspace_root.join(".git").exists() {
        git::workspace_diff(workspace_root)?
    } else {
        String::new()
    };
    let parsed = parse_unified_diff(&unified);
    if let Some(parsed_file) = parsed.get(path)
        && !parsed_file.hunks.is_empty()
    {
        let original_lines = read_file_lines(&original_path)?;
        let merged = apply_parsed_hunks(&original_lines, &parsed_file.hunks, &selected_indices)?;
        write_file_lines(&original_path, &merged)?;
        return Ok(());
    }

    fsx::copy_file_or_remove(workspace_root, original_root, path)
}

pub(crate) fn diff_stats(changed_files: &[ChangedFile]) -> DiffStats {
    let mut stats = DiffStats {
        changed_files: changed_files.len(),
        added_files: 0,
        modified_files: 0,
        deleted_files: 0,
    };
    for changed in changed_files {
        match changed.status {
            ChangedFileStatus::Added => stats.added_files += 1,
            ChangedFileStatus::Modified => stats.modified_files += 1,
            ChangedFileStatus::Deleted => stats.deleted_files += 1,
        }
    }
    stats
}

pub(crate) fn detect_changed_file_events(
    previous_changes: &[ChangedFile],
    current_changes: &[ChangedFile],
) -> Vec<ChangedFile> {
    let previous = previous_changes
        .iter()
        .map(|change| (change.path.as_str(), change))
        .collect::<BTreeMap<_, _>>();
    current_changes
        .iter()
        .filter(|current| match previous.get(current.path.as_str()) {
            Some(previous) => {
                previous.after_ai_hash != current.after_ai_hash || previous.status != current.status
            }
            None => true,
        })
        .cloned()
        .collect()
}

#[derive(Debug, Clone)]
struct ParsedFileDiff {
    is_binary: bool,
    hunks: Vec<ParsedHunk>,
}

#[derive(Debug, Clone)]
struct ParsedHunk {
    header: String,
    old_start: usize,
    old_lines: usize,
    new_start: usize,
    new_lines: usize,
    preview: Vec<String>,
    removals: Vec<String>,
    additions: Vec<String>,
}

fn load_unified_diff(manifest: &TaskManifest) -> Result<String> {
    if manifest.workspace_root.join(".git").exists() {
        if let Ok(diff) = git::workspace_diff(&manifest.workspace_root)
            && !diff.is_empty()
        {
            return Ok(diff);
        }
    }
    Ok(String::new())
}

fn parse_unified_diff(diff: &str) -> BTreeMap<String, ParsedFileDiff> {
    let mut files = BTreeMap::new();
    if diff.trim().is_empty() {
        return files;
    }
    let mut current_path = None;
    let mut current = ParsedFileDiff {
        is_binary: false,
        hunks: Vec::new(),
    };
    let mut current_hunk: Option<ParsedHunk> = None;

    for line in diff.lines() {
        if line.starts_with("diff --git ") {
            if let (Some(path), Some(hunk)) = (current_path.take(), current_hunk.take()) {
                current.hunks.push(hunk);
                files.insert(path, current);
            }
            current = ParsedFileDiff {
                is_binary: false,
                hunks: Vec::new(),
            };
            current_hunk = None;
            current_path = parse_diff_git_path(line);
            continue;
        }
        if line.starts_with("Binary files ") {
            current.is_binary = true;
            continue;
        }
        if line.starts_with("@@ ") {
            if let Some(hunk) = current_hunk.take() {
                current.hunks.push(hunk);
            }
            current_hunk = parse_hunk_header(line);
            continue;
        }
        let Some(hunk) = current_hunk.as_mut() else {
            continue;
        };
        match line.as_bytes().first() {
            Some(b'-') if line.len() > 1 => {
                hunk.removals.push(line[1..].to_string());
                hunk.preview.push(format!("-{line}"));
            }
            Some(b'+') if line.len() > 1 => {
                hunk.additions.push(line[1..].to_string());
                hunk.preview.push(format!("+{line}"));
            }
            Some(b' ') if line.len() > 1 => {
                hunk.preview.push(format!(" {line}"));
            }
            _ => {}
        }
    }
    if let Some(path) = current_path {
        if let Some(hunk) = current_hunk {
            current.hunks.push(hunk);
        }
        files.insert(path, current);
    }
    files
}

fn parse_diff_git_path(line: &str) -> Option<String> {
    let rest = line.strip_prefix("diff --git ")?;
    let mut parts = rest.split_whitespace();
    let a_path = parts.next()?.strip_prefix("a/")?;
    let b_path = parts.next()?.strip_prefix("b/")?;
    if a_path == "/dev/null" {
        Some(b_path.to_string())
    } else {
        Some(a_path.to_string())
    }
}

fn parse_hunk_header(line: &str) -> Option<ParsedHunk> {
    let rest = line.strip_prefix("@@ ")?;
    let marker = rest.split(" @@").next()?;
    let mut chunks = marker.split_whitespace();
    let old = chunks.next()?;
    let new = chunks.next()?;
    let (old_start, old_lines) = parse_range(old.strip_prefix('-')?)?;
    let (new_start, new_lines) = parse_range(new.strip_prefix('+')?)?;
    Some(ParsedHunk {
        header: line.to_string(),
        old_start,
        old_lines,
        new_start,
        new_lines,
        preview: vec![line.to_string()],
        removals: Vec::new(),
        additions: Vec::new(),
    })
}

fn parse_range(value: &str) -> Option<(usize, usize)> {
    let (start, count) = value.split_once(',').unwrap_or((value, "1"));
    let start = start.parse().ok()?;
    let count = count.parse().ok()?;
    Some((start, count))
}

fn apply_parsed_hunks(
    original: &[String],
    hunks: &[ParsedHunk],
    selected: &BTreeSet<usize>,
) -> Result<Vec<String>> {
    let mut lines = original.to_vec();
    let mut selected_hunks = hunks
        .iter()
        .enumerate()
        .filter(|(index, _)| selected.contains(index))
        .collect::<Vec<_>>();
    selected_hunks.sort_by_key(|(_, hunk)| hunk.old_start);
    for (_, hunk) in selected_hunks {
        let start_idx = hunk.old_start.saturating_sub(1);
        let end_idx = (start_idx + hunk.old_lines).min(lines.len());
        lines.splice(start_idx..end_idx, hunk.additions.clone());
    }
    Ok(lines)
}

fn read_file_lines(path: &Path) -> Result<Vec<String>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(path)?;
    Ok(text.lines().map(ToString::to_string).collect())
}

fn write_file_lines(path: &Path, lines: &[String]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut content = lines.join("\n");
    if !content.is_empty() {
        content.push('\n');
    }
    std::fs::write(path, content)?;
    Ok(())
}

fn read_preview(root: &Path, path: &str) -> Result<Vec<String>> {
    let absolute = fsx::checked_join(root, path)?;
    if !absolute.exists() || !absolute.is_file() {
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(absolute)?;
    let text = String::from_utf8_lossy(&bytes);
    const MAX_PREVIEW_LINES: usize = 400;
    Ok(text
        .lines()
        .take(MAX_PREVIEW_LINES)
        .map(ToString::to_string)
        .collect())
}

fn build_preview_lines(before: &[String], after: &[String]) -> Vec<String> {
    const MAX_SIDE_LINES: usize = 80;
    let before_truncated = before.len() > MAX_SIDE_LINES;
    let after_truncated = after.len() > MAX_SIDE_LINES;
    let mut preview = before
        .iter()
        .take(MAX_SIDE_LINES)
        .map(|line| format!("- {line}"))
        .collect::<Vec<_>>();
    preview.extend(
        after
            .iter()
            .take(MAX_SIDE_LINES)
            .map(|line| format!("+ {line}")),
    );
    if before_truncated || after_truncated {
        preview.push(
            "... preview truncated; open the file in the isolated workspace for the full content."
                .to_string(),
        );
    }
    preview
}

fn is_lockfile(path: &str) -> bool {
    matches!(
        path,
        "package-lock.json"
            | "pnpm-lock.yaml"
            | "yarn.lock"
            | "bun.lockb"
            | "Cargo.lock"
            | "poetry.lock"
            | "uv.lock"
            | "Pipfile.lock"
    )
}
