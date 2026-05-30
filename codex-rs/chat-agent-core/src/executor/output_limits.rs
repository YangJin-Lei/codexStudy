//! Output truncation limits (aligned with Goose `developer/shell.rs` constants).

pub const OUTPUT_LIMIT_LINES: usize = 2000;
pub const OUTPUT_LIMIT_BYTES: usize = 50_000;
pub const OUTPUT_PREVIEW_LINES: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TruncationNotice {
    pub reason: String,
    pub total_lines: usize,
    pub total_bytes: usize,
}

pub struct TruncatedOutput {
    pub text: String,
    pub notice: Option<TruncationNotice>,
}

pub fn truncate_command_output(full_output: &str) -> TruncatedOutput {
    if full_output.is_empty() {
        return TruncatedOutput {
            text: String::new(),
            notice: None,
        };
    }

    let lines: Vec<&str> = full_output.split('\n').collect();
    let total_lines = lines.len();
    let total_bytes = full_output.len();
    let exceeded_lines = total_lines > OUTPUT_LIMIT_LINES;
    let exceeded_bytes = total_bytes > OUTPUT_LIMIT_BYTES;

    if !exceeded_lines && !exceeded_bytes {
        return TruncatedOutput {
            text: full_output.to_string(),
            notice: None,
        };
    }

    let preview_start = total_lines.saturating_sub(OUTPUT_PREVIEW_LINES);
    let preview = lines[preview_start..].join("\n");
    let preview = truncate_to_bytes(&preview, OUTPUT_LIMIT_BYTES);

    let reason = if exceeded_lines {
        format!("Output exceeded {OUTPUT_LIMIT_LINES} line limit ({total_lines} lines total).")
    } else {
        format!("Output exceeded {OUTPUT_LIMIT_BYTES} byte limit ({total_bytes} bytes total).")
    };

    TruncatedOutput {
        text: preview,
        notice: Some(TruncationNotice {
            reason,
            total_lines,
            total_bytes,
        }),
    }
}

fn truncate_to_bytes(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }
    text.chars().take(max_bytes).chain("…".chars()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_through_small_output() {
        let result = truncate_command_output("hello");
        assert_eq!(result.text, "hello");
        assert!(result.notice.is_none());
    }

    #[test]
    fn truncates_by_bytes() {
        let huge = "x".repeat(OUTPUT_LIMIT_BYTES + 1);
        let result = truncate_command_output(&huge);
        assert!(result.notice.is_some());
        assert!(result.text.len() <= OUTPUT_LIMIT_BYTES + 4);
    }
}
