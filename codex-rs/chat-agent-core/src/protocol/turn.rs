use serde::Deserialize;
use serde::Serialize;

use super::Action;

/// Parsed model output for a single planner turn.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlannerTurn {
    pub thought: String,
    pub action: Action,
}
