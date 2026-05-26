use axum::extract::State;
use axum::http::header::AUTHORIZATION;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Map, Value};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, RwLock};

use crate::types::{AppSettings, ModelProviderCompatKind, ModelProviderCompatSettings};

const COMPAT_BRIDGE_HOST: &str = "127.0.0.1";
const COMPAT_BRIDGE_PORT: u16 = 43189;
const COMPAT_BRIDGE_BASE_URL: &str = "http://127.0.0.1:43189/v1";
const TOOL_SEARCH_FLAT_NAME: &str = "tool_search";
const SHELL_COMMAND_FLAT_NAME: &str = "shell_command";

#[derive(Clone)]
struct CompatBridgeState {
    client: reqwest::Client,
    config: Arc<RwLock<Option<ModelProviderCompatSettings>>>,
}

struct CompatBridgeRuntime {
    config: Arc<RwLock<Option<ModelProviderCompatSettings>>>,
}

#[derive(Clone)]
struct CompatToolDescriptor {
    flat_name: String,
    name: String,
    namespace: Option<String>,
    tool_type: CompatToolType,
}

#[derive(Clone)]
enum CompatToolType {
    Function,
    ToolSearch { execution: String },
}

pub(crate) struct CompatCapabilities {
    pub(crate) input_modalities: &'static [&'static str],
    supports_search_tool: bool,
}

const TEXT_ONLY_MODALITIES: &[&str] = &["text"];
const TEXT_AND_IMAGE_MODALITIES: &[&str] = &["text", "image"];
const MAX_COMPAT_TOOL_OUTPUT_CHARS: usize = 12_000;
const MAX_COMPAT_TOOL_SCHEMA_CHARS: usize = 8_192;
const MAX_COMPAT_TOOL_SCHEMA_DEPTH: usize = 8;

fn compat_runtime() -> &'static Mutex<Option<CompatBridgeRuntime>> {
    static RUNTIME: OnceLock<Mutex<Option<CompatBridgeRuntime>>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(None))
}

pub(crate) fn base_url_for_kind(_kind: ModelProviderCompatKind) -> String {
    COMPAT_BRIDGE_BASE_URL.to_string()
}

pub(crate) async fn ensure_running_for_app_settings(
    app_settings: &AppSettings,
) -> Result<(), String> {
    let compat = app_settings.model_provider_compat.clone();
    let runtime = compat_runtime();
    let mut runtime = runtime.lock().await;

    if let Some(existing) = runtime.as_mut() {
        *existing.config.write().await = compat;
        return Ok(());
    }

    let Some(compat) = compat else {
        return Ok(());
    };

    let config = Arc::new(RwLock::new(Some(compat)));
    let listener = TcpListener::bind((COMPAT_BRIDGE_HOST, COMPAT_BRIDGE_PORT))
        .await
        .map_err(|err| {
            format!(
                "Unable to start local model compatibility bridge on {}:{}: {err}",
                COMPAT_BRIDGE_HOST, COMPAT_BRIDGE_PORT
            )
        })?;
    let state = CompatBridgeState {
        client: reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|err| format!("Unable to create compatibility bridge HTTP client: {err}"))?,
        config: Arc::clone(&config),
    };
    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/models", get(list_models))
        .route("/v1/responses", post(create_response))
        .with_state(state);

    tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, app).await {
            eprintln!("provider compat bridge exited: {err}");
        }
    });

    *runtime = Some(CompatBridgeRuntime { config });
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn list_models(State(state): State<CompatBridgeState>, headers: HeaderMap) -> Response {
    let Some(config) = state.config.read().await.clone() else {
        return json_error(
            StatusCode::BAD_REQUEST,
            "No compatible model provider is configured.",
        );
    };
    match fetch_models_response(&state.client, &config, auth_header(&headers)).await {
        Ok(Some(body)) => Json(body).into_response(),
        Ok(None) => Json(json!({ "models": fallback_models(&config) })).into_response(),
        Err(message) => json_error(StatusCode::BAD_GATEWAY, &message),
    }
}

async fn create_response(
    State(state): State<CompatBridgeState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let Some(config) = state.config.read().await.clone() else {
        return sse_response(
            sse_failed_payload(
                "compat-not-configured",
                "No compatible model provider is configured.",
            ),
            None,
        );
    };

    let (request_body, tool_index) = match build_chat_completions_request(&config, &body) {
        Ok(value) => value,
        Err(message) => {
            return sse_response(sse_failed_payload("compat-invalid-request", &message), None);
        }
    };

    let upstream_url = join_url(&config.upstream_base_url, "chat/completions");
    let request_body_bytes = match serde_json::to_vec(&request_body) {
        Ok(bytes) => bytes,
        Err(err) => {
            return sse_response(
                sse_failed_payload("compat-invalid-request", &err.to_string()),
                None,
            );
        }
    };
    let mut request = state
        .client
        .post(upstream_url)
        .header("content-type", "application/json")
        .body(request_body_bytes);
    if let Some(header) = auth_header(&headers) {
        request = request.header(AUTHORIZATION, header);
    }

    let upstream = match request.send().await {
        Ok(response) => response,
        Err(err) => {
            return sse_response(
                sse_failed_payload("compat-upstream-unreachable", &err.to_string()),
                None,
            );
        }
    };

    if !upstream.status().is_success() {
        let status = upstream.status();
        let body_text = upstream.text().await.unwrap_or_default();
        return sse_response(sse_failed_from_upstream(status, &body_text), None);
    }

    let completion_body = match upstream.text().await {
        Ok(body) => body,
        Err(err) => {
            return sse_response(
                sse_failed_payload("compat-invalid-upstream-response", &err.to_string()),
                None,
            );
        }
    };
    let completion: Value = match serde_json::from_str(&completion_body) {
        Ok(value) => value,
        Err(err) => {
            return sse_response(
                sse_failed_payload("compat-invalid-upstream-response", &err.to_string()),
                None,
            );
        }
    };

    let model_header = completion
        .get("model")
        .and_then(Value::as_str)
        .map(str::to_string);
    match build_responses_sse(&completion, &tool_index) {
        Ok(payload) => sse_response(payload, model_header.as_deref()),
        Err(message) => sse_response(
            sse_failed_payload("compat-response-translation-failed", &message),
            model_header.as_deref(),
        ),
    }
}

