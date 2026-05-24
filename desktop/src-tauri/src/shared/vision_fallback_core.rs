use reqwest::Client;
use serde_json::{json, Value};

use crate::shared::codex_core::read_image_as_data_url_core;
use crate::types::{VisionFallbackPreset, VisionFallbackSettings};

const VISION_SYSTEM_PROMPT: &str = "You are a vision preprocessor for a downstream text-only coding assistant. Describe the attached images faithfully and compactly. Prioritize OCR text, UI labels, code, logs, tables, diagrams, and anything directly relevant to the user's request. Do not invent unreadable details. Respond in markdown with sections titled Summary, OCR, and Notable details.";

pub(crate) fn vision_fallback_is_ready(settings: Option<&VisionFallbackSettings>) -> bool {
    settings.is_some_and(|settings| {
        settings.enabled
            && !resolved_base_url(settings).is_empty()
            && !resolved_model(settings).is_empty()
            && settings
                .api_key
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
    })
}

pub(crate) fn merge_vision_analysis_into_text(
    original_text: &str,
    analysis: &str,
    settings: &VisionFallbackSettings,
) -> String {
    let trimmed_text = original_text.trim();
    let provider_label = vision_provider_label(&settings.preset);
    if trimmed_text.is_empty() {
        return format!(
            "The user attached image input. The selected main model is text-only, so the image was first analyzed with the configured vision fallback ({provider_label} / {}). Use the analysis below as the visual source of truth.\n\n[Vision analysis]\n{}",
            resolved_model(settings),
            analysis.trim()
        );
    }

    format!(
        "{trimmed_text}\n\n[Vision fallback context from {provider_label} / {}]\n{}\n\nUse the vision fallback context above as additional image-derived evidence. If a detail is uncertain or unreadable, say so plainly.",
        resolved_model(settings),
        analysis.trim()
    )
}

pub(crate) async fn analyze_images_with_fallback(
    settings: &VisionFallbackSettings,
    text: &str,
    images: &[String],
) -> Result<String, String> {
    let api_key = settings
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "Vision fallback is enabled, but no API key is configured. Open Settings > Codex > Vision fallback.".to_string()
        })?;

    let normalized_images = images
        .iter()
        .map(|image| normalize_image_for_vision(image))
        .collect::<Result<Vec<_>, _>>()?;
    if normalized_images.is_empty() {
        return Err("No valid images were available for the vision fallback request.".to_string());
    }

    let mut content = vec![json!({
        "type": "text",
        "text": build_user_prompt(text, normalized_images.len()),
    })];
    for image in normalized_images {
        content.push(json!({
            "type": "image_url",
            "image_url": { "url": image },
        }));
    }

    let body = json!({
        "model": resolved_model(settings),
        "messages": [
            { "role": "system", "content": VISION_SYSTEM_PROMPT },
            { "role": "user", "content": content }
        ],
        "temperature": 0.1,
        "stream": false
    });

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Failed to initialize the vision fallback client: {error}"))?;
    let body_bytes = serde_json::to_vec(&body)
        .map_err(|error| format!("Failed to serialize the vision fallback request: {error}"))?;
    let response = client
        .post(chat_completions_url(resolved_base_url(settings).as_str()))
        .header("content-type", "application/json")
        .bearer_auth(api_key)
        .body(body_bytes)
        .send()
        .await
        .map_err(|error| format!("Vision fallback request failed: {error}"))?;

    let status = response.status();
    let payload_text = response
        .text()
        .await
        .map_err(|error| format!("Vision fallback returned an unreadable response: {error}"))?;
    let payload = serde_json::from_str::<Value>(&payload_text).map_err(|error| {
        format!("Vision fallback returned an unreadable JSON response: {error}")
    })?;
    if !status.is_success() {
        return Err(format!(
            "Vision fallback request failed with {}: {}",
            status.as_u16(),
            extract_error_message(&payload)
        ));
    }

    extract_completion_text(&payload).ok_or_else(|| {
        "Vision fallback returned no text content. Try a different vision model or provider."
            .to_string()
    })
}

fn build_user_prompt(text: &str, image_count: usize) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return format!(
            "The user attached {image_count} image(s) without extra text. Analyze them for a downstream text-only coding assistant. Keep the answer concise but high-signal."
        );
    }
    format!(
        "User request: {trimmed}\n\nThe user attached {image_count} image(s). Analyze them for a downstream text-only coding assistant. Keep the answer concise but high-signal."
    )
}

