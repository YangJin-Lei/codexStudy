use serde::Deserialize;
use serde::Serialize;

/// A single structured action emitted by the chat model each turn.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    ReadFile {
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        line_start: Option<usize>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        line_end: Option<usize>,
    },
    SearchCode {
        pattern: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        path_filter: Option<String>,
    },
    EditFile {
        path: String,
        old_str: String,
        new_str: String,
    },
    RunCommand {
        command: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cwd: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timeout_secs: Option<u64>,
    },
    AskUser {
        question: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        options: Option<Vec<String>>,
    },
    Finalize {
        summary: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        next_steps: Option<Vec<String>>,
    },
}

impl Action {
    pub fn type_name(&self) -> &'static str {
        match self {
            Action::ReadFile { .. } => "read_file",
            Action::SearchCode { .. } => "search_code",
            Action::EditFile { .. } => "edit_file",
            Action::RunCommand { .. } => "run_command",
            Action::AskUser { .. } => "ask_user",
            Action::Finalize { .. } => "finalize",
        }
    }

    pub fn fingerprint(&self) -> String {
        match self {
            Action::ReadFile { path, .. } => format!("read_file:{path}"),
            Action::SearchCode {
                pattern,
                path_filter,
            } => {
                format!(
                    "search_code:{pattern}:{}",
                    path_filter.as_deref().unwrap_or("")
                )
            }
            Action::EditFile { path, old_str, .. } => {
                format!("edit_file:{path}:{}", old_str.len())
            }
            Action::RunCommand { command, cwd, .. } => {
                format!("run_command:{}:{}", command, cwd.as_deref().unwrap_or(""))
            }
            Action::AskUser { question, .. } => format!("ask_user:{question}"),
            Action::Finalize { summary, .. } => format!("finalize:{}", summary.len()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn deserializes_read_file_action() {
        let json = r#"{"type":"read_file","path":"src/main.rs","line_start":1,"line_end":50}"#;
        let action: Action = serde_json::from_str(json).unwrap();
        assert_eq!(
            action,
            Action::ReadFile {
                path: "src/main.rs".to_string(),
                line_start: Some(1),
                line_end: Some(50),
            }
        );
    }
}
