use uuid::Uuid;

use super::SessionContext;
use super::ToolApprovalPolicy;

pub struct SessionBuilder {
    workspace_id: String,
    workspace_root: String,
    model: String,
    task_prompt: String,
    thread_id: Option<String>,
    security_mode: bool,
    tool_approval_policy: ToolApprovalPolicy,
}

impl SessionBuilder {
    pub fn new(
        workspace_id: impl Into<String>,
        workspace_root: impl Into<String>,
        model: impl Into<String>,
        task_prompt: impl Into<String>,
    ) -> Self {
        Self {
            workspace_id: workspace_id.into(),
            workspace_root: workspace_root.into(),
            model: model.into(),
            task_prompt: task_prompt.into(),
            thread_id: None,
            security_mode: false,
            tool_approval_policy: ToolApprovalPolicy::default(),
        }
    }

    pub fn thread_id(mut self, thread_id: impl Into<String>) -> Self {
        self.thread_id = Some(thread_id.into());
        self
    }

    pub fn security_mode(mut self, security_mode: bool) -> Self {
        self.security_mode = security_mode;
        self
    }

    pub fn tool_approval_policy(mut self, tool_approval_policy: ToolApprovalPolicy) -> Self {
        self.tool_approval_policy = tool_approval_policy;
        self
    }

    pub fn build(self) -> SessionContext {
        SessionContext {
            run_id: Uuid::new_v4().to_string(),
            workspace_id: self.workspace_id,
            workspace_root: self.workspace_root,
            thread_id: self.thread_id,
            model: self.model,
            task_prompt: self.task_prompt,
            security_mode: self.security_mode,
            tool_approval_policy: self.tool_approval_policy,
        }
    }
}
