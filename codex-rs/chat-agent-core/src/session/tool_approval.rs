use serde::Deserialize;
use serde::Serialize;

use crate::protocol::Action;

/// Mirrors composer access modes and Goose approve/auto session modes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ToolApprovalPolicy {
    #[default]
    OnRequest,
    Auto,
    ReadOnly,
}

impl ToolApprovalPolicy {
    pub fn from_access_mode(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "full-access" | "full_access" | "fullaccess" => Self::Auto,
            "read-only" | "read_only" | "readonly" => Self::ReadOnly,
            _ => Self::OnRequest,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolApprovalDecision {
    Execute,
    PromptUser,
    DenyReadOnly,
}

pub fn evaluate(action: &Action, policy: ToolApprovalPolicy) -> ToolApprovalDecision {
    match policy {
        ToolApprovalPolicy::Auto => ToolApprovalDecision::Execute,
        ToolApprovalPolicy::ReadOnly => {
            if is_mutating(action) {
                ToolApprovalDecision::DenyReadOnly
            } else {
                ToolApprovalDecision::Execute
            }
        }
        ToolApprovalPolicy::OnRequest => {
            if requires_user_approval(action) {
                ToolApprovalDecision::PromptUser
            } else {
                ToolApprovalDecision::Execute
            }
        }
    }
}

pub fn approval_summary(action: &Action) -> String {
    match action {
        Action::EditFile { path, .. } => format!("Edit file `{path}`"),
        Action::RunCommand { command, .. } => format!("Run command `{command}`"),
        Action::ReadFile { path, .. } => format!("Read file `{path}`"),
        Action::SearchCode { pattern, .. } => format!("Search code for `{pattern}`"),
        Action::AskUser { question, .. } => question.clone(),
        Action::Finalize { summary, .. } => summary.clone(),
    }
}

fn is_mutating(action: &Action) -> bool {
    matches!(action, Action::EditFile { .. } | Action::RunCommand { .. })
}

fn requires_user_approval(action: &Action) -> bool {
    is_mutating(action)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn maps_access_modes_to_policy() {
        assert_eq!(
            ToolApprovalPolicy::from_access_mode("full-access"),
            ToolApprovalPolicy::Auto
        );
        assert_eq!(
            ToolApprovalPolicy::from_access_mode("read-only"),
            ToolApprovalPolicy::ReadOnly
        );
        assert_eq!(
            ToolApprovalPolicy::from_access_mode("current"),
            ToolApprovalPolicy::OnRequest
        );
    }

    #[test]
    fn on_request_prompts_for_shell_and_edit() {
        let edit = Action::EditFile {
            path: "a.rs".into(),
            old_str: "a".into(),
            new_str: "b".into(),
        };
        assert_eq!(
            evaluate(&edit, ToolApprovalPolicy::OnRequest),
            ToolApprovalDecision::PromptUser
        );
        let read = Action::ReadFile {
            path: "a.rs".into(),
            line_start: None,
            line_end: None,
        };
        assert_eq!(
            evaluate(&read, ToolApprovalPolicy::OnRequest),
            ToolApprovalDecision::Execute
        );
    }

    #[test]
    fn read_only_denies_mutations() {
        let command = Action::RunCommand {
            command: "cargo test".into(),
            cwd: None,
            timeout_secs: None,
        };
        assert_eq!(
            evaluate(&command, ToolApprovalPolicy::ReadOnly),
            ToolApprovalDecision::DenyReadOnly
        );
    }
}
