use serde::Deserialize;
use serde::Serialize;

use crate::state::RunStatus;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalResult {
    pub status: RunStatus,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_steps: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
