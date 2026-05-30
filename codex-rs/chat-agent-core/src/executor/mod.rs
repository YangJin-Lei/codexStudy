mod approval_tools;
pub mod command_tools;
mod core_delegate;
mod dispatcher;
mod edit_replace;
pub mod file_tools;
mod output_limits;
pub mod output_spill;
mod search_tools;

pub use core_delegate::CoreDelegate;
pub use dispatcher::Dispatcher;

use crate::error::Result;
use crate::protocol::Action;
use crate::protocol::Observation;
use crate::session::SessionContext;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct ExecutorConfig {
    pub max_observation_chars: usize,
    pub shell_timeout_secs: u64,
    pub max_output_bytes: usize,
    pub blocked_command_patterns: Vec<String>,
}

impl Default for ExecutorConfig {
    fn default() -> Self {
        Self {
            max_observation_chars: 12_000,
            shell_timeout_secs: 60,
            max_output_bytes: output_limits::OUTPUT_LIMIT_BYTES,
            blocked_command_patterns: vec!["rm -rf".into(), "sudo".into(), "chmod 777".into()],
        }
    }
}

pub struct Executor {
    dispatcher: Dispatcher,
    config: ExecutorConfig,
}

impl Executor {
    pub fn new(
        workspace_root: impl Into<std::path::PathBuf>,
        config: ExecutorConfig,
        spill_dir: Option<std::path::PathBuf>,
        core_delegate: Option<Arc<dyn CoreDelegate>>,
    ) -> Self {
        Self {
            dispatcher: Dispatcher::new(
                workspace_root.into(),
                config.clone(),
                spill_dir,
                core_delegate,
            ),
            config,
        }
    }

    pub async fn execute(&self, session: &SessionContext, action: &Action) -> Result<Observation> {
        let observation = self.dispatcher.dispatch(session, action).await?;
        Ok(truncate_observation(
            observation,
            self.config.max_observation_chars,
        ))
    }
}

fn truncate_observation(mut observation: Observation, max_chars: usize) -> Observation {
    if observation.summary.chars().count() > max_chars {
        observation.summary = observation
            .summary
            .chars()
            .take(max_chars)
            .chain("…".chars())
            .collect();
    }
    observation
}
