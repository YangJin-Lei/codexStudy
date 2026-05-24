use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::home::{detect_legacy_codex_homes, resolve_default_codex_home};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexHomeMigrationLegacyHome {
    pub(crate) path: String,
    pub(crate) session_file_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexHomeMigrationStatus {
    pub(crate) should_prompt: bool,
    pub(crate) codex_home: String,
    pub(crate) legacy_homes: Vec<CodexHomeMigrationLegacyHome>,
    pub(crate) decision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexHomeMigrationImportResult {
    pub(crate) copied_files: u64,
    pub(crate) skipped_files: u64,
    pub(crate) copied_config: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexHomeMigrationRecord {
    #[serde(default)]
    decision: Option<String>,
    #[serde(default)]
    source_path: Option<String>,
    #[serde(default)]
    decided_at: Option<i64>,
}

fn migration_record_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?;
    Ok(data_dir.join("codex-home-migration.json"))
}

fn read_migration_record(app: &AppHandle) -> CodexHomeMigrationRecord {
    let Ok(path) = migration_record_path(app) else {
        return CodexHomeMigrationRecord::default();
    };
    let Ok(bytes) = fs::read(&path) else {
        return CodexHomeMigrationRecord::default();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn write_migration_record(app: &AppHandle, record: &CodexHomeMigrationRecord) -> Result<(), String> {
    let path = migration_record_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(record).map_err(|err| err.to_string())?;
    fs::write(path, bytes).map_err(|err| err.to_string())
}

fn unix_now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn count_session_rollout_files(root: &Path) -> u64 {
    let sessions_root = root.join("sessions");
    if !sessions_root.is_dir() {
        return 0;
    }
    let mut count = 0u64;
    count_rollout_files_recursive(&sessions_root, &mut count);
    count
}

fn count_rollout_files_recursive(dir: &Path, count: &mut u64) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            count_rollout_files_recursive(&path, count);
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        if name.starts_with("rollout-") && name.ends_with(".jsonl") {
            *count += 1;
        }
    }
}

fn legacy_homes_with_counts(current_codex_home: &Path) -> Vec<CodexHomeMigrationLegacyHome> {
    detect_legacy_codex_homes(current_codex_home)
        .into_iter()
        .map(|path| CodexHomeMigrationLegacyHome {
            session_file_count: count_session_rollout_files(&path),
            path: path.to_string_lossy().to_string(),
        })
        .filter(|entry| entry.session_file_count > 0)
        .collect()
}

pub(crate) fn build_migration_status(app: &AppHandle) -> CodexHomeMigrationStatus {
    let codex_home = resolve_default_codex_home().unwrap_or_default();
    let legacy_homes = legacy_homes_with_counts(&codex_home);
    let record = read_migration_record(app);
    let should_prompt = record.decision.is_none() && !legacy_homes.is_empty();
    CodexHomeMigrationStatus {
        should_prompt,
        codex_home: codex_home.to_string_lossy().to_string(),
        legacy_homes,
        decision: record.decision,
    }
}

fn copy_file_if_missing(src: &Path, dst: &Path) -> Result<bool, String> {
    if dst.exists() {
        return Ok(false);
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            format!("Unable to create {}: {err}", parent.display())
        })?;
    }
    fs::copy(src, dst).map_err(|err| {
        format!(
            "Unable to copy {} to {}: {err}",
            src.display(),
            dst.display()
        )
    })?;
    Ok(true)
}

fn copy_tree_merge(src: &Path, dst: &Path, stats: &mut CodexHomeMigrationImportResult) -> Result<(), String> {
    if !src.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(src).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let src_path = entry.path();
        let file_name = entry.file_name();
        let dst_path = dst.join(file_name);
        let file_type = entry
            .file_type()
            .map_err(|err| err.to_string())?;
        if file_type.is_dir() {
            copy_tree_merge(&src_path, &dst_path, stats)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        if copy_file_if_missing(&src_path, &dst_path)? {
            stats.copied_files += 1;
        } else {
            stats.skipped_files += 1;
        }
    }
    Ok(())
}

pub(crate) fn import_legacy_codex_home(
    app: &AppHandle,
    source_path: &str,
) -> Result<CodexHomeMigrationImportResult, String> {
    let source = PathBuf::from(source_path.trim());
    if !source.is_dir() {
        return Err(format!("Legacy Codex home not found: {}", source.display()));
    }
    let target = resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CodexStudy home directory".to_string())?;
    fs::create_dir_all(&target).map_err(|err| {
        format!(
            "Unable to initialize CodexStudy home at {}: {err}",
            target.display()
        )
    })?;

    let mut result = CodexHomeMigrationImportResult {
        copied_files: 0,
        skipped_files: 0,
        copied_config: false,
    };

    let sessions_src = source.join("sessions");
    if sessions_src.is_dir() {
        copy_tree_merge(&sessions_src, &target.join("sessions"), &mut result)?;
    }

    let config_src = source.join("config.toml");
    let config_dst = target.join("config.toml");
    if config_src.is_file() && !config_dst.exists() {
        if copy_file_if_missing(&config_src, &config_dst)? {
            result.copied_config = true;
        }
    }

    write_migration_record(
        app,
        &CodexHomeMigrationRecord {
            decision: Some("imported".to_string()),
            source_path: Some(source.to_string_lossy().to_string()),
            decided_at: Some(unix_now_secs()),
        },
    )?;

    Ok(result)
}

pub(crate) fn skip_legacy_codex_home_import(app: &AppHandle) -> Result<(), String> {
    write_migration_record(
        app,
        &CodexHomeMigrationRecord {
            decision: Some("skipped".to_string()),
            source_path: None,
            decided_at: Some(unix_now_secs()),
        },
    )
}

#[tauri::command]
pub(crate) fn codex_home_migration_status(
    app: AppHandle,
) -> Result<CodexHomeMigrationStatus, String> {
    Ok(build_migration_status(&app))
}

#[tauri::command]
pub(crate) fn codex_home_migration_import(
    app: AppHandle,
    source_path: String,
) -> Result<CodexHomeMigrationImportResult, String> {
    import_legacy_codex_home(&app, &source_path)
}

#[tauri::command]
pub(crate) fn codex_home_migration_skip(app: AppHandle) -> Result<(), String> {
    skip_legacy_codex_home_import(&app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn count_session_rollout_files_counts_jsonl_rollouts() {
        let root = std::env::temp_dir().join(format!(
            "codex-migration-count-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let sessions = root.join("sessions/2025/01/03");
        fs::create_dir_all(&sessions).expect("create sessions dir");
        let rollout = sessions.join("rollout-2025-01-03T12-00-00-test.jsonl");
        let mut file = File::create(&rollout).expect("create rollout");
        writeln!(file, "{{}}").expect("write rollout");
        assert_eq!(count_session_rollout_files(&root), 1);
        let _ = fs::remove_dir_all(&root);
    }
}
