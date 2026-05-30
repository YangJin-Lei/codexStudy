//! Persistence for `codex-new/desktop-state.json` with corruption recovery and atomic writes.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewDesktopStore {
    pub(crate) active_workspace_id: Option<String>,
    pub(crate) sessions: std::collections::BTreeMap<String, CodexNewWorkspaceRecord>,
    #[serde(default)]
    pub(crate) thread_registry: std::collections::BTreeMap<String, CodexNewThreadRegistryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewThreadRegistryEntry {
    pub(crate) thread_id: String,
    pub(crate) workspace_id: String,
    pub(crate) workspace_name: String,
    pub(crate) original_root: String,
    pub(crate) isolated_root: Option<String>,
    #[serde(default)]
    pub(crate) thread_title: Option<String>,
    #[serde(default)]
    pub(crate) local_folder_name: Option<String>,
    pub(crate) updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewWorkspaceRecord {
    pub(crate) workspace_id: String,
    pub(crate) workspace_name: String,
    pub(crate) original_workspace_path: String,
    pub(crate) project_id: String,
    pub(crate) task_id: String,
    pub(crate) thread_id: Option<String>,
    pub(crate) enabled_at: i64,
}

static DESKTOP_STORE_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn store_io_lock() -> &'static Mutex<()> {
    DESKTOP_STORE_IO_LOCK.get_or_init(|| Mutex::new(()))
}

pub(crate) fn read_desktop_store(path: &Path) -> Result<CodexNewDesktopStore, String> {
    let _guard = store_io_lock()
        .lock()
        .map_err(|_| "desktop-state.json lock poisoned".to_string())?;
    read_desktop_store_unlocked(path)
}

pub(crate) fn write_desktop_store(path: &Path, store: &CodexNewDesktopStore) -> Result<(), String> {
    let _guard = store_io_lock()
        .lock()
        .map_err(|_| "desktop-state.json lock poisoned".to_string())?;
    write_desktop_store_unlocked(path, store)
}

fn read_desktop_store_unlocked(path: &Path) -> Result<CodexNewDesktopStore, String> {
    if !path.exists() {
        return Ok(CodexNewDesktopStore::default());
    }
    let bytes =
        fs::read(path).map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    match serde_json::from_slice::<CodexNewDesktopStore>(&bytes) {
        Ok(store) => Ok(store),
        Err(err) => {
            if let Some(store) = recover_desktop_store_from_bytes(&bytes) {
                backup_corrupt_desktop_state(path, &bytes)?;
                write_desktop_store_unlocked(path, &store)?;
                eprintln!(
                    "[codex-new] Recovered corrupt desktop-state.json at {} (original error: {err})",
                    path.display()
                );
                Ok(store)
            } else {
                Err(format!(
                    "Failed to parse {}: {err}. \
                     This file stores CodexStudy security-mode workspace/thread bindings. \
                     Rename or delete it and restart CodexStudy; a fresh file will be created.",
                    path.display()
                ))
            }
        }
    }
}

fn write_desktop_store_unlocked(path: &Path, store: &CodexNewDesktopStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }
    let bytes = serde_json::to_vec_pretty(store)
        .map_err(|err| format!("Failed to serialize desktop state: {err}"))?;
    let tmp_path = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&tmp_path).map_err(|err| {
            format!(
                "Failed to write temporary desktop state at {}: {err}",
                tmp_path.display()
            )
        })?;
        file.write_all(&bytes).map_err(|err| {
            format!(
                "Failed to write temporary desktop state at {}: {err}",
                tmp_path.display()
            )
        })?;
        file.sync_all().map_err(|err| {
            format!(
                "Failed to flush temporary desktop state at {}: {err}",
                tmp_path.display()
            )
        })?;
    }
    if path.exists() {
        fs::remove_file(path).map_err(|err| {
            format!(
                "Failed to replace {} with recovered desktop state: {err}",
                path.display()
            )
        })?;
    }
    fs::rename(&tmp_path, path).map_err(|err| {
        let _ = fs::remove_file(&tmp_path);
        format!(
            "Failed to install desktop state at {}: {err}",
            path.display()
        )
    })?;
    Ok(())
}

fn backup_corrupt_desktop_state(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let backup_path = corrupt_backup_path(path);
    fs::write(&backup_path, bytes).map_err(|err| {
        format!(
            "Failed to back up corrupt desktop state to {}: {err}",
            backup_path.display()
        )
    })
}

fn corrupt_backup_path(path: &Path) -> PathBuf {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    path.with_file_name(format!(
        "{}.corrupt.{stamp}.bak",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("desktop-state.json")
    ))
}

