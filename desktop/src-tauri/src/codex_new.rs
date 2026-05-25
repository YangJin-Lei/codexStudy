use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use codex_new_core::{
    CandidateMemoryRecord, ChangedFile, CodexNewCore, CommandExecutionKind, CommandRunStatus,
    RollbackRequest, RollbackSelection,
    DiffBundle, HunkSelection, MemoryApplyOutcome, MergeRequest, MergeSelection, ProjectSettings,
    ResolveTaskRequest, ReviewReport, StructuredTaskSummary, TaskManifest, TaskReusePolicy,
    TaskStatus, TestExecutionRequest, TimelineEvent, TimelineEventKind, TracebackEntry,
    TracebackRestoreOutcome, TracebackRestoreTarget, WorkspaceStrategy,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::backend::events::AppServerEvent;
use crate::codex::args::resolve_workspace_codex_args;
use crate::codex::home::{resolve_default_codex_home, resolve_workspace_codex_home};
use crate::codex::spawn_workspace_session;
use crate::shared::process_core::kill_child_process_tree;
use crate::state::AppState;
use crate::codex_new_store_io::{
    read_desktop_store, write_desktop_store, CodexNewDesktopStore, CodexNewWorkspaceRecord,
};
use crate::types::WorkspaceEntry;

pub(crate) use crate::codex_new_store_io::CodexNewThreadRegistryEntry;

const MAX_PROCESS_ENTRIES: usize = 80;
const MAX_TERMINAL_RUNS: usize = 40;
const MAX_DETAIL_CHARS: usize = 1800;
const MAX_OUTPUT_CHARS: usize = 6000;
const MAX_FILE_PREVIEW_BYTES: usize = 24 * 1024;
const MAX_FILE_PREVIEW_CHARS: usize = 8000;

#[derive(Debug, Clone, Default)]
pub(crate) struct LiveWorkspaceState {
    pub(crate) process_entries: BTreeMap<String, LiveProcessEntry>,
    pub(crate) terminal_runs: BTreeMap<String, LiveTerminalRun>,
    pub(crate) command_routes: BTreeMap<String, ShellCommandRoute>,
}

#[derive(Debug, Clone)]
enum ShellCommandRoute {
    Shell,
    FileRead {
        path: Option<String>,
    },
    FileWrite {
        path: Option<String>,
    },
    Patch,
    InlineScript,
}

impl ShellCommandRoute {
    fn mirrors_terminal_output(&self) -> bool {
        matches!(self, Self::Shell)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct LiveProcessEntry {
    pub(crate) id: String,
    pub(crate) thread_id: Option<String>,
    pub(crate) kind: CodexNewProcessKind,
    pub(crate) title: String,
    pub(crate) detail: String,
    pub(crate) files: Vec<CodexNewProcessFileRef>,
    pub(crate) status: CodexNewProcessStatus,
    pub(crate) created_at: i64,
}

#[derive(Debug, Clone)]
pub(crate) struct LiveTerminalRun {
    pub(crate) id: String,
    pub(crate) thread_id: Option<String>,
    pub(crate) title: String,
    pub(crate) command: String,
    pub(crate) cwd: String,
    pub(crate) status: CodexNewTerminalStatus,
    pub(crate) started_at: i64,
    pub(crate) completed_at: Option<i64>,
    pub(crate) exit_code: Option<i32>,
    pub(crate) stdout_excerpt: String,
    pub(crate) stderr_excerpt: String,
}

#[derive(Debug, Clone)]
struct PreparedSecurityContext {
    workspace: WorkspaceEntry,
    parent_workspace: Option<WorkspaceEntry>,
    workspace_root: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewFrontendState {
    active_session: Option<CodexNewSession>,
    active_task: Option<CodexNewActiveTask>,
    workspace_security: BTreeMap<String, CodexNewWorkspaceSecurityState>,
    thread_registry: BTreeMap<String, CodexNewThreadRegistryEntry>,
    data_paths: CodexNewDataPaths,
    process_entries: Vec<CodexNewProcessEntry>,
    terminal_runs: Vec<CodexNewTerminalRun>,
    last_updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewDataPaths {
    pub(crate) codex_home: String,
    pub(crate) codex_new_root: String,
    pub(crate) desktop_state_path: String,
    pub(crate) legacy_codex_homes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewActiveTask {
    project_id: String,
    task_id: String,
    title: String,
    status: TaskStatus,
    original_root: String,
    workspace_root: String,
    environment_summary: Option<String>,
    project_settings: ProjectSettings,
    changed_files: Vec<ChangedFile>,
    diff: DiffBundle,
    review: Option<ReviewReport>,
    latest_summary: Option<StructuredTaskSummary>,
    latest_test: Option<CodexNewLatestTest>,
    has_passing_test: bool,
    suggested_test_commands: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewLatestTest {
    command_run_id: String,
    command: String,
    status: CommandRunStatus,
    exit_code: Option<i32>,
    started_at: i64,
    completed_at: Option<i64>,
    stdout_excerpt: String,
    stderr_excerpt: String,
    failure_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewSession {
    workspace_id: String,
    workspace_name: String,
    workspace_path: String,
    thread_id: Option<String>,
    enabled_at: i64,
    source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewWorkspaceSecurityState {
    workspace_id: String,
    workspace_name: String,
    enabled_at: i64,
    /// Paths that should map back to this workspace when matching thread/list `cwd`.
    path_aliases: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CodexNewProcessStatus {
    Pending,
    Running,
    Completed,
    Blocked,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CodexNewProcessKind {
    Workspace,
    Plan,
    Edit,
    Review,
    Summary,
    Notice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewProcessEntry {
    id: String,
    kind: CodexNewProcessKind,
    title: String,
    detail: String,
    files: Vec<CodexNewProcessFileRef>,
    status: CodexNewProcessStatus,
    created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewProcessFileRef {
    path: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CodexNewFilePreviewStatus {
    Ready,
    Binary,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewFilePreview {
    path: String,
    status: CodexNewFilePreviewStatus,
    content: String,
    truncated: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CodexNewTerminalStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewTerminalRun {
    id: String,
    title: String,
    command: String,
    cwd: String,
    status: CodexNewTerminalStatus,
    started_at: i64,
    completed_at: Option<i64>,
    exit_code: Option<i32>,
    stdout_excerpt: String,
    stderr_excerpt: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewSessionInput {
    workspace_id: String,
    thread_id: Option<String>,
    thread_title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewThreadTitleSync {
    thread_id: String,
    thread_title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewFilePreviewInput {
    workspace_id: String,
    path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewWorkspaceActionInput {
    workspace_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewHunkSelectionInput {
    path: String,
    hunk_index: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewMergeInput {
    workspace_id: String,
    paths: Option<Vec<String>>,
    hunks: Option<Vec<CodexNewHunkSelectionInput>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewRollbackInput {
    workspace_id: String,
    paths: Option<Vec<String>>,
    hunks: Option<Vec<CodexNewHunkSelectionInput>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewTracebackRestoreInput {
    workspace_id: String,
    path: String,
    target: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewMemoryApplyInput {
    workspace_id: String,
    candidate_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewSummaryInput {
    workspace_id: String,
    goal: Option<String>,
    result: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNewTestInput {
    workspace_id: String,
    command: String,
    use_environment_binding: Option<bool>,
    retry_of: Option<String>,
    title: Option<String>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn default_project_settings() -> ProjectSettings {
    ProjectSettings {
        workspace_strategy: WorkspaceStrategy::Auto,
        keep_days: 30,
        require_review: true,
        require_tests: false,
        protect_sensitive_files: true,
        default_test_commands: Vec::new(),
    }
}

fn codex_new_root(app: &AppHandle) -> PathBuf {
    let base = resolve_default_codex_home().unwrap_or_else(|| {
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| ".".into()))
    });
    base.join("codex-new")
}

fn desktop_state_path(app: &AppHandle) -> PathBuf {
    codex_new_root(app).join("desktop-state.json")
}

fn read_store(app: &AppHandle) -> Result<CodexNewDesktopStore, String> {
    read_desktop_store(&desktop_state_path(app))
}

fn write_store(app: &AppHandle, store: &CodexNewDesktopStore) -> Result<(), String> {
    write_desktop_store(&desktop_state_path(app), store)
}

fn core_for_app(app: &AppHandle) -> CodexNewCore {
    CodexNewCore::new(codex_new_root(app))
}

fn build_data_paths(app: &AppHandle) -> CodexNewDataPaths {
    let codex_home = resolve_default_codex_home()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    let codex_new_data_root = codex_new_root(app).to_string_lossy().to_string();
    let desktop_state_path = desktop_state_path(app)
        .to_string_lossy()
        .to_string();
    let legacy_codex_homes = crate::codex::home::detect_legacy_codex_homes(Path::new(&codex_home))
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    CodexNewDataPaths {
        codex_home,
        codex_new_root: codex_new_data_root,
        desktop_state_path,
        legacy_codex_homes,
    }
}

pub(crate) fn codex_study_developer_instructions(
    model_display_name: &str,
    ui_language: &str,
) -> String {
    let model_name = if model_display_name.trim().is_empty() {
        "the configured OpenAI model"
    } else {
        model_display_name.trim()
    };
    let language_rule = if ui_language.eq_ignore_ascii_case("zh-CN")
        || ui_language.starts_with("zh")
    {
        "Respond to the user in Simplified Chinese. Write reasoning summaries, planning notes, tool narration, and explanations in Chinese (keep code, paths, and command lines as-is)."
    } else if ui_language.eq_ignore_ascii_case("system") {
        "Match the language the user writes in. When the user writes Chinese, respond and reason in Simplified Chinese."
    } else {
        "Respond in English unless the user clearly prefers another language."
    };
    format!(
        "You are CodexStudy (never introduce yourself as Codex alone).\n\
        {language_rule}\n\
        When speaking Chinese, say 我是 CodexStudy，由 {model_name} 驱动（OpenAI）— not 我是 Codex.\n\
        When asked what model you are, say you are CodexStudy and the active model for this conversation is {model_name}.\n\
        Do not claim you run in the Codex CLI; you run in CodexStudy with optional isolated workspaces."
    )
}

pub(crate) fn security_thread_start_params(
    workspace_id: &str,
    cwd: &str,
    original_cwd: &str,
    model_display_name: Option<&str>,
    ui_language: &str,
) -> Value {
    let developer_instructions = codex_study_developer_instructions(
        model_display_name.unwrap_or_default(),
        ui_language,
    );
    json!({
        "cwd": cwd,
        "runtimeWorkspaceRoots": [cwd],
        "approvalPolicy": "never",
        "developerInstructions": developer_instructions,
        "config": {
            "codexStudy": {
                "workspaceId": workspace_id,
                "securityMode": true,
                "originalCwd": original_cwd,
            }
        }
    })
}

fn local_folder_name_from_isolated_root(isolated_root: &str, workspace_name: &str) -> Option<String> {
    let normalized = isolated_root.replace('\\', "/");
    let marker = "/workspaces/";
    let Some(index) = normalized.to_ascii_lowercase().find(marker) else {
        return None;
    };
    let relative = &normalized[index + marker.len()..];
    let relative = relative.strip_suffix("/copy").unwrap_or(relative);
    let relative = relative.strip_suffix("/worktree").unwrap_or(relative);
    let trimmed = relative.trim_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with(&format!("{workspace_name}/"))
        || trimmed.starts_with(&format!("{workspace_name}\\"))
    {
        Some(trimmed.to_string())
    } else {
        Some(format!("{workspace_name}/{trimmed}"))
    }
}

fn register_thread_in_store(
    store: &mut CodexNewDesktopStore,
    workspace_id: &str,
    thread_id: &str,
    workspace_name: &str,
    original_root: &str,
    isolated_root: Option<&str>,
    thread_title: Option<&str>,
) {
    let local_folder_name = isolated_root
        .and_then(|path| local_folder_name_from_isolated_root(path, workspace_name));
    let thread_title = thread_title
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_string);
    let existing = store.thread_registry.get(thread_id);
    let thread_title = thread_title.or_else(|| {
        existing
            .and_then(|entry| entry.thread_title.clone())
            .filter(|title| !title.trim().is_empty())
    });
    store.thread_registry.insert(
        thread_id.to_string(),
        CodexNewThreadRegistryEntry {
            thread_id: thread_id.to_string(),
            workspace_id: workspace_id.to_string(),
            workspace_name: workspace_name.to_string(),
            original_root: original_root.to_string(),
            isolated_root: isolated_root.map(str::to_string),
            thread_title,
            local_folder_name: local_folder_name.or_else(|| {
                existing
                    .and_then(|entry| entry.local_folder_name.clone())
                    .filter(|folder| !folder.trim().is_empty())
            }),
            updated_at: now_ms(),
        },
    );
}

fn apply_session_input_metadata(store: &mut CodexNewDesktopStore, input: &CodexNewSessionInput) {
    let Some(thread_id) = input.thread_id.as_deref().filter(|id| !id.trim().is_empty()) else {
        return;
    };
    let Some(entry) = store.thread_registry.get_mut(thread_id) else {
        return;
    };
    if entry.workspace_id != input.workspace_id {
        return;
    }
    if let Some(title) = input
        .thread_title
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty())
    {
        entry.thread_title = Some(title.to_string());
    }
    if let Some(isolated) = entry.isolated_root.as_deref() {
        entry.local_folder_name =
            local_folder_name_from_isolated_root(isolated, &entry.workspace_name);
    }
    entry.updated_at = now_ms();
}

pub(crate) async fn register_workspace_thread(
    app: &AppHandle,
    workspace_id: &str,
    thread_id: &str,
    isolated_root: Option<&str>,
) -> Result<(), String> {
    let mut store = read_store(app)?;
    let Some(record) = store.sessions.get(workspace_id).cloned() else {
        return Ok(());
    };
    register_thread_in_store(
        &mut store,
        workspace_id,
        thread_id,
        &record.workspace_name,
        &record.original_workspace_path,
        isolated_root,
        None,
    );
    let mut record = record;
    record.thread_id = Some(thread_id.to_string());
    store
        .sessions
        .insert(workspace_id.to_string(), record);
    write_store(app, &store)
}

async fn resolve_workspace_context(
    state: &AppState,
    workspace_id: &str,
) -> Result<(WorkspaceEntry, Option<WorkspaceEntry>), String> {
    let workspaces = state.workspaces.lock().await;
    let workspace = workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| format!("Unknown workspace: {workspace_id}"))?;
    let parent = workspace
        .parent_id
        .as_deref()
        .and_then(|parent_id| workspaces.get(parent_id).cloned());
    Ok((workspace, parent))
}

fn task_title(workspace: &WorkspaceEntry) -> String {
    format!("codex-new task for {}", workspace.name)
}

async fn ensure_security_context(
    app: &AppHandle,
    state: &AppState,
    workspace_id: &str,
    thread_id: Option<&str>,
    preserve_existing_thread: bool,
    activate: bool,
) -> Result<PreparedSecurityContext, String> {
    let (workspace, parent_workspace) = resolve_workspace_context(state, workspace_id).await?;
    let core = core_for_app(app);
    let project = core
        .register_project(PathBuf::from(&workspace.path), default_project_settings())
        .map_err(|err| err.to_string())?;

    let mut store = read_store(app)?;
    let existing = store.sessions.get(workspace_id).cloned();
    let resolved_thread_id = if preserve_existing_thread {
        thread_id.map(ToOwned::to_owned).or_else(|| {
            existing
                .as_ref()
                .and_then(|record| record.thread_id.clone())
        })
    } else {
        thread_id.map(ToOwned::to_owned)
    };
    let resolved = core
        .resolve_or_create_task(ResolveTaskRequest {
            project_id: project.id.clone(),
            title: task_title(&workspace),
            conversation_id: resolved_thread_id.clone(),
            reuse_policy: TaskReusePolicy::ReuseActive,
        })
        .map_err(|err| err.to_string())?;

    let record = CodexNewWorkspaceRecord {
        workspace_id: workspace.id.clone(),
        workspace_name: workspace.name.clone(),
        original_workspace_path: workspace.path.clone(),
        project_id: project.id,
        task_id: resolved.task.id.clone(),
        thread_id: if preserve_existing_thread {
            resolved_thread_id
        } else {
            thread_id.map(ToOwned::to_owned)
        },
        enabled_at: existing
            .as_ref()
            .map(|entry| entry.enabled_at)
            .unwrap_or_else(now_ms),
    };
    store
        .sessions
        .insert(workspace_id.to_string(), record.clone());
    if activate {
        store.active_workspace_id = Some(workspace_id.to_string());
    }
    if let Some(thread_id) = record.thread_id.as_deref() {
        let isolated = resolved.manifest.workspace_root.to_string_lossy();
        register_thread_in_store(
            &mut store,
            workspace_id,
            thread_id,
            &record.workspace_name,
            &record.original_workspace_path,
            Some(isolated.as_ref()),
            None,
        );
    }
    write_store(app, &store)?;
    let _ = core.refresh_environment_links(&record.project_id, &record.task_id);

    Ok(PreparedSecurityContext {
        workspace,
        parent_workspace,
        workspace_root: resolved.manifest.workspace_root,
    })
}

async fn replace_workspace_session(
    app: &AppHandle,
    state: &AppState,
    workspace: WorkspaceEntry,
    parent_workspace: Option<WorkspaceEntry>,
    effective_path: &Path,
) -> Result<(), String> {
    let (default_bin, codex_args) = {
        let settings = state.app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&workspace, parent_workspace.as_ref(), Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&workspace, parent_workspace.as_ref());
    let mut runtime_workspace = workspace.clone();
    runtime_workspace.path = effective_path.to_string_lossy().to_string();

    let replacement = spawn_workspace_session(
        runtime_workspace.clone(),
        default_bin,
        codex_args,
        app.clone(),
        codex_home,
    )
    .await?;
    replacement
        .register_workspace_with_path(&workspace.id, Some(&runtime_workspace.path))
        .await;

    let existing = {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(workspace.id.clone(), Arc::clone(&replacement))
    };
    if let Some(existing) = existing {
        existing.unregister_workspace(&workspace.id).await;
        let still_referenced = {
            let sessions = state.sessions.lock().await;
            sessions
                .values()
                .any(|candidate| Arc::ptr_eq(candidate, &existing))
        };
        if !still_referenced {
            let mut child = existing.child.lock().await;
            kill_child_process_tree(&mut child).await;
        }
    }
    Ok(())
}

fn extract_thread_id(params: &serde_json::Map<String, Value>) -> Option<String> {
    params
        .get("threadId")
        .or_else(|| params.get("thread_id"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            params
                .get("thread")
                .and_then(Value::as_object)
                .and_then(|thread| thread.get("id"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
}

fn append_limited_text(buffer: &mut String, delta: &str, limit: usize) {
    if delta.is_empty() {
        return;
    }
    buffer.push_str(delta);
    if buffer.chars().count() <= limit {
        return;
    }
    let trimmed: String = buffer
        .chars()
        .rev()
        .take(limit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    *buffer = trimmed;
}

fn trim_text(value: impl Into<String>, limit: usize) -> String {
    let value = value.into();
    if value.chars().count() <= limit {
        return value;
    }
    value
        .chars()
        .rev()
        .take(limit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

fn truncate_text_prefix(value: String, limit: usize) -> (String, bool) {
    if value.chars().count() <= limit {
        return (value, false);
    }
    (value.chars().take(limit).collect(), true)
}

fn safe_relative_path(path: &str) -> Option<&Path> {
    let path = Path::new(path);
    if path.is_absolute() {
        return None;
    }
    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return None;
    }
    Some(path)
}

fn file_refs_from_paths<I>(paths: I) -> Vec<CodexNewProcessFileRef>
where
    I: IntoIterator<Item = String>,
{
    let mut refs = Vec::new();
    for path in paths {
        if path.trim().is_empty() {
            continue;
        }
        if refs
            .iter()
            .any(|existing: &CodexNewProcessFileRef| existing.path == path)
        {
            continue;
        }
        refs.push(CodexNewProcessFileRef { path });
    }
    refs
}

fn file_refs_from_value(payload: &Value) -> Vec<CodexNewProcessFileRef> {
    let Some(paths) = payload.get("paths").and_then(Value::as_array) else {
        return Vec::new();
    };
    file_refs_from_paths(
        paths
            .iter()
            .filter_map(Value::as_str)
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>(),
    )
}

fn try_read_file_preview(root: &Path, path: &str) -> Option<CodexNewFilePreview> {
    let Some(relative) = safe_relative_path(path) else {
        return None;
    };
    let absolute = root.join(relative);
    let mut file = match fs::File::open(&absolute) {
        Ok(file) => file,
        Err(_) => return None,
    };
    let mut buffer = Vec::with_capacity(MAX_FILE_PREVIEW_BYTES + 1);
    let mut handle = file.by_ref().take((MAX_FILE_PREVIEW_BYTES + 1) as u64);
    if handle.read_to_end(&mut buffer).is_err() {
        return None;
    }
    let truncated_by_bytes = buffer.len() > MAX_FILE_PREVIEW_BYTES;
    if truncated_by_bytes {
        buffer.truncate(MAX_FILE_PREVIEW_BYTES);
    }
    if buffer.contains(&0) {
        return Some(CodexNewFilePreview {
            path: path.to_string(),
            status: CodexNewFilePreviewStatus::Binary,
            content: String::new(),
            truncated: false,
        });
    }
    let text = match String::from_utf8(buffer) {
        Ok(text) => text,
        Err(_) => {
            return Some(CodexNewFilePreview {
                path: path.to_string(),
                status: CodexNewFilePreviewStatus::Binary,
                content: String::new(),
                truncated: false,
            });
        }
    };
    let (content, truncated_by_chars) = truncate_text_prefix(text, MAX_FILE_PREVIEW_CHARS);
    Some(CodexNewFilePreview {
        path: path.to_string(),
        status: CodexNewFilePreviewStatus::Ready,
        content,
        truncated: truncated_by_bytes || truncated_by_chars,
    })
}

fn read_file_preview(roots: &[PathBuf], path: &str) -> CodexNewFilePreview {
    for root in roots {
        if let Some(preview) = try_read_file_preview(root, path) {
            return preview;
        }
    }
    CodexNewFilePreview {
        path: path.to_string(),
        status: CodexNewFilePreviewStatus::Missing,
        content: String::new(),
        truncated: false,
    }
}

fn normalize_workspace_path(value: &str) -> String {
    let normalized = value.replace('\\', "/");
    let normalized = normalized.trim_end_matches('/');
    if normalized.is_empty() {
        return String::new();
    }
    let lower = normalized.to_ascii_lowercase();
    let normalized = if lower.starts_with("//?/unc/") {
        format!("//{}", &normalized[8..])
    } else if lower.starts_with("//?/") || lower.starts_with("//./") {
        normalized[4..].to_string()
    } else {
        normalized.to_string()
    };
    if normalized.is_empty() {
        return String::new();
    }
    let bytes = normalized.as_bytes();
    let is_drive_path =
        bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/';
    if is_drive_path || normalized.starts_with("//") {
        normalized.to_ascii_lowercase()
    } else {
        normalized
    }
}

async fn workspace_session_matches_path(
    state: &AppState,
    workspace_id: &str,
    effective_path: &Path,
) -> bool {
    let existing = {
        let sessions = state.sessions.lock().await;
        sessions.get(workspace_id).cloned()
    };
    let Some(existing) = existing else {
        return false;
    };
    let normalized_target = normalize_workspace_path(&effective_path.to_string_lossy());
    let workspace_roots = existing.workspace_roots.lock().await;
    workspace_roots
        .get(workspace_id)
        .map(|path| path == &normalized_target)
        .unwrap_or(false)
}

fn process_status_from_item_status(status: &str, completed: bool) -> CodexNewProcessStatus {
    let normalized = status.trim().to_ascii_lowercase();
    if normalized.contains("fail")
        || normalized.contains("error")
        || normalized.contains("block")
        || normalized.contains("deny")
    {
        return CodexNewProcessStatus::Blocked;
    }
    if completed {
        return CodexNewProcessStatus::Completed;
    }
    if normalized.contains("run")
        || normalized.contains("progress")
        || normalized.contains("work")
        || normalized.contains("start")
    {
        return CodexNewProcessStatus::Running;
    }
    if normalized.contains("pending") || normalized.contains("queue") {
        return CodexNewProcessStatus::Pending;
    }
    if completed {
        CodexNewProcessStatus::Completed
    } else {
        CodexNewProcessStatus::Running
    }
}

fn terminal_status_from_item_status(status: &str, completed: bool) -> CodexNewTerminalStatus {
    let normalized = status.trim().to_ascii_lowercase();
    if normalized.contains("fail") || normalized.contains("error") || normalized.contains("exit") {
        return CodexNewTerminalStatus::Failed;
    }
    if completed || normalized.contains("complete") || normalized.contains("success") {
        return CodexNewTerminalStatus::Succeeded;
    }
    if normalized.contains("pending") || normalized.contains("queue") {
        return CodexNewTerminalStatus::Pending;
    }
    CodexNewTerminalStatus::Running
}

fn join_command_parts(value: Option<&Value>) -> String {
    match value {
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(" "),
        Some(Value::String(command)) => command.clone(),
        _ => String::new(),
    }
}

fn normalize_shell_command(command: &str) -> String {
    command.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn contains_token(command: &str, tokens: &[&str]) -> bool {
    let lower = command.to_ascii_lowercase();
    tokens.iter().any(|token| {
        lower
            .split_whitespace()
            .any(|part| part.trim_matches(|c: char| !c.is_alphanumeric() && c != '_') == *token)
            || lower.contains(&format!(" {token} "))
            || lower.ends_with(&format!(" {token}"))
            || lower.starts_with(&format!("{token} "))
    })
}

fn extract_quoted_or_trailing_path(command: &str, verbs: &[&str]) -> Option<String> {
    let lower = command.to_ascii_lowercase();
    let verb = verbs.iter().find(|verb| lower.contains(&verb.to_ascii_lowercase()))?;
    let after = command[lower.find(&verb.to_ascii_lowercase())? + verb.len()..].trim();
    if let Some((_, rest)) = after.split_once('"') {
        return rest.split_once('"').map(|(path, _)| path.to_string());
    }
    if let Some((_, rest)) = after.split_once('\'') {
        return rest.split_once('\'').map(|(path, _)| path.to_string());
    }
    after
        .split_whitespace()
        .find(|part| !part.starts_with('-'))
        .map(ToOwned::to_owned)
}

fn extract_powershell_path_flag(command: &str) -> Option<String> {
    let lower = command.to_ascii_lowercase();
    for flag in ["-literalpath", "-path"] {
        let Some(index) = lower.find(flag) else {
            continue;
        };
        let after = command[index + flag.len()..].trim();
        if let Some((_, rest)) = after.split_once('"') {
            return rest.split_once('"').map(|(path, _)| path.to_string());
        }
        if let Some((_, rest)) = after.split_once('\'') {
            return rest.split_once('\'').map(|(path, _)| path.to_string());
        }
        return after
            .split_whitespace()
            .next()
            .map(ToOwned::to_owned);
    }
    None
}

fn classify_shell_command(command: &str) -> ShellCommandRoute {
    let normalized = normalize_shell_command(command);
    if normalized.is_empty() {
        return ShellCommandRoute::Shell;
    }
    if contains_token(&normalized, &["get-content", "gc", "cat", "type"]) {
        return ShellCommandRoute::FileRead {
            path: extract_quoted_or_trailing_path(&normalized, &["Get-Content", "gc", "cat", "type"]),
        };
    }
    let write_path = extract_powershell_path_flag(&normalized).or_else(|| {
        extract_quoted_or_trailing_path(
            &normalized,
            &["Set-Content", "Add-Content", "Out-File", "tee"],
        )
    });
    if write_path.is_some()
        || contains_token(
            &normalized,
            &["set-content", "add-content", "out-file", "tee"],
        )
    {
        return ShellCommandRoute::FileWrite { path: write_path };
    }
    if normalized.to_ascii_lowercase().contains("apply_patch") {
        return ShellCommandRoute::Patch;
    }
    let has_inline_payload = normalized.contains("@\"")
        || normalized.contains("\"@")
        || normalized.contains("@'")
        || normalized.contains("'@")
        || normalized.contains("<<");
    if has_inline_payload && normalized.len() > 180 {
        return ShellCommandRoute::InlineScript;
    }
    ShellCommandRoute::Shell
}

fn shell_command_process_title(route: &ShellCommandRoute) -> String {
    match route {
        ShellCommandRoute::FileRead { .. } => "Read file".to_string(),
        ShellCommandRoute::FileWrite { .. } => "Write file".to_string(),
        ShellCommandRoute::Patch => "Apply patch".to_string(),
        ShellCommandRoute::InlineScript => "Inline script".to_string(),
        ShellCommandRoute::Shell => "Command".to_string(),
    }
}

fn shell_command_terminal_label(route: &ShellCommandRoute, command: &str) -> String {
    match route {
        ShellCommandRoute::FileRead { path } => path
            .as_ref()
            .map(|target| format!("Read file {target}"))
            .unwrap_or_else(|| "Read file".to_string()),
        ShellCommandRoute::FileWrite { path } => path
            .as_ref()
            .map(|target| format!("Write file {target}"))
            .unwrap_or_else(|| "Write file".to_string()),
        ShellCommandRoute::Patch => "Apply patch".to_string(),
        ShellCommandRoute::InlineScript => "Inline shell script (output hidden)".to_string(),
        ShellCommandRoute::Shell => {
            if command.is_empty() {
                "Command".to_string()
            } else {
                format!("Command: {command}")
            }
        }
    }
}

fn sanitize_workspace_folder_name(value: &str) -> String {
    let mut sanitized = String::new();
    for ch in value.chars() {
        let next = match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        };
        sanitized.push(next);
    }
    let trimmed = sanitized.trim_matches('_').trim();
    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed.to_string()
    }
}

fn push_unique_path_alias(roots: &mut Vec<String>, path: PathBuf) {
    let normalized = path.to_string_lossy().trim().to_string();
    if normalized.is_empty() {
        return;
    }
    if roots.iter().any(|existing| existing == &normalized) {
        return;
    }
    roots.push(normalized);
}

fn collect_workspace_path_aliases(
    core: &CodexNewCore,
    codex_new_data_root: &Path,
    record: &CodexNewWorkspaceRecord,
) -> Vec<String> {
    let mut roots = Vec::new();
    push_unique_path_alias(&mut roots, PathBuf::from(&record.original_workspace_path));
    if let Ok(overview) = core.get_task_overview(&record.project_id, &record.task_id) {
        push_unique_path_alias(&mut roots, overview.manifest.workspace_root.clone());
        push_unique_path_alias(&mut roots, overview.manifest.original_root.clone());
    }
    let workspaces_root = codex_new_data_root.join("workspaces");
    for folder_name in [
        sanitize_workspace_folder_name(&record.workspace_name),
        record.project_id.clone(),
    ] {
        let project_dir = workspaces_root.join(folder_name);
        let Ok(entries) = fs::read_dir(project_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let task_dir = entry.path();
            push_unique_path_alias(&mut roots, task_dir.join("copy"));
            push_unique_path_alias(&mut roots, task_dir.join("worktree"));
            push_unique_path_alias(&mut roots, task_dir);
        }
    }
    roots
}

fn format_environment_summary(binding: &codex_new_core::EnvironmentBinding) -> String {
    let mut parts = Vec::new();
    for tool in &binding.detected_tools {
        parts.push(format!(
            "{}: {}",
            tool.name,
            tool.executable.display()
        ));
    }
    parts.extend(binding.validation.notes.clone());
    if parts.is_empty() {
        "No project environment detected; shell uses system PATH.".to_string()
    } else {
        parts.join(" · ")
    }
}

fn format_file_change_detail(item: &serde_json::Map<String, Value>) -> String {
    let changes = item
        .get("changes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_object)
        .filter_map(|change| change.get("path").and_then(Value::as_str))
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    if !changes.is_empty() {
        return changes.join(", ");
    }
    item.get("status")
        .and_then(Value::as_str)
        .unwrap_or("Pending changes")
        .to_string()
}

fn upsert_live_process_entry(
    live: &mut LiveWorkspaceState,
    id: String,
    thread_id: Option<String>,
    kind: CodexNewProcessKind,
    title: String,
    detail: String,
    files: Vec<CodexNewProcessFileRef>,
    status: CodexNewProcessStatus,
) {
    let entry = live
        .process_entries
        .entry(id.clone())
        .or_insert_with(|| LiveProcessEntry {
            id,
            thread_id: thread_id.clone(),
            kind,
            title: title.clone(),
            detail: String::new(),
            files: files.clone(),
            status,
            created_at: now_ms(),
        });
    entry.thread_id = thread_id.or_else(|| entry.thread_id.clone());
    entry.kind = kind;
    entry.title = title;
    if !detail.is_empty() {
        entry.detail = trim_text(detail, MAX_DETAIL_CHARS);
    }
    if !files.is_empty() {
        entry.files = files;
    }
    entry.status = status;
}

fn upsert_live_terminal_run(
    live: &mut LiveWorkspaceState,
    id: String,
    thread_id: Option<String>,
    title: String,
    command: String,
    cwd: String,
    status: CodexNewTerminalStatus,
    completed_at: Option<i64>,
    stdout_delta: Option<&str>,
    stderr_delta: Option<&str>,
) {
    let run = live
        .terminal_runs
        .entry(id.clone())
        .or_insert_with(|| LiveTerminalRun {
            id,
            thread_id: thread_id.clone(),
            title: title.clone(),
            command: command.clone(),
            cwd: cwd.clone(),
            status,
            started_at: now_ms(),
            completed_at,
            exit_code: None,
            stdout_excerpt: String::new(),
            stderr_excerpt: String::new(),
        });
    run.thread_id = thread_id.or_else(|| run.thread_id.clone());
    if !title.is_empty() {
        run.title = title;
    }
    if !command.is_empty() {
        run.command = command;
    }
    if !cwd.is_empty() {
        run.cwd = cwd;
    }
    if let Some(delta) = stdout_delta {
        append_limited_text(&mut run.stdout_excerpt, delta, MAX_OUTPUT_CHARS);
    }
    if let Some(delta) = stderr_delta {
        append_limited_text(&mut run.stderr_excerpt, delta, MAX_OUTPUT_CHARS);
    }
    run.status = status;
    if let Some(completed_at) = completed_at {
        run.completed_at = Some(completed_at);
    }
}

async fn refresh_workspace_task(app: &AppHandle, workspace_id: &str) -> Result<(), String> {
    let store = read_store(app)?;
    let Some(record) = store.sessions.get(workspace_id) else {
        return Ok(());
    };
    let core = core_for_app(app);
    core.refresh_changes(
        &core
            .task_artifact_root(&record.project_id, &record.task_id)
            .join("manifest.json"),
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

async fn mirror_item_lifecycle(
    state: &AppState,
    workspace_id: &str,
    thread_id: Option<String>,
    item: &serde_json::Map<String, Value>,
    completed: bool,
) {
    let Some(item_id) = item.get("id").and_then(Value::as_str) else {
        return;
    };
    let item_type = item
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if item_type.is_empty() {
        return;
    }
    let status = item
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let mut live = state.codex_new_live.lock().await;
    let workspace_live = live.entry(workspace_id.to_string()).or_default();
    match item_type {
        "plan" => {
            let detail = item
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or(&status)
                .to_string();
            upsert_live_process_entry(
                workspace_live,
                format!("live-plan-{item_id}"),
                thread_id,
                CodexNewProcessKind::Plan,
                "Plan".to_string(),
                detail,
                Vec::new(),
                process_status_from_item_status(&status, completed),
            );
        }
        "fileChange" => {
            let files = file_refs_from_paths(
                item.get("changes")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_object)
                    .filter_map(|change| change.get("path").and_then(Value::as_str))
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>(),
            );
            upsert_live_process_entry(
                workspace_live,
                format!("live-edit-{item_id}"),
                thread_id,
                CodexNewProcessKind::Edit,
                "File changes".to_string(),
                format_file_change_detail(item),
                files,
                process_status_from_item_status(&status, completed),
            );
        }
        "commandExecution" => {
            let command = join_command_parts(item.get("command"));
            let cwd = item
                .get("cwd")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let aggregated_output = item
                .get("aggregatedOutput")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let route = classify_shell_command(&command);
            workspace_live
                .command_routes
                .insert(item_id.to_string(), route.clone());
            let terminal_label = shell_command_terminal_label(&route, &command);
            if !route.mirrors_terminal_output() {
                let files = match &route {
                    ShellCommandRoute::FileRead { path } | ShellCommandRoute::FileWrite { path } => {
                        path.as_ref()
                            .map(|target| file_refs_from_paths(vec![target.clone()]))
                            .unwrap_or_default()
                    }
                    _ => Vec::new(),
                };
                upsert_live_process_entry(
                    workspace_live,
                    format!("live-command-{item_id}"),
                    thread_id.clone(),
                    CodexNewProcessKind::Edit,
                    shell_command_process_title(&route),
                    terminal_label.clone(),
                    files,
                    process_status_from_item_status(&status, completed),
                );
            }
            upsert_live_terminal_run(
                workspace_live,
                format!("live-command-{item_id}"),
                thread_id,
                terminal_label,
                if route.mirrors_terminal_output() {
                    command
                } else {
                    shell_command_terminal_label(&route, "")
                },
                cwd,
                terminal_status_from_item_status(&status, completed),
                completed.then_some(now_ms()),
                route
                    .mirrors_terminal_output()
                    .then(|| aggregated_output)
                    .filter(|output| !output.is_empty()),
                None,
            );
        }
        _ => {}
    }
}

async fn workspace_security_enabled(app: &AppHandle, workspace_id: &str) -> Result<bool, String> {
    Ok(read_store(app)?.sessions.contains_key(workspace_id))
}

fn thread_security_armed(store: &CodexNewDesktopStore, thread_id: &str) -> bool {
    store
        .thread_registry
        .get(thread_id)
        .and_then(|entry| entry.isolated_root.as_ref())
        .is_some_and(|path| !path.trim().is_empty())
}

pub(crate) async fn mirror_app_server_event(app: AppHandle, event: AppServerEvent) {
    let message = match event.message.as_object() {
        Some(message) => message,
        None => return,
    };
    let method = match message.get("method").and_then(Value::as_str) {
        Some(method) if !method.trim().is_empty() => method.trim(),
        _ => return,
    };
    let params = match message.get("params").and_then(Value::as_object) {
        Some(params) => params,
        None => return,
    };
    let Ok(enabled) = workspace_security_enabled(&app, &event.workspace_id).await else {
        return;
    };
    if !enabled {
        return;
    }
    let state = app.state::<AppState>();
    let thread_id = extract_thread_id(params);
    if let Some(thread_id) = thread_id.as_deref() {
        let Ok(store) = read_store(&app) else {
            return;
        };
        if !thread_security_armed(&store, thread_id) {
            return;
        }
    }
    match method {
        "item/started" => {
            if let Some(item) = params.get("item").and_then(Value::as_object) {
                mirror_item_lifecycle(&state, &event.workspace_id, thread_id, item, false).await;
            }
        }
        "item/completed" => {
            if let Some(item) = params.get("item").and_then(Value::as_object) {
                mirror_item_lifecycle(&state, &event.workspace_id, thread_id, item, true).await;
                if item.get("type").and_then(Value::as_str) == Some("fileChange") {
                    let _ = refresh_workspace_task(&app, &event.workspace_id).await;
                }
            }
        }
        "item/plan/delta" => {
            let item_id = params
                .get("itemId")
                .or_else(|| params.get("item_id"))
                .and_then(Value::as_str);
            let delta = params
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if let Some(item_id) = item_id {
                let mut live = state.codex_new_live.lock().await;
                let workspace_live = live.entry(event.workspace_id.clone()).or_default();
                let entry = workspace_live
                    .process_entries
                    .entry(format!("live-plan-{item_id}"))
                    .or_insert_with(|| LiveProcessEntry {
                        id: format!("live-plan-{item_id}"),
                        thread_id: thread_id.clone(),
                        kind: CodexNewProcessKind::Plan,
                        title: "Plan".to_string(),
                        detail: String::new(),
                        files: Vec::new(),
                        status: CodexNewProcessStatus::Running,
                        created_at: now_ms(),
                    });
                entry.thread_id = thread_id;
                entry.status = CodexNewProcessStatus::Running;
                append_limited_text(&mut entry.detail, delta, MAX_DETAIL_CHARS);
            }
        }
        "item/fileChange/outputDelta" => {
            let item_id = params
                .get("itemId")
                .or_else(|| params.get("item_id"))
                .and_then(Value::as_str);
            let delta = params
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if let Some(item_id) = item_id {
                let mut live = state.codex_new_live.lock().await;
                let workspace_live = live.entry(event.workspace_id.clone()).or_default();
                let entry = workspace_live
                    .process_entries
                    .entry(format!("live-edit-{item_id}"))
                    .or_insert_with(|| LiveProcessEntry {
                        id: format!("live-edit-{item_id}"),
                        thread_id: thread_id.clone(),
                        kind: CodexNewProcessKind::Edit,
                        title: "File changes".to_string(),
                        detail: String::new(),
                        files: Vec::new(),
                        status: CodexNewProcessStatus::Running,
                        created_at: now_ms(),
                    });
                entry.thread_id = thread_id;
                entry.status = CodexNewProcessStatus::Running;
                append_limited_text(&mut entry.detail, delta, MAX_DETAIL_CHARS);
            }
        }
        "item/commandExecution/outputDelta" => {
            let item_id = params
                .get("itemId")
                .or_else(|| params.get("item_id"))
                .and_then(Value::as_str);
            let delta = params
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if let Some(item_id) = item_id {
                let mut live = state.codex_new_live.lock().await;
                let workspace_live = live.entry(event.workspace_id.clone()).or_default();
                let route = workspace_live
                    .command_routes
                    .get(item_id)
                    .cloned()
                    .unwrap_or(ShellCommandRoute::Shell);
                if route.mirrors_terminal_output() {
                    upsert_live_terminal_run(
                        workspace_live,
                        format!("live-command-{item_id}"),
                        thread_id,
                        "Command".to_string(),
                        String::new(),
                        String::new(),
                        CodexNewTerminalStatus::Running,
                        None,
                        Some(delta),
                        None,
                    );
                } else {
                    let entry = workspace_live
                        .process_entries
                        .entry(format!("live-command-{item_id}"))
                        .or_insert_with(|| LiveProcessEntry {
                            id: format!("live-command-{item_id}"),
                            thread_id: thread_id.clone(),
                            kind: CodexNewProcessKind::Edit,
                            title: shell_command_process_title(&route),
                            detail: String::new(),
                            files: Vec::new(),
                            status: CodexNewProcessStatus::Running,
                            created_at: now_ms(),
                        });
                    entry.thread_id = thread_id;
                    entry.status = CodexNewProcessStatus::Running;
                    append_limited_text(&mut entry.detail, delta, MAX_DETAIL_CHARS);
                }
            }
        }
        "item/commandExecution/terminalInteraction" => {
            let item_id = params
                .get("itemId")
                .or_else(|| params.get("item_id"))
                .and_then(Value::as_str);
            let stdin = params
                .get("stdin")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if let Some(item_id) = item_id {
                let mut live = state.codex_new_live.lock().await;
                let workspace_live = live.entry(event.workspace_id.clone()).or_default();
                upsert_live_terminal_run(
                    workspace_live,
                    format!("live-command-{item_id}"),
                    thread_id,
                    "Command".to_string(),
                    String::new(),
                    String::new(),
                    CodexNewTerminalStatus::Running,
                    None,
                    Some(&format!("\n[stdin]\n{stdin}\n")),
                    None,
                );
            }
        }
        "thread/started" => {}
        "turn/completed" | "turn/diff/updated" => {
            let _ = refresh_workspace_task(&app, &event.workspace_id).await;
        }
        _ => {}
    }
}

fn read_output_excerpt(path: &Path) -> String {
    match fs::read(path) {
        Ok(bytes) => trim_text(String::from_utf8_lossy(&bytes).into_owned(), MAX_OUTPUT_CHARS),
        Err(_) => String::new(),
    }
}

fn map_latest_test(run: &codex_new_core::CommandRunRecord) -> CodexNewLatestTest {
    CodexNewLatestTest {
        command_run_id: run.id.clone(),
        command: run.command.clone(),
        status: run.status,
        exit_code: run.exit_code,
        started_at: timestamp_ms(run.started_at),
        completed_at: run.completed_at.map(timestamp_ms),
        stdout_excerpt: read_output_excerpt(&run.stdout_path),
        stderr_excerpt: read_output_excerpt(&run.stderr_path),
        failure_summary: run.failure_summary.clone(),
    }
}

fn timestamp_ms(value: chrono::DateTime<chrono::Utc>) -> i64 {
    value.timestamp_millis()
}

fn summarize_diff_stats(payload: &Value) -> String {
    let Some(stats) = payload.get("stats").and_then(Value::as_object) else {
        return "Diff updated".to_string();
    };
    let changed = stats
        .get("changedFiles")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let added = stats
        .get("addedFiles")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let modified = stats
        .get("modifiedFiles")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let deleted = stats
        .get("deletedFiles")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    format!("{changed} changed, {added} added, {modified} modified, {deleted} deleted")
}

fn map_timeline_event(event: &TimelineEvent) -> Option<CodexNewProcessEntry> {
    let payload = &event.payload;
    let (kind, title, detail, files, status) = match event.kind {
        TimelineEventKind::WorkspaceCreated => (
            CodexNewProcessKind::Workspace,
            "Isolated workspace created".to_string(),
            format!(
                "strategy: {}, branch: {}",
                payload
                    .get("strategy")
                    .and_then(Value::as_str)
                    .unwrap_or("auto"),
                payload
                    .get("branchName")
                    .and_then(Value::as_str)
                    .unwrap_or("n/a")
            ),
            Vec::new(),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::AgentPlan => (
            CodexNewProcessKind::Plan,
            "Plan update".to_string(),
            payload
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Plan updated")
                .to_string(),
            Vec::new(),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::AgentNote => (
            CodexNewProcessKind::Notice,
            "Agent note".to_string(),
            payload
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| payload.get("nextStep").and_then(Value::as_str))
                .or_else(|| payload.get("diagnosis").and_then(Value::as_str))
                .unwrap_or("Agent note recorded")
                .to_string(),
            Vec::new(),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::FileRead => (
            CodexNewProcessKind::Notice,
            "File read".to_string(),
            payload
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("unknown file")
                .to_string(),
            file_refs_from_paths(
                payload
                    .get("path")
                    .and_then(Value::as_str)
                    .map(|path| vec![path.to_string()])
                    .unwrap_or_default(),
            ),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::FileEditStarted => (
            CodexNewProcessKind::Edit,
            "Editing file".to_string(),
            payload
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("unknown file")
                .to_string(),
            file_refs_from_paths(
                payload
                    .get("path")
                    .and_then(Value::as_str)
                    .map(|path| vec![path.to_string()])
                    .unwrap_or_default(),
            ),
            CodexNewProcessStatus::Running,
        ),
        TimelineEventKind::FileEditCompleted => (
            CodexNewProcessKind::Edit,
            "File updated".to_string(),
            payload
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("unknown file")
                .to_string(),
            file_refs_from_paths(
                payload
                    .get("path")
                    .and_then(Value::as_str)
                    .map(|path| vec![path.to_string()])
                    .unwrap_or_default(),
            ),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::DiffUpdated => (
            CodexNewProcessKind::Edit,
            "Diff updated".to_string(),
            summarize_diff_stats(payload),
            file_refs_from_value(payload),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::ReviewCompleted => {
            let report = payload.get("report").and_then(Value::as_object);
            let summary = report
                .and_then(|report| report.get("summary"))
                .and_then(Value::as_str)
                .unwrap_or("Review completed");
            let disposition = report
                .and_then(|report| report.get("disposition"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_ascii_lowercase();
            (
                CodexNewProcessKind::Review,
                "Review completed".to_string(),
                summary.to_string(),
                Vec::new(),
                if disposition.contains("blocked") || disposition.contains("needs") {
                    CodexNewProcessStatus::Blocked
                } else {
                    CodexNewProcessStatus::Completed
                },
            )
        }
        TimelineEventKind::SummaryGenerated => (
            CodexNewProcessKind::Summary,
            "Task summary written".to_string(),
            payload
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("memory/task-summary.md")
                .to_string(),
            Vec::new(),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::MergeStarted => (
            CodexNewProcessKind::Review,
            "Merge started".to_string(),
            "Applying accepted files".to_string(),
            Vec::new(),
            CodexNewProcessStatus::Running,
        ),
        TimelineEventKind::MergeCompleted => (
            CodexNewProcessKind::Review,
            "Merge completed".to_string(),
            format!(
                "{} accepted, {} skipped",
                payload
                    .get("acceptedPaths")
                    .and_then(Value::as_array)
                    .map(Vec::len)
                    .unwrap_or_default(),
                payload
                    .get("skippedPaths")
                    .and_then(Value::as_array)
                    .map(Vec::len)
                    .unwrap_or_default()
            ),
            Vec::new(),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::RollbackCompleted => (
            CodexNewProcessKind::Review,
            "Rollback completed".to_string(),
            format!(
                "{} restored",
                payload
                    .get("restoredPaths")
                    .and_then(Value::as_array)
                    .map(Vec::len)
                    .unwrap_or_default()
            ),
            Vec::new(),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::TestStarted => (
            CodexNewProcessKind::Notice,
            "Test run started".to_string(),
            payload
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or("test")
                .to_string(),
            Vec::new(),
            CodexNewProcessStatus::Running,
        ),
        TimelineEventKind::TestCompleted => (
            CodexNewProcessKind::Notice,
            "Test run completed".to_string(),
            payload
                .get("outcome")
                .and_then(Value::as_object)
                .and_then(|outcome| outcome.get("status"))
                .and_then(Value::as_str)
                .unwrap_or("completed")
                .to_string(),
            Vec::new(),
            CodexNewProcessStatus::Completed,
        ),
        TimelineEventKind::Error => (
            CodexNewProcessKind::Notice,
            "Error".to_string(),
            trim_text(payload.to_string(), MAX_DETAIL_CHARS),
            Vec::new(),
            CodexNewProcessStatus::Blocked,
        ),
        _ => return None,
    };
    Some(CodexNewProcessEntry {
        id: format!("core-{}", event.id),
        kind,
        title,
        detail: trim_text(detail, MAX_DETAIL_CHARS),
        files,
        status,
        created_at: timestamp_ms(event.created_at),
    })
}

fn live_process_entry_to_frontend(entry: &LiveProcessEntry) -> CodexNewProcessEntry {
    CodexNewProcessEntry {
        id: entry.id.clone(),
        kind: entry.kind,
        title: entry.title.clone(),
        detail: trim_text(entry.detail.clone(), MAX_DETAIL_CHARS),
        files: entry.files.clone(),
        status: entry.status,
        created_at: entry.created_at,
    }
}

fn live_terminal_run_to_frontend(run: &LiveTerminalRun) -> CodexNewTerminalRun {
    CodexNewTerminalRun {
        id: run.id.clone(),
        title: run.title.clone(),
        command: run.command.clone(),
        cwd: run.cwd.clone(),
        status: run.status,
        started_at: run.started_at,
        completed_at: run.completed_at,
        exit_code: run.exit_code,
        stdout_excerpt: trim_text(run.stdout_excerpt.clone(), MAX_OUTPUT_CHARS),
        stderr_excerpt: trim_text(run.stderr_excerpt.clone(), MAX_OUTPUT_CHARS),
    }
}

async fn build_frontend_state(
    app: &AppHandle,
    state: &AppState,
) -> Result<CodexNewFrontendState, String> {
    let store = read_store(app)?;
    let mut workspace_security = BTreeMap::new();
    let core = core_for_app(app);
    let codex_new_data_root = codex_new_root(app);
    for (workspace_id, record) in &store.sessions {
        workspace_security.insert(
            workspace_id.clone(),
            CodexNewWorkspaceSecurityState {
                workspace_id: workspace_id.clone(),
                workspace_name: record.workspace_name.clone(),
                enabled_at: record.enabled_at,
                path_aliases: collect_workspace_path_aliases(
                    &core,
                    &codex_new_data_root,
                    record,
                ),
            },
        );
    }

    let mut active_session = None;
    let mut active_task = None;
    let mut process_entries = Vec::new();
    let mut terminal_runs = Vec::new();
    if let Some(active_workspace_id) = store.active_workspace_id.as_deref() {
        if let Some(record) = store.sessions.get(active_workspace_id) {
            let core = core_for_app(app);
            match core.get_task_overview(&record.project_id, &record.task_id) {
                Ok(overview) => {
                    active_session = Some(CodexNewSession {
                        workspace_id: record.workspace_id.clone(),
                        workspace_name: record.workspace_name.clone(),
                        workspace_path: overview
                            .manifest
                            .workspace_root
                            .to_string_lossy()
                            .to_string(),
                        thread_id: record.thread_id.clone(),
                        enabled_at: record.enabled_at,
                        source: "backend".to_string(),
                    });
                    let latest_test = overview
                        .command_runs
                        .iter()
                        .filter(|run| run.kind == CommandExecutionKind::Test)
                        .max_by_key(|run| run.started_at.timestamp_millis())
                        .map(map_latest_test);
                    let has_passing_test = overview.command_runs.iter().any(|run| {
                        run.kind == CommandExecutionKind::Test
                            && matches!(run.status, CommandRunStatus::Succeeded)
                    });
                    active_task = Some(CodexNewActiveTask {
                        project_id: overview.task.project_id.clone(),
                        task_id: overview.task.id.clone(),
                        title: overview.task.title.clone(),
                        status: overview.task.status,
                        original_root: overview
                            .manifest
                            .original_root
                            .to_string_lossy()
                            .to_string(),
                        workspace_root: overview
                            .manifest
                            .workspace_root
                            .to_string_lossy()
                            .to_string(),
                        environment_summary: overview
                            .manifest
                            .environment_binding
                            .as_ref()
                            .map(format_environment_summary),
                        project_settings: {
                            let settings = core
                                .read_project(&record.project_id)
                                .map(|project| project.settings)
                                .unwrap_or_else(|_| default_project_settings());
                            settings
                        },
                        suggested_test_commands: {
                            let settings = core
                                .read_project(&record.project_id)
                                .map(|project| project.settings)
                                .unwrap_or_else(|_| default_project_settings());
                            let mut suggested = settings.default_test_commands.clone();
                            suggested.extend(codex_new_core::detect_test_commands(
                                &overview.manifest.original_root,
                            ));
                            suggested.sort();
                            suggested.dedup();
                            suggested
                        },
                        changed_files: overview.manifest.changed_files.clone(),
                        diff: overview.diff.clone(),
                        review: overview.review.clone(),
                        latest_summary: overview.latest_summary.clone(),
                        latest_test,
                        has_passing_test,
                    });
                    let mut mapped = overview
                        .recent_activity
                        .iter()
                        .filter_map(map_timeline_event)
                        .collect::<Vec<_>>();
                    mapped.sort_by_key(|entry| entry.created_at);
                    process_entries.extend(mapped);
                    terminal_runs.extend(overview.command_runs.iter().map(|run| {
                        CodexNewTerminalRun {
                            id: format!("core-{}", run.id),
                            title: run.title.clone().unwrap_or_else(|| {
                                if run.kind == codex_new_core::CommandExecutionKind::Test {
                                    "Test run".to_string()
                                } else {
                                    "Command run".to_string()
                                }
                            }),
                            command: run.command.clone(),
                            cwd: run.cwd.to_string_lossy().to_string(),
                            status: match run.status {
                                codex_new_core::CommandRunStatus::Running => {
                                    CodexNewTerminalStatus::Running
                                }
                                codex_new_core::CommandRunStatus::Succeeded => {
                                    CodexNewTerminalStatus::Succeeded
                                }
                                codex_new_core::CommandRunStatus::Failed => {
                                    CodexNewTerminalStatus::Failed
                                }
                            },
                            started_at: timestamp_ms(run.started_at),
                            completed_at: run.completed_at.map(timestamp_ms),
                            exit_code: run.exit_code,
                            stdout_excerpt: read_output_excerpt(&run.stdout_path),
                            stderr_excerpt: read_output_excerpt(&run.stderr_path),
                        }
                    }));
                    let live = state.codex_new_live.lock().await;
                    if let Some(workspace_live) = live.get(active_workspace_id) {
                        let filtered_process = workspace_live
                            .process_entries
                            .values()
                            .filter(|entry| {
                                record.thread_id.is_none()
                                    || entry.thread_id.is_none()
                                    || entry.thread_id == record.thread_id
                            })
                            .map(live_process_entry_to_frontend)
                            .collect::<Vec<_>>();
                        let filtered_terminal = workspace_live
                            .terminal_runs
                            .values()
                            .filter(|run| {
                                record.thread_id.is_none()
                                    || run.thread_id.is_none()
                                    || run.thread_id == record.thread_id
                            })
                            .map(live_terminal_run_to_frontend)
                            .collect::<Vec<_>>();
                        process_entries.extend(filtered_process);
                        terminal_runs.extend(filtered_terminal);
                    }
                }
                Err(error) => {
                    active_session = Some(CodexNewSession {
                        workspace_id: record.workspace_id.clone(),
                        workspace_name: record.workspace_name.clone(),
                        workspace_path: record.original_workspace_path.clone(),
                        thread_id: record.thread_id.clone(),
                        enabled_at: record.enabled_at,
                        source: "backend".to_string(),
                    });
                    process_entries.push(CodexNewProcessEntry {
                        id: format!("error-{}-{}", record.workspace_id, now_ms()),
                        kind: CodexNewProcessKind::Notice,
                        title: "codex-new task unavailable".to_string(),
                        detail: trim_text(error.to_string(), MAX_DETAIL_CHARS),
                        files: Vec::new(),
                        status: CodexNewProcessStatus::Blocked,
                        created_at: now_ms(),
                    });
                }
            }
        }
    }

    if active_session.is_none() {
        if let Some(workspace_id) = store.active_workspace_id.as_deref() {
            if let Ok((workspace, _)) = resolve_workspace_context(state, workspace_id).await {
                let thread_id = store
                    .sessions
                    .get(workspace_id)
                    .and_then(|record| record.thread_id.clone());
                active_session = Some(CodexNewSession {
                    workspace_id: workspace.id.clone(),
                    workspace_name: workspace.name.clone(),
                    workspace_path: workspace.path.clone(),
                    thread_id,
                    enabled_at: store
                        .sessions
                        .get(workspace_id)
                        .map(|record| record.enabled_at)
                        .unwrap_or_else(now_ms),
                    source: "backend".to_string(),
                });
            }
        }
    }

    process_entries.sort_by_key(|entry| entry.created_at);
    terminal_runs.sort_by_key(|run| run.started_at);
    if process_entries.len() > MAX_PROCESS_ENTRIES {
        process_entries =
            process_entries.split_off(process_entries.len().saturating_sub(MAX_PROCESS_ENTRIES));
    }
    if terminal_runs.len() > MAX_TERMINAL_RUNS {
        terminal_runs =
            terminal_runs.split_off(terminal_runs.len().saturating_sub(MAX_TERMINAL_RUNS));
    }

    Ok(CodexNewFrontendState {
        active_session,
        active_task,
        workspace_security,
        thread_registry: store.thread_registry.clone(),
        data_paths: build_data_paths(app),
        process_entries,
        terminal_runs,
        last_updated_at: now_ms(),
    })
}

fn resolve_session_preview_roots(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<Vec<PathBuf>, String> {
    let record = resolve_session_record(app, workspace_id)?;
    let mut roots = Vec::new();
    let mut push_unique = |path: PathBuf| {
        if roots.iter().any(|existing| existing == &path) {
            return;
        }
        roots.push(path);
    };

    let core = core_for_app(app);
    if let Ok(overview) = core.get_task_overview(&record.project_id, &record.task_id) {
        push_unique(overview.manifest.workspace_root);
        push_unique(overview.manifest.original_root);
    }
    push_unique(PathBuf::from(record.original_workspace_path));
    Ok(roots)
}

fn resolve_session_record(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<CodexNewWorkspaceRecord, String> {
    let store = read_store(app)?;
    store
        .sessions
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| format!("Unknown codex-new workspace session: {workspace_id}"))
}

fn resolve_manifest_path(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<(CodexNewCore, CodexNewWorkspaceRecord, PathBuf), String> {
    let record = resolve_session_record(app, workspace_id)?;
    let core = core_for_app(app);
    let manifest_path = core
        .task_artifact_root(&record.project_id, &record.task_id)
        .join("manifest.json");
    Ok((core, record, manifest_path))
}

fn normalized_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn default_summary_result_for_task(
    diff: &DiffBundle,
    review: Option<&ReviewReport>,
    latest_test: Option<&CodexNewLatestTest>,
) -> String {
    let mut parts = vec![format!(
        "Prepared {} changed file(s) in the isolated workspace.",
        diff.stats.changed_files
    )];
    if let Some(review) = review {
        parts.push(review.summary.clone());
    }
    if let Some(test) = latest_test {
        let test_status = match test.status {
            CommandRunStatus::Running => "Latest test is still running".to_string(),
            CommandRunStatus::Succeeded => "Latest test passed".to_string(),
            CommandRunStatus::Failed => match test.exit_code {
                Some(code) => format!("Latest test failed with exit code {code}"),
                None => "Latest test failed".to_string(),
            },
        };
        parts.push(test_status);
    }
    parts.join(" ")
}

async fn apply_prepared_security_runtime(
    _app: &AppHandle,
    _state: &AppState,
    _workspace_id: &str,
    _prepared: &PreparedSecurityContext,
) -> Result<(), String> {
    // Isolation is enforced per turn via `resolve_turn_workspace_path` (cwd +
    // runtimeWorkspaceRoots + workspaceWrite sandbox). Respawning the codex
    // app-server child here would drop all in-memory threads and cause
    // "thread not found" on the next message.
    Ok(())
}

/// Exec approvals are redundant while a security-armed thread runs in an isolated workspace.
pub(crate) async fn security_exec_approval_isolated(
    app: &AppHandle,
    workspace_id: &str,
    thread_id: Option<&str>,
) -> Result<bool, String> {
    if !workspace_security_enabled(app, workspace_id).await? {
        return Ok(false);
    }
    let Some(thread_id) = thread_id.filter(|id| !id.trim().is_empty()) else {
        return Ok(false);
    };
    let store = read_store(app)?;
    Ok(thread_security_armed(&store, thread_id))
}

/// Security mode must not run with full-access; shell would write directly into the project tree.
pub(crate) async fn turn_access_mode_for_workspace(
    app: &AppHandle,
    workspace_id: &str,
    requested: Option<String>,
) -> Result<String, String> {
    if workspace_security_enabled(app, workspace_id).await? {
        return Ok("current".to_string());
    }
    Ok(requested.unwrap_or_else(|| "current".to_string()))
}

/// Effective cwd + writable roots for Codex turns while Security is armed.
pub(crate) async fn resolve_turn_workspace_path(
    app: &AppHandle,
    state: &AppState,
    workspace_id: &str,
    thread_id: Option<&str>,
) -> Result<String, String> {
    if let Some(path) = prepare_workspace_for_thread(app, state, workspace_id, thread_id).await? {
        return Ok(path);
    }
    let (workspace, _) = resolve_workspace_context(state, workspace_id).await?;
    Ok(workspace.path)
}

pub(crate) async fn prepare_workspace_for_thread(
    app: &AppHandle,
    state: &AppState,
    workspace_id: &str,
    thread_id: Option<&str>,
) -> Result<Option<String>, String> {
    if !workspace_security_enabled(app, workspace_id).await? {
        return Ok(None);
    }
    let Some(thread_id) = thread_id.filter(|id| !id.trim().is_empty()) else {
        return Ok(None);
    };
    let store = read_store(app)?;
    if !thread_security_armed(&store, thread_id) {
        return Ok(None);
    }
    let prepared =
        ensure_security_context(app, state, workspace_id, Some(thread_id), true, true).await?;
    apply_prepared_security_runtime(app, state, workspace_id, &prepared).await?;
    Ok(Some(prepared.workspace_root.to_string_lossy().to_string()))
}

pub(crate) async fn bind_workspace_thread(
    app: &AppHandle,
    state: &AppState,
    workspace_id: &str,
    thread_id: &str,
) -> Result<(), String> {
    if !workspace_security_enabled(app, workspace_id).await? {
        return Ok(());
    }
    let store = read_store(app)?;
    if !thread_security_armed(&store, thread_id) {
        return Ok(());
    }
    let prepared =
        ensure_security_context(app, state, workspace_id, Some(thread_id), true, true).await?;
    let isolated = prepared.workspace_root.to_string_lossy().to_string();
    register_workspace_thread(app, workspace_id, thread_id, Some(isolated.as_str())).await?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn codex_new_sync_viewing_context(
    input: CodexNewSessionInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let mut store = read_store(&app)?;
    store.active_workspace_id = Some(input.workspace_id.clone());
    if let Some(thread_id) = input
        .thread_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
    {
        if let Some(record) = store.sessions.get_mut(&input.workspace_id) {
            record.thread_id = Some(thread_id.to_string());
        }
    }
    apply_session_input_metadata(&mut store, &input);
    write_store(&app, &store)?;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_get_state(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_enable_security(
    input: CodexNewSessionInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let prepared = ensure_security_context(
        &app,
        &state,
        &input.workspace_id,
        input.thread_id.as_deref(),
        false,
        true,
    )
    .await?;
    apply_prepared_security_runtime(&app, &state, &input.workspace_id, &prepared).await?;
    let mut store = read_store(&app)?;
    apply_session_input_metadata(&mut store, &input);
    write_store(&app, &store)?;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_sync_thread_titles(
    workspace_id: String,
    entries: Vec<CodexNewThreadTitleSync>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let _ = state;
    let mut store = read_store(&app)?;
    for entry in entries {
        let Some(registry) = store.thread_registry.get_mut(&entry.thread_id) else {
            continue;
        };
        if registry.workspace_id != workspace_id {
            continue;
        }
        if let Some(title) = entry
            .thread_title
            .as_deref()
            .map(str::trim)
            .filter(|title| !title.is_empty())
        {
            registry.thread_title = Some(title.to_string());
            registry.updated_at = now_ms();
        }
    }
    write_store(&app, &store)?;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_focus_session(
    input: CodexNewSessionInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let mut store = read_store(&app)?;
    store.active_workspace_id = Some(input.workspace_id.clone());
    if let Some(thread_id) = input.thread_id.as_deref().filter(|id| !id.trim().is_empty()) {
        if thread_security_armed(&store, thread_id) {
            let prepared = ensure_security_context(
                &app,
                &state,
                &input.workspace_id,
                Some(thread_id),
                false,
                true,
            )
            .await?;
            apply_prepared_security_runtime(&app, &state, &input.workspace_id, &prepared).await?;
        } else if let Some(record) = store.sessions.get_mut(&input.workspace_id) {
            record.thread_id = Some(thread_id.to_string());
        }
    }
    apply_session_input_metadata(&mut store, &input);
    write_store(&app, &store)?;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_disable_security(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let (workspace, parent_workspace) = resolve_workspace_context(&state, &workspace_id).await?;
    let mut store = read_store(&app)?;
    let original_path = store
        .sessions
        .get(&workspace_id)
        .map(|record| record.original_workspace_path.clone())
        .unwrap_or_else(|| workspace.path.clone());
    store.sessions.remove(&workspace_id);
    if store.active_workspace_id.as_deref() == Some(workspace_id.as_str()) {
        store.active_workspace_id = None;
    }
    write_store(&app, &store)?;
    state.codex_new_live.lock().await.remove(&workspace_id);
    let should_restore_runtime = {
        let sessions = state.sessions.lock().await;
        sessions.contains_key(&workspace_id)
    };
    if should_restore_runtime
        && !workspace_session_matches_path(&state, &workspace_id, Path::new(&original_path)).await
    {
        replace_workspace_session(
            &app,
            &state,
            workspace,
            parent_workspace,
            Path::new(&original_path),
        )
        .await?;
    }
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_refresh_changes(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    refresh_workspace_task(&app, &workspace_id).await?;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_run_review(
    input: CodexNewWorkspaceActionInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let app_for_task = app.clone();
    let workspace_id = input.workspace_id;
    tokio::task::spawn_blocking(move || {
        let (core, record, _) = resolve_manifest_path(&app_for_task, &workspace_id)?;
        core.review_task(&record.project_id, &record.task_id)
            .map_err(|err| err.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|err| err.to_string())??;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_merge_changes(
    input: CodexNewMergeInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, _, manifest_path) = resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        let manifest =
            TaskManifest::read_from_path(&manifest_path).map_err(|err| err.to_string())?;
        let available_paths = manifest
            .changed_files
            .iter()
            .filter(|changed| !changed.accepted)
            .map(|changed| changed.path.clone())
            .collect::<Vec<_>>();
        let requested_hunks = input.hunks.unwrap_or_default();
        if !requested_hunks.is_empty() {
            let selections = requested_hunks
                .into_iter()
                .filter(|selection| {
                    available_paths
                        .iter()
                        .any(|candidate| candidate == &selection.path)
                })
                .map(|selection| HunkSelection {
                    path: selection.path,
                    hunk_index: selection.hunk_index,
                })
                .collect::<Vec<_>>();
            if selections.is_empty() {
                return Err("No unmerged hunks selected.".to_string());
            }
            return core
                .merge(
                    &manifest_path,
                    &MergeRequest {
                        selection: MergeSelection::Hunks(selections),
                    },
                )
                .map_err(|err| err.to_string())
                .map(|_| ());
        }

        let requested_paths = input.paths.unwrap_or_default();
        let selected_paths = if requested_paths.is_empty() {
            available_paths
        } else {
            requested_paths
                .into_iter()
                .filter(|path| available_paths.iter().any(|candidate| candidate == path))
                .collect::<Vec<_>>()
        };
        if selected_paths.is_empty() {
            return Err("No unmerged files selected.".to_string());
        }
        core.merge(
            &manifest_path,
            &MergeRequest {
                selection: MergeSelection::Files(selected_paths),
            },
        )
        .map_err(|err| err.to_string())
        .map(|_| ())
    })
    .await
    .map_err(|err| err.to_string())??;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_rollback_task(
    input: CodexNewRollbackInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, _, manifest_path) = resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        let manifest =
            TaskManifest::read_from_path(&manifest_path).map_err(|err| err.to_string())?;
        let merged_paths = manifest
            .changed_files
            .iter()
            .filter(|changed| changed.accepted)
            .map(|changed| changed.path.clone())
            .collect::<Vec<_>>();
        if merged_paths.is_empty() {
            return Err("No merged files are available for rollback.".to_string());
        }

        let selection = if let Some(hunks) = input.hunks {
            let selections = hunks
                .into_iter()
                .filter(|selection| {
                    merged_paths
                        .iter()
                        .any(|candidate| candidate == &selection.path)
                })
                .map(|selection| HunkSelection {
                    path: selection.path,
                    hunk_index: selection.hunk_index,
                })
                .collect::<Vec<_>>();
            if selections.is_empty() {
                return Err("No merged hunks selected for rollback.".to_string());
            }
            RollbackSelection::Hunks(selections)
        } else {
            let requested_paths = input.paths.unwrap_or_default();
            let selected_paths = if requested_paths.is_empty() {
                merged_paths
            } else {
                requested_paths
                    .into_iter()
                    .filter(|path| merged_paths.iter().any(|candidate| candidate == path))
                    .collect::<Vec<_>>()
            };
            if selected_paths.is_empty() {
                return Err("No merged files selected for rollback.".to_string());
            }
            RollbackSelection::Files(selected_paths)
        };

        core.rollback(
            &manifest_path,
            &RollbackRequest { selection },
        )
        .map_err(|err| err.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|err| err.to_string())??;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_write_summary(
    input: CodexNewSummaryInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, record, manifest_path) =
            resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        let overview = core
            .get_task_overview(&record.project_id, &record.task_id)
            .map_err(|err| err.to_string())?;
        let latest_test = overview
            .command_runs
            .iter()
            .filter(|run| run.kind == CommandExecutionKind::Test)
            .max_by_key(|run| run.started_at.timestamp_millis())
            .map(map_latest_test);
        let goal =
            normalized_string(input.goal.as_deref()).unwrap_or_else(|| overview.task.title.clone());
        let result = normalized_string(input.result.as_deref()).unwrap_or_else(|| {
            default_summary_result_for_task(
                &overview.diff,
                overview.review.as_ref(),
                latest_test.as_ref(),
            )
        });
        core.write_task_summary(&manifest_path, &goal, &result)
            .map_err(|err| err.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|err| err.to_string())??;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_run_test(
    input: CodexNewTestInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let command = normalized_string(Some(&input.command))
            .ok_or_else(|| "Enter a test command before running tests.".to_string())?;
        let (core, _, manifest_path) = resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        core.run_test_command_request(
            &manifest_path,
            TestExecutionRequest {
                command,
                use_environment_binding: input.use_environment_binding.unwrap_or(true),
                env_overrides: BTreeMap::new(),
                profile_id: None,
                retry_of: normalized_string(input.retry_of.as_deref()),
                title: normalized_string(input.title.as_deref()).or(Some("Test run".to_string())),
            },
        )
        .map_err(|err| err.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|err| err.to_string())??;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_read_file_preview(
    input: CodexNewFilePreviewInput,
    app: AppHandle,
) -> Result<CodexNewFilePreview, String> {
    let roots = resolve_session_preview_roots(&app, &input.workspace_id)?;
    Ok(read_file_preview(&roots, &input.path))
}

#[tauri::command]
pub(crate) async fn codex_new_list_traceback(
    input: CodexNewWorkspaceActionInput,
    app: AppHandle,
) -> Result<Vec<TracebackEntry>, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, record, _) = resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        core.list_traceback(&record.project_id, &record.task_id)
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub(crate) async fn codex_new_restore_traceback(
    input: CodexNewTracebackRestoreInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let target = match input.target.as_str() {
        "project" => TracebackRestoreTarget::Project,
        "workspace" => TracebackRestoreTarget::Workspace,
        _ => {
            return Err("Traceback restore target must be \"project\" or \"workspace\".".to_string());
        }
    };
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, record, manifest_path) =
            resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        let outcome = core
            .restore_traceback(
                &record.project_id,
                &record.task_id,
                &input.path,
                target,
            )
            .map_err(|err| err.to_string())?;
        core.refresh_changes(&manifest_path)
            .map_err(|err| err.to_string())?;
        Ok::<TracebackRestoreOutcome, String>(outcome)
    })
    .await
    .map_err(|err| err.to_string())??;
    build_frontend_state(&app, &state).await
}

#[tauri::command]
pub(crate) async fn codex_new_list_memory_candidates(
    input: CodexNewWorkspaceActionInput,
    app: AppHandle,
) -> Result<Vec<CandidateMemoryRecord>, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, record, _) = resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        core.list_memory_candidates(&record.project_id, &record.task_id)
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub(crate) async fn codex_new_apply_memory_candidates(
    input: CodexNewMemoryApplyInput,
    app: AppHandle,
) -> Result<MemoryApplyOutcome, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, record, _) = resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        if input.candidate_ids.is_empty() {
            return Err("Select at least one memory candidate.".to_string());
        }
        core.apply_memory_candidates(
            &record.project_id,
            &record.task_id,
            &input.candidate_ids,
        )
        .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        append_limited_text, process_status_from_item_status, terminal_status_from_item_status,
        trim_text, CodexNewProcessStatus, CodexNewTerminalStatus,
    };

    #[test]
    fn trim_text_keeps_tail() {
        assert_eq!(trim_text("abcdef", 3), "def");
    }

    #[test]
    fn append_limited_text_keeps_recent_content() {
        let mut buffer = String::from("abc");
        append_limited_text(&mut buffer, "defgh", 5);
        assert_eq!(buffer, "defgh");
    }

    #[test]
    fn maps_process_statuses() {
        assert_eq!(
            process_status_from_item_status("running", false),
            CodexNewProcessStatus::Running
        );
        assert_eq!(
            process_status_from_item_status("blocked", true),
            CodexNewProcessStatus::Blocked
        );
        assert_eq!(
            process_status_from_item_status("completed", true),
            CodexNewProcessStatus::Completed
        );
    }

    #[test]
    fn maps_terminal_statuses() {
        assert_eq!(
            terminal_status_from_item_status("running", false),
            CodexNewTerminalStatus::Running
        );
        assert_eq!(
            terminal_status_from_item_status("failed", true),
            CodexNewTerminalStatus::Failed
        );
        assert_eq!(
            terminal_status_from_item_status("completed", true),
            CodexNewTerminalStatus::Succeeded
        );
    }
}
