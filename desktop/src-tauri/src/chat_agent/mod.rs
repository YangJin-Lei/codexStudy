mod codex_delegate;
mod daemon_delegate;
mod delegate_factory;
mod events;
mod execution;
mod model_client;
mod runtime_factory;
mod runs;
mod types;

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use chat_agent_core::{
    get_model_capability, select_engine, AgentEngine, EnginePreference, GuardrailsConfig,
    ModelClient, RunLoopConfig, RunRequest, RunState, TaskRequirements, ToolApprovalPolicy,
};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::shared::codex_core::get_config_model_core;
use crate::state::AppState;
use crate::types::{ChatAgentSettings, WorkspaceEntry};

use self::delegate_factory::resolve_hybrid_delegate;
use self::execution::{spawn_confirm_tool_execution, spawn_resume_execution, spawn_run_execution};
use self::runtime_factory::build_chat_agent_runtime;
use self::model_client::DesktopModelClient;
use self::runs::{ChatAgentRunContext, ChatAgentRunRecord, ChatAgentRunRegistry};
use self::types::{
    parse_engine_preference, ChatAgentRunStateDto, ChatAgentRunUpdatedEvent, ChatAgentSettingsDto,
    ConfirmChatAgentToolInput, ModelCapabilityDto, ResumeChatAgentRunInput, SelectEngineInput,
    SelectEngineOutput, StartChatAgentRunInput, StartChatAgentRunOutput,
};

pub(crate) struct ChatAgentState {
    pub(crate) registry: Arc<ChatAgentRunRegistry>,
}

impl ChatAgentState {
    pub(crate) fn new() -> Self {
        Self {
            registry: Arc::new(ChatAgentRunRegistry::new()),
        }
    }
}

#[tauri::command]
pub(crate) async fn chat_agent_get_settings(
    state: State<'_, AppState>,
) -> Result<ChatAgentSettingsDto, String> {
    let settings = state.app_settings.lock().await;
    Ok(chat_agent_settings_to_dto(&settings.chat_agent))
}