fn auth_header(headers: &HeaderMap) -> Option<HeaderValue> {
    headers.get(AUTHORIZATION).cloned()
}

async fn fetch_models_response(
    client: &reqwest::Client,
    config: &ModelProviderCompatSettings,
    auth: Option<HeaderValue>,
) -> Result<Option<Value>, String> {
    let mut request = client.get(join_url(&config.upstream_base_url, "models"));
    if let Some(auth) = auth {
        request = request.header(AUTHORIZATION, auth);
    }
    let response = request.send().await.map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Upstream /models request failed ({status}): {body}"
        ));
    }
    let body = response.text().await.map_err(|err| err.to_string())?;
    let value: Value = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    if value
        .get("models")
        .and_then(Value::as_array)
        .is_some_and(|models| !models.is_empty())
    {
        return Ok(Some(value));
    }
    let Some(data) = value.get("data").and_then(Value::as_array) else {
        return Ok(None);
    };
    if data.is_empty() {
        return Ok(None);
    }
    let models = data
        .iter()
        .enumerate()
        .filter_map(|(priority, entry)| {
            let slug = entry.get("id").and_then(Value::as_str)?.trim();
            if slug.is_empty() {
                return None;
            }
            Some(model_info_json(config, slug, slug, priority as i32 + 1))
        })
        .collect::<Vec<_>>();
    if models.is_empty() {
        Ok(None)
    } else {
        Ok(Some(json!({ "models": models })))
    }
}

fn build_chat_completions_request(
    config: &ModelProviderCompatSettings,
    body: &Value,
) -> Result<(Value, Vec<CompatToolDescriptor>), String> {
    let requested_model = body.get("model").and_then(Value::as_str);
    let capabilities = compat_capabilities(config, requested_model);

    let tools = body.get("tools").and_then(Value::as_array);
    let (translated_tools, tool_index) = translate_tools(tools, config);
    let messages = translate_messages(
        body,
        &tool_index,
        capabilities.input_modalities.contains(&"image"),
    );
    if messages.is_empty() {
        return Err("The request did not contain any translatable messages.".to_string());
    }

    let model = body
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| default_model_slug(config.kind).to_string());

    let mut request = Map::new();
    request.insert("model".to_string(), Value::String(model));
    request.insert("messages".to_string(), Value::Array(messages));
    request.insert("stream".to_string(), Value::Bool(false));
    if !translated_tools.is_empty() {
        request.insert("tools".to_string(), Value::Array(translated_tools));
    }
    if let Some(parallel_tool_calls) = body.get("parallel_tool_calls").and_then(Value::as_bool) {
        request.insert(
            "parallel_tool_calls".to_string(),
            Value::Bool(parallel_tool_calls),
        );
    }
    if let Some(temperature) = body.get("temperature") {
        request.insert("temperature".to_string(), temperature.clone());
    }
    copy_optional_request_key(body, &mut request, "top_p");
    copy_optional_request_key(body, &mut request, "presence_penalty");
    copy_optional_request_key(body, &mut request, "frequency_penalty");
    copy_optional_request_key(body, &mut request, "stop");
    copy_optional_request_key(body, &mut request, "seed");
    copy_optional_request_key(body, &mut request, "tool_choice");
    copy_optional_request_key(body, &mut request, "response_format");
    copy_optional_request_key(body, &mut request, "max_tokens");
    copy_optional_request_key(body, &mut request, "max_completion_tokens");
    if let Some(max_output_tokens) = body.get("max_output_tokens") {
        request.insert(
            "max_completion_tokens".to_string(),
            max_output_tokens.clone(),
        );
    }
    let request_value = Value::Object(request);
    validate_compat_request_body(&request_value)?;
    Ok((request_value, tool_index))
}

fn validate_compat_request_body(request: &Value) -> Result<(), String> {
    let serialized = serde_json::to_string(request).map_err(|err| err.to_string())?;
    if serialized.len() > 256 * 1024 {
        return Err(
            "The translated model request is too large for this provider. Start a new thread or reduce tool history."
                .to_string(),
        );
    }
    Ok(())
}

fn sanitize_tool_parameters(_config: &ModelProviderCompatSettings, parameters: Value) -> Value {
    let parsed = match parameters {
        Value::String(raw) => serde_json::from_str(&raw).unwrap_or_else(|_| {
            json!({
                "type": "object",
                "properties": {},
                "additionalProperties": true,
            })
        }),
        other => other,
    };
    let sanitized = sanitize_json_schema(&parsed, 0);
    match serde_json::to_string(&sanitized) {
        Ok(serialized) if serialized.len() > MAX_COMPAT_TOOL_SCHEMA_CHARS => json!({
            "type": "object",
            "properties": {},
            "additionalProperties": true,
        }),
        _ => sanitized,
    }
}

fn sanitize_json_schema(value: &Value, depth: usize) -> Value {
    if depth > MAX_COMPAT_TOOL_SCHEMA_DEPTH {
        return json!({
            "type": "object",
            "additionalProperties": true,
        });
    }

    match value {
        Value::Object(map) => {
            let mut sanitized = Map::new();
            if let Some(value) = map.get("type").and_then(Value::as_str) {
                sanitized.insert("type".to_string(), Value::String(value.to_string()));
            }
            if let Some(value) = map.get("description").and_then(Value::as_str) {
                sanitized.insert(
                    "description".to_string(),
                    Value::String(truncate_compat_text(value, 512)),
                );
            }
            if let Some(value) = map.get("enum") {
                sanitized.insert("enum".to_string(), value.clone());
            }
            if let Some(value) = map.get("properties").and_then(Value::as_object) {
                let mut properties = Map::new();
                for (key, property) in value {
                    properties.insert(
                        key.clone(),
                        sanitize_json_schema(property, depth.saturating_add(1)),
                    );
                }
                sanitized.insert("properties".to_string(), Value::Object(properties));
            }
            if let Some(value) = map.get("required").and_then(Value::as_array) {
                let required = value
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect::<Vec<_>>();
                if !required.is_empty() {
                    sanitized.insert("required".to_string(), json!(required));
                }
            }
            if let Some(value) = map.get("items") {
                sanitized.insert(
                    "items".to_string(),
                    sanitize_json_schema_items(value, depth.saturating_add(1)),
                );
            }
            if sanitized.get("type").is_none() {
                if sanitized.contains_key("properties") {
                    sanitized.insert("type".to_string(), Value::String("object".to_string()));
                } else if sanitized.contains_key("items") {
                    sanitized.insert("type".to_string(), Value::String("array".to_string()));
                } else {
                    sanitized.insert("type".to_string(), Value::String("object".to_string()));
                }
            }
            if sanitized.get("type").and_then(Value::as_str) == Some("object")
                && !sanitized.contains_key("properties")
            {
                sanitized.insert("properties".to_string(), Value::Object(Map::new()));
            }
            sanitized.insert("additionalProperties".to_string(), Value::Bool(true));
            Value::Object(sanitized)
        }
        _ => json!({
            "type": "object",
            "properties": {},
            "additionalProperties": true,
        }),
    }
}

