use std::sync::Arc;

use chat_agent_core::{
    ChatAgentRuntime, CoreDelegate, ModelClient, RunLoopConfig, RuntimeConfig,
};

pub(crate) fn build_chat_agent_runtime(
    model_client: Arc<dyn ModelClient>,
    run_loop_config: RunLoopConfig,
    core_delegate: Option<Arc<dyn CoreDelegate>>,
) -> ChatAgentRuntime {
    ChatAgentRuntime::new(
        model_client,
        RuntimeConfig {
            run_loop: run_loop_config,
            ..RuntimeConfig::default()
        },
        core_delegate,
    )
}
