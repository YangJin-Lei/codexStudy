use serde::Deserialize;
use serde::Serialize;

use super::StepRecord;
use super::pending_turn::PendingTurn;
use super::pending_turn::ToolApprovalRequest;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Pending,
    Preparing,
    Planning,
    Executing,
    Observing,
    AwaitingUser,
    AwaitingToolApproval,
    Finalizing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunState {
    pub run_id: String,
    pub workspace_id: String,
    pub status: RunStatus,
    pub current_step: u32,
    pub steps: Vec<StepRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub awaiting_user_question: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_turn: Option<PendingTurn>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub awaiting_tool_approval: Option<ToolApprovalRequest>,
}

impl RunState {
    pub fn new(run_id: impl Into<String>, workspace_id: impl Into<String>) -> Self {
        Self {
            run_id: run_id.into(),
            workspace_id: workspace_id.into(),
            status: RunStatus::Pending,
            current_step: 0,
            steps: Vec::new(),
            error: None,
            awaiting_user_question: None,
            pending_turn: None,
            awaiting_tool_approval: None,
        }
    }

    pub fn push_step(&mut self, step: StepRecord) {
        self.current_step = self.steps.len() as u32 + 1;
        self.steps.push(step);
    }
}
