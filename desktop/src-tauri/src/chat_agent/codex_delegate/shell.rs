use std::path::Path;

use chat_agent_core::{command_tools, output_spill, Artifact, Observation, Result};
use codex_new_core::{
    CodexNewCore, CommandExecutionKind, CommandExecutionRequest, CommandRunRecord,
    CommandRunStatus,
};
use serde_json::json;

#[derive(Debug, Clone)]
pub(crate) struct CodexNewShellContext {
    pub(crate) core: CodexNewCore,
    pub(crate) manifest_path: std::path::PathBuf,
}

pub(crate) async fn run_shell_action(
    workspace_root: &Path,
    spill_dir: &Path,
    command: &str,
    cwd: Option<&str>,
    timeout_secs: u64,
    max_output_bytes: usize,
    blocked_patterns: &[String],
    codex_new: Option<&CodexNewShellContext>,
) -> Result<Observation> {
    if let Some(context) = codex_new {
        return run_via_codex_new(context, spill_dir, command).await;
    }
    command_tools::run_command(
        workspace_root,
        command,
        cwd,
        timeout_secs,
        max_output_bytes,
        blocked_patterns,
        Some(spill_dir),
    )
    .await
}

async fn run_via_codex_new(
    context: &CodexNewShellContext,
    spill_dir: &Path,
    command: &str,
) -> Result<Observation> {
    let context = context.clone();
    let command = command.to_string();
    let spill_dir = spill_dir.to_path_buf();
    let record = tokio::task::spawn_blocking(move || {
        context.core.run_command_request(
            &context.manifest_path,
            CommandExecutionRequest {
                command,
                use_environment_binding: true,
                env_overrides: std::collections::BTreeMap::new(),
                profile_id: None,
                title: Some("Chat Agent command".into()),
                kind: CommandExecutionKind::Generic,
                retry_of: None,
            },
        )
    })
    .await
    .map_err(|error| chat_agent_core::ChatAgentError::Tool(format!("command task failed: {error}")))?
    .map_err(|error| chat_agent_core::ChatAgentError::Tool(error.to_string()))?;

    observation_from_codex_new_run(&record, &spill_dir)
}

fn observation_from_codex_new_run(
    record: &CommandRunRecord,
    spill_dir: &Path,
) -> Result<Observation> {
    let stdout_raw = std::fs::read_to_string(&record.stdout_path).unwrap_or_default();
    let stderr_raw = std::fs::read_to_string(&record.stderr_path).unwrap_or_default();
    let stdout = output_spill::format_command_stream(&stdout_raw, spill_dir, "stdout");
    let stderr = output_spill::format_command_stream(&stderr_raw, spill_dir, "stderr");
    let exit_code = record.exit_code.unwrap_or(-1);
    let ok = record.status == CommandRunStatus::Succeeded;

    let summary = if ok {
        format!("Command succeeded (exit {exit_code})")
    } else {
        format!("Command failed (exit {exit_code})")
    };

    let mut details = json!({
        "exitCode": exit_code,
        "command": record.command,
        "commandId": record.id,
        "stdoutPath": record.stdout_path,
        "stderrPath": record.stderr_path,
    });
    if let Some(stdout_details) = output_spill::spill_details(&stdout) {
        details["stdout"] = stdout_details;
    }
    if let Some(stderr_details) = output_spill::spill_details(&stderr) {
        details["stderr"] = stderr_details;
    }

    let observation = if ok {
        Observation::success("run_command", summary)
    } else {
        Observation::failure("run_command", summary)
    };

    Ok(observation
        .with_details(details)
        .with_artifacts(vec![
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
