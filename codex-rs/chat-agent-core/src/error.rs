use thiserror::Error;

pub type Result<T> = std::result::Result<T, ChatAgentError>;

#[derive(Debug, Error)]
pub enum ChatAgentError {
    #[error("parse error: {0}")]
    Parse(String),
    #[error("tool error: {0}")]
    Tool(String),
    #[error("runtime error: {0}")]
    Runtime(String),
    #[error("model API error: {0}")]
    ModelApi(String),
    #[error("guardrail: {0}")]
    Guardrail(String),
    #[error("cancelled")]
    Cancelled,
    #[error("awaiting user input")]
    AwaitingUser,
    #[error("awaiting tool approval")]
    AwaitingToolApproval,
}
