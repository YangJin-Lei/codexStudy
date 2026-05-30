mod model_client;
mod prompt_builder;
mod response_parser;

pub use model_client::ChatMessage;
pub use model_client::ModelClient;
pub use model_client::ModelRequest;
pub use response_parser::parse_planner_response;

use std::sync::Arc;

use crate::error::ChatAgentError;
use crate::error::Result;
use crate::protocol::PlannerTurn;
use crate::session::SessionContext;

use self::prompt_builder::PromptBuilder;

#[derive(Clone)]
pub struct PlannerConfig {
    pub max_parse_retries: u32,
}

impl Default for PlannerConfig {
    fn default() -> Self {
        Self {
            max_parse_retries: 2,
        }
    }
}

pub struct Planner {
    client: Arc<dyn ModelClient>,
    config: PlannerConfig,
}

impl Planner {
    pub fn new(client: Arc<dyn ModelClient>, config: PlannerConfig) -> Self {
        Self { client, config }
    }

    pub async fn plan_next_action(
        &self,
        session: &SessionContext,
        history: &[ChatMessage],
        last_parse_error: Option<&str>,
    ) -> Result<PlannerTurn> {
        let mut messages = PromptBuilder::build(session, history);
        if let Some(error) = last_parse_error {
            messages.push(ChatMessage::user(format!(
                "Your previous response could not be parsed: {error}. Reply with valid JSON only."
            )));
        }

        let mut last_error = String::new();
        for attempt in 0..=self.config.max_parse_retries {
            let response = self
                .client
                .complete(ModelRequest {
                    model: session.model.clone(),
                    messages: messages.clone(),
                })
                .await
                .map_err(|error| ChatAgentError::ModelApi(error))?;

            match parse_planner_response(&response) {
                Ok(turn) => return Ok(turn),
                Err(error) => {
                    last_error = error.to_string();
                    if attempt == self.config.max_parse_retries {
                        break;
                    }
                    messages.push(ChatMessage::user(format!(
                        "Parse error (attempt {}): {last_error}. Return valid JSON with thought and action.",
                        attempt + 1
                    )));
                }
            }
        }

        Err(ChatAgentError::Parse(last_error))
    }
}
