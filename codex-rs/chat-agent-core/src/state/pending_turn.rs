use serde::Deserialize;
use serde::Serialize;

use crate::protocol::Action;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingTurn {
    pub thought: String,
    pub action: Action,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolApprovalRequest {
    pub tool_name: String,
    pub summary: String,
}
