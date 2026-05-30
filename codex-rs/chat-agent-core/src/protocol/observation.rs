use serde::Deserialize;
use serde::Serialize;

/// Unified observation returned to the model after executing an action.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Observation {
    pub action_type: String,
    pub ok: bool,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub artifacts: Vec<Artifact>,
}

impl Observation {
    pub fn success(action_type: &str, summary: impl Into<String>) -> Self {
        Self {
            action_type: action_type.to_string(),
            ok: true,
            summary: summary.into(),
            details: None,
            artifacts: Vec::new(),
        }
    }

    pub fn failure(action_type: &str, summary: impl Into<String>) -> Self {
        Self {
            action_type: action_type.to_string(),
            ok: false,
            summary: summary.into(),
            details: None,
            artifacts: Vec::new(),
        }
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }

    pub fn with_artifacts(mut self, artifacts: Vec<Artifact>) -> Self {
        self.artifacts = artifacts;
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub kind: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}
