//! String-replace semantics aligned with Goose `developer/edit.rs` (unique match required).

const NO_MATCH_PREVIEW_LINES: usize = 20;

#[derive(Debug, PartialEq, Eq)]
pub enum ReplaceOutcome {
    Applied { new_content: String },
    NoMatch { message: String },
    MultipleMatches { message: String },
}

pub fn string_replace(content: &str, old_str: &str, new_str: &str) -> ReplaceOutcome {
    if old_str.is_empty() {
        return ReplaceOutcome::NoMatch {
            message: "old_str must not be empty".into(),
        };
    }

    let matches: Vec<_> = content.match_indices(old_str).collect();
    match matches.len() {
        0 => ReplaceOutcome::NoMatch {
            message: build_no_match_message(content, old_str),
        },
        1 => ReplaceOutcome::Applied {
            new_content: content.replacen(old_str, new_str, 1),
        },
        count => ReplaceOutcome::MultipleMatches {
            message: build_multiple_match_message(content, old_str, count, &matches),
        },
    }
}

fn build_no_match_message(content: &str, search: &str) -> String {
    let mut msg = "old_str did not match any content".to_string();
    if let Some(hint) = find_similar_context(content, search) {
        msg.push_str("\n\nDid you mean:\n```\n");
        msg.push_str(&hint);
        msg.push_str("\n```");
    }
    let preview = build_file_preview(content, NO_MATCH_PREVIEW_LINES);
    msg.push_str("\n\nFile preview:\n```\n");
    msg.push_str(&preview);
    msg.push_str("\n```");
    msg
}

fn build_multiple_match_message(
    content: &str,
    old_str: &str,
    count: usize,
    matches: &[(usize, &str)],
) -> String {
    let mut msg = format!("old_str matched {count} locations; must be unique");
    for (index, (pos, _)) in matches.iter().take(2).enumerate() {
        let line_num = count_lines_before(content, *pos);
        let context = get_line_context(content, line_num, 1);
        msg.push_str(&format!(
            "\n\nMatch {} (line {line_num}):\n```\n{context}\n```",
            index + 1
        ));
    }
    if count > 2 {
        msg.push_str(&format!("\n\n...and {} more", count - 2));
    }
    let _ = old_str;
    msg
}

fn count_lines_before(content: &str, byte_pos: usize) -> usize {
    content
        .char_indices()
        .take_while(|(index, _)| *index < byte_pos)
        .filter(|(_, character)| *character == '\n')
        .count()
        + 1
}

fn get_line_context(content: &str, target_line: usize, context: usize) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let start = target_line.saturating_sub(context + 1);
    let end = (target_line + context).min(lines.len());
    lines[start..end].join("\n")
}

fn find_similar_context(content: &str, search: &str) -> Option<String> {
    let first_line = search.lines().next()?.trim();
    if first_line.is_empty() {
        return None;
    }
    for (index, line) in content.lines().enumerate() {
        if line.contains(first_line) || first_line.contains(line.trim()) {
            return Some(get_line_context(content, index + 1, 2));
        }
    }
    None
}

fn build_file_preview(content: &str, max_lines: usize) -> String {
    if content.is_empty() {
        return "(file is empty)".into();
    }
    let lines: Vec<&str> = content.lines().collect();
    let preview_end = lines.len().min(max_lines);
    let mut preview = lines[..preview_end]
        .iter()
        .enumerate()
        .map(|(index, line)| format!("{:>4}: {}", index + 1, line))
        .collect::<Vec<_>>()
        .join("\n");
    if lines.len() > preview_end {
        preview.push_str(&format!("\n... ({} more lines)", lines.len() - preview_end));
    }
    preview
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_requires_unique_match() {
        let content = "foo bar foo";
        assert!(matches!(
            string_replace(content, "foo", "baz"),
            ReplaceOutcome::MultipleMatches { .. }
        ));
    }

    #[test]
    fn replace_applies_once() {
        assert!(matches!(
            string_replace("hello world", "world", "there"),
            ReplaceOutcome::Applied { .. }
        ));
    }

    #[test]
    fn no_match_includes_preview() {
        let outcome = string_replace("alpha\nbeta", "missing", "x");
        assert!(
            matches!(outcome, ReplaceOutcome::NoMatch { message } if message.contains("File preview"))
        );
    }
}