fn normalize_image_for_vision(image: &str) -> Result<String, String> {
    let trimmed = image.trim();
    if trimmed.is_empty() {
        return Err("Encountered an empty image reference.".to_string());
    }
    if trimmed.starts_with("data:")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
    {
        return Ok(trimmed.to_string());
    }
    read_image_as_data_url_core(trimmed)
}

fn chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn resolved_base_url(settings: &VisionFallbackSettings) -> String {
    if settings.base_url.trim().is_empty() {
        default_base_url(&settings.preset).to_string()
    } else {
        settings.base_url.trim().to_string()
    }
}

fn resolved_model(settings: &VisionFallbackSettings) -> String {
    if settings.model.trim().is_empty() {
        default_model(&settings.preset).to_string()
    } else {
        settings.model.trim().to_string()
    }
}

fn default_base_url(preset: &VisionFallbackPreset) -> &'static str {
    match preset {
        VisionFallbackPreset::Doubao => "https://ark.cn-beijing.volces.com/api/v3",
        VisionFallbackPreset::Qwen => "https://dashscope.aliyuncs.com/compatible-mode/v1",
        VisionFallbackPreset::Zhipu => "https://open.bigmodel.cn/api/paas/v4",
        VisionFallbackPreset::Moonshot => "https://api.moonshot.cn/v1",
        VisionFallbackPreset::Baichuan => "https://api.baichuan-ai.com/v1",
        VisionFallbackPreset::Minimax => "https://api.minimax.chat/v1",
    }
}

fn default_model(preset: &VisionFallbackPreset) -> &'static str {
    match preset {
        VisionFallbackPreset::Doubao => "doubao-1.5-vision-pro-32k-250115",
        VisionFallbackPreset::Qwen => "qwen-vl-max-latest",
        VisionFallbackPreset::Zhipu => "glm-4.1v-thinking-flashx",
        VisionFallbackPreset::Moonshot => "kimi-k2.5-vision-preview",
        VisionFallbackPreset::Baichuan => "Baichuan4-Vision",
        VisionFallbackPreset::Minimax => "MiniMax-VL-01",
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
    let array = message.get("content")?.as_array()?;
    let text = array
        .iter()
        .filter_map(|entry| match entry.get("type").and_then(Value::as_str) {
            Some("text") => entry.get("text").and_then(Value::as_str),
            Some("output_text") => entry.get("text").and_then(Value::as_str),
            _ => None,
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn extract_error_message(payload: &Value) -> String {
    payload
        .get("error")
        .and_then(|error| {
            error
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| error.get("msg").and_then(Value::as_str))
        })
        .or_else(|| payload.get("message").and_then(Value::as_str))
        .unwrap_or("unknown upstream error")
        .trim()
        .to_string()
}

fn vision_provider_label(preset: &VisionFallbackPreset) -> &'static str {
    match preset {
        VisionFallbackPreset::Doubao => "Doubao",
        VisionFallbackPreset::Qwen => "Qwen",
        VisionFallbackPreset::Zhipu => "Zhipu",
        VisionFallbackPreset::Moonshot => "Kimi",
        VisionFallbackPreset::Baichuan => "Baichuan",
        VisionFallbackPreset::Minimax => "MiniMax",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_requires_toggle_model_key_and_base_url() {
        let settings = VisionFallbackSettings {
            enabled: true,
            preset: VisionFallbackPreset::Doubao,
            base_url: "https://example.com/v1".to_string(),
            model: "vision-model".to_string(),
            api_key: Some("sk-test".to_string()),
        };
        assert!(vision_fallback_is_ready(Some(&settings)));
        assert!(!vision_fallback_is_ready(None));
    }

    #[test]
    fn merge_keeps_original_prompt_and_notes_provider() {
        let settings = VisionFallbackSettings {
            enabled: true,
            preset: VisionFallbackPreset::Qwen,
            base_url: "https://example.com/v1".to_string(),
            model: "qwen-vl".to_string(),
            api_key: Some("sk-test".to_string()),
        };
        let merged = merge_vision_analysis_into_text("Fix the UI bug", "Summary\n...", &settings);
        assert!(merged.contains("Fix the UI bug"));
        assert!(merged.contains("Qwen / qwen-vl"));
        assert!(merged.contains("[Vision fallback context"));
    }
}
