use crate::protocol::build_system_prompt;
use crate::session::SessionContext;

use super::ChatMessage;

pub struct PromptBuilder;

impl PromptBuilder {
    pub fn build(session: &SessionContext, history: &[ChatMessage]) -> Vec<ChatMessage> {
        let mut messages = vec![
            ChatMessage::system(build_system_prompt(&session.workspace_root)),
            ChatMessage::user(format!("Task:\n{}", session.task_prompt.trim())),
        ];
        messages.extend(history.iter().cloned());
        messages
    }
}
