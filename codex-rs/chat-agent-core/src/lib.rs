//! Structured JSON action loop for chat-completion models.
//!
//! This crate owns the Chat Agent protocol, planner/executor loop, guardrails,
//! and runtime state. It intentionally contains no desktop UI or Tauri code.

mod error;
mod executor;
mod loop_control;
mod planner;
mod protocol;
mod runtime;
mod runtime_selector;
mod session;
mod state;

pub use error::ChatAgentError;
pub use error::Result;
pub use executor::CoreDelegate;
pub use executor::Executor;
pub use executor::ExecutorConfig;
pub use executor::command_tools;
pub use executor::file_tools;
pub use executor::output_spill;
pub use loop_control::GuardrailAction;
pub use loop_control::Guardrails;
pub use loop_control::GuardrailsConfig;
pub use loop_control::RunLoop;
pub use loop_control::RunLoopConfig;
pub use loop_control::RunLoopOutcome;
pub use planner::ChatMessage;
pub use planner::ModelClient;
pub use planner::ModelRequest;
pub use planner::Planner;
pub use planner::PlannerConfig;
pub use protocol::Action;
pub use protocol::Artifact;
pub use protocol::FinalResult;
pub use protocol::Observation;
pub use protocol::PlannerTurn;
pub use runtime::ChatAgentRuntime;
pub use runtime::RunRequest;
pub use runtime::RunResult;
pub use runtime::RuntimeConfig;
pub use runtime_selector::AgentEngine;
pub use runtime_selector::EnginePreference;
pub use runtime_selector::TaskRequirements;
pub use runtime_selector::select_engine;
pub use session::ModelCapability;
pub use session::SessionBuilder;
pub use session::SessionContext;
pub use session::ToolApprovalPolicy;
pub use session::get_model_capability;
pub use state::PendingTurn;
pub use state::RunState;
pub use state::RunStatus;
pub use state::StepRecord;
pub use state::TimelineEventPayload;
pub use state::ToolApprovalRequest;
