mod read;
mod shell;

use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;

use chat_agent_core::{
    output_spill, Action, CoreDelegate, ExecutorConfig, Observation, Result,
};
use tauri::AppHandle;

use read::{execute_edit, execute_read};
use shell::{run_shell_action, CodexNewShellContext};

#[derive(Clone)]
pub(crate) struct CodexCoreDelegate {
    workspace_root: PathBuf,
    spill_dir: PathBuf,
    executor_config: ExecutorConfig,
    codex_new: Option<CodexNewShellContext>,
}

impl CodexCoreDelegate {
    pub(crate) fn new(
        workspace_root: PathBuf,
        run_id: &str,
        codex_new: Option<CodexNewShellContext>,
    ) -> Self {
        let spill_dir = output_spill::ensure_spill_dir(run_id, &workspace_root);
        Self {
            workspace_root,
            spill_dir,
            executor_config: ExecutorConfig::default(),
            codex_new,
        }
    }

    pub(crate) fn build(
        app: &AppHandle,
        workspace_id: &str,
        workspace_root: &Path,
        run_id: &str,
        security_mode: bool,
    ) -> Arc<dyn CoreDelegate> {
        let codex_new = if security_mode {
            crate::codex_new::resolve_codex_new_manifest_path(app, workspace_id)
                .map(|(core, manifest_path)| CodexNewShellContext {
                    core,
                    manifest_path,
                })
        } else {
            None
        };
        Arc::new(Self::new(workspace_root.to_path_buf(), run_id, codex_new))
    }

    async fn execute_action(&self, action: &Action) -> Result<Observation> {
        match action {
            Action::ReadFile { .. } => execute_read(action, &self.workspace_root),
            Action::EditFile { .. } => execute_edit(action, &self.workspace_root),
            Action::RunCommand {
                command,
                cwd,
                timeout_secs,
            } => {
                run_shell_action(
                    &self.workspace_root,
                    &self.spill_dir,
                    command,
                    cwd.as_deref(),
                    timeout_secs.unwrap_or(self.executor_config.shell_timeout_secs),
                    self.executor_config.max_output_bytes,
                    &self.executor_config.blocked_command_patterns,
                    self.codex_new.as_ref(),
                )
                .await
            }
            other => Err(chat_agent_core::ChatAgentError::Tool(format!(
                "Codex core delegate does not handle {}",
                other.type_name()
            ))),
        }
    }
}

impl CoreDelegate for CodexCoreDelegate {
    fn execute(
        &self,
        action: &Action,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<Observation>> + Send + '_>> {
        let action = action.clone();
        let this = self.clone();
        Box::pin(async move { this.execute_action(&action).await })
    }
}