fn sanitize_json_schema_items(value: &Value, depth: usize) -> Value {
    match value {
        Value::Object(map) if map.contains_key("type") || map.contains_key("properties") => {
            sanitize_json_schema(value, depth)
        }
        Value::Array(values) if !values.is_empty() => {
            sanitize_json_schema(&values[0], depth)
        }
        _ => json!({ "type": "string" }),
    }
}

fn truncate_compat_text(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    text.chars().take(max_chars).collect::<String>()
}

fn truncate_compat_tool_output(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.len() <= MAX_COMPAT_TOOL_OUTPUT_CHARS {
        return text.to_string();
    }
    let looks_like_base64 = trimmed.len() > 256
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '=' | '\n' | '\r'));
    if looks_like_base64 {
        return "[Tool output omitted: screenshot/binary payload was too large for this model provider.]".to_string();
    }
    format!(
        "{}\n\n[Tool output truncated for model provider compatibility.]",
        truncate_compat_text(trimmed, MAX_COMPAT_TOOL_OUTPUT_CHARS)
    )
}

fn copy_optional_request_key(body: &Value, request: &mut Map<String, Value>, key: &str) {
    if let Some(value) = body.get(key) {
        request.insert(key.to_string(), value.clone());
    }
}

fn translate_tools(
    tools: Option<&Vec<Value>>,
    config: &ModelProviderCompatSettings,
) -> (Vec<Value>, Vec<CompatToolDescriptor>) {
    let Some(tools) = tools else {
        return (Vec::new(), Vec::new());
    };

    let mut translated = Vec::new();
    let mut index = Vec::new();
    for tool in tools {
        match tool.get("type").and_then(Value::as_str) {
            Some("function") => {
                if let Some((descriptor, value)) = function_tool(config, None, tool) {
                    index.push(descriptor);
                    translated.push(value);
                }
            }
            Some("namespace") => {
                let namespace = tool.get("name").and_then(Value::as_str);
                if let Some(children) = tool.get("tools").and_then(Value::as_array) {
                    for child in children {
                        if let Some((descriptor, value)) = function_tool(config, namespace, child) {
                            index.push(descriptor);
                            translated.push(value);
                        }
                    }
                }
            }
            Some("tool_search") => {
                let flat_name = TOOL_SEARCH_FLAT_NAME.to_string();
                index.push(CompatToolDescriptor {
                    flat_name: flat_name.clone(),
                    name: flat_name.clone(),
                    namespace: None,
                    tool_type: CompatToolType::ToolSearch {
                        execution: tool
                            .get("execution")
                            .and_then(Value::as_str)
                            .unwrap_or("client")
                            .to_string(),
                    },
                });
                let parameters = tool.get("parameters").cloned().unwrap_or_else(|| {
                    json!({
                        "type": "object",
                        "properties": {},
                        "additionalProperties": true,
                    })
                });
                translated.push(json!({
                    "type": "function",
                    "function": {
                        "name": flat_name,
                        "description": tool.get("description").cloned().unwrap_or_else(|| json!("Search deferred tools.")),
                        "parameters": sanitize_tool_parameters(config, parameters),
                    }
                }));
            }
            _ => {}
        }
    }
    (translated, index)
}

fn function_tool(
    config: &ModelProviderCompatSettings,
    namespace: Option<&str>,
    tool: &Value,
) -> Option<(CompatToolDescriptor, Value)> {
    let name = tool.get("name").and_then(Value::as_str)?.trim();
    if name.is_empty() {
        return None;
    }
    let flat_name = flatten_tool_name(namespace, name);
    let descriptor = CompatToolDescriptor {
        flat_name: flat_name.clone(),
        name: name.to_string(),
        namespace: namespace.map(str::to_string),
        tool_type: CompatToolType::Function,
    };
    let parameters = tool.get("parameters").cloned().unwrap_or_else(|| {
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": true,
        })
    });
    Some((
        descriptor,
        json!({
            "type": "function",
            "function": {
                "name": flat_name,
                "description": tool.get("description").cloned().unwrap_or_else(|| json!("")),
                "parameters": sanitize_tool_parameters(config, parameters),
            }
        }),
    ))
}

