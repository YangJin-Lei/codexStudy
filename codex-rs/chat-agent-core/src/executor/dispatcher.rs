use std::path::PathBuf;
use std::sync::Arc;

use crate::error::Result;
use crate::protocol::Action;
use crate::protocol::Observation;
use crate::session::SessionContext;

use super::ExecutorConfig;
use super::approval_tools;
use super::command_tools;
use super::core_delegate::CoreDelegate;
use super::file_tools;
use super::search_tools;

pub struct Dispatcher {
    workspace_root: PathBuf,
    config: ExecutorConfig,
    spill_dir: Option<PathBuf>,
    core_delegate: Option<Arc<dyn CoreDelegate>>,
}

impl Dispatcher {
    pub fn new(
        workspace_root: PathBuf,
        config: ExecutorConfig,
        spill_dir: Option<PathBuf>,
        core_delegate: Option<Arc<dyn CoreDelegate>>,
    ) -> Self {
        Self {
            workspace_root,
            config,
            spill_dir,
            core_delegate,
        }
    }

    pub async fn dispatch(
        &self,
        _session: &SessionContext,
        action: &Action,
    ) -> Result<Observation> {
        if let Some(delegate) = &self.core_delegate {
            match action {
                Action::AskUser { .. } | Action::Finalize { .. } | Action::SearchCode { .. } => {}
                _ => return delegate.execute(action).await,
            }
        }

        match action {
            Action::ReadFile {
                path,
                line_start,
                line_end,
            } => file_tools::read_file(&self.workspace_root, path, *line_start, *line_end),
            Action::SearchCode {
                pattern,
                path_filter,
            } => search_tools::search_code(&self.workspace_root, pattern, path_filter.as_deref()),
            Action::EditFile {
                path,
                old_str,
                new_str,
            } => file_tools::edit_file(&self.workspace_root, path, old_str, new_str),
            Action::RunCommand {
                command,
                cwd,
                timeout_secs,
            } => {
                command_tools::run_command(
                    &self.workspace_root,
                    command,
                    cwd.as_deref(),
                    timeout_secs.unwrap_or(self.config.shell_timeout_secs),
                    self.config.max_output_bytes,
                    &self.config.blocked_command_patterns,
                    self.spill_dir.as_deref(),
                )
                .await
            }
            Action::AskUser { question, options } => {
                Ok(approval_tools::ask_user(question, options.as_deref()))
            }
            Action::Finalize {
                summary,
                next_steps,
            } => Ok(approval_tools::finalize(summary, next_steps.as_deref())),
        }
    }
}
