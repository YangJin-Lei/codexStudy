use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

use crate::error::ChatAgentError;
use crate::error::Result;
use crate::executor::Executor;
use crate::planner::ChatMessage;
use crate::planner::Planner;
use crate::protocol::Action;
use crate::protocol::FinalResult;
use crate::session::SessionContext;
use crate::session::ToolApprovalDecision;
use crate::session::evaluate_tool_approval;
use crate::session::tool_approval_summary;
use crate::state::PendingTurn;
use crate::state::RunState;
use crate::state::RunStatus;
use crate::state::StepRecord;
use crate::state::ToolApprovalRequest;

use super::guardrails::GuardrailAction;
use super::guardrails::Guardrails;
use super::guardrails::GuardrailsConfig;
use super::stop_conditions::should_pause_for_user;
use super::stop_conditions::should_stop_after_action;
use super::turn_commit::commit_turn;
use super::turn_commit::read_only_denial_observation;
use super::turn_commit::user_denial_observation;

#[derive(Clone)]
pub struct RunLoopConfig {
    pub guardrails: GuardrailsConfig,
}

impl Default for RunLoopConfig {
    fn default() -> Self {
        Self {
            guardrails: GuardrailsConfig::default(),
        }
    }
}

pub struct RunLoop {
    planner: Arc<Planner>,
    executor: Arc<Executor>,
    config: RunLoopConfig,
}

pub struct RunLoopOutcome {
    pub state: RunState,
    pub result: FinalResult,
}

impl RunLoop {
    pub fn new(planner: Arc<Planner>, executor: Arc<Executor>, config: RunLoopConfig) -> Self {
        Self {
            planner,
            executor,
            config,
        }
    }

    pub async fn run(
        &self,
        session: SessionContext,
        cancelled: Option<&AtomicBool>,
        on_step: impl FnMut(&RunState, &StepRecord) + Send,
        on_status: impl FnMut(&RunState) + Send,
    ) -> Result<RunLoopOutcome> {
        let state = RunState::new(&session.run_id, &session.workspace_id);
        self.run_with_state(session, state, Vec::new(), cancelled, on_step, on_status)
            .await
    }