fn translate_messages(
    body: &Value,
    _tool_index: &[CompatToolDescriptor],
    allow_image_parts: bool,
) -> Vec<Value> {
    let mut messages = Vec::new();
    let mut pending_assistant = PendingAssistantMessage::default();
    if let Some(instructions) = body
        .get("instructions")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        messages.push(json!({ "role": "system", "content": instructions }));
    }

    let Some(input) = body.get("input").and_then(Value::as_array) else {
        return messages;
    };
    for item in input {
        match item.get("type").and_then(Value::as_str) {
            Some("reasoning") => {
                if let Some(text) = reasoning_item_text(item) {
                    pending_assistant.push_reasoning(text);
                }
            }
            Some("message") => {
                if let Some(message) = translate_message_item(item, allow_image_parts) {
                    match message.get("role").and_then(Value::as_str) {
                        Some("assistant") => pending_assistant
                            .push_content(message_content_text(message.get("content"))),
                        _ => {
                            flush_pending_assistant_message(&mut messages, &mut pending_assistant);
                            messages.push(message);
                        }
                    }
                }
            }
            Some("function_call") => {
                let Some(call_id) = item.get("call_id").and_then(Value::as_str) else {
                    continue;
                };
                let flat_name = flatten_tool_name(
                    item.get("namespace").and_then(Value::as_str),
                    item.get("name")
                        .and_then(Value::as_str)
                        .unwrap_or(SHELL_COMMAND_FLAT_NAME),
                );
                pending_assistant.tool_calls.push(tool_call_json(
                    call_id,
                    &flat_name,
                    item.get("arguments")
                        .and_then(Value::as_str)
                        .unwrap_or("{}"),
                ));
            }
            Some("tool_search_call") => {
                let Some(call_id) = item.get("call_id").and_then(Value::as_str) else {
                    continue;
                };
                let arguments = item.get("arguments").cloned().unwrap_or_else(|| json!({}));
                pending_assistant.tool_calls.push(tool_call_json(
                    call_id,
                    TOOL_SEARCH_FLAT_NAME,
                    &arguments.to_string(),
                ));
            }
            Some("local_shell_call") => {
                let Some(call_id) = item.get("call_id").and_then(Value::as_str) else {
                    continue;
                };
                pending_assistant.tool_calls.push(tool_call_json(
                    call_id,
                    SHELL_COMMAND_FLAT_NAME,
                    &item
                        .get("action")
                        .cloned()
                        .unwrap_or(Value::Null)
                        .to_string(),
                ));
            }
            Some("function_call_output") | Some("custom_tool_call_output") => {
                flush_pending_assistant_message(&mut messages, &mut pending_assistant);
                let Some(call_id) = item.get("call_id").and_then(Value::as_str) else {
                    continue;
                };
                let content = output_payload_text(item.get("output").unwrap_or(&Value::Null));
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": content,
                }));
            }
            Some("tool_search_output") => {
                flush_pending_assistant_message(&mut messages, &mut pending_assistant);
                let Some(call_id) = item.get("call_id").and_then(Value::as_str) else {
                    continue;
                };
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": json!({
                        "status": item.get("status").cloned().unwrap_or_else(|| json!("completed")),
                        "execution": item.get("execution").cloned().unwrap_or_else(|| json!("client")),
                        "tools": item.get("tools").cloned().unwrap_or_else(|| json!([])),
                    }).to_string(),
                }));
            }
            _ => {}
        }
    }

    flush_pending_assistant_message(&mut messages, &mut pending_assistant);
    messages
}

#[derive(Default)]
struct PendingAssistantMessage {
    content_parts: Vec<String>,
    reasoning_parts: Vec<String>,
    tool_calls: Vec<Value>,
}

impl PendingAssistantMessage {
    fn push_content(&mut self, content: Option<String>) {
        if let Some(content) = content.filter(|text| !text.trim().is_empty()) {
            self.content_parts.push(content);
        }
    }

    fn push_reasoning(&mut self, reasoning: String) {
        if !reasoning.trim().is_empty() {
            self.reasoning_parts.push(reasoning);
        }
    }

    fn take_message(&mut self) -> Option<Value> {
        if self.content_parts.is_empty()
            && self.reasoning_parts.is_empty()
            && self.tool_calls.is_empty()
        {
            return None;
        }

        let content = if self.content_parts.is_empty() {
            Value::Null
        } else {
            Value::String(self.content_parts.join("\n"))
        };
        let reasoning_content = if self.reasoning_parts.is_empty() {
            None
        } else {
            Some(self.reasoning_parts.join("\n"))
        };
        let tool_calls = std::mem::take(&mut self.tool_calls);
        self.content_parts.clear();
        self.reasoning_parts.clear();

        let mut message = json!({
            "role": "assistant",
            "content": content,
        });
        if !tool_calls.is_empty() {
            message
                .as_object_mut()
                .expect("assistant message is object")
                .insert("tool_calls".to_string(), Value::Array(tool_calls));
        }
        Some(attach_reasoning_content(message, reasoning_content))
    }
}

fn translate_message_item(item: &Value, allow_image_parts: bool) -> Option<Value> {
    let role = match item.get("role").and_then(Value::as_str)? {
        "developer" => "system",
        other => other,
    };
    let content = item.get("content").and_then(Value::as_array)?;
    if role == "user" {
        let parts = content
            .iter()
            .filter_map(|entry| match entry.get("type").and_then(Value::as_str) {
                Some("input_text") | Some("output_text") => entry
                    .get("text")
                    .and_then(Value::as_str)
                    .map(|text| json!({ "type": "text", "text": text })),
                Some("input_image") => {
                    if allow_image_parts {
                        entry.get("image_url").and_then(Value::as_str).map(|url| {
                            json!({
                                "type": "image_url",
                                "image_url": { "url": url },
                            })
                        })
                    } else {
                        Some(json!({
                            "type": "text",
                            "text": text_only_image_placeholder(),
                        }))
                    }
                }
                _ => None,
            })
            .collect::<Vec<_>>();
        if parts.is_empty() {
            return None;
        }
        if parts.len() == 1 && parts[0].get("type").and_then(Value::as_str) == Some("text") {
            if let Some(text) = parts[0].get("text").and_then(Value::as_str) {
                return Some(json!({ "role": role, "content": text }));
            }
        }
        return Some(json!({ "role": role, "content": parts }));
    }

    let text = content
        .iter()
        .filter_map(|entry| entry.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    if text.trim().is_empty() {
        None
    } else {
        Some(json!({ "role": role, "content": text }))
    }
}

fn text_only_image_placeholder() -> &'static str {
    "[Image omitted: this thread is currently being translated for a text-only model.]"
}

fn tool_call_json(call_id: &str, flat_name: &str, arguments: &str) -> Value {
    json!({
        "id": call_id,
        "type": "function",
        "function": {
            "name": flat_name,
            "arguments": arguments,
        }
    })
}

fn flush_pending_assistant_message(
    messages: &mut Vec<Value>,
    pending_assistant: &mut PendingAssistantMessage,
) {
    if let Some(message) = pending_assistant.take_message() {
        messages.push(message);
    }
}

