use serde::Deserialize;
use serde::Serialize;

use crate::runtime_selector::AgentEngine;

/// Model capability metadata used by the runtime selector.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapability {
    pub tool_call_reliable: bool,
    pub supports_responses_api: bool,
    pub max_context_tokens: usize,
    pub recommended_engine: AgentEngine,
    #[serde(default)]
    pub input_modalities: Vec<String>,
}

pub fn get_model_capability(model_name: &str) -> ModelCapability {
    let normalized = model_name.trim().to_ascii_lowercase();

    if normalized.contains("claude") {
        return ModelCapability {
            tool_call_reliable: true,
            supports_responses_api: true,
            max_context_tokens: 200_000,
            recommended_engine: AgentEngine::CodexCore,
            input_modalities: vec!["text".into(), "image".into()],
        };
    }

    if normalized.contains("gpt-4") || normalized.contains("gpt-5") || normalized.contains("o1") {
        return ModelCapability {
            tool_call_reliable: true,
            supports_responses_api: false,
            max_context_tokens: 128_000,
            recommended_engine: AgentEngine::CodexCore,
            input_modalities: vec!["text".into(), "image".into()],
        };
    }

    if normalized.contains("qwen")
        || normalized.contains("deepseek")
        || normalized.contains("glm")
        || normalized.contains("doubao")
        || normalized.contains("moonshot")
        || normalized.contains("baichuan")
        || normalized.contains("minimax")
    {
        return ModelCapability {
            tool_call_reliable: false,
            supports_responses_api: false,
            max_context_tokens: 65_536,
            recommended_engine: AgentEngine::ChatAgent,
            input_modalities: vec!["text".into()],
        };
    }

    ModelCapability {
        tool_call_reliable: false,
        supports_responses_api: false,
        max_context_tokens: 32_768,
        recommended_engine: AgentEngine::ChatAgent,
        input_modalities: vec!["text".into()],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qwen_defaults_to_chat_agent() {
        let cap = get_model_capability("qwen-plus");
        assert!(!cap.tool_call_reliable);
        assert_eq!(cap.recommended_engine, AgentEngine::ChatAgent);
    }
}
