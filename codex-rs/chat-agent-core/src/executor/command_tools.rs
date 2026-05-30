use std::path::Path;

use serde_json::json;
use tokio::time::Duration;
use tokio::time::timeout;

use crate::error::ChatAgentError;
use crate::error::Result;
use crate::protocol::Artifact;
use crate::protocol::Observation;

use super::file_tools::resolve_workspace_path;
use super::output_spill::format_command_stream;
use super::output_spill::spill_details;

pub async fn run_command(
    workspace_root: &Path,
    command: &str,
    cwd: Option<&str>,
    timeout_secs: u64,
    max_output_bytes: usize,
    blocked_patterns: &[String],
    spill_dir: Option<&Path>,
) -> Result<Observation> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(ChatAgentError::Tool("command is empty".into()));
    }

    let lower = trimmed.to_ascii_lowercase();
    for pattern in blocked_patterns {
        if lower.contains(&pattern.to_ascii_lowercase()) {
            return Ok(Observation::failure(
                "run_command",
                format!("command blocked by policy: {pattern}"),
            ));
        }
    }

    let work_dir = match cwd {
        Some(relative) => resolve_workspace_path(workspace_root, relative)?,
        None => workspace_root.to_path_buf(),
    };

    let shell = if cfg!(windows) { "cmd" } else { "sh" };
    let arg = if cfg!(windows) { "/C" } else { "-c" };

    let mut process = tokio::process::Command::new(shell);
    process.arg(arg).arg(trimmed).current_dir(work_dir);
    process.stdout(std::process::Stdio::piped());
    process.stderr(std::process::Stdio::piped());

    let child = process
        .spawn()
        .map_err(|error| ChatAgentError::Tool(format!("failed to spawn command: {error}")))?;

    let result = timeout(Duration::from_secs(timeout_secs), child.wait_with_output())
        .await
        .map_err(|_| ChatAgentError::Tool(format!("command timed out after {timeout_secs}s")))?
        .map_err(|error| ChatAgentError::Tool(format!("command failed: {error}")))?;

    let exit_code = result.status.code().unwrap_or(-1);
    let stdout_raw = String::from_utf8_lossy(&result.stdout);
    let stderr_raw = String::from_utf8_lossy(&result.stderr);
    let stdout = format_stream(stdout_raw.as_ref(), spill_dir, max_output_bytes, "stdout");
    let stderr = format_stream(stderr_raw.as_ref(), spill_dir, max_output_bytes, "stderr");
    let ok = result.status.success();

    let summary = if ok {
        format!("Command succeeded (exit {exit_code})")
    } else {
        format!("Command failed (exit {exit_code})")
    };

    let mut details = json!({ "exitCode": exit_code, "command": trimmed });
    if let Some(stdout_details) = spill_details(&stdout) {
        details["stdout"] = stdout_details;
    }
    if let Some(stderr_details) = spill_details(&stderr) {
        details["stderr"] = stderr_details;
    }

    let observation = if ok {
        Observation::success("run_command", summary)
    } else {
        Observation::failure("run_command", summary)
    };

    Ok(observation.with_details(details).with_artifacts(vec![
        Artifact {
            kind: "stdout".into(),
            content: stdout.display_text,
            metadata: stdout
                .spill_path
                .as_ref()
                .map(|path| json!({ "spillPath": path.display().to_string() })),
        },
        Artifact {
            kind: "stderr".into(),
            content: stderr.display_text,
            metadata: stderr
                .spill_path
                .as_ref()
                .map(|path| json!({ "spillPath": path.display().to_string() })),
        },
    ]))
}

fn format_stream(
    text: &str,
    spill_dir: Option<&Path>,
    legacy_max_bytes: usize,
    label: &str,
) -> super::output_spill::SpillResult {
    if let Some(spill_dir) = spill_dir {
        return format_command_stream(text, spill_dir, label);
    }
    if text.len() <= legacy_max_bytes {
        return super::output_spill::SpillResult {
            display_text: text.to_string(),
            spill_path: None,
            notice: None,
            total_lines: text.lines().count(),
            total_bytes: text.len(),
        };
    }
    let display_text = text
        .chars()
        .take(legacy_max_bytes)
        .chain("…".chars())
        .collect();
    super::output_spill::SpillResult {
        display_text,
        spill_path: None,
        notice: Some(format!(
            "Output exceeded {legacy_max_bytes} byte policy limit."
        )),
        total_lines: text.lines().count(),
        total_bytes: text.len(),
    }
}