fn build_responses_sse(
    completion: &Value,
    tool_index: &[CompatToolDescriptor],
) -> Result<String, String> {
    let response_id = completion
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("compat-response");
    let choice = completion
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .ok_or_else(|| "Upstream response did not include any choices.".to_string())?;
    let message = choice
        .get("message")
        .ok_or_else(|| "Upstream response did not include a message.".to_string())?;
    let model = completion.get("model").and_then(Value::as_str);

    let mut events = Vec::new();
    let mut created_response = Map::new();
    created_response.insert("id".to_string(), Value::String(response_id.to_string()));
    if let Some(model) = model {
        created_response.insert("headers".to_string(), json!({ "openai-model": model }));
    }
    events.push((
        "response.created",
        json!({ "type": "response.created", "response": created_response }),
    ));

    let reasoning_text = assistant_reasoning_text(message);
    if !reasoning_text.trim().is_empty() {
        let reasoning_id = format!("{response_id}-reasoning");
        events.push((
            "response.output_item.added",
            json!({
                "type": "response.output_item.added",
                "item": {
                    "type": "reasoning",
                    "id": reasoning_id,
                    "summary": [{ "type": "summary_text", "text": "" }],
                }
            }),
        ));
        events.push((
            "response.output_item.done",
            json!({
                "type": "response.output_item.done",
                "item": {
                    "type": "reasoning",
                    "id": reasoning_id,
                    "summary": [{ "type": "summary_text", "text": "" }],
                    "content": [{ "type": "reasoning_text", "text": reasoning_text }],
                }
            }),
        ));
    }

    let text = assistant_content_text(message.get("content"));
    if !text.trim().is_empty() {
        events.push((
            "response.output_item.done",
            json!({
                "type": "response.output_item.done",
                "item": {
                    "type": "message",
                    "role": "assistant",
                    "content": [{ "type": "output_text", "text": text }],
                }
            }),
        ));
    }

    let descriptor_by_name = tool_index
        .iter()
        .map(|descriptor| (descriptor.flat_name.as_str(), descriptor))
        .collect::<std::collections::HashMap<_, _>>();
    let tool_calls = message
        .get("tool_calls")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for tool_call in &tool_calls {
        let Some(function) = tool_call.get("function") else {
            continue;
        };
        let flat_name = function
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(SHELL_COMMAND_FLAT_NAME);
        let arguments = function
            .get("arguments")
            .map(|value| {
                value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string())
            })
            .unwrap_or_else(|| "{}".to_string());
        let call_id = tool_call
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("compat-call");

        let item = match descriptor_by_name.get(flat_name) {
            Some(CompatToolDescriptor {
                tool_type: CompatToolType::ToolSearch { execution },
                ..
            }) => json!({
                "type": "tool_search_call",
                "call_id": call_id,
                "execution": execution,
                "arguments": serde_json::from_str::<Value>(&arguments).unwrap_or_else(|_| json!({ "query": arguments })),
            }),
            Some(descriptor) => {
                let mut value = Map::new();
                value.insert(
                    "type".to_string(),
                    Value::String("function_call".to_string()),
                );
                value.insert("call_id".to_string(), Value::String(call_id.to_string()));
                value.insert("name".to_string(), Value::String(descriptor.name.clone()));
                value.insert("arguments".to_string(), Value::String(arguments));
                if let Some(namespace) = descriptor.namespace.as_ref() {
                    value.insert("namespace".to_string(), Value::String(namespace.clone()));
                }
                Value::Object(value)
            }
            None => json!({
                "type": "function_call",
                "call_id": call_id,
                "name": flat_name,
                "arguments": arguments,
            }),
        };
        events.push((
            "response.output_item.done",
            json!({
                "type": "response.output_item.done",
                "item": item,
            }),
        ));
    }

    let usage = usage_value(completion.get("usage"));
    let end_turn = tool_calls.is_empty();
    events.push((
        "response.completed",
        json!({
            "type": "response.completed",
            "response": {
                "id": response_id,
                "usage": usage,
                "end_turn": end_turn,
            }
        }),
    ));

    let mut payload = String::new();
    for (event_name, data) in events {
        payload.push_str("event: ");
        payload.push_str(event_name);
        payload.push('\n');
        payload.push_str("data: ");
        payload.push_str(&data.to_string());
        payload.push_str("\n\n");
    }
    Ok(payload)
}

