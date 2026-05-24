use crate::Result;
use crate::models::ConversationBinding;
use crate::models::TaskRecord;
use chrono::Utc;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

pub(crate) fn read_conversation_binding(
    project_root: &Path,
    conversation_id: &str,
) -> Result<Option<ConversationBinding>> {
    let path = conversation_binding_path(project_root, conversation_id);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path)?;
    Ok(Some(serde_json::from_slice(bytes.as_slice())?))
}

pub(crate) fn write_conversation_binding(
    project_root: &Path,
    project_id: &str,
    conversation_id: &str,
    active_task_id: Option<String>,
) -> Result<ConversationBinding> {
    let path = conversation_binding_path(project_root, conversation_id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let now = Utc::now();
    let created_at = read_conversation_binding(project_root, conversation_id)?
        .map(|binding| binding.created_at)
        .unwrap_or(now);
    let binding = ConversationBinding {
        project_id: project_id.to_string(),
        conversation_id: conversation_id.to_string(),
        active_task_id,
        created_at,
        updated_at: now,
    };
    fs::write(path, serde_json::to_vec_pretty(&binding)?)?;
    Ok(binding)
}

pub(crate) fn find_latest_unfinished_task(project_root: &Path) -> Result<Option<TaskRecord>> {
    let tasks_root = project_root.join("tasks");
    if !tasks_root.exists() {
        return Ok(None);
    }
    let mut tasks = fs::read_dir(tasks_root)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path().join("task.json"))
        .filter(|path| path.exists())
        .filter_map(|path| fs::read(path).ok())
        .filter_map(|bytes| serde_json::from_slice::<TaskRecord>(&bytes).ok())
        .filter(|task| !task.status.is_terminal())
        .collect::<Vec<_>>();
    tasks.sort_by_key(|task| task.updated_at);
    Ok(tasks.pop())
}

pub(crate) fn write_task_record(project_root: &Path, task: &TaskRecord) -> Result<()> {
    let path = task_record_path(project_root, &task.id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(task)?)?;
    Ok(())
}

pub(crate) fn read_task_record(project_root: &Path, task_id: &str) -> Result<Option<TaskRecord>> {
    let path = task_record_path(project_root, task_id);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path)?;
    Ok(Some(serde_json::from_slice(bytes.as_slice())?))
}

fn conversation_binding_path(project_root: &Path, conversation_id: &str) -> PathBuf {
    project_root
        .join("conversations")
        .join(format!("{conversation_id}.json"))
}

fn task_record_path(project_root: &Path, task_id: &str) -> PathBuf {
    project_root.join("tasks").join(task_id).join("task.json")
}