    pub async fn run_with_state(
        &self,
        session: SessionContext,
        mut state: RunState,
        mut history: Vec<ChatMessage>,
        cancelled: Option<&AtomicBool>,
        mut on_step: impl FnMut(&RunState, &StepRecord) + Send,
        mut on_status: impl FnMut(&RunState) + Send,
    ) -> Result<RunLoopOutcome> {
        state.status = RunStatus::Preparing;
        state.awaiting_user_question = None;
        on_status(&state);

        let mut guardrails = Guardrails::new(self.config.guardrails.clone());
        let mut last_parse_error: Option<String> = None;

        loop {
            if cancelled.is_some_and(|flag| flag.load(Ordering::SeqCst)) {
                state.status = RunStatus::Cancelled;
                on_status(&state);
                return Err(ChatAgentError::Cancelled);
            }

            state.status = RunStatus::Planning;
            on_status(&state);

            let turn = match self
                .planner
                .plan_next_action(&session, &history, last_parse_error.as_deref())
                .await
            {
                Ok(turn) => {
                    last_parse_error = None;
                    turn
                }
                Err(ChatAgentError::Parse(message)) => {
                    last_parse_error = Some(message);
                    state.status = RunStatus::AwaitingUser;
                    state.error = Some("Failed to parse model response".into());
                    on_status(&state);
                    return Ok(RunLoopOutcome {
                        state,
                        result: FinalResult {
                            status: RunStatus::Failed,
                            summary: "Planner parse failed".into(),
                            next_steps: None,
                            error: last_parse_error,
                        },
                    });
                }
                Err(error) => return Err(error),
            };

            match guardrails.check(&turn.action) {
                GuardrailAction::Continue => {}
                GuardrailAction::ForceAskUser { reason } => {
                    let action = Action::AskUser {
                        question: reason,
                        options: None,
                    };
                    return self
                        .finish_with_action(
                            &session,
                            &mut state,
                            turn.thought,
                            action,
                            &mut guardrails,
                            &mut history,
                            cancelled,
                            &mut on_step,
                            &mut on_status,
                        )
                        .await;
                }
                GuardrailAction::ForceFinalize { reason } => {
                    let action = Action::Finalize {
                        summary: reason,
                        next_steps: None,
                    };
                    return self
                        .finish_with_action(
                            &session,
                            &mut state,
                            turn.thought,
                            action,
                            &mut guardrails,
                            &mut history,
                            cancelled,
                            &mut on_step,
                            &mut on_status,
                        )
                        .await;
                }
            }

            if should_pause_for_user(&turn.action) || should_stop_after_action(&turn.action) {
                return self
                    .finish_with_action(
                        &session,
                        &mut state,
                        turn.thought,
                        turn.action,
                        &mut guardrails,
                        &mut history,
                        cancelled,
                        &mut on_step,
                        &mut on_status,
                    )
                    .await;
            }

            match self.gate_tool_approval(
                &session,
                &mut state,
                &turn.thought,
                &turn.action,
                &mut on_status,
            ) {
                ToolApprovalGate::Execute => {}
                ToolApprovalGate::Paused => return Err(ChatAgentError::AwaitingToolApproval),
                ToolApprovalGate::DeniedReadOnly => {
                    let observation = read_only_denial_observation(&turn.action);
                    commit_turn(
                        &mut state,
                        &mut guardrails,
                        &mut history,
                        turn.thought,
                        turn.action,
                        observation,
                        &mut on_step,
                    );
                    state.status = RunStatus::Planning;
                    on_status(&state);
                    continue;
                }
            }

            state.status = RunStatus::Executing;
            on_status(&state);

            let observation = self.executor.execute(&session, &turn.action).await?;
            if cancelled.is_some_and(|flag| flag.load(Ordering::SeqCst)) {
                state.status = RunStatus::Cancelled;
                on_status(&state);
                return Err(ChatAgentError::Cancelled);
            }

            commit_turn(
                &mut state,
                &mut guardrails,
                &mut history,
                turn.thought,
                turn.action,
                observation,
                &mut on_step,
            );

            state.status = RunStatus::Planning;
            on_status(&state);
        }
    }

    pub async fn resume_pending_tool(
        &self,
        session: SessionContext,
        mut state: RunState,
        mut history: Vec<ChatMessage>,
        approved: bool,
        cancelled: Option<&AtomicBool>,
        mut on_step: impl FnMut(&RunState, &StepRecord) + Send,
        mut on_status: impl FnMut(&RunState) + Send,
    ) -> Result<RunLoopOutcome> {
        let pending = state
            .pending_turn
            .take()
            .ok_or_else(|| ChatAgentError::Runtime("No pending tool approval".into()))?;
        state.awaiting_tool_approval = None;

        if cancelled.is_some_and(|flag| flag.load(Ordering::SeqCst)) {
            state.status = RunStatus::Cancelled;
            on_status(&state);
            return Err(ChatAgentError::Cancelled);
        }

        let mut guardrails = Guardrails::new(self.config.guardrails.clone());
        for step in &state.steps {
            guardrails.record_turn(&step.action, step.observation.ok);
        }

        let observation = if approved {
            state.status = RunStatus::Executing;
            on_status(&state);
            self.executor.execute(&session, &pending.action).await?
        } else {
            user_denial_observation(&pending.action)
        };

        if cancelled.is_some_and(|flag| flag.load(Ordering::SeqCst)) {
            state.status = RunStatus::Cancelled;
            on_status(&state);
            return Err(ChatAgentError::Cancelled);
        }

        commit_turn(
            &mut state,
            &mut guardrails,
            &mut history,
            pending.thought,
            pending.action,
            observation,
            &mut on_step,
        );

        state.status = RunStatus::Planning;
        on_status(&state);

        self.run_with_state(session, state, history, cancelled, on_step, on_status)
            .await
    }

