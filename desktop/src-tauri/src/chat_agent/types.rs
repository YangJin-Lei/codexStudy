use chat_agent_core::{
    Action, AgentEngine, EnginePreference, ModelCapability, Observation, RunState, RunStatus,
    StepRecord,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentSettingsDto {
    #[serde(default = "default_engine_preference")]
    pub(crate) engine_preference: String,
    #[serde(default = "default_max_turns")]
    pub(crate) max_turns: u32,
    #[serde(default = "default_show_thoughts")]
    pub(crate) show_thoughts: bool,
}

fn default_engine_preference() -> String {
    "auto".to_string()
}

fn default_max_turns() -> u32 {
    20
}

fn default_show_thoughts() -> bool {
    true
}

impl Default for ChatAgentSettingsDto {
    fn default() -> Self {
        Self {
            engine_preference: default_engine_preference(),
            max_turns: default_max_turns(),
            show_thoughts: default_show_thoughts(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SelectEngineInput {
    pub(crate) workspace_id: String,
    pub(crate) model: String,
    #[serde(default)]
    pub(crate) needs_mcp: bool,
    #[serde(default)]
    pub(crate) needs_skills: bool,
    #[serde(default)]
    pub(crate) wants_step_cards: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SelectEngineOutput {
    pub(crate) engine: String,
    pub(crate) capability: ModelCapabilityDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelCapabilityDto {
    pub(crate) tool_call_reliable: bool,
    pub(crate) supports_responses_api: bool,
    pub(crate) max_context_tokens: usize,
    pub(crate) recommended_engine: String,
}

impl From<ModelCapability> for ModelCapabilityDto {
    fn from(value: ModelCapability) -> Self {
        Self {
            tool_call_reliable: value.tool_call_reliable,
            supports_responses_api: value.supports_responses_api,
            max_context_tokens: value.max_context_tokens,
            recommended_engine: engine_label(value.recommended_engine).to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartChatAgentRunInput {
    pub(crate) workspace_id: String,
    pub(crate) prompt: String,
    #[serde(default)]
    pub(crate) thread_id: Option<String>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) security_mode: bool,
    #[serde(default)]
    pub(crate) max_turns: Option<u32>,
    #[serde(default)]
    pub(crate) access_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartChatAgentRunOutput {
    pub(crate) run_id: String,
    pub(crate) status: String,
    pub(crate) engine: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentRunStateDto {
    pub(crate) run_id: String,
    pub(crate) status: String,
    pub(crate) current_step: u32,
    pub(crate) total_steps: u32,
    pub(crate) steps: Vec<ChatAgentStepDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) awaiting_user_question: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) awaiting_tool_approval: Option<ToolApprovalRequestDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolApprovalRequestDto {
    pub(crate) tool_name: String,
    pub(crate) summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentStepDto {
    pub(crate) id: String,
    pub(crate) thought: String,
    pub(crate) action: Action,
    pub(crate) observation: Observation,
    pub(crate) started_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) completed_at: Option<i64>,
}

impl From<StepRecord> for ChatAgentStepDto {
    fn from(value: StepRecord) -> Self {
        Self {
            id: value.id,
            thought: value.thought,
            action: value.action,
            observation: value.observation,
            started_at: value.started_at,
            completed_at: value.completed_at,
        }
    }
}

impl From<RunState> for ChatAgentRunStateDto {
    fn from(state: RunState) -> Self {
        Self {
            run_id: state.run_id.clone(),
            status: status_label(state.status).to_string(),
            current_step: state.current_step,
            total_steps: state.steps.len() as u32,
            steps: state
                .steps
                .into_iter()
                .map(ChatAgentStepDto::from)
                .collect(),
            error: state.error,
            awaiting_user_question: state.awaiting_user_question,
            awaiting_tool_approval: state.awaiting_tool_approval.as_ref().map(|request| {
                ToolApprovalRequestDto {
                    tool_name: request.tool_name.clone(),
                    summary: request.summary.clone(),
                }
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentRunUpdatedEvent {
    pub(crate) run_id: String,
    pub(crate) status: String,
    pub(crate) current_step: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentStepAddedEvent {
    pub(crate) run_id: String,
    pub(crate) step: ChatAgentStepDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentAwaitingUserEvent {
    pub(crate) run_id: String,
    pub(crate) question: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) options: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentToolApprovalRequiredEvent {
    pub(crate) run_id: String,
    pub(crate) tool_name: String,
    pub(crate) summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConfirmChatAgentToolInput {
    pub(crate) run_id: String,
    pub(crate) approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatAgentFinishedEvent {
    pub(crate) run_id: String,
    pub(crate) status: String,
    pub(crate) summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResumeChatAgentRunInput {
    pub(crate) run_id: String,
    pub(crate) response: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) access_mode: Option<String>,
}

pub(crate) fn engine_label(engine: AgentEngine) -> &'static str {
    match engine {
        AgentEngine::CodexCore => "codex_core",
        AgentEngine::ChatAgent => "chat_agent",
    }
}

pub(crate) fn status_label(status: RunStatus) -> &'static str {
    match status {
        RunStatus::Pending => "pending",
        RunStatus::Preparing => "preparing",
        RunStatus::Planning => "planning",
        RunStatus::Executing => "executing",
        RunStatus::Observing => "observing",
        RunStatus::AwaitingUser => "awaiting_user",
        RunStatus::AwaitingToolApproval => "awaiting_tool_approval",
        RunStatus::Finalizing => "finalizing",
        RunStatus::Completed => "completed",
        RunStatus::Failed => "failed",
        RunStatus::Cancelled => "cancelled",
    }
}

pub(crate) fn parse_engine_preference(value: &str) -> EnginePreference {
    match value.trim().to_ascii_lowercase().as_str() {
        "codex_core" | "codexcore" => EnginePreference::CodexCore,
        "chat_agent" | "chatagent" => EnginePreference::ChatAgent,
        "hybrid" => EnginePreference::Hybrid,
        _ => EnginePreference::Auto,
    }
}
