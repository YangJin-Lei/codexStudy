use uuid::Uuid;

use crate::loop_control::guardrails::Guardrails;
use crate::planner::ChatMessage;
use crate::protocol::Action;
use crate::protocol::Observation;
use crate::state::RunState;
use crate::state::StepRecord;

pub(super) fn commit_turn(
    state: &mut RunState,
    guardrails: &mut Guardrails,
    history: &mut Vec<ChatMessage>,
    thought: String,
    action: Action,
    observation: Observation,
    on_step: &mut impl FnMut(&RunState, &StepRecord),
) {
    guardrails.record_turn(&action, observation.ok);

    let step = StepRecord {
        id: Uuid::new_v4().to_string(),
        thought: thought.clone(),
        action: action.clone(),
        observation: observation.clone(),
        started_at: chrono::Utc::now().timestamp(),
        completed_at: Some(chrono::Utc::now().timestamp()),
    };
    state.push_step(step.clone());
    on_step(state, &step);

    history.push(ChatMessage::assistant(
        serde_json::json!({
            "thought": thought,
            "action": action,
        })
        .to_string(),
    ));
    history.push(ChatMessage::user(
        serde_json::to_string(&observation).unwrap_or_default(),
    ));
}

pub(super) fn read_only_denial_observation(action: &Action) -> Observation {
    Observation::failure(
        action.type_name(),
        "Read-only mode blocked this tool. Switch access to On-Request or Full access to allow edits and commands.",
    )
}

pub(super) fn user_denial_observation(action: &Action) -> Observation {
    Observation::failure(action.type_name(), "Tool execution denied by user.")
}