    fn gate_tool_approval(
        &self,
        session: &SessionContext,
        state: &mut RunState,
        thought: &str,
        action: &Action,
        on_status: &mut impl FnMut(&RunState),
    ) -> ToolApprovalGate {
        match evaluate_tool_approval(action, session.tool_approval_policy) {
            ToolApprovalDecision::Execute => ToolApprovalGate::Execute,
            ToolApprovalDecision::DenyReadOnly => ToolApprovalGate::DeniedReadOnly,
            ToolApprovalDecision::PromptUser => {
                state.pending_turn = Some(PendingTurn {
                    thought: thought.to_string(),
                    action: action.clone(),
                });
                state.awaiting_tool_approval = Some(ToolApprovalRequest {
                    tool_name: action.type_name().to_string(),
                    summary: tool_approval_summary(action),
                });
                state.status = RunStatus::AwaitingToolApproval;
                on_status(state);
                ToolApprovalGate::Paused
            }
        }
    }

    async fn finish_with_action(
        &self,
        session: &SessionContext,
        state: &mut RunState,
        thought: String,
        action: Action,
        guardrails: &mut Guardrails,
        history: &mut Vec<ChatMessage>,
        cancelled: Option<&AtomicBool>,
        on_step: &mut impl FnMut(&RunState, &StepRecord),
        on_status: &mut impl FnMut(&RunState),
    ) -> Result<RunLoopOutcome> {
        match self.gate_tool_approval(session, state, &thought, &action, on_status) {
            ToolApprovalGate::Execute => {}
            ToolApprovalGate::Paused => return Err(ChatAgentError::AwaitingToolApproval),
            ToolApprovalGate::DeniedReadOnly => {
                let observation = read_only_denial_observation(&action);
                commit_turn(
                    state,
                    guardrails,
                    history,
                    thought,
                    action.clone(),
                    observation,
                    on_step,
                );
                state.status = RunStatus::Completed;
                on_status(state);
                return Ok(RunLoopOutcome {
                    state: state.clone(),
                    result: FinalResult {
                        status: RunStatus::Completed,
                        summary: "Read-only mode blocked the requested action.".into(),
                        next_steps: None,
                        error: None,
                    },
                });
            }
        }

        state.status = RunStatus::Executing;
        on_status(state);

        let observation = self.executor.execute(session, &action).await?;
        if cancelled.is_some_and(|flag| flag.load(Ordering::SeqCst)) {
            state.status = RunStatus::Cancelled;
            on_status(state);
            return Err(ChatAgentError::Cancelled);
        }
        guardrails.record_turn(&action, observation.ok);

        commit_turn(
            state,
            guardrails,
            history,
            thought,
            action.clone(),
            observation.clone(),
            on_step,
        );

        if should_pause_for_user(&action) {
            if let Action::AskUser { question, .. } = &action {
                state.awaiting_user_question = Some(question.clone());
            }
            state.status = RunStatus::AwaitingUser;
            on_status(state);
            return Err(ChatAgentError::AwaitingUser);
        }

        state.status = RunStatus::Completed;
        on_status(state);

        let summary = match &action {
            Action::Finalize {
                summary,
                next_steps,
            } => FinalResult {
                status: RunStatus::Completed,
                summary: summary.clone(),
                next_steps: next_steps.clone(),
                error: None,
            },
            _ => FinalResult {
                status: RunStatus::Completed,
                summary: observation.summary.clone(),
                next_steps: None,
                error: None,
            },
        };

        Ok(RunLoopOutcome {
            state: state.clone(),
            result: summary,
        })
    }
}

enum ToolApprovalGate {
    Execute,
    Paused,
    DeniedReadOnly,
}