#[tauri::command]
pub(crate) async fn chat_agent_set_settings(
    state: State<'_, AppState>,
    settings: ChatAgentSettingsDto,
) -> Result<(), String> {
    let mut app_settings = state.app_settings.lock().await;
    app_settings.chat_agent = chat_agent_settings_from_dto(&settings);
    crate::storage::write_settings(&state.settings_path, &app_settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn chat_agent_select_engine(
    state: State<'_, AppState>,
    input: SelectEngineInput,
) -> Result<SelectEngineOutput, String> {
    let settings = state.app_settings.lock().await;
    let preference = parse_engine_preference(&settings.chat_agent.engine_preference);
    let capability = get_model_capability(&input.model);
    let engine = select_engine(
        preference,
        &input.model,
        &TaskRequirements {
            needs_mcp: input.needs_mcp,
            needs_skills: false,
            needs_multi_agent: false,
            wants_step_cards: input.wants_step_cards,
            wants_full_codex_features: false,
        },
    );
    Ok(SelectEngineOutput {
        engine: types::engine_label(engine).to_string(),
        capability: ModelCapabilityDto::from(capability),
    })
}

#[tauri::command]
pub(crate) async fn chat_agent_start_run(
    app: AppHandle,
    state: State<'_, AppState>,
    chat_agent_state: State<'_, ChatAgentState>,
    input: StartChatAgentRunInput,
) -> Result<StartChatAgentRunOutput, String> {
    let workspace = resolve_workspace(&state, &input.workspace_id).await?;
    let app_settings = state.app_settings.lock().await.clone();
    let preference = parse_engine_preference(&app_settings.chat_agent.engine_preference);
    let model = resolve_model(&state, &input, &workspace).await?;
    let engine = select_engine(
        preference,
        &model,
        &TaskRequirements {
            needs_mcp: false,
            needs_skills: false,
            needs_multi_agent: false,
            wants_step_cards: true,
            wants_full_codex_features: false,
        },
    );

    if engine == AgentEngine::CodexCore {
        return Err(
            "Selected engine is Codex Core. Start a normal thread turn instead of Chat Agent."
                .to_string(),
        );
    }

    let run_id = Uuid::new_v4().to_string();
    if let Some(thread_id) = input.thread_id.as_deref() {
        chat_agent_state
            .registry
            .cancel_in_flight_for_thread(thread_id)
            .await;
    }
    let run_state = Arc::new(Mutex::new(RunState::new(&run_id, &input.workspace_id)));
    let tool_approval_policy = ToolApprovalPolicy::from_access_mode(
        input.access_mode.as_deref().unwrap_or("current"),
    );
    let request = RunRequest {
        run_id: run_id.clone(),
        workspace_id: input.workspace_id.clone(),
        workspace_root: workspace.path.clone(),
        model: model.clone(),
        prompt: input.prompt.clone(),
        thread_id: input.thread_id.clone(),
        security_mode: input.security_mode,
        tool_approval_policy,
    };
    let executor_root = std::path::PathBuf::from(&workspace.path);
    let core_delegate = resolve_hybrid_delegate(
        preference,
        &app,
        &state,
        &input.workspace_id,
        &executor_root,
        &run_id,
        input.security_mode,
        None,
    )
    .await;
    let record = ChatAgentRunRecord {
        state: Arc::clone(&run_state),
        cancelled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        context: Arc::new(ChatAgentRunContext {
            request: request.clone(),
            executor_root: executor_root.clone(),
            core_delegate: core_delegate.clone(),
        }),
    };
    let cancelled = Arc::clone(&record.cancelled);
    chat_agent_state
        .registry
        .insert(run_id.clone(), record)
        .await;

    let max_turns = input.max_turns.unwrap_or(app_settings.chat_agent.max_turns);
    let guardrails = GuardrailsConfig {
        max_turns,
        ..GuardrailsConfig::default()
    };

    let model_client: Arc<dyn ModelClient> = Arc::new(DesktopModelClient::new(app.clone()));
    let runtime = build_chat_agent_runtime(
        model_client,
        RunLoopConfig { guardrails },
        core_delegate,
    );

    let app_handle = app.clone();
    let registry = Arc::clone(&chat_agent_state.registry);
    spawn_run_execution(
        app_handle,
        Arc::clone(&registry),
        runtime,
        request,
        run_state,
        cancelled,
        executor_root,
    );

    let engine_label = if preference == EnginePreference::Hybrid {
        "hybrid"
    } else {
        types::engine_label(AgentEngine::ChatAgent)
    };
    Ok(StartChatAgentRunOutput {
        run_id,
        status: "running".to_string(),
        engine: engine_label.to_string(),
    })
}

#[tauri::command]
pub(crate) async fn chat_agent_get_run_state(
    chat_agent_state: State<'_, ChatAgentState>,
    run_id: String,
) -> Result<ChatAgentRunStateDto, String> {
    let record = chat_agent_state
        .registry
        .get(&run_id)
        .await
        .ok_or_else(|| format!("Chat Agent run not found: {run_id}"))?;
    let state = record.read_state();
    Ok(ChatAgentRunStateDto::from(state))
}

#[tauri::command]
pub(crate) async fn chat_agent_cancel_run(
    chat_agent_state: State<'_, ChatAgentState>,
    run_id: String,
) -> Result<bool, String> {
    let record = chat_agent_state
        .registry
        .get(&run_id)
        .await
        .ok_or_else(|| format!("Chat Agent run not found: {run_id}"))?;
    record.cancelled.store(true, Ordering::SeqCst);
    Ok(true)
}

#[tauri::command]
pub(crate) async fn chat_agent_resume_run(
    app: AppHandle,
    app_state: State<'_, AppState>,
    chat_agent_state: State<'_, ChatAgentState>,
    input: ResumeChatAgentRunInput,
) -> Result<ChatAgentRunStateDto, String> {
    let record = chat_agent_state
        .registry
        .get(&input.run_id)
        .await
        .ok_or_else(|| format!("Chat Agent run not found: {}", input.run_id))?;
    let state = record.read_state();
    if state.status != chat_agent_core::RunStatus::AwaitingUser {
        return Err("Chat Agent run is not awaiting user input.".to_string());
    }
    let response = input.response.trim().to_string();
    if response.is_empty() {
        return Err("Provide a response before resuming Chat Agent run.".to_string());
    }

    record.cancelled.store(false, Ordering::SeqCst);
    let app_settings = app_state.app_settings.lock().await.clone();
    let preference = parse_engine_preference(&app_settings.chat_agent.engine_preference);
    let max_turns = app_settings.chat_agent.max_turns;
    let core_delegate = resolve_hybrid_delegate(
        preference,
        &app,
        &app_state,
        &record.context.request.workspace_id,
        &record.context.executor_root,
        &input.run_id,
        record.context.request.security_mode,
        record.context.core_delegate.clone(),
    )
    .await;
    let resumed_runtime = build_chat_agent_runtime(
        Arc::new(DesktopModelClient::new(app.clone())),
        RunLoopConfig {
            guardrails: GuardrailsConfig {
                max_turns,
                ..GuardrailsConfig::default()
            },
        },
        core_delegate,
    );
    let executor_root = record.context.executor_root.clone();
    let run_state = Arc::clone(&record.state);
    let cancelled = Arc::clone(&record.cancelled);
    let registry = Arc::clone(&chat_agent_state.registry);
    record.update_state(|shared| {
        shared.status = chat_agent_core::RunStatus::Planning;
        shared.awaiting_user_question = None;
    });

    let mut resume_request = record.context.request.clone();
    if let Some(access_mode) = input.access_mode.as_deref() {
        resume_request.tool_approval_policy =
            ToolApprovalPolicy::from_access_mode(access_mode);
    }

    spawn_resume_execution(
        app.clone(),
        registry,
        resumed_runtime,
        resume_request,
        run_state,
        cancelled,
        executor_root,
        response,
    );

    let _ = app.emit(
        "chat-agent-run-updated",
        ChatAgentRunUpdatedEvent {
            run_id: input.run_id,
            status: "running".to_string(),
            current_step: state.current_step,
        },
    );
    Ok(ChatAgentRunStateDto::from(record.read_state()))
}

#[tauri::command]
pub(crate) async fn chat_agent_confirm_tool(
    app: AppHandle,
    app_state: State<'_, AppState>,
    chat_agent_state: State<'_, ChatAgentState>,
    input: ConfirmChatAgentToolInput,
) -> Result<ChatAgentRunStateDto, String> {
    let record = chat_agent_state
        .registry
        .get(&input.run_id)
        .await
        .ok_or_else(|| format!("Chat Agent run not found: {}", input.run_id))?;
    let state = record.read_state();
    if state.status != chat_agent_core::RunStatus::AwaitingToolApproval {
        return Err("Chat Agent run is not awaiting tool approval.".to_string());
    }

    record.cancelled.store(false, Ordering::SeqCst);
    let app_settings = app_state.app_settings.lock().await.clone();
    let preference = parse_engine_preference(&app_settings.chat_agent.engine_preference);
    let max_turns = app_settings.chat_agent.max_turns;
    let core_delegate = resolve_hybrid_delegate(
        preference,
        &app,
        &app_state,
        &record.context.request.workspace_id,
        &record.context.executor_root,
        &input.run_id,
        record.context.request.security_mode,
        record.context.core_delegate.clone(),
    )
    .await;
    let runtime = build_chat_agent_runtime(
        Arc::new(DesktopModelClient::new(app.clone())),
        RunLoopConfig {
            guardrails: GuardrailsConfig {
                max_turns,
                ..GuardrailsConfig::default()
            },
        },
        core_delegate,
    );
    let confirm_request = record.context.request.clone();
    let executor_root = record.context.executor_root.clone();
    let run_state = Arc::clone(&record.state);
    let cancelled = Arc::clone(&record.cancelled);
    let registry = Arc::clone(&chat_agent_state.registry);
    record.update_state(|shared| {
        shared.status = chat_agent_core::RunStatus::Planning;
        shared.awaiting_tool_approval = None;
    });

    spawn_confirm_tool_execution(
        app.clone(),
        registry,
        runtime,
        confirm_request,
        run_state,
        cancelled,
        executor_root,
        input.approved,
    );

    Ok(ChatAgentRunStateDto::from(record.read_state()))
}

#[tauri::command]
pub(crate) async fn chat_agent_list_thread_runs(
    chat_agent_state: State<'_, ChatAgentState>,
    thread_id: String,
) -> Result<Vec<ChatAgentRunStateDto>, String> {
    let records = chat_agent_state
        .registry
        .list_for_thread(&thread_id)
        .await;
    let mut runs = Vec::new();
    for record in records {
        runs.push(ChatAgentRunStateDto::from(record.read_state()));
    }
    Ok(runs)
}

async fn resolve_workspace(
    state: &State<'_, AppState>,
    workspace_id: &str,
) -> Result<WorkspaceEntry, String> {
    let workspaces = state.workspaces.lock().await;
    workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| format!("Workspace not found: {workspace_id}"))
}

async fn resolve_model(
    state: &State<'_, AppState>,
    input: &StartChatAgentRunInput,
    workspace: &WorkspaceEntry,
) -> Result<String, String> {
    if let Some(model) = input
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        return Ok(model.trim().to_string());
    }
    let payload = get_config_model_core(&state.workspaces, workspace.id.clone())
        .await
        .map_err(|error| error.to_string())?;
    payload
        .get("model")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Workspace model is not configured.".to_string())
}

fn chat_agent_settings_to_dto(settings: &ChatAgentSettings) -> ChatAgentSettingsDto {
    ChatAgentSettingsDto {
        engine_preference: settings.engine_preference.clone(),
        max_turns: settings.max_turns,
        show_thoughts: settings.show_thoughts,
    }
}

fn chat_agent_settings_from_dto(dto: &ChatAgentSettingsDto) -> ChatAgentSettings {
    ChatAgentSettings {
        engine_preference: dto.engine_preference.clone(),
        max_turns: dto.max_turns,
        show_thoughts: dto.show_thoughts,
    }
}
