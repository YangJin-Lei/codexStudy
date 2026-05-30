use serde::Deserialize;

use crate::error::ChatAgentError;
use crate::error::Result;
use crate::protocol::Action;
use crate::protocol::PlannerTurn;

#[derive(Debug, Deserialize)]
struct RawPlannerResponse {
    thought: String,
    action: Action,
}

/// Extract JSON from model text (strip markdown fences if present).
pub fn extract_json_payload(text: &str) -> &str {
    let trimmed = text.trim();
    if trimmed.starts_with("```") {
        let without_open = trimmed
            .trim_start_matches('`')
            .trim_start_matches("json")
            .trim_start_matches('\n');
        if let Some(end) = without_open.rfind("```") {
            return without_open[..end].trim();
        }
    }
    trimmed
}

pub fn parse_planner_response(text: &str) -> Result<PlannerTurn> {
    let payload = extract_json_payload(text);
    let raw: RawPlannerResponse = serde_json::from_str(payload)
        .map_err(|error| ChatAgentError::Parse(format!("invalid JSON: {error}")))?;

    if raw.thought.trim().is_empty() {
        return Err(ChatAgentError::Parse("missing thought".into()));
    }

    Ok(PlannerTurn {
        thought: raw.thought.trim().to_string(),
        action: raw.action,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Action;
    use pretty_assertions::assert_eq;

    #[test]
    fn parses_fenced_json() {
        let text = r#"```json
{"thought":"read first","action":{"type":"read_file","path":"README.md"}}
```"#;
        let turn = parse_planner_response(text).unwrap();
        assert_eq!(
            turn.action,
            Action::ReadFile {
                path: "README.md".into(),
                line_start: None,
                line_end: None,
            }
        );
    }
}
