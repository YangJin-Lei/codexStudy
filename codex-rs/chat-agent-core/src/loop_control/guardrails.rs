use serde::Deserialize;
use serde::Serialize;

use crate::protocol::Action;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailsConfig {
    pub max_turns: u32,
    pub max_identical_actions: u32,
    pub max_consecutive_failures: u32,
    pub max_edits_per_file: u32,
}

impl Default for GuardrailsConfig {
    fn default() -> Self {
        Self {
            max_turns: 20,
            max_identical_actions: 3,
            max_consecutive_failures: 2,
            max_edits_per_file: 5,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuardrailAction {
    Continue,
    ForceAskUser { reason: String },
    ForceFinalize { reason: String },
}

pub struct Guardrails {
    config: GuardrailsConfig,
    turn_count: u32,
    last_fingerprint: Option<String>,
    identical_count: u32,
    consecutive_failures: u32,
    file_edit_counts: std::collections::HashMap<String, u32>,
}

impl Guardrails {
    pub fn new(config: GuardrailsConfig) -> Self {
        Self {
            config,
            turn_count: 0,
            last_fingerprint: None,
            identical_count: 0,
            consecutive_failures: 0,
            file_edit_counts: std::collections::HashMap::new(),
        }
    }

    pub fn record_turn(&mut self, action: &Action, observation_ok: bool) {
        self.turn_count += 1;
        let fingerprint = action.fingerprint();
        if self.last_fingerprint.as_deref() == Some(fingerprint.as_str()) {
            self.identical_count += 1;
        } else {
            self.identical_count = 1;
            self.last_fingerprint = Some(fingerprint);
        }

        if observation_ok {
            self.consecutive_failures = 0;
        } else {
            self.consecutive_failures += 1;
        }

        if let Action::EditFile { path, .. } = action {
            *self.file_edit_counts.entry(path.clone()).or_insert(0) += 1;
        }
    }

    pub fn check(&self, action: &Action) -> GuardrailAction {
        if self.turn_count >= self.config.max_turns {
            return GuardrailAction::ForceFinalize {
                reason: format!("Reached max turns ({})", self.config.max_turns),
            };
        }

        if self.identical_count >= self.config.max_identical_actions {
            return GuardrailAction::ForceAskUser {
                reason: "Repeated identical action".into(),
            };
        }

        if self.consecutive_failures >= self.config.max_consecutive_failures {
            return GuardrailAction::ForceAskUser {
                reason: "Too many consecutive failures; consider a different approach".into(),
            };
        }

        if let Action::EditFile { path, .. } = action {
            if self
                .file_edit_counts
                .get(path)
                .is_some_and(|count| *count >= self.config.max_edits_per_file)
            {
                return GuardrailAction::ForceAskUser {
                    reason: format!("Too many edits on {path}"),
                };
            }
        }

        GuardrailAction::Continue
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Action;

    #[test]
    fn repeated_action_triggers_ask_user() {
        let mut guard = Guardrails::new(GuardrailsConfig {
            max_identical_actions: 3,
            ..GuardrailsConfig::default()
        });
        let action = Action::ReadFile {
            path: "src/main.rs".into(),
            line_start: None,
            line_end: None,
        };
        for _ in 0..3 {
            guard.record_turn(&action, true);
        }
        assert!(matches!(
            guard.check(&action),
            GuardrailAction::ForceAskUser { .. }
        ));
    }
}