fn usage_value(usage: Option<&Value>) -> Value {
    let Some(usage) = usage else {
        return Value::Null;
    };
    let input_tokens = usage
        .get("prompt_tokens")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let output_tokens = usage
        .get("completion_tokens")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let total_tokens = usage
        .get("total_tokens")
        .and_then(Value::as_i64)
        .unwrap_or(input_tokens + output_tokens);
    let cached_tokens = usage
        .get("prompt_tokens_details")
        .and_then(|details| details.get("cached_tokens"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let reasoning_tokens = usage
        .get("completion_tokens_details")
        .and_then(|details| details.get("reasoning_tokens"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    json!({
        "input_tokens": input_tokens,
        "input_tokens_details": { "cached_tokens": cached_tokens },
        "output_tokens": output_tokens,
        "output_tokens_details": { "reasoning_tokens": reasoning_tokens },
        "total_tokens": total_tokens,
    })
}

fn assistant_content_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| {
                item.get("text")
                    .and_then(Value::as_str)
                    .or_else(|| item.get("content").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Some(Value::Object(object)) => object
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

fn message_content_text(content: Option<&Value>) -> Option<String> {
    let text = assistant_content_text(content);
    (!text.trim().is_empty()).then_some(text)
}

fn assistant_reasoning_text(message: &Value) -> String {
    if let Some(text) = value_text(message.get("reasoning_content")) {
        return text;
    }
    if let Some(reasoning) = message.get("reasoning") {
        if let Some(text) = value_text(Some(reasoning)) {
            return text;
        }
    }
    String::new()
}

fn reasoning_item_text(item: &Value) -> Option<String> {
    let from_content = item
        .get("content")
        .and_then(Value::as_array)
        .map(|content| {
            content
                .iter()
                .filter_map(|entry| entry.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|text| !text.trim().is_empty());
    if from_content.is_some() {
        return from_content;
    }

    item.get("summary")
        .and_then(Value::as_array)
        .map(|summary| {
            summary
                .iter()
                .filter_map(|entry| entry.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|text| !text.trim().is_empty())
}

fn attach_reasoning_content(message: Value, reasoning_content: Option<String>) -> Value {
    let Some(reasoning_content) = reasoning_content.filter(|text| !text.trim().is_empty()) else {
        return message;
    };
    let mut object = match message {
        Value::Object(object) => object,
        other => return other,
    };
    object.insert(
        "reasoning_content".to_string(),
        Value::String(reasoning_content),
    );
    Value::Object(object)
}

fn value_text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(text)) => Some(text.clone()),
        Some(Value::Array(items)) => {
            let text = items
                .iter()
                .filter_map(|item| {
                    item.get("text")
                        .and_then(Value::as_str)
                        .or_else(|| item.get("content").and_then(Value::as_str))
                })
                .collect::<Vec<_>>()
                .join("\n");
            (!text.trim().is_empty()).then_some(text)
        }
        Some(Value::Object(object)) => object
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|text| !text.trim().is_empty()),
        Some(Value::Null) | None => None,
        Some(other) => {
            let text = other.to_string();
            (!text.trim().is_empty()).then_some(text)
        }
    }
}

fn output_payload_text(output: &Value) -> String {
    let text = match output {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(object) => object
            .get("content")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| output.to_string()),
        Value::Null => String::new(),
        _ => output.to_string(),
    };
    truncate_compat_tool_output(&text)
}

fn sse_failed_from_upstream(status: StatusCode, body: &str) -> String {
    let error = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| value.get("error").cloned())
        .unwrap_or_else(|| {
            json!({
                "code": format!("upstream_http_{}", status.as_u16()),
                "message": if body.trim().is_empty() {
                    format!("Upstream request failed with status {status}.")
                } else {
                    body.to_string()
                }
            })
        });
    let payload = json!({
        "type": "response.failed",
        "response": {
            "id": "compat-failed",
            "error": error,
        }
    });
    format!("event: response.failed\ndata: {payload}\n\n")
}

fn sse_failed_payload(code: &str, message: &str) -> String {
    let payload = json!({
        "type": "response.failed",
        "response": {
            "id": "compat-failed",
            "error": {
                "code": code,
                "message": message,
            }
        }
    });
    format!("event: response.failed\ndata: {payload}\n\n")
}

fn sse_response(body: String, model: Option<&str>) -> Response {
    let mut response = body.into_response();
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/event-stream"),
    );
    if let Some(model) = model {
        if let Ok(value) = HeaderValue::from_str(model) {
            response.headers_mut().insert("openai-model", value);
        }
    }
    response
}

fn json_error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

fn join_url(base_url: &str, path: &str) -> String {
    let base_url = base_url.trim_end_matches('/');
    format!("{base_url}/{path}")
}

fn flatten_tool_name(namespace: Option<&str>, name: &str) -> String {
    let raw = if let Some(namespace) = namespace.filter(|value| !value.trim().is_empty()) {
        format!("{namespace}__{name}")
    } else {
        name.to_string()
    };
    sanitize_function_name(&raw)
}

fn sanitize_function_name(raw: &str) -> String {
    let sanitized = raw
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    if sanitized.is_empty() {
        "tool".to_string()
    } else {
        sanitized.chars().take(64).collect()
    }
}

fn fallback_models(config: &ModelProviderCompatSettings) -> Vec<Value> {
    default_model_candidates(config.kind)
        .into_iter()
        .enumerate()
        .map(|(priority, slug)| model_info_json(config, slug, slug, priority as i32 + 1))
        .collect()
}

fn model_info_json(
    config: &ModelProviderCompatSettings,
    slug: &str,
    display_name: &str,
    priority: i32,
) -> Value {
    let capabilities = compat_capabilities(config, Some(slug));
    json!({
        "slug": slug,
        "display_name": display_name,
        "description": "Compatible provider routed through CodexStudy.",
        "supported_reasoning_levels": [],
        "shell_type": "unified_exec",
        "visibility": "list",
        "supported_in_api": true,
        "priority": priority,
        "availability_nux": null,
        "upgrade": null,
        "base_instructions": "default",
        "model_messages": null,
        "supports_reasoning_summaries": false,
        "default_reasoning_summary": "auto",
        "support_verbosity": false,
        "default_verbosity": null,
        "apply_patch_tool_type": null,
        "truncation_policy": {
            "mode": "bytes",
            "limit": 10000,
        },
        "supports_parallel_tool_calls": true,
        "supports_image_detail_original": false,
        "context_window": null,
        "auto_compact_token_limit": null,
        "effective_context_window_percent": 95,
        "experimental_supported_tools": [],
        "input_modalities": capabilities.input_modalities,
        "supports_search_tool": capabilities.supports_search_tool,
    })
}

pub(crate) fn compat_capabilities(
    config: &ModelProviderCompatSettings,
    model_slug: Option<&str>,
) -> CompatCapabilities {
    if let Some(supports_image_input) = config.supports_image_input {
        return CompatCapabilities {
            input_modalities: if supports_image_input {
                TEXT_AND_IMAGE_MODALITIES
            } else {
                TEXT_ONLY_MODALITIES
            },
            supports_search_tool: false,
        };
    }

    let supports_image_input = match config.kind {
        ModelProviderCompatKind::DeepSeek => false,
        ModelProviderCompatKind::Qwen => model_slug.is_some_and(qwen_supports_image_input),
        ModelProviderCompatKind::Doubao => model_slug.is_some_and(doubao_supports_image_input),
        ModelProviderCompatKind::Zhipu => model_slug.is_some_and(zhipu_supports_image_input),
        ModelProviderCompatKind::Moonshot => model_slug.is_some_and(moonshot_supports_image_input),
        ModelProviderCompatKind::Baichuan => model_slug.is_some_and(baichuan_supports_image_input),
        ModelProviderCompatKind::Minimax => model_slug.is_some_and(minimax_supports_image_input),
        ModelProviderCompatKind::Ollama | ModelProviderCompatKind::LmStudio => {
            model_slug.is_some_and(local_model_supports_image_input)
        }
    };

    CompatCapabilities {
        input_modalities: if supports_image_input {
            TEXT_AND_IMAGE_MODALITIES
        } else {
            TEXT_ONLY_MODALITIES
        },
        supports_search_tool: false,
    }
}

pub(crate) fn compat_kind_label(kind: ModelProviderCompatKind) -> &'static str {
    match kind {
        ModelProviderCompatKind::DeepSeek => "DeepSeek",
        ModelProviderCompatKind::Qwen => "Qwen",
        ModelProviderCompatKind::Doubao => "Doubao",
        ModelProviderCompatKind::Zhipu => "Zhipu",
        ModelProviderCompatKind::Moonshot => "Moonshot",
        ModelProviderCompatKind::Baichuan => "Baichuan",
        ModelProviderCompatKind::Minimax => "MiniMax",
        ModelProviderCompatKind::Ollama => "Ollama",
        ModelProviderCompatKind::LmStudio => "LM Studio",
    }
}

pub(crate) fn compat_supports_image_input(
    config: &ModelProviderCompatSettings,
    model_slug: Option<&str>,
) -> bool {
    compat_capabilities(config, model_slug)
        .input_modalities
        .contains(&"image")
}

fn default_model_slug(kind: ModelProviderCompatKind) -> &'static str {
    default_model_candidates(kind)
        .first()
        .copied()
        .unwrap_or("assistant")
}

fn default_model_candidates(kind: ModelProviderCompatKind) -> &'static [&'static str] {
    match kind {
        ModelProviderCompatKind::DeepSeek => &["deepseek-chat", "deepseek-reasoner"],
        ModelProviderCompatKind::Qwen => &["qwen-plus", "qwen-max"],
        ModelProviderCompatKind::Doubao => &[
            "doubao-1.5-thinking-pro-250415",
            "doubao-1.5-pro-32k-250115",
        ],
        ModelProviderCompatKind::Zhipu => &["glm-4-flash", "glm-4-plus"],
        ModelProviderCompatKind::Moonshot => &["moonshot-v1-8k", "moonshot-v1-32k"],
        ModelProviderCompatKind::Baichuan => &["Baichuan4-Turbo", "Baichuan3-Turbo"],
        ModelProviderCompatKind::Minimax => &["MiniMax-Text-01", "MiniMax-M1"],
        ModelProviderCompatKind::Ollama => &["qwen2.5-coder", "llama3.1"],
        ModelProviderCompatKind::LmStudio => &["local-model", "assistant"],
    }
}

