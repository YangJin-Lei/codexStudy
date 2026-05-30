use std::path::Path;
use std::path::PathBuf;

use serde_json::json;

use crate::error::ChatAgentError;
use crate::error::Result;
use crate::protocol::Artifact;
use crate::protocol::Observation;

use super::edit_replace::ReplaceOutcome;
use super::edit_replace::string_replace;

pub fn resolve_workspace_path(workspace_root: &Path, relative_path: &str) -> Result<PathBuf> {
    let trimmed = relative_path.trim().trim_start_matches("./");
    let candidate = workspace_root.join(trimmed);
    let canonical_root = workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf());
    let canonical = candidate
        .canonicalize()
        .map_err(|error| ChatAgentError::Tool(format!("path not found: {error}")))?;
    if !canonical.starts_with(&canonical_root) {
        return Err(ChatAgentError::Tool("path escapes workspace root".into()));
    }
    Ok(canonical)
}

pub fn read_file(
    workspace_root: &Path,
    path: &str,
    line_start: Option<usize>,
    line_end: Option<usize>,
) -> Result<Observation> {
    let file_path = resolve_workspace_path(workspace_root, path)?;
    let content = std::fs::read_to_string(&file_path)
        .map_err(|error| ChatAgentError::Tool(format!("read failed: {error}")))?;

    let lines: Vec<&str> = content.lines().collect();
    let start = line_start.unwrap_or(1).max(1);
    let end = line_end.unwrap_or(lines.len()).min(lines.len());
    let slice = if lines.is_empty() {
        String::new()
    } else {
        lines[(start - 1)..end]
            .iter()
            .enumerate()
            .map(|(index, line)| format!("{:>6}| {line}", start + index))
            .collect::<Vec<_>>()
            .join("\n")
    };

    Ok(
        Observation::success("read_file", format!("Read {path} ({start}-{end})"))
            .with_details(json!({ "path": path, "lineStart": start, "lineEnd": end }))
            .with_artifacts(vec![Artifact {
                kind: "file_content".into(),
                content: slice,
                metadata: Some(json!({ "path": path })),
            }]),
    )
}

pub fn edit_file(
    workspace_root: &Path,
    path: &str,
    old_str: &str,
    new_str: &str,
) -> Result<Observation> {
    let file_path = resolve_workspace_path(workspace_root, path)?;
    let content = std::fs::read_to_string(&file_path)
        .map_err(|error| ChatAgentError::Tool(format!("read failed: {error}")))?;

    match string_replace(&content, old_str, new_str) {
        ReplaceOutcome::Applied { new_content } => {
            std::fs::write(&file_path, new_content)
                .map_err(|error| ChatAgentError::Tool(format!("write failed: {error}")))?;
            Ok(Observation::success("edit_file", format!("Updated {path}")))
        }
        ReplaceOutcome::NoMatch { message } => {
            Ok(Observation::failure("edit_file", message).with_details(json!({ "path": path })))
        }
        ReplaceOutcome::MultipleMatches { message } => {
            Ok(Observation::failure("edit_file", message).with_details(json!({ "path": path })))
        }
    }
}
