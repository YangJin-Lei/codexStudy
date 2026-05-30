use serde::Deserialize;
use serde::Serialize;

use super::RunState;
use super::StepRecord;

/// Payload shape aligned with codex-new timeline consumption.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEventPayload {
    pub run_id: String,
    pub workspace_id: String,
    pub status: String,
    pub step: Option<StepRecord>,
}

pub fn map_run_updated(state: &RunState) -> TimelineEventPayload {
    TimelineEventPayload {
        run_id: state.run_id.clone(),
        workspace_id: state.workspace_id.clone(),
        status: format!("{:?}", state.status).to_ascii_lowercase(),
        step: None,
    }
}

pub fn map_step_added(state: &RunState, step: &StepRecord) -> TimelineEventPayload {
    TimelineEventPayload {
        run_id: state.run_id.clone(),
        workspace_id: state.workspace_id.clone(),
        status: format!("{:?}", state.status).to_ascii_lowercase(),
        step: Some(step.clone()),
    }
}
