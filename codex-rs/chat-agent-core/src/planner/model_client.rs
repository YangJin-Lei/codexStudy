use serde::Deserialize;
use serde::Serialize;

/// A chat message for the planner model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".to_string(),
            content: content.into(),
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            content: content.into(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".to_string(),
            content: content.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ModelRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
}

/// HTTP chat completion client implemented by the desktop host.
pub trait ModelClient: Send + Sync {
    fn complete(
        &self,
        request: ModelRequest,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = std::result::Result<String, String>> + Send + '_>,
    >;
}
