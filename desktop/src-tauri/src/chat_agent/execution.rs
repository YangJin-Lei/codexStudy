use std::sync::Arc;

use chat_agent_core::{ChatAgentError, ChatAgentRuntime, RunState};
use tauri::{AppHandle, Emitter};

use super::events::{emit_finished, emit_run_updated, emit_step_added};
use super::runs::ChatAgentRunRegistry;
use super::runs::SharedRunState;
use super::types::ChatAgentAwaitingUserEvent;
use super::types::ChatAgentToolApprovalRequiredEvent;

fn sync_shared_run_state(run_state: &SharedRunState, state: &RunState) {
    let mut shared = run_state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *shared = state.clone();
}

fn read_shared_run_state(run_state: &SharedRunState) -> RunState {
    run_state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

pub(super) fn spawn_run_execution(
    app: AppHandle,
    registry: Arc<ChatAgentRunRegistry>,
    runtime: ChatAgentRuntime,
    request: chat_agent_core::RunRequest,
    run_state: SharedRunState,
    cancelled: Arc<std::sync::atomic::AtomicBool>,
    executor_root: std::path::PathBuf,
) {
    let run_id = request.run_id.clone();
    let run_state_for_callbacks = Arc::clone(&run_state);
    tauri::async_runtime::spawn(async move {
        let result = runtime
            .run(
                request,
                executor_root,
                Some(cancelled.as_ref()),
                |state, step| {
                    sync_shared_run_state(&run_state_for_callbacks, state);
                    emit_step_added(&app, state, step);
                },
                |state| {
                    sync_shared_run_state(&run_state_for_callbacks, state);
                    emit_run_updated(&app, state);
                },
            )
            .await;

        let remove_after = handle_run_result(&app, &run_id, &run_state, result).await;
        if remove_after {
            registry.remove(&run_id).await;
        }
    });
}

pub(super) fn spawn_resume_execution(
    app: AppHandle,
    registry: Arc<ChatAgentRunRegistry>,
    runtime: ChatAgentRuntime,
    request: chat_agent_core::RunRequest,
    run_state: SharedRunState,
    cancelled: Arc<std::sync::atomic::AtomicBool>,
    executor_root: std::path::PathBuf,
    user_response: String,
) {
    let run_id = request.run_id.clone();
    let run_state_for_callbacks = Arc::clone(&run_state);
    tauri::async_runtime::spawn(async move {
        let previous_state = read_shared_run_state(&run_state);
        let result = runtime
            .resume(
                request,
                previous_state,
                user_response,
                executor_root,
                Some(cancelled.as_ref()),
                |state, step| {
                    sync_shared_run_state(&run_state_for_callbacks, state);
                    emit_step_added(&app, state, step);
                },
                |state| {
                    sync_shared_run_state(&run_state_for_callbacks, state);
                    emit_run_updated(&app, state);
                },
            )
            .await;

        let remove_after = handle_run_result(&app, &run_id, &run_state, result).await;
        if remove_after {
            registry.remove(&run_id).await;
        }
    });
}

pub(super) fn spawn_confirm_tool_execution(
    app: AppHandle,
    registry: Arc<ChatAgentRunRegistry>,
    runtime: ChatAgentRuntime,
    request: chat_agent_core::RunRequest,
    run_state: SharedRunState,
    cancelled: Arc<std::sync::atomic::AtomicBool>,
    executor_root: std::path::PathBuf,
    approved: bool,
) {
    let run_id = request.run_id.clone();
    let run_state_for_callbacks = Arc::clone(&run_state);
    tauri::async_runtime::spawn(async move {
        let previous_state = read_shared_run_state(&run_state);
        let result = runtime
            .confirm_pending_tool(
                request,
                previous_state,
                approved,
                executor_root,
                Some(cancelled.as_ref()),
                |state, step| {
                    sync_shared_run_state(&run_state_for_callbacks, state);
                    emit_step_added(&app, state, step);
                },
                |state| {
                    sync_shared_run_state(&run_state_for_callbacks, state);
                    emit_run_updated(&app, state);
                },
            )
            .await;

        let remove_after = handle_run_result(&app, &run_id, &run_state, result).await;
        if remove_after {
            registry.remove(&run_id).await;
        }
    });
}

async fn handle_run_result(
    app: &AppHandle,
    run_id: &str,
    run_state: &SharedRunState,
    result: Result<chat_agent_core::RunResult, ChatAgentError>,
) -> bool {
    match result {
        Ok(run_result) => {
            sync_shared_run_state(run_state, &run_result.state);
            emit_finished(
                app,
                run_id,
                "completed",
                &run_result.final_result.summary,
                None,
            );
            true
        }
        Err(ChatAgentError::AwaitingUser) => {
            let shared = read_shared_run_state(run_state);
            emit_run_updated(app, &shared);
            if let Some(question) = shared.awaiting_user_question.clone() {
                let _ = app.emit(
                    "chat-agent-awaiting-user",
                    ChatAgentAwaitingUserEvent {
                        run_id: run_id.to_string(),
                        question,
                        options: None,
                    },
                );
            }
            false
        }
        Err(ChatAgentError::AwaitingToolApproval) => {
            let shared = read_shared_run_state(run_state);
            emit_run_updated(app, &shared);
            if let Some(request) = shared.awaiting_tool_approval.clone() {
                let _ = app.emit(
                    "chat-agent-tool-approval-required",
                    ChatAgentToolApprovalRequiredEvent {
                        run_id: run_id.to_string(),
                        tool_name: request.tool_name,
                        summary: request.summary,
                    },
                );
            }
            false
        }
        Err(ChatAgentError::Cancelled) => {
            emit_finished(app, run_id, "cancelled", "Run cancelled", None);
            true
        }
        Err(error) => {
            emit_finished(
                app,
                run_id,
                "failed",
                "Chat Agent run failed",
                Some(error.to_string()),
            );
            true
        }
    }
}
