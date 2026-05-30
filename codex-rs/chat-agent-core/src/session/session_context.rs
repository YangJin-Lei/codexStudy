use serde::Deserialize;
use serde::Serialize;

use super::ToolApprovalPolicy;

/// Environment assembled before starting a chat agent run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContext {
    pub run_id: String,
    pub workspace_id: String,
    pub workspace_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub model: String,
    pub task_prompt: String,
    #[serde(default)]
    pub security_mode: bool,
    #[serde(default)]
    pub tool_approval_policy: ToolApprovalPolicy,
}
