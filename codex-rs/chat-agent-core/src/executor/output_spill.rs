//! Goose-style spill files for truncated command output (`developer/shell.rs`).

use std::path::Path;
use std::path::PathBuf;

use serde_json::json;

use super::output_limits::truncate_command_output;

const SPILL_DIR_NAME: &str = ".codex/chat-agent-spill";

#[derive(Debug, Clone)]
pub struct SpillResult {
    pub display_text: String,
    pub spill_path: Option<PathBuf>,
    pub notice: Option<String>,
    pub total_lines: usize,
    pub total_bytes: usize,
}

pub fn ensure_spill_dir(run_id: &str, workspace_root: &Path) -> PathBuf {
    let dir = workspace_root.join(SPILL_DIR_NAME).join(run_id);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn format_command_stream(full_output: &str, spill_dir: &Path, label: &str) -> SpillResult {
    let total_lines = full_output.lines().count();
    let total_bytes = full_output.len();
    let truncated = truncate_command_output(full_output);

    if truncated.notice.is_none() {
        return SpillResult {
            display_text: truncated.text,
            spill_path: None,
            notice: None,
            total_lines,
            total_bytes,
        };
    }

    let spill_path = spill_dir.join(format!("{label}.log"));
    if std::fs::write(&spill_path, full_output).is_err() {
        return SpillResult {
            display_text: truncated.text,
            spill_path: None,
            notice: truncated.notice.as_ref().map(|value| value.reason.clone()),
            total_lines,
            total_bytes,
        };
    }

    let read_hint = if cfg!(windows) {
        "PowerShell: Get-Content -TotalCount 200, Select-String, or Get-Content | Select-Object -Skip 100 -First 100"
    } else {
        "shell: head, tail, or sed -n '100,200p'"
    };
    let reason = truncated
        .notice
        .as_ref()
        .map(|value| value.reason.clone())
        .unwrap_or_else(|| "Output truncated".into());
    let notice = format!(
        "{reason} Full output saved to {}. Read with {read_hint}.",
        spill_path.display()
    );
    let display_text = if truncated.text.is_empty() {
        notice.clone()
    } else {
        format!("{}\n\n{}", truncated.text, notice)
    };

    SpillResult {
        display_text,
        spill_path: Some(spill_path),
        notice: Some(notice),
        total_lines,
        total_bytes,
    }
}

pub fn spill_details(result: &SpillResult) -> Option<serde_json::Value> {
    if result.spill_path.is_none() && result.notice.is_none() {
        return None;
    }
    Some(json!({
        "truncation": {
            "reason": result.notice,
            "spillPath": result.spill_path.as_ref().map(|path| path.display().to_string()),
            "totalLines": result.total_lines,
            "totalBytes": result.total_bytes,
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn writes_spill_file_when_output_is_large() {
        let dir = tempdir().unwrap();
        let spill_dir = dir.path().join("spill");
        std::fs::create_dir_all(&spill_dir).unwrap();
        let huge = "line\n".repeat(5_000);
        let result = format_command_stream(&huge, &spill_dir, "stdout");
        assert!(result.spill_path.is_some());
        assert!(result.notice.is_some());
    }
}