fn slug_contains_any(slug: &str, patterns: &[&str]) -> bool {
    let slug = slug.to_ascii_lowercase();
    patterns.iter().any(|pattern| slug.contains(pattern))
}

fn qwen_supports_image_input(slug: &str) -> bool {
    slug_contains_any(
        slug,
        &[
            "qwen-vl",
            "qwen2-vl",
            "qwen2.5-vl",
            "qwen3-vl",
            "qvq",
            "omni",
        ],
    ) || slug.eq_ignore_ascii_case("qwen3.5-plus")
        || slug.eq_ignore_ascii_case("qwen3.5-plus-latest")
}

fn doubao_supports_image_input(slug: &str) -> bool {
    slug_contains_any(
        slug,
        &["vision", "seed-code", "seed-2.0-lite", "doubao-1.5-vision"],
    )
}

fn zhipu_supports_image_input(slug: &str) -> bool {
    slug_contains_any(
        slug,
        &["glm-4v", "glm-4.1v", "glm-4.5v", "glm-4.6v", "vision"],
    )
}

fn moonshot_supports_image_input(slug: &str) -> bool {
    slug_contains_any(slug, &["vision", "kimi-k2.5", "kimi-k2.6"])
}

fn baichuan_supports_image_input(slug: &str) -> bool {
    slug_contains_any(slug, &["vision", "vl"])
}

fn minimax_supports_image_input(slug: &str) -> bool {
    slug_contains_any(slug, &["vision", "vl", "image"])
}

