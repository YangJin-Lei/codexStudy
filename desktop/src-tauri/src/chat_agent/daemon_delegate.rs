use std::pin::Pin;

use chat_agent_core::{Action, CoreDelegate, Observation, Result};
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::remote_backend;
use crate::shared::chat_agent_rpc::{
    parse_execute_tool_response, ChatAgentExecuteToolRequest,
};
use crate::state::AppState;

#[derive(Clone)]
pub(crate) struct DaemonRpcCoreDelegate {
    app: AppHandle,
    workspace_id: String,
    run_id: String,
}

impl DaemonRpcCoreDelegate {
    pub(crate) fn new(app: AppHandle, workspace_id: String, run_id: String) -> Self {
        Self {
            app,
            workspace_id,
            run_id,
        }
    }
}

impl CoreDelegate for DaemonRpcCoreDelegate {
    fn execute(
        &self,
        action: &Action,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<Observation>> + Send + '_>> {
        let action = action.clone();
        let this = self.clone();
        Box::pin(async move { this.execute_action(&action).await })
    }
}

impl DaemonRpcCoreDelegate {
    async fn execute_action(&self, action: &Action) -> Result<Observation> {
        let state = self
            .app
            .try_state::<AppState>()
            .ok_or_else(|| chat_agent_core::ChatAgentError::Tool("app state unavailable".into()))?;
        let request = ChatAgentExecuteToolRequest {
            workspace_id: self.workspace_id.clone(),
            run_id: self.run_id.clone(),
            action: action.clone(),
        };
        let params = json!(request);
        let response = remote_backend::call_remote(
            &state,
            self.app.clone(),
            "chat_agent_execute_tool",
            params,
        )
        .await
        .map_err(|error| chat_agent_core::ChatAgentError::Tool(error))?;
        let parsed = parse_execute_tool_response(response)
            .map_err(|error| chat_agent_core::ChatAgentError::Tool(error))?;
        Ok(parsed.observation)
    }
}
