use std::path::PathBuf;

use chat_agent_core::{
    command_tools, file_tools, output_spill, Action, ExecutorConfig, Observation, Result,
};

#[derive(Debug, Clone)]
pub(crate) struct ChatAgentToolRunnerConfig {
    pub workspace_root: PathBuf,
    pub run_id: String,
    pub executor: ExecutorConfig,
}

pub(crate) async fn execute_chat_agent_action(
    action: &Action,
    config: &ChatAgentToolRunnerConfig,
) -> Result<Observation> {
    let spill_dir = output_spill::ensure_spill_dir(&config.run_id, &config.workspace_root);
    match action {
        Action::ReadFile {
            path,
            line_start,
            line_end,
        } => file_tools::read_file(
            &config.workspace_root,
            path,
            *line_start,
            *line_end,
        ),
        Action::EditFile {
            path,
            old_str,
            new_str,
        } => file_tools::edit_file(&config.workspace_root, path, old_str, new_str),
        Action::RunCommand {
            command,
            cwd,
            timeout_secs,
        } => {
            command_tools::run_command(
                &config.workspace_root,
                command,
                cwd.as_deref(),
                timeout_secs.unwrap_or(config.executor.shell_timeout_secs),
                config.executor.max_output_bytes,
                &config.executor.blocked_command_patterns,
                Some(&spill_dir),
            )
            .await
        }
        other => Err(chat_agent_core::ChatAgentError::Tool(format!(
            "tool runner does not handle {}",
            other.type_name()
        ))),
    }
}

pub(crate) fn workspace_root_from_path(path: &str) -> std::result::Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("workspace path is empty".to_string());
    }
    Ok(PathBuf::from(trimmed))
}
