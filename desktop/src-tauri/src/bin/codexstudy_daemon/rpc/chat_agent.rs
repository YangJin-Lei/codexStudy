use super::*;
use chat_agent_core::ExecutorConfig;
use serde::Deserialize;

use crate::shared::chat_agent_rpc::ChatAgentExecuteToolResponse;
use crate::shared::chat_agent_tool_runner::{
    execute_chat_agent_action, workspace_root_from_path, ChatAgentToolRunnerConfig,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteToolParams {
    workspace_id: String,
    run_id: String,
    action: chat_agent_core::Action,
}

async fn resolve_workspace_root(
    state: &DaemonState,
    workspace_id: &str,
) -> Result<std::path::PathBuf, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or_else(|| format!("workspace not found: {workspace_id}"))?;
    workspace_root_from_path(&entry.path)
}

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        "chat_agent_execute_tool" => Some(execute_tool(state, params).await),
        _ => None,
    }
}

async fn execute_tool(state: &DaemonState, params: &Value) -> Result<Value, String> {
    let request: ExecuteToolParams = serde_json::from_value(params.clone())
        .map_err(|error| format!("invalid chat_agent_execute_tool params: {error}"))?;
    let workspace_root = resolve_workspace_root(state, &request.workspace_id).await?;
    let config = ChatAgentToolRunnerConfig {
        workspace_root,
        run_id: request.run_id,
        executor: ExecutorConfig::default(),
    };
    let observation = execute_chat_agent_action(&request.action, &config)
        .await
        .map_err(|error| error.to_string())?;
    let response = ChatAgentExecuteToolResponse { observation };
    serde_json::to_value(response).map_err(|error| error.to_string())
}
