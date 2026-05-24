use crate::Result;
use crate::models::CommandRunRecord;
use crate::models::TaskActivityFeed;
use crate::models::TimelineEvent;
use crate::models::TimelineEventKind;
use chrono::Utc;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use uuid::Uuid;

pub(crate) fn append_timeline_event(
    task_root: &Path,
    task_id: &str,
    kind: TimelineEventKind,
    payload: serde_json::Value,
) -> Result<TimelineEvent> {
    fs::create_dir_all(task_root)?;
    let timeline_path = task_root.join("timeline.jsonl");
    let seq = fs::read_to_string(&timeline_path)
        .map(|text| text.lines().count() as u64)
        .unwrap_or(0);
    let event = TimelineEvent {
        id: Uuid::new_v4().to_string(),
        task_id: task_id.to_string(),
        seq,
        kind,
        created_at: Utc::now(),
        payload,
    };
    let mut line = serde_json::to_string(&event)?;
    line.push('\n');
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(timeline_path)?
        .write_all(line.as_bytes())?;
    Ok(event)
}

pub(crate) fn read_timeline_events(
    task_root: &Path,
    task_id: &str,
    after_seq: Option<u64>,
    limit: usize,
) -> Result<TaskActivityFeed> {
    let timeline_path = task_root.join("timeline.jsonl");
    if !timeline_path.exists() {
        return Ok(TaskActivityFeed {
            task_id: task_id.to_string(),
            latest_seq: 0,
            events: Vec::new(),
        });
    }

    let bytes = fs::read(timeline_path)?;
    let text = String::from_utf8_lossy(&bytes);
    let mut events = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<TimelineEvent>(line).ok())
        .collect::<Vec<_>>();
    let latest_seq = events.last().map(|event| event.seq).unwrap_or(0);

    if let Some(after_seq) = after_seq {
        events.retain(|event| event.seq > after_seq);
        if limit > 0 && events.len() > limit {
            events.truncate(limit);
        }
    } else if limit > 0 && events.len() > limit {
        events = events.split_off(events.len() - limit);
    }

    Ok(TaskActivityFeed {
        task_id: task_id.to_string(),
        latest_seq,
        events,
    })
}

pub(crate) fn write_command_run(task_root: &Path, record: &CommandRunRecord) -> Result<()> {
    let path = command_run_path(task_root, &record.id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(record)?)?;
    Ok(())
}

pub(crate) fn read_command_run(
    task_root: &Path,
    command_id: &str,
) -> Result<Option<CommandRunRecord>> {
    let path = command_run_path(task_root, command_id);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path)?;
    Ok(Some(serde_json::from_slice(bytes.as_slice())?))
}

pub(crate) fn list_command_runs(task_root: &Path, limit: usize) -> Result<Vec<CommandRunRecord>> {
    let terminal_root = task_root.join("terminal");
    if !terminal_root.exists() {
        return Ok(Vec::new());
    }

    let mut runs = fs::read_dir(terminal_root)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .filter_map(|path| fs::read(path).ok())
        .filter_map(|bytes| serde_json::from_slice::<CommandRunRecord>(&bytes).ok())
        .collect::<Vec<_>>();
    runs.sort_by_key(|run| run.started_at);
    if limit > 0 && runs.len() > limit {
        runs = runs.split_off(runs.len() - limit);
    }
    Ok(runs)
}

pub(crate) fn command_run_path(task_root: &Path, command_id: &str) -> PathBuf {
    task_root
        .join("terminal")
        .join(format!("{command_id}.json"))
}
