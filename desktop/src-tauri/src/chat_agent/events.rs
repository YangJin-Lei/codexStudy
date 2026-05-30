use chat_agent_core::{RunState, StepRecord};
use tauri::{AppHandle, Emitter};

use super::types::{
    ChatAgentFinishedEvent, ChatAgentRunUpdatedEvent, ChatAgentStepAddedEvent, ChatAgentStepDto,
};

pub(super) fn emit_run_updated(app: &AppHandle, state: &RunState) {
    let _ = app.emit(
        "chat-agent-run-updated",
        ChatAgentRunUpdatedEvent {
            run_id: state.run_id.clone(),
            status: super::types::status_label(state.status).to_string(),
            current_step: state.current_step,
        },
    );
}

pub(super) fn emit_step_added(app: &AppHandle, state: &RunState, step: &StepRecord) {
    let _ = app.emit(
        "chat-agent-step-added",
        ChatAgentStepAddedEvent {
            run_id: state.run_id.clone(),
            step: ChatAgentStepDto::from(step.clone()),
        },
    );
}

pub(super) fn emit_finished(
    app: &AppHandle,
    run_id: &str,
    status: &str,
    summary: &str,
    error: Option<String>,
) {
    let _ = app.emit(
        "chat-agent-finished",
        ChatAgentFinishedEvent {
            run_id: run_id.to_string(),
            status: status.to_string(),
            summary: summary.to_string(),
            error,
        },
    );
}
