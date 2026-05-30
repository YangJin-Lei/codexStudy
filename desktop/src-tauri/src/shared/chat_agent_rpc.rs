use chat_agent_core::Action;
use chat_agent_core::Observation;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentExecuteToolRequest {
    pub(crate) workspace_id: String,
    pub(crate) run_id: String,
    pub(crate) action: Action,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentExecuteToolResponse {
    pub(crate) observation: Observation,
}

pub(crate) fn execute_tool_params(request: &ChatAgentExecuteToolRequest) -> Result<serde_json::Value, String> {
    serde_json::to_value(request).map_err(|error| error.to_string())
}

pub(crate) fn parse_execute_tool_response(value: serde_json::Value) -> Result<ChatAgentExecuteToolResponse, String> {
    serde_json::from_value(value).map_err(|error| error.to_string())
}