/// Best-effort parse when valid JSON is followed by garbage (e.g. interrupted write).
fn recover_desktop_store_from_bytes(bytes: &[u8]) -> Option<CodexNewDesktopStore> {
    if let Ok(store) = serde_json::from_slice::<CodexNewDesktopStore>(bytes) {
        return Some(store);
    }
    if let Some(prefix) = truncate_before_trailing_characters_line(bytes) {
        if let Ok(store) = serde_json::from_slice::<CodexNewDesktopStore>(prefix) {
            return Some(store);
        }
    }
    let mut end = bytes.len();
    while end > 0 {
        let trimmed_end = trim_ascii_whitespace_end(bytes, end);
        if trimmed_end == 0 {
            break;
        }
        if let Ok(store) = serde_json::from_slice::<CodexNewDesktopStore>(&bytes[..trimmed_end]) {
            return Some(store);
        }
        end = trimmed_end.saturating_sub(1);
    }
    None
}

fn trim_ascii_whitespace_end(bytes: &[u8], end: usize) -> usize {
    let mut trimmed = end.min(bytes.len());
    while trimmed > 0 && bytes[trimmed - 1].is_ascii_whitespace() {
        trimmed -= 1;
    }
    trimmed
}

fn truncate_before_trailing_characters_line(bytes: &[u8]) -> Option<&[u8]> {
    let err = serde_json::from_slice::<CodexNewDesktopStore>(bytes).err()?;
    if !err
        .to_string()
        .to_ascii_lowercase()
        .contains("trailing characters")
    {
        return None;
    }
    let line = err.line();
    if line <= 1 {
        return None;
    }
    let mut current_line = 1usize;
    let mut cut = None;
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'\n' {
            if current_line + 1 == line {
                cut = Some(index);
                break;
            }
            current_line += 1;
        }
    }
    cut.map(|index| &bytes[..index])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_state_path(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("codexstudy-desktop-state-{label}-{stamp}.json"))
    }

    #[test]
    fn recovers_store_with_trailing_garbage() {
        let valid = r#"{
  "activeWorkspaceId": "ws-1",
  "sessions": {},
  "threadRegistry": {
    "thread-1": {
      "threadId": "thread-1",
      "workspaceId": "ws-1",
      "workspaceName": "demo",
      "originalRoot": "/tmp/demo",
      "isolatedRoot": null,
      "updatedAt": 1
    }
  }
}"#;
        let mut corrupt = valid.to_string();
        corrupt.push_str("}atedAt\": 1779466214516\n    }\n  }\n}");

        let recovered = recover_desktop_store_from_bytes(corrupt.as_bytes()).expect("recover");
        assert_eq!(recovered.active_workspace_id.as_deref(), Some("ws-1"));
        assert_eq!(recovered.thread_registry.len(), 1);
    }

    #[test]
    fn round_trip_uses_atomic_write() {
        let path = temp_state_path("round-trip");
        let mut store = CodexNewDesktopStore::default();
        store.active_workspace_id = Some("ws-2".to_string());
        write_desktop_store(&path, &store).expect("write");
        let loaded = read_desktop_store(&path).expect("read");
        assert_eq!(loaded.active_workspace_id.as_deref(), Some("ws-2"));
        assert!(!path.with_extension("json.tmp").exists());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn read_rewrites_recovered_store_and_backups_corrupt_bytes() {
        let path = temp_state_path("recover-read");
        let corrupt = format!(
            r#"{{
  "sessions": {{}},
  "threadRegistry": {{
    "thread-1": {{
      "threadId": "thread-1",
      "workspaceId": "ws-1",
      "workspaceName": "demo",
      "originalRoot": "/tmp/demo",
      "isolatedRoot": null,
      "updatedAt": 1
    }}
  }}
}}{trailing}"#,
            trailing = r#"}atedAt": 1779466214516
    }
  }
}"#
        );
        fs::write(&path, corrupt).expect("seed corrupt");
        let loaded = read_desktop_store(&path).expect("recover on read");
        assert_eq!(loaded.thread_registry.len(), 1);
        let reread = fs::read_to_string(&path).expect("rewritten file");
        assert!(serde_json::from_str::<CodexNewDesktopStore>(&reread).is_ok());
        let parent = path.parent().expect("parent");
        let backups: Vec<_> = fs::read_dir(parent)
            .expect("dir")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|entry| {
                entry
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.contains(".corrupt."))
            })
            .collect();
        assert_eq!(backups.len(), 1);
        let _ = fs::remove_file(&path);
        for backup in backups {
            let _ = fs::remove_file(backup);
        }
    }
}
