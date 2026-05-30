use serde::Deserialize;
use serde::Serialize;

use crate::protocol::Action;
use crate::protocol::Observation;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepRecord {
    pub id: String,
    pub thought: String,
    pub action: Action,
    pub observation: Observation,
    pub started_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<i64>,
}
