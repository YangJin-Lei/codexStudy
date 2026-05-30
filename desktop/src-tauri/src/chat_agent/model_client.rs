use std::sync::Arc;

use chat_agent_core::{ModelClient, ModelRequest};
use reqwest::Client;
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri::Manager;

use crate::shared::provider_config_core;
use crate::state::AppState;

pub(crate) struct DesktopModelClient {
    client: Client,
    app: AppHandle,
}

impl DesktopModelClient {
    pub(crate) fn new(app: AppHandle) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("reqwest client");
        Self { client, app }
    }
}

impl ModelClient for DesktopModelClient {
    fn complete(
        &self,
        request: ModelRequest,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = std::result::Result<String, String>> + Send + '_>,
    > {
        let app = self.app.clone();
        let client = self.client.clone();
        Box::pin(async move {
            let state = app.state::<AppState>();
            let settings = state.app_settings.lock().await.clone();
            let credentials = provider_config_core::chat_completion_credentials_core(&settings)?;

            let api_key = credentials.api_key;
            let base_url = credentials
                .base_url
                .trim()
                .trim_end_matches('/')
                .to_string();
            let url = if base_url.ends_with("/chat/completions") {
                base_url
            } else {
                format!("{base_url}/chat/completions")
            };

            let messages: Vec<Value> = request
                .messages
                .iter()
                .map(|message| {
                    json!({
                        "role": message.role,
                        "content": message.content,
                    })
                })
                .collect();

            let body = json!({
                "model": request.model,
                "messages": messages,
                "temperature": 0.2,
                "stream": false,
            });
            let body_bytes = serde_json::to_vec(&body)
                .map_err(|error| format!("Failed to serialize model request: {error}"))?;

            let response = client
                .post(url)
                .header("content-type", "application/json")
                .bearer_auth(api_key)
                .body(body_bytes)
                .send()
                .await
                .map_err(|error| format!("Model request failed: {error}"))?;

            let status = response.status();
            let payload_text = response
                .text()
                .await
                .map_err(|error| format!("Model response was unreadable: {error}"))?;
            let payload: Value = serde_json::from_str(&payload_text)
                .map_err(|error| format!("Model response was not JSON: {error}"))?;

            if !status.is_success() {
                return Err(format!(
                    "Model API returned {}: {}",
                    status.as_u16(),
                    extract_error_message(&payload)
                ));
            }

            extract_completion_text(&payload)
                .ok_or_else(|| "Model API returned no text content in the completion.".to_string())
        })
    }
}

fn extract_completion_text(payload: &Value) -> Option<String> {
    let choice = payload.get("choices")?.as_array()?.first()?;
    let message = choice.get("message")?;
    if let Some(content) = message.get("content").and_then(Value::as_str) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

fn extract_error_message(payload: &Value) -> String {
    payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| payload.get("message").and_then(Value::as_str))
        .unwrap_or("unknown error")
        .to_string()
}