fn local_model_supports_image_input(slug: &str) -> bool {
    slug_contains_any(
        slug,
        &[
            "llava",
            "vision",
            "minicpm-v",
            "qwen2-vl",
            "qwen2.5-vl",
            "qwen3-vl",
            "glm-4v",
            "internvl",
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translate_messages_attaches_reasoning_to_following_tool_call() {
        let body = json!({
            "input": [
                {
                    "type": "reasoning",
                    "summary": [{"type": "summary_text", "text": "brief"}],
                    "content": [{"type": "reasoning_text", "text": "full chain"}]
                },
                {
                    "type": "function_call",
                    "call_id": "call_123",
                    "name": "shell_command",
                    "arguments": "{\"command\":\"pwd\"}"
                }
            ]
        });

        let messages = translate_messages(&body, &[], false);
        assert_eq!(messages.len(), 1);
        assert_eq!(
            messages[0].get("reasoning_content").and_then(Value::as_str),
            Some("full chain")
        );
    }

    #[test]
    fn translate_messages_groups_consecutive_tool_calls_before_tool_outputs() {
        let body = json!({
            "input": [
                {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "shell_command",
                    "arguments": "{\"command\":\"pwd\"}"
                },
                {
                    "type": "function_call",
                    "call_id": "call_2",
                    "name": "shell_command",
                    "arguments": "{\"command\":\"ls\"}"
                },
                {
                    "type": "function_call_output",
                    "call_id": "call_1",
                    "output": "h:/repo"
                },
                {
                    "type": "function_call_output",
                    "call_id": "call_2",
                    "output": "file.txt"
                }
            ]
        });

        let messages = translate_messages(&body, &[], false);
        assert_eq!(messages.len(), 3);
        assert_eq!(
            messages[0].get("role").and_then(Value::as_str),
            Some("assistant")
        );
        assert_eq!(
            messages[0]
                .get("tool_calls")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(2)
        );
        assert_eq!(
            messages[1].get("role").and_then(Value::as_str),
            Some("tool")
        );
        assert_eq!(
            messages[1].get("tool_call_id").and_then(Value::as_str),
            Some("call_1")
        );
        assert_eq!(
            messages[2].get("tool_call_id").and_then(Value::as_str),
            Some("call_2")
        );
    }

    #[test]
    fn translate_messages_merges_assistant_text_reasoning_and_tool_calls() {
        let body = json!({
            "input": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{ "type": "output_text", "text": "Let me inspect that." }]
                },
                {
                    "type": "reasoning",
                    "content": [{ "type": "reasoning_text", "text": "need two commands" }]
                },
                {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "shell_command",
                    "arguments": "{\"command\":\"pwd\"}"
                },
                {
                    "type": "function_call",
                    "call_id": "call_2",
                    "name": "shell_command",
                    "arguments": "{\"command\":\"ls\"}"
                }
            ]
        });

        let messages = translate_messages(&body, &[], false);
        assert_eq!(messages.len(), 1);
        assert_eq!(
            messages[0].get("role").and_then(Value::as_str),
            Some("assistant")
        );
        assert_eq!(
            messages[0].get("content").and_then(Value::as_str),
            Some("Let me inspect that.")
        );
        assert_eq!(
            messages[0].get("reasoning_content").and_then(Value::as_str),
            Some("need two commands")
        );
        assert_eq!(
            messages[0]
                .get("tool_calls")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(2)
        );
    }

    #[test]
    fn translate_messages_rewrites_user_images_for_text_only_models() {
        let body = json!({
            "input": [{
                "type": "message",
                "role": "user",
                "content": [
                    { "type": "input_text", "text": "看一下这张图" },
                    { "type": "input_image", "image_url": "data:image/png;base64,AAA" }
                ]
            }]
        });

        let messages = translate_messages(&body, &[], false);
        assert_eq!(messages.len(), 1);
        assert_eq!(
            messages[0].get("role").and_then(Value::as_str),
            Some("user")
        );
        let parts = messages[0]
            .get("content")
            .and_then(Value::as_array)
            .expect("user content array");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].get("type").and_then(Value::as_str), Some("text"));
        assert_eq!(parts[1].get("type").and_then(Value::as_str), Some("text"));
        assert_eq!(
            parts[1].get("text").and_then(Value::as_str),
            Some(text_only_image_placeholder())
        );
    }

    #[test]
    fn translate_messages_keeps_user_images_for_vision_models() {
        let body = json!({
            "input": [{
                "type": "message",
                "role": "user",
                "content": [
                    { "type": "input_text", "text": "看一下这张图" },
                    { "type": "input_image", "image_url": "data:image/png;base64,AAA" }
                ]
            }]
        });

        let messages = translate_messages(&body, &[], true);
        assert_eq!(messages.len(), 1);
        let parts = messages[0]
            .get("content")
            .and_then(Value::as_array)
            .expect("user content array");
        assert_eq!(parts.len(), 2);
        assert_eq!(
            parts[1].get("type").and_then(Value::as_str),
            Some("image_url")
        );
    }

    #[test]
    fn build_responses_sse_emits_reasoning_item_when_upstream_supplies_it() {
        let completion = json!({
            "id": "resp_123",
            "model": "deepseek-v4-pro",
            "choices": [{
                "message": {
                    "reasoning_content": "step by step",
                    "content": "done"
                }
            }]
        });

        let payload = build_responses_sse(&completion, &[]).expect("sse payload");
        assert!(payload.contains("\"type\":\"response.output_item.added\""));
        assert!(payload.contains("\"type\":\"reasoning\""));
        assert!(payload.contains("step by step"));
        assert!(payload.contains("\"text\":\"done\""));
    }

    #[test]
    fn build_chat_completions_request_copies_common_controls() {
        let config = ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::DeepSeek,
            upstream_base_url: "https://api.deepseek.com/v1".to_string(),
            supports_image_input: None,
        };
        let body = json!({
            "model": "deepseek-v4-flash",
            "input": [{
                "type": "message",
                "role": "user",
                "content": [{ "type": "input_text", "text": "hello" }]
            }],
            "top_p": 0.8,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.2,
            "stop": ["DONE"],
            "seed": 7,
            "tool_choice": "auto",
            "response_format": { "type": "json_object" },
            "max_output_tokens": 1234
        });

        let (request, _) = build_chat_completions_request(&config, &body).expect("request");
        assert_eq!(request["top_p"], json!(0.8));
        assert_eq!(request["presence_penalty"], json!(0.1));
        assert_eq!(request["frequency_penalty"], json!(0.2));
        assert_eq!(request["stop"], json!(["DONE"]));
        assert_eq!(request["seed"], json!(7));
        assert_eq!(request["tool_choice"], json!("auto"));
        assert_eq!(request["response_format"], json!({ "type": "json_object" }));
        assert_eq!(request["max_completion_tokens"], json!(1234));
    }

    #[test]
    fn model_info_json_is_conservative_about_image_input() {
        let model = model_info_json(
            &ModelProviderCompatSettings {
                kind: ModelProviderCompatKind::DeepSeek,
                upstream_base_url: "https://api.deepseek.com/v1".to_string(),
                supports_image_input: None,
            },
            "deepseek-v4-flash",
            "deepseek-v4-flash",
            1,
        );
        assert_eq!(model["input_modalities"], json!(["text"]));
    }

    #[test]
    fn model_info_json_marks_qwen_vl_models_as_image_capable() {
        let model = model_info_json(
            &ModelProviderCompatSettings {
                kind: ModelProviderCompatKind::Qwen,
                upstream_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
                supports_image_input: None,
            },
            "qwen2.5-vl-72b-instruct",
            "qwen2.5-vl-72b-instruct",
            1,
        );
        assert_eq!(model["input_modalities"], json!(["text", "image"]));
    }

    #[test]
    fn build_chat_completions_request_rewrites_image_input_for_text_only_compat() {
        let config = ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::DeepSeek,
            upstream_base_url: "https://api.deepseek.com/v1".to_string(),
            supports_image_input: None,
        };
        let body = json!({
            "model": "deepseek-v4-flash",
            "input": [{
                "type": "message",
                "role": "user",
                "content": [{ "type": "input_image", "image_url": "data:image/png;base64,abc" }]
            }]
        });

        let (request, _) = build_chat_completions_request(&config, &body).expect("request");
        let messages = request["messages"].as_array().expect("messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(
            messages[0]["content"].as_str(),
            Some(text_only_image_placeholder())
        );
    }

    #[test]
    fn build_chat_completions_request_allows_image_input_for_doubao_vision_models() {
        let config = ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::Doubao,
            upstream_base_url: "https://ark.cn-beijing.volces.com/api/v3".to_string(),
            supports_image_input: None,
        };
        let body = json!({
            "model": "doubao-1.5-vision-pro-250328",
            "input": [{
                "type": "message",
                "role": "user",
                "content": [{
                    "type": "input_image",
                    "image_url": "data:image/png;base64,abc"
                }]
            }]
        });

        let (request, _) = build_chat_completions_request(&config, &body).expect("request");
        assert_eq!(request["model"], json!("doubao-1.5-vision-pro-250328"));
    }
}
