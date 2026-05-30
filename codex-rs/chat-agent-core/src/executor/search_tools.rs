use std::path::Path;
use std::process::Command;
use std::process::Stdio;

use serde_json::json;

use crate::error::ChatAgentError;
use crate::error::Result;
use crate::protocol::Artifact;
use crate::protocol::Observation;

pub fn search_code(
    workspace_root: &Path,
    pattern: &str,
    path_filter: Option<&str>,
) -> Result<Observation> {
    if pattern.trim().is_empty() {
        return Err(ChatAgentError::Tool("search pattern is empty".into()));
    }

    let mut command = Command::new("rg");
    command
        .arg("--line-number")
        .arg("--no-heading")
        .arg("--color=never")
        .arg("--max-count")
        .arg("50")
        .arg(pattern)
        .current_dir(workspace_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(filter) = path_filter.filter(|value| !value.trim().is_empty()) {
        command.arg(filter);
    }

    let output = command
        .output()
        .map_err(|error| ChatAgentError::Tool(format!("rg failed to start: {error}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() && stdout.is_empty() {
        let summary = if stderr.is_empty() {
            "No matches found".to_string()
        } else {
            format!("Search failed: {stderr}")
        };
        return Ok(Observation::failure("search_code", summary));
    }

    let line_count = stdout.lines().count();
    Ok(
        Observation::success("search_code", format!("Found {line_count} match lines"))
            .with_details(json!({ "pattern": pattern, "pathFilter": path_filter }))
            .with_artifacts(vec![Artifact {
                kind: "search_results".into(),
                content: stdout,
                metadata: None,
            }]),
    )
}
