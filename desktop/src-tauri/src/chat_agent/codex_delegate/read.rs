use std::path::Path;

use chat_agent_core::{file_tools, Action, Observation, Result};

pub(crate) fn execute_read(action: &Action, workspace_root: &Path) -> Result<Observation> {
    let Action::ReadFile {
        path,
        line_start,
        line_end,
    } = action
    else {
        return Err(chat_agent_core::ChatAgentError::Tool(
            "expected read_file action".into(),
        ));
    };
    file_tools::read_file(workspace_root, path, *line_start, *line_end)
}

pub(crate) fn execute_edit(action: &Action, workspace_root: &Path) -> Result<Observation> {
    let Action::EditFile {
        path,
        old_str,
        new_str,
    } = action
    else {
        return Err(chat_agent_core::ChatAgentError::Tool(
            "expected edit_file action".into(),
        ));
    };
    file_tools::edit_file(workspace_root, path, old_str, new_str)
}
