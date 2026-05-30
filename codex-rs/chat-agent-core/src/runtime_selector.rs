use serde::Deserialize;
use serde::Serialize;

use crate::session::get_model_capability;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentEngine {
    CodexCore,
    ChatAgent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum EnginePreference {
    #[default]
    Auto,
    CodexCore,
    ChatAgent,
    /// Chat Agent planner with tool execution delegated to Codex-aligned runtime.
    Hybrid,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TaskRequirements {
    pub needs_mcp: bool,
    pub needs_skills: bool,
    pub needs_multi_agent: bool,
    pub wants_step_cards: bool,
    pub wants_full_codex_features: bool,
}

/// Select which agent engine should handle a task.
pub fn select_engine(
    preference: EnginePreference,
    model_name: &str,
    requirements: &TaskRequirements,
) -> AgentEngine {
    match preference {
        EnginePreference::CodexCore => return AgentEngine::CodexCore,
        EnginePreference::ChatAgent => return AgentEngine::ChatAgent,
        EnginePreference::Hybrid => return AgentEngine::ChatAgent,
        EnginePreference::Auto => {}
    }

    if requirements.needs_mcp || requirements.needs_skills || requirements.needs_multi_agent {
        return AgentEngine::CodexCore;
    }

    let capability = get_model_capability(model_name);

    if !capability.tool_call_reliable && !requirements.wants_full_codex_features {
        return AgentEngine::ChatAgent;
    }

    if capability.supports_responses_api && capability.tool_call_reliable {
        return AgentEngine::CodexCore;
    }

    if requirements.wants_step_cards {
        return AgentEngine::ChatAgent;
    }

    if requirements.wants_full_codex_features {
        return AgentEngine::CodexCore;
    }

    capability.recommended_engine
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_requirement_forces_codex_core() {
        let engine = select_engine(
            EnginePreference::Auto,
            "qwen-plus",
            &TaskRequirements {
                needs_mcp: true,
                ..TaskRequirements::default()
            },
        );
        assert_eq!(engine, AgentEngine::CodexCore);
    }

    #[test]
    fn user_preference_overrides_auto() {
        let engine = select_engine(
            EnginePreference::ChatAgent,
            "claude-3-5-sonnet",
            &TaskRequirements::default(),
        );
        assert_eq!(engine, AgentEngine::ChatAgent);
    }
}
