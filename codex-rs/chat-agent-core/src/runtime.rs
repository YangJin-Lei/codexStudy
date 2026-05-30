use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use crate::error::ChatAgentError;
use crate::error::Result;
use crate::executor::CoreDelegate;
use crate::executor::Executor;
use crate::executor::ExecutorConfig;
use crate::executor::output_spill;
use crate::loop_control::RunLoop;
use crate::loop_control::RunLoopConfig;
use crate::loop_control::RunLoopOutcome;
use crate::planner::ChatMessage;
use crate::planner::ModelClient;
use crate::planner::Planner;
use crate::planner::PlannerConfig;
use crate::protocol::FinalResult;
use crate::session::SessionBuilder;
use crate::session::SessionContext;
use crate::session::ToolApprovalPolicy;
use crate::state::RunState;
use crate::state::StepRecord;

pub struct RuntimeConfig {
    pub planner: PlannerConfig,
    pub executor: ExecutorConfig,
    pub run_loop: RunLoopConfig,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            planner: PlannerConfig::default(),
            executor: ExecutorConfig::default(),
            run_loop: RunLoopConfig::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RunRequest {
    pub run_id: String,
    pub workspace_id: String,
    pub workspace_root: String,
    pub model: String,
    pub prompt: String,
    pub thread_id: Option<String>,
    pub security_mode: bool,
    pub tool_approval_policy: ToolApprovalPolicy,
}

pub struct RunResult {
    pub session: SessionContext,
    pub state: RunState,
    pub final_result: FinalResult,
}

pub struct ChatAgentRuntime {
    model_client: Arc<dyn ModelClient>,
    config: RuntimeConfig,
    core_delegate: Option<Arc<dyn CoreDelegate>>,
}

impl ChatAgentRuntime {
    pub fn new(
        model_client: Arc<dyn ModelClient>,
        config: RuntimeConfig,
        core_delegate: Option<Arc<dyn CoreDelegate>>,
    ) -> Self {
        Self {
            model_client,
            config,
            core_delegate,
        }
    }

    pub async fn run(
        &self,
        request: RunRequest,
        executor_root: impl Into<PathBuf>,
        cancelled: Option<&AtomicBool>,
        mut on_step: impl FnMut(&RunState, &StepRecord) + Send,
        mut on_status: impl FnMut(&RunState) + Send,
    ) -> Result<RunResult> {
        let run_id = request.run_id.clone();
        let session = Self::build_session(request);
        let run_loop = self.build_run_loop(&run_id, executor_root);

        match run_loop
            .run(session.clone(), cancelled, &mut on_step, &mut on_status)
            .await
        {
            Ok(RunLoopOutcome { state, result }) => Ok(RunResult {
                session,
                state,
                final_result: result,
            }),
            Err(ChatAgentError::AwaitingUser) => Err(ChatAgentError::AwaitingUser),
            Err(ChatAgentError::AwaitingToolApproval) => Err(ChatAgentError::AwaitingToolApproval),
            Err(error) => Err(error),
        }
    }

    pub async fn confirm_pending_tool(
        &self,
        request: RunRequest,
        previous_state: RunState,
        approved: bool,
        executor_root: impl Into<PathBuf>,
        cancelled: Option<&AtomicBool>,
        mut on_step: impl FnMut(&RunState, &StepRecord) + Send,
        mut on_status: impl FnMut(&RunState) + Send,
    ) -> Result<RunResult> {
        let run_id = request.run_id.clone();
        let session = Self::build_session(request);
        let history = Self::build_history_from_state(&previous_state, "");
        let mut resumed_state = previous_state;
        resumed_state.awaiting_user_question = None;
        resumed_state.error = None;

        let run_loop = self.build_run_loop(&run_id, executor_root);
        match run_loop
            .resume_pending_tool(
                session.clone(),
                resumed_state,
                history,
                approved,
                cancelled,
                &mut on_step,
                &mut on_status,
            )
            .await
        {
            Ok(RunLoopOutcome { state, result }) => Ok(RunResult {
                session,
                state,
                final_result: result,
            }),
            Err(ChatAgentError::AwaitingUser) => Err(ChatAgentError::AwaitingUser),
            Err(ChatAgentError::AwaitingToolApproval) => Err(ChatAgentError::AwaitingToolApproval),
            Err(error) => Err(error),
        }
    }

    pub async fn resume(
        &self,
        request: RunRequest,
        previous_state: RunState,
        user_response: String,
        executor_root: impl Into<PathBuf>,
        cancelled: Option<&AtomicBool>,
        mut on_step: impl FnMut(&RunState, &StepRecord) + Send,
        mut on_status: impl FnMut(&RunState) + Send,
    ) -> Result<RunResult> {
        let run_id = request.run_id.clone();
        let session = Self::build_session(request);
        let history = Self::build_history_from_state(&previous_state, &user_response);
        let mut resumed_state = previous_state;
        resumed_state.awaiting_user_question = None;
        resumed_state.error = None;

        let run_loop = self.build_run_loop(&run_id, executor_root);
        match run_loop
            .run_with_state(
                session.clone(),
                resumed_state,
                history,
                cancelled,
                &mut on_step,
                &mut on_status,
            )
            .await
        {
            Ok(RunLoopOutcome { state, result }) => Ok(RunResult {
                session,
                state,
                final_result: result,
            }),
            Err(ChatAgentError::AwaitingUser) => Err(ChatAgentError::AwaitingUser),
            Err(ChatAgentError::AwaitingToolApproval) => Err(ChatAgentError::AwaitingToolApproval),
            Err(error) => Err(error),
        }
    }

    fn build_run_loop(&self, run_id: &str, executor_root: impl Into<PathBuf>) -> RunLoop {
        let executor_root = executor_root.into();
        let spill_dir = output_spill::ensure_spill_dir(run_id, &executor_root);
        let planner = Arc::new(Planner::new(
            Arc::clone(&self.model_client),
            self.config.planner.clone(),
        ));
        let executor = Arc::new(Executor::new(
            executor_root,
            self.config.executor.clone(),
            Some(spill_dir),
            self.core_delegate.clone(),
        ));
        RunLoop::new(planner, executor, self.config.run_loop.clone())
    }

    fn build_session(request: RunRequest) -> SessionContext {
        let mut builder = SessionBuilder::new(
            request.workspace_id,
            request.workspace_root,
            request.model,
            request.prompt,
        )
        .security_mode(request.security_mode)
        .tool_approval_policy(request.tool_approval_policy);
        if let Some(thread_id) = request.thread_id {
            builder = builder.thread_id(thread_id);
        }
        let mut session = builder.build();
        session.run_id = request.run_id;
        session
    }

    fn build_history_from_state(
        previous_state: &RunState,
        user_response: &str,
    ) -> Vec<ChatMessage> {
        let mut history = previous_state
            .steps
            .iter()
            .flat_map(|step| {
                [
                    ChatMessage::assistant(
                        serde_json::json!({
                            "thought": step.thought,
                            "action": step.action,
                        })
                        .to_string(),
                    ),
                    ChatMessage::user(serde_json::to_string(&step.observation).unwrap_or_default()),
                ]
            })
            .collect::<Vec<_>>();

        if !user_response.trim().is_empty() {
            history.push(ChatMessage::user(user_response.trim().to_string()));
        }
        history
    }
}
