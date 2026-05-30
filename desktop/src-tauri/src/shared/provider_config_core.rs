use reqwest::header::AUTHORIZATION;
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::sync::Mutex;
use toml_edit::{value, Document, Item, Table};

use crate::backend::app_server::WorkspaceSession;
use crate::codex::home::resolve_default_codex_home;
use crate::codex::home::resolve_workspace_codex_home;
use crate::shared::config_toml_core;
use crate::shared::process_core::kill_child_process_tree;
use crate::shared::provider_compat_bridge;
use crate::shared::workspaces_core::workspace_session_spawn_lock;
use crate::storage::write_settings;
use crate::types::{
    AppSettings, ModelProviderCompatKind, ModelProviderCompatSettings,
    ModelProviderHistoryEntry as StoredModelProviderHistoryEntry, WorkspaceEntry,
};

const CHATGPT_PROVIDER_ID: &str = "openai";
const AMAZON_BEDROCK_PROVIDER_ID: &str = "amazon-bedrock";
const MANAGED_PROVIDER_ID: &str = "codexstudy-provider";
const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const DEFAULT_QWEN_BASE_URL: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_DOUBAO_BASE_URL: &str = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_OLLAMA_BASE_URL: &str = "http://localhost:11434/v1";
const DEFAULT_LMSTUDIO_BASE_URL: &str = "http://localhost:1234/v1";
const DEFAULT_BEDROCK_BASE_URL: &str = "https://bedrock-mantle.us-east-1.api.aws/openai/v1";
const DEFAULT_CLAUDE_BASE_URL: &str = "https://api.anthropic.com/v1";
const DEFAULT_GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1";
const DEFAULT_ZHIPU_BASE_URL: &str = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MOONSHOT_BASE_URL: &str = "https://api.moonshot.cn/v1";
const DEFAULT_BAICHUAN_BASE_URL: &str = "https://api.baichuan-ai.com/v1";
const DEFAULT_MINIMAX_BASE_URL: &str = "https://api.minimax.chat/v1";
const RESPONSES_WIRE_API: &str = "responses";
const MODEL_CACHE_FILE: &str = "models_cache.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ModelProviderPreset {
    Chatgpt,
    OpenaiApi,
    DeepSeek,
    Qwen,
    Doubao,
    Claude,
    Gemini,
    Zhipu,
    Moonshot,
    Baichuan,
    Minimax,
    CustomResponses,
    Ollama,
    LmStudio,
    AmazonBedrock,
}

impl ModelProviderPreset {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Chatgpt => "chatgpt",
            Self::OpenaiApi => "openaiApi",
            Self::DeepSeek => "deepSeek",
            Self::Qwen => "qwen",
            Self::Doubao => "doubao",
            Self::Claude => "claude",
            Self::Gemini => "gemini",
            Self::Zhipu => "zhipu",
            Self::Moonshot => "moonshot",
            Self::Baichuan => "baichuan",
            Self::Minimax => "minimax",
            Self::CustomResponses => "customResponses",
            Self::Ollama => "ollama",
            Self::LmStudio => "lmstudio",
            Self::AmazonBedrock => "amazonBedrock",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ModelProviderAuthMode {
    Chatgpt,
    ApiKey,
    None,
    Aws,
}

impl ModelProviderAuthMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Chatgpt => "chatgpt",
            Self::ApiKey => "apiKey",
            Self::None => "none",
            Self::Aws => "aws",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ModelProviderConnectionMode {
    ManagedLogin,
    Direct,
    CompatibilityBridge,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ModelProviderConnectionStatus {
    Ok,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelProviderSettingsDto {
    pub(crate) preset: ModelProviderPreset,
    pub(crate) provider_id: String,
    pub(crate) provider_name: String,
    pub(crate) base_url: Option<String>,
    pub(crate) effective_base_url: Option<String>,
    pub(crate) bridge_base_url: Option<String>,
    pub(crate) upstream_base_url: Option<String>,
    pub(crate) connection_mode: ModelProviderConnectionMode,
    pub(crate) auth_mode: ModelProviderAuthMode,
    pub(crate) api_key_configured: bool,
    pub(crate) aws_profile: Option<String>,
    pub(crate) aws_region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveModelProviderSettingsInput {
    pub(crate) preset: ModelProviderPreset,
    pub(crate) provider_name: Option<String>,
    pub(crate) base_url: Option<String>,
    pub(crate) auth_mode: Option<ModelProviderAuthMode>,
    pub(crate) api_key: Option<String>,
    pub(crate) aws_profile: Option<String>,
    pub(crate) aws_region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveModelProviderSettingsResult {
    pub(crate) settings: ModelProviderSettingsDto,
    pub(crate) history: Vec<ModelProviderHistoryEntryDto>,
    pub(crate) respawned: bool,
    pub(crate) affected_workspace_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelProviderHistoryEntryDto {
    pub(crate) id: String,
    pub(crate) preset: ModelProviderPreset,
    pub(crate) provider_name: String,
    pub(crate) base_url: Option<String>,
    pub(crate) auth_mode: ModelProviderAuthMode,
    pub(crate) aws_profile: Option<String>,
    pub(crate) aws_region: Option<String>,
    pub(crate) models: Vec<String>,
    pub(crate) last_used_at: i64,
    pub(crate) is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteModelProviderHistoryEntryResult {
    pub(crate) settings: ModelProviderSettingsDto,
    pub(crate) history: Vec<ModelProviderHistoryEntryDto>,
    pub(crate) removed_current: bool,
    pub(crate) respawned: bool,
    pub(crate) affected_workspace_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelProviderConnectionDiagnosticDto {
    pub(crate) preset: ModelProviderPreset,
    pub(crate) provider_name: String,
    pub(crate) status: ModelProviderConnectionStatus,
    pub(crate) can_test: bool,
    pub(crate) connection_mode: ModelProviderConnectionMode,
    pub(crate) effective_base_url: Option<String>,
    pub(crate) bridge_base_url: Option<String>,
    pub(crate) upstream_base_url: Option<String>,
    pub(crate) checked_url: Option<String>,
    pub(crate) response_status: Option<u16>,
    pub(crate) summary: String,
    pub(crate) detail: Option<String>,
    pub(crate) action_hint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RespawnSharedSessionResult {
    respawned: bool,
    affected_workspace_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ResolvedProviderConfig {
    preset: ModelProviderPreset,
    provider_id: String,
    provider_name: String,
    base_url: Option<String>,
    effective_base_url: Option<String>,
    bridge_base_url: Option<String>,
    upstream_base_url: Option<String>,
    connection_mode: ModelProviderConnectionMode,
    auth_mode: ModelProviderAuthMode,
    api_key_configured: bool,
    api_key: Option<String>,
    aws_profile: Option<String>,
    aws_region: Option<String>,
}

pub(crate) struct ChatCompletionCredentials {
    pub(crate) base_url: String,
    pub(crate) api_key: String,
}

pub(crate) fn chat_completion_credentials_core(
    app_settings: &AppSettings,
) -> Result<ChatCompletionCredentials, String> {
    let Some(codex_home) = resolve_default_codex_home() else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&codex_home)?;
    let resolved = resolve_provider_config(&document, app_settings.model_provider_compat.as_ref());
    let api_key = resolved
        .api_key
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            "Model provider API key is not configured. Open Settings > Model provider.".to_string()
        })?;
    let base_url = resolved
        .upstream_base_url
        .or(resolved.effective_base_url)
        .or(resolved.base_url)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Model provider base URL is not configured.".to_string())?;
    Ok(ChatCompletionCredentials { base_url, api_key })
}

pub(crate) fn get_model_provider_settings_core(
    app_settings: &AppSettings,
) -> Result<ModelProviderSettingsDto, String> {
    let Some(codex_home) = resolve_default_codex_home() else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&codex_home)?;
    Ok(read_settings_from_document(
        &document,
        app_settings.model_provider_compat.as_ref(),
    ))
}

pub(crate) async fn diagnose_model_provider_connection_core(
    app_settings: &AppSettings,
) -> Result<ModelProviderConnectionDiagnosticDto, String> {
    let Some(codex_home) = resolve_default_codex_home() else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&codex_home)?;
    let resolved = resolve_provider_config(&document, app_settings.model_provider_compat.as_ref());
    diagnose_provider_connection(&resolved).await
}

pub(crate) fn get_model_provider_history_core(
    app_settings: &AppSettings,
) -> Result<Vec<ModelProviderHistoryEntryDto>, String> {
    let Some(codex_home) = resolve_default_codex_home() else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&codex_home)?;
    let current_id =
        resolve_provider_history_entry_id(&document, app_settings.model_provider_compat.as_ref());
    Ok(history_entries_dto(
        &app_settings.model_provider_history,
        current_id.as_deref(),
    ))
}

pub(crate) async fn sync_current_model_provider_history_models_core(
    models: Vec<String>,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<Vec<ModelProviderHistoryEntryDto>, String> {
    let Some(codex_home) = resolve_default_codex_home() else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&codex_home)?;
    let mut settings = app_settings.lock().await;
    let current_id =
        resolve_provider_history_entry_id(&document, settings.model_provider_compat.as_ref());
    let Some(current_id) = current_id else {
        return Ok(history_entries_dto(&settings.model_provider_history, None));
    };
    if let Some(entry) = settings
        .model_provider_history
        .iter_mut()
        .find(|entry| entry.id == current_id)
    {
        entry.models = normalize_model_snapshot(models);
        write_settings(settings_path, &settings)?;
    }
    Ok(history_entries_dto(
        &settings.model_provider_history,
        Some(current_id.as_str()),
    ))
}

/// Ensures CodexStudy defaults in global config.toml (API-first login policy).
pub(crate) fn ensure_codexstudy_config_defaults() -> Result<(), String> {
    let Some(codex_home) = resolve_default_codex_home() else {
        return Ok(());
    };
    let (existed, mut document) = config_toml_core::load_global_config_document(&codex_home)?;
    let mut changed = false;
    if config_toml_core::read_top_level_string(&document, "forced_login_method").is_none() {
        config_toml_core::set_top_level_string(&mut document, "forced_login_method", Some("api"));
        changed = true;
    }
    if !existed || changed {
        config_toml_core::persist_global_config_document(&codex_home, &document)?;
    }
    Ok(())
}

fn is_qwen_managed_provider(provider_name: Option<&str>, base_url: Option<&str>) -> bool {
    provider_name
        .map(str::trim)
        .is_some_and(|name| name.eq_ignore_ascii_case("qwen"))
        || base_url
            .map(str::trim)
            .is_some_and(|url| url.to_ascii_lowercase().contains("dashscope.aliyuncs.com"))
}

/// Migrates legacy Qwen configs that still pointed at the local compatibility bridge.
pub(crate) fn reconcile_legacy_qwen_direct_responses_config() -> Result<bool, String> {
    let Some(codex_home) = resolve_default_codex_home() else {
        return Ok(false);
    };
    let (existed, mut document) = config_toml_core::load_global_config_document(&codex_home)?;
    if !existed {
        return Ok(false);
    }
    if config_toml_core::read_top_level_string(&document, "model_provider").as_deref()
        != Some(MANAGED_PROVIDER_ID)
    {
        return Ok(false);
    }
    let Some(provider) = read_provider_table(&document, MANAGED_PROVIDER_ID) else {
        return Ok(false);
    };
    let provider_name = read_table_string(provider, "name");
    let base_url = read_table_string(provider, "base_url");
    if !is_qwen_managed_provider(provider_name.as_deref(), base_url.as_deref()) {
        return Ok(false);
    }
    let Some(base_url) = base_url else {
        return Ok(false);
    };
    if !provider_compat_bridge::is_local_bridge_base_url(&base_url) {
        return Ok(false);
    }

    let provider = replace_provider_table(&mut document, MANAGED_PROVIDER_ID)?;
    set_table_string(provider, "base_url", Some(DEFAULT_QWEN_BASE_URL));
    config_toml_core::persist_global_config_document(&codex_home, &document)?;
    Ok(true)
}

pub(crate) async fn reconcile_legacy_qwen_compat_app_settings(
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<bool, String> {
    let mut settings = app_settings.lock().await;
    if settings
        .model_provider_compat
        .as_ref()
        .is_some_and(|compat| compat.kind == ModelProviderCompatKind::Qwen)
    {
        settings.model_provider_compat = None;
        write_settings(settings_path, &settings)?;
        return Ok(true);
    }
    Ok(false)
}

pub(crate) async fn save_model_provider_settings_core<F, Fut>(
    input: SaveModelProviderSettingsInput,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
    spawn_session: F,
) -> Result<SaveModelProviderSettingsResult, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
    let Some(codex_home) = resolve_default_codex_home() else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, mut document) = config_toml_core::load_global_config_document(&codex_home)?;
    apply_settings_to_document(&mut document, &input)?;
    config_toml_core::persist_global_config_document(&codex_home, &document)?;
    clear_models_cache_for_provider_switch(Some(&codex_home));
    let updated_app_settings = {
        let mut settings = app_settings.lock().await;
        apply_provider_compat_settings(&mut settings, &input)?;
        let resolved = resolve_provider_config(&document, settings.model_provider_compat.as_ref());
        upsert_provider_history_entry(&mut settings, &resolved);
        write_settings(settings_path, &settings)?;
        settings.clone()
    };
    provider_compat_bridge::ensure_running_for_app_settings(&updated_app_settings).await?;
    let respawn = respawn_shared_session_after_provider_change(
        workspaces,
        sessions,
        app_settings,
        spawn_session,
    )
    .await?;
    Ok(SaveModelProviderSettingsResult {
        settings: read_settings_from_document(
            &document,
            updated_app_settings.model_provider_compat.as_ref(),
        ),
        history: history_entries_dto(
            &updated_app_settings.model_provider_history,
            resolve_provider_history_entry_id(
                &document,
                updated_app_settings.model_provider_compat.as_ref(),
            )
            .as_deref(),
        ),
        respawned: respawn.respawned,
        affected_workspace_count: respawn.affected_workspace_count,
    })
}

pub(crate) async fn delete_model_provider_history_entry_core<F, Fut>(
    id: &str,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
    spawn_session: F,
) -> Result<DeleteModelProviderHistoryEntryResult, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
    let Some(codex_home) = resolve_default_codex_home() else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, mut document) = config_toml_core::load_global_config_document(&codex_home)?;
    let current_id = {
        let settings = app_settings.lock().await;
        resolve_provider_history_entry_id(&document, settings.model_provider_compat.as_ref())
    };
    let removed_current = current_id.as_deref() == Some(id);
    let mut respawn = RespawnSharedSessionResult {
        respawned: false,
        affected_workspace_count: 0,
    };
    let updated_app_settings = {
        let mut settings = app_settings.lock().await;
        let original_len = settings.model_provider_history.len();
        settings
            .model_provider_history
            .retain(|entry| entry.id != id);
        if settings.model_provider_history.len() == original_len {
            return Err("Saved API history entry not found.".to_string());
        }
        if removed_current {
            apply_settings_to_document(
                &mut document,
                &SaveModelProviderSettingsInput {
                    preset: ModelProviderPreset::Chatgpt,
                    provider_name: None,
                    base_url: None,
                    auth_mode: None,
                    api_key: None,
                    aws_profile: None,
                    aws_region: None,
                },
            )?;
            remove_provider_table(&mut document, MANAGED_PROVIDER_ID)?;
            config_toml_core::persist_global_config_document(&codex_home, &document)?;
            clear_models_cache_for_provider_switch(Some(&codex_home));
            apply_provider_compat_settings(
                &mut settings,
                &SaveModelProviderSettingsInput {
                    preset: ModelProviderPreset::Chatgpt,
                    provider_name: None,
                    base_url: None,
                    auth_mode: None,
                    api_key: None,
                    aws_profile: None,
                    aws_region: None,
                },
            )?;
        }
        write_settings(settings_path, &settings)?;
        settings.clone()
    };
    if removed_current {
        provider_compat_bridge::ensure_running_for_app_settings(&updated_app_settings).await?;
        respawn = respawn_shared_session_after_provider_change(
            workspaces,
            sessions,
            app_settings,
            spawn_session,
        )
        .await?;
    }
    let settings = read_settings_from_document(
        &document,
        updated_app_settings.model_provider_compat.as_ref(),
    );
    let history = history_entries_dto(
        &updated_app_settings.model_provider_history,
        resolve_provider_history_entry_id(
            &document,
            updated_app_settings.model_provider_compat.as_ref(),
        )
        .as_deref(),
    );
    Ok(DeleteModelProviderHistoryEntryResult {
        settings,
        history,
        removed_current,
        respawned: respawn.respawned,
        affected_workspace_count: respawn.affected_workspace_count,
    })
}

fn read_settings_from_document(
    document: &Document,
    provider_compat: Option<&ModelProviderCompatSettings>,
) -> ModelProviderSettingsDto {
    let resolved = resolve_provider_config(document, provider_compat);
    resolved_provider_settings_dto(&resolved)
}

fn resolved_provider_settings_dto(resolved: &ResolvedProviderConfig) -> ModelProviderSettingsDto {
    ModelProviderSettingsDto {
        preset: resolved.preset.clone(),
        provider_id: resolved.provider_id.clone(),
        provider_name: resolved.provider_name.clone(),
        base_url: resolved.base_url.clone(),
        effective_base_url: resolved.effective_base_url.clone(),
        bridge_base_url: resolved.bridge_base_url.clone(),
        upstream_base_url: resolved.upstream_base_url.clone(),
        connection_mode: resolved.connection_mode.clone(),
        auth_mode: resolved.auth_mode.clone(),
        api_key_configured: resolved.api_key_configured,
        aws_profile: resolved.aws_profile.clone(),
        aws_region: resolved.aws_region.clone(),
    }
}

fn history_entries_dto(
    entries: &[StoredModelProviderHistoryEntry],
    current_id: Option<&str>,
) -> Vec<ModelProviderHistoryEntryDto> {
    let mut history = entries
        .iter()
        .map(|entry| ModelProviderHistoryEntryDto {
            id: entry.id.clone(),
            preset: parse_history_preset(entry.preset.as_str()),
            provider_name: entry.provider_name.clone(),
            base_url: entry.base_url.clone(),
            auth_mode: parse_history_auth_mode(entry.auth_mode.as_str()),
            aws_profile: entry.aws_profile.clone(),
            aws_region: entry.aws_region.clone(),
            models: entry.models.clone(),
            last_used_at: entry.last_used_at,
            is_current: current_id.is_some_and(|value| value == entry.id),
        })
        .collect::<Vec<_>>();
    history.sort_by(|left, right| {
        right
            .last_used_at
            .cmp(&left.last_used_at)
            .then_with(|| left.provider_name.cmp(&right.provider_name))
    });
    history
}

fn resolve_provider_history_entry_id(
    document: &Document,
    provider_compat: Option<&ModelProviderCompatSettings>,
) -> Option<String> {
    let resolved = resolve_provider_config(document, provider_compat);
    history_entry_id_from_resolved(&resolved)
}

fn history_entry_id_from_resolved(resolved: &ResolvedProviderConfig) -> Option<String> {
    if matches!(resolved.preset, ModelProviderPreset::Chatgpt) {
        return None;
    }
    Some(history_entry_id(
        resolved.preset.as_str(),
        resolved.base_url.as_deref(),
        resolved.auth_mode.as_str(),
        resolved.aws_profile.as_deref(),
        resolved.aws_region.as_deref(),
    ))
}

fn history_entry_id(
    preset: &str,
    base_url: Option<&str>,
    auth_mode: &str,
    aws_profile: Option<&str>,
    aws_region: Option<&str>,
) -> String {
    format!(
        "{preset}|{auth_mode}|{}|{}|{}",
        normalize_history_segment(base_url.unwrap_or_default()),
        normalize_history_segment(aws_profile.unwrap_or_default()),
        normalize_history_segment(aws_region.unwrap_or_default())
    )
}

fn normalize_history_segment(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn parse_history_preset(value: &str) -> ModelProviderPreset {
    match value {
        "chatgpt" => ModelProviderPreset::Chatgpt,
        "openaiApi" => ModelProviderPreset::OpenaiApi,
        "deepSeek" => ModelProviderPreset::DeepSeek,
        "qwen" => ModelProviderPreset::Qwen,
        "doubao" => ModelProviderPreset::Doubao,
        "claude" => ModelProviderPreset::Claude,
        "gemini" => ModelProviderPreset::Gemini,
        "zhipu" => ModelProviderPreset::Zhipu,
        "moonshot" => ModelProviderPreset::Moonshot,
        "baichuan" => ModelProviderPreset::Baichuan,
        "minimax" => ModelProviderPreset::Minimax,
        "ollama" => ModelProviderPreset::Ollama,
        "lmstudio" => ModelProviderPreset::LmStudio,
        "amazonBedrock" => ModelProviderPreset::AmazonBedrock,
        _ => ModelProviderPreset::CustomResponses,
    }
}

fn parse_history_auth_mode(value: &str) -> ModelProviderAuthMode {
    match value {
        "chatgpt" => ModelProviderAuthMode::Chatgpt,
        "apiKey" => ModelProviderAuthMode::ApiKey,
        "aws" => ModelProviderAuthMode::Aws,
        _ => ModelProviderAuthMode::None,
    }
}

fn current_time_ms() -> i64 {
    let Ok(duration) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        return 0;
    };
    i64::try_from(duration.as_millis()).unwrap_or(i64::MAX)
}

fn normalize_model_snapshot(models: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for model in models {
        let trimmed = model.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_ascii_lowercase();
        if !seen.insert(key) {
            continue;
        }
        normalized.push(trimmed.to_string());
    }
    normalized
}

fn upsert_provider_history_entry(
    settings: &mut AppSettings,
    resolved: &ResolvedProviderConfig,
) -> Option<String> {
    let id = history_entry_id_from_resolved(resolved)?;
    let last_used_at = current_time_ms();
    if let Some(entry) = settings
        .model_provider_history
        .iter_mut()
        .find(|entry| entry.id == id)
    {
        entry.preset = resolved.preset.as_str().to_string();
        entry.provider_name = resolved.provider_name.clone();
        entry.base_url = resolved.base_url.clone();
        entry.auth_mode = resolved.auth_mode.as_str().to_string();
        entry.aws_profile = resolved.aws_profile.clone();
        entry.aws_region = resolved.aws_region.clone();
        entry.last_used_at = last_used_at;
    } else {
        settings
            .model_provider_history
            .push(StoredModelProviderHistoryEntry {
                id: id.clone(),
                preset: resolved.preset.as_str().to_string(),
                provider_name: resolved.provider_name.clone(),
                base_url: resolved.base_url.clone(),
                auth_mode: resolved.auth_mode.as_str().to_string(),
                aws_profile: resolved.aws_profile.clone(),
                aws_region: resolved.aws_region.clone(),
                models: Vec::new(),
                last_used_at,
            });
    }
    settings.model_provider_history.sort_by(|left, right| {
        right
            .last_used_at
            .cmp(&left.last_used_at)
            .then_with(|| left.provider_name.cmp(&right.provider_name))
    });
    Some(id)
}

fn resolve_provider_config(
    document: &Document,
    provider_compat: Option<&ModelProviderCompatSettings>,
) -> ResolvedProviderConfig {
    let active_provider_id = config_toml_core::read_top_level_string(document, "model_provider")
        .unwrap_or_else(|| CHATGPT_PROVIDER_ID.to_string());

    if active_provider_id == CHATGPT_PROVIDER_ID {
        let base_url = config_toml_core::read_top_level_string(document, "openai_base_url");
        return ResolvedProviderConfig {
            preset: ModelProviderPreset::Chatgpt,
            provider_id: CHATGPT_PROVIDER_ID.to_string(),
            provider_name: "ChatGPT / OpenAI".to_string(),
            base_url: base_url.clone(),
            effective_base_url: base_url,
            bridge_base_url: None,
            upstream_base_url: None,
            connection_mode: ModelProviderConnectionMode::ManagedLogin,
            auth_mode: ModelProviderAuthMode::Chatgpt,
            api_key_configured: false,
            api_key: None,
            aws_profile: None,
            aws_region: None,
        };
    }

    if active_provider_id == AMAZON_BEDROCK_PROVIDER_ID {
        let bedrock = read_provider_table(document, AMAZON_BEDROCK_PROVIDER_ID);
        let aws_profile =
            bedrock.and_then(|provider| read_nested_table_string(provider, "aws", "profile"));
        let aws_region =
            bedrock.and_then(|provider| read_nested_table_string(provider, "aws", "region"));
        let base_url = Some(DEFAULT_BEDROCK_BASE_URL.to_string());
        return ResolvedProviderConfig {
            preset: ModelProviderPreset::AmazonBedrock,
            provider_id: AMAZON_BEDROCK_PROVIDER_ID.to_string(),
            provider_name: "Amazon Bedrock".to_string(),
            base_url: base_url.clone(),
            effective_base_url: base_url,
            bridge_base_url: None,
            upstream_base_url: None,
            connection_mode: ModelProviderConnectionMode::Direct,
            auth_mode: ModelProviderAuthMode::Aws,
            api_key_configured: false,
            api_key: None,
            aws_profile,
            aws_region,
        };
    }

    let provider = read_provider_table(document, &active_provider_id);
    let provider_name = provider
        .and_then(|table| read_table_string(table, "name"))
        .unwrap_or_else(|| active_provider_id.clone());
    let configured_base_url = provider.and_then(|table| read_table_string(table, "base_url"));
    let api_key = provider.and_then(|table| read_table_string(table, "experimental_bearer_token"));
    let api_key_configured = api_key.is_some();
    let auth_mode = if provider
        .and_then(|table| read_nested_table_string(table, "aws", "region"))
        .is_some()
        || provider
            .and_then(|table| read_nested_table_string(table, "aws", "profile"))
            .is_some()
    {
        ModelProviderAuthMode::Aws
    } else if api_key_configured
        || provider
            .and_then(|table| table.get("requires_openai_auth"))
            .and_then(Item::as_bool)
            .unwrap_or(false)
        || provider
            .and_then(|table| table.get("env_key"))
            .and_then(Item::as_str)
            .is_some()
    {
        ModelProviderAuthMode::ApiKey
    } else {
        ModelProviderAuthMode::None
    };

    let preset = infer_custom_preset(
        active_provider_id.as_str(),
        provider_name.as_str(),
        configured_base_url.as_deref(),
        &auth_mode,
        provider_compat,
    );

    let (base_url, effective_base_url, bridge_base_url, upstream_base_url, connection_mode) =
        if active_provider_id == MANAGED_PROVIDER_ID {
            if let Some(compat) = provider_compat {
                let bridge_base_url = configured_base_url.clone();
                (
                    Some(compat.upstream_base_url.clone()),
                    bridge_base_url.clone(),
                    bridge_base_url,
                    Some(compat.upstream_base_url.clone()),
                    ModelProviderConnectionMode::CompatibilityBridge,
                )
            } else {
                (
                    configured_base_url.clone(),
                    configured_base_url.clone(),
                    None,
                    None,
                    ModelProviderConnectionMode::Direct,
                )
            }
        } else {
            (
                configured_base_url.clone(),
                configured_base_url.clone(),
                None,
                None,
                ModelProviderConnectionMode::Direct,
            )
        };

    ResolvedProviderConfig {
        preset,
        provider_id: active_provider_id,
        provider_name,
        base_url,
        effective_base_url,
        bridge_base_url,
        upstream_base_url,
        connection_mode,
        auth_mode,
        api_key_configured,
        api_key,
        aws_profile: None,
        aws_region: None,
    }
}

async fn diagnose_provider_connection(
    resolved: &ResolvedProviderConfig,
) -> Result<ModelProviderConnectionDiagnosticDto, String> {
    if matches!(
        resolved.connection_mode,
        ModelProviderConnectionMode::ManagedLogin
    ) {
        return Ok(ModelProviderConnectionDiagnosticDto {
            preset: resolved.preset.clone(),
            provider_name: resolved.provider_name.clone(),
            status: ModelProviderConnectionStatus::Warning,
            can_test: false,
            connection_mode: resolved.connection_mode.clone(),
            effective_base_url: resolved.effective_base_url.clone(),
            bridge_base_url: resolved.bridge_base_url.clone(),
            upstream_base_url: resolved.upstream_base_url.clone(),
            checked_url: None,
            response_status: None,
            summary: "This provider uses Codex's managed login flow.".to_string(),
            detail: Some(
                "There is no standalone Responses API base URL to probe from settings.".to_string(),
            ),
            action_hint: None,
        });
    }

    let Some(effective_base_url) = resolved.effective_base_url.as_deref() else {
        return Ok(ModelProviderConnectionDiagnosticDto {
            preset: resolved.preset.clone(),
            provider_name: resolved.provider_name.clone(),
            status: ModelProviderConnectionStatus::Error,
            can_test: false,
            connection_mode: resolved.connection_mode.clone(),
            effective_base_url: None,
            bridge_base_url: resolved.bridge_base_url.clone(),
            upstream_base_url: resolved.upstream_base_url.clone(),
            checked_url: None,
            response_status: None,
            summary: "No base URL is configured for this provider.".to_string(),
            detail: None,
            action_hint: Some("Save a base URL first, then run the route test again.".to_string()),
        });
    };

    let checked_url = join_url(effective_base_url, "models");
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|err| err.to_string())?;

    if matches!(
        resolved.connection_mode,
        ModelProviderConnectionMode::CompatibilityBridge
    ) {
        let bridge_health_url = bridge_health_url(effective_base_url);
        if let Ok(bridge_health) = client.get(&bridge_health_url).send().await {
            if !bridge_health.status().is_success() {
                return Ok(ModelProviderConnectionDiagnosticDto {
                    preset: resolved.preset.clone(),
                    provider_name: resolved.provider_name.clone(),
                    status: ModelProviderConnectionStatus::Error,
                    can_test: true,
                    connection_mode: resolved.connection_mode.clone(),
                    effective_base_url: resolved.effective_base_url.clone(),
                    bridge_base_url: resolved.bridge_base_url.clone(),
                    upstream_base_url: resolved.upstream_base_url.clone(),
                    checked_url: Some(checked_url),
                    response_status: Some(bridge_health.status().as_u16()),
                    summary: "The local compatibility bridge did not respond cleanly.".to_string(),
                    detail: Some(format!(
                        "GET {} returned HTTP {}.",
                        bridge_health_url,
                        bridge_health.status()
                    )),
                    action_hint: Some(
                        "Restart CodexStudy and run the route test again.".to_string(),
                    ),
                });
            }
        }
    }

    let mut request = client.get(&checked_url);
    if let Some(api_key) = resolved.api_key.as_deref() {
        request = request.header(AUTHORIZATION, format!("Bearer {api_key}"));
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(err) => {
            return Ok(ModelProviderConnectionDiagnosticDto {
                preset: resolved.preset.clone(),
                provider_name: resolved.provider_name.clone(),
                status: ModelProviderConnectionStatus::Error,
                can_test: true,
                connection_mode: resolved.connection_mode.clone(),
                effective_base_url: resolved.effective_base_url.clone(),
                bridge_base_url: resolved.bridge_base_url.clone(),
                upstream_base_url: resolved.upstream_base_url.clone(),
                checked_url: Some(checked_url.clone()),
                response_status: None,
                summary: format!(
                    "Couldn't reach {}.",
                    route_host_label(
                        resolved
                            .upstream_base_url
                            .as_deref()
                            .unwrap_or(effective_base_url)
                    )
                ),
                detail: Some(err.to_string()),
                action_hint: Some(route_failure_hint(resolved)),
            });
        }
    };

    let status = response.status();
    let body_text = response.text().await.unwrap_or_default();
    let detail = summarize_response_detail(&body_text);

    let (diagnostic_status, summary, action_hint) = match status {
        value if value.is_success() => (
            ModelProviderConnectionStatus::Ok,
            success_summary(resolved),
            None,
        ),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => (
            ModelProviderConnectionStatus::Warning,
            "The endpoint responded, but the current credentials were rejected.".to_string(),
            Some("Save a valid API key and run the route test again.".to_string()),
        ),
        StatusCode::BAD_GATEWAY
            if matches!(
                resolved.connection_mode,
                ModelProviderConnectionMode::CompatibilityBridge
            ) =>
        (
            ModelProviderConnectionStatus::Error,
            bridge_upstream_failure_summary(resolved),
            Some(route_failure_hint(resolved)),
        ),
        StatusCode::NOT_FOUND | StatusCode::METHOD_NOT_ALLOWED => (
            ModelProviderConnectionStatus::Warning,
            "The endpoint responded, but it does not expose /models at this base URL."
                .to_string(),
            Some(
                "The network path is working. If this vendor needs a Responses-compatible gateway, point the base URL at that gateway.".to_string(),
            ),
        ),
        value if value.is_client_error() => (
            ModelProviderConnectionStatus::Warning,
            format!("The endpoint responded with HTTP {}.", value.as_u16()),
            None,
        ),
        value if value.is_server_error() => (
            ModelProviderConnectionStatus::Warning,
            format!("The endpoint responded with HTTP {}.", value.as_u16()),
            Some("The network path is working, but the provider returned a server error.".to_string()),
        ),
        value => (
            ModelProviderConnectionStatus::Warning,
            format!("The endpoint responded with HTTP {}.", value.as_u16()),
            None,
        ),
    };

    Ok(ModelProviderConnectionDiagnosticDto {
        preset: resolved.preset.clone(),
        provider_name: resolved.provider_name.clone(),
        status: diagnostic_status,
        can_test: true,
        connection_mode: resolved.connection_mode.clone(),
        effective_base_url: resolved.effective_base_url.clone(),
        bridge_base_url: resolved.bridge_base_url.clone(),
        upstream_base_url: resolved.upstream_base_url.clone(),
        checked_url: Some(checked_url),
        response_status: Some(status.as_u16()),
        summary,
        detail,
        action_hint,
    })
}

fn success_summary(resolved: &ResolvedProviderConfig) -> String {
    if matches!(
        resolved.connection_mode,
        ModelProviderConnectionMode::CompatibilityBridge
    ) {
        "The local bridge is running and the upstream provider responded.".to_string()
    } else {
        "The provider endpoint responded.".to_string()
    }
}

fn bridge_upstream_failure_summary(resolved: &ResolvedProviderConfig) -> String {
    format!(
        "The local bridge is running, but it could not reach {}.",
        route_host_label(
            resolved
                .upstream_base_url
                .as_deref()
                .or(resolved.base_url.as_deref())
                .unwrap_or_default()
        )
    )
}

fn route_failure_hint(resolved: &ResolvedProviderConfig) -> String {
    match &resolved.preset {
        ModelProviderPreset::Ollama | ModelProviderPreset::LmStudio => {
            "Start the local model server first, then rerun the route test.".to_string()
        }
        _ => "This route uses your current system network path. If the upstream needs a VPN or proxy on this network, start it before retrying.".to_string(),
    }
}

fn route_host_label(base_url: &str) -> String {
    Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| base_url.to_string())
}

fn bridge_health_url(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if let Some(root) = trimmed.strip_suffix("/v1") {
        format!("{root}/health")
    } else {
        format!("{trimmed}/health")
    }
}

fn summarize_response_detail(body_text: &str) -> Option<String> {
    let trimmed = body_text.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(message) = json_value.get("error").and_then(|value| value.as_str()) {
            return Some(message.to_string());
        }
    }
    let first = trimmed.lines().next()?.trim();
    if first.is_empty() {
        return None;
    }
    if first.chars().count() > 240 {
        let snippet = first.chars().take(240).collect::<String>();
        return Some(format!("{snippet}..."));
    }
    Some(first.to_string())
}

fn join_url(base_url: &str, path: &str) -> String {
    let base_url = base_url.trim_end_matches('/');
    format!("{base_url}/{path}")
}

fn infer_custom_preset(
    provider_id: &str,
    provider_name: &str,
    base_url: Option<&str>,
    auth_mode: &ModelProviderAuthMode,
    provider_compat: Option<&ModelProviderCompatSettings>,
) -> ModelProviderPreset {
    if provider_id == MANAGED_PROVIDER_ID {
        if let Some(compat) = provider_compat {
            return match compat.kind {
                ModelProviderCompatKind::DeepSeek => ModelProviderPreset::DeepSeek,
                ModelProviderCompatKind::Qwen => ModelProviderPreset::Qwen,
                ModelProviderCompatKind::Doubao => ModelProviderPreset::Doubao,
                ModelProviderCompatKind::Zhipu => ModelProviderPreset::Zhipu,
                ModelProviderCompatKind::Moonshot => ModelProviderPreset::Moonshot,
                ModelProviderCompatKind::Baichuan => ModelProviderPreset::Baichuan,
                ModelProviderCompatKind::Minimax => ModelProviderPreset::Minimax,
                ModelProviderCompatKind::Ollama => ModelProviderPreset::Ollama,
                ModelProviderCompatKind::LmStudio => ModelProviderPreset::LmStudio,
            };
        }
    }
    if provider_id == "ollama" {
        return ModelProviderPreset::Ollama;
    }
    if provider_id == "lmstudio" {
        return ModelProviderPreset::LmStudio;
    }

    let normalized_name = provider_name.trim().to_ascii_lowercase();
    let normalized_base_url = base_url
        .map(str::trim)
        .unwrap_or_default()
        .to_ascii_lowercase();

    if normalized_name == "openai"
        || normalized_name == "openai api"
        || normalized_base_url == DEFAULT_OPENAI_BASE_URL
    {
        return ModelProviderPreset::OpenaiApi;
    }
    if normalized_name == "qwen" || normalized_base_url.contains("dashscope.aliyuncs.com") {
        return ModelProviderPreset::Qwen;
    }
    if normalized_name == "doubao"
        || normalized_name.contains("璞嗗寘")
        || normalized_base_url.contains("volces.com")
    {
        return ModelProviderPreset::Doubao;
    }
    if normalized_name == "claude" || normalized_base_url.contains("anthropic.com") {
        return ModelProviderPreset::Claude;
    }
    if normalized_name == "gemini"
        || normalized_base_url.contains("generativelanguage.googleapis.com")
    {
        return ModelProviderPreset::Gemini;
    }
    if normalized_name == "zhipu"
        || normalized_name.contains("智谱")
        || normalized_base_url.contains("bigmodel.cn")
    {
        return ModelProviderPreset::Zhipu;
    }
    if normalized_name == "moonshot"
        || normalized_name.contains("月之暗面")
        || normalized_base_url.contains("moonshot.cn")
    {
        return ModelProviderPreset::Moonshot;
    }
    if normalized_name == "baichuan"
        || normalized_name.contains("百川")
        || normalized_base_url.contains("baichuan-ai.com")
    {
        return ModelProviderPreset::Baichuan;
    }
    if normalized_name == "minimax" || normalized_base_url.contains("minimax.chat") {
        return ModelProviderPreset::Minimax;
    }
    if normalized_name == "ollama" || normalized_base_url.contains("localhost:11434") {
        return ModelProviderPreset::Ollama;
    }
    if normalized_name == "lm studio" || normalized_base_url.contains("localhost:1234") {
        return ModelProviderPreset::LmStudio;
    }
    if matches!(auth_mode, ModelProviderAuthMode::Aws) {
        return ModelProviderPreset::AmazonBedrock;
    }
    ModelProviderPreset::CustomResponses
}

fn apply_settings_to_document(
    document: &mut Document,
    input: &SaveModelProviderSettingsInput,
) -> Result<(), String> {
    match input.preset {
        ModelProviderPreset::Chatgpt => {
            config_toml_core::set_top_level_string(
                document,
                "model_provider",
                Some(CHATGPT_PROVIDER_ID),
            );
            config_toml_core::set_top_level_string(document, "openai_base_url", None);
        }
        ModelProviderPreset::AmazonBedrock => {
            config_toml_core::set_top_level_string(
                document,
                "model_provider",
                Some(AMAZON_BEDROCK_PROVIDER_ID),
            );
            config_toml_core::set_top_level_string(document, "openai_base_url", None);

            let provider = replace_provider_table(document, AMAZON_BEDROCK_PROVIDER_ID)?;
            let aws = ensure_child_table(provider, "aws")?;
            set_table_string(aws, "profile", input.aws_profile.as_deref());
            set_table_string(aws, "region", input.aws_region.as_deref());
        }
        ModelProviderPreset::OpenaiApi
        | ModelProviderPreset::DeepSeek
        | ModelProviderPreset::Qwen
        | ModelProviderPreset::Doubao
        | ModelProviderPreset::Claude
        | ModelProviderPreset::Gemini
        | ModelProviderPreset::Zhipu
        | ModelProviderPreset::Moonshot
        | ModelProviderPreset::Baichuan
        | ModelProviderPreset::Minimax
        | ModelProviderPreset::CustomResponses
        | ModelProviderPreset::Ollama
        | ModelProviderPreset::LmStudio => {
            let current_active_provider_id =
                config_toml_core::read_top_level_string(document, "model_provider")
                    .unwrap_or_default();
            let existing_api_key =
                read_provider_table(document, current_active_provider_id.as_str())
                    .and_then(|provider| read_table_string(provider, "experimental_bearer_token"));
            config_toml_core::set_top_level_string(
                document,
                "model_provider",
                Some(MANAGED_PROVIDER_ID),
            );
            config_toml_core::set_top_level_string(document, "openai_base_url", None);

            let provider = replace_provider_table(document, MANAGED_PROVIDER_ID)?;
            populate_managed_provider_table(provider, input, existing_api_key.as_deref())?;
            config_toml_core::set_top_level_string(document, "forced_login_method", Some("api"));
        }
    }

    Ok(())
}

fn populate_managed_provider_table(
    provider: &mut Table,
    input: &SaveModelProviderSettingsInput,
    existing_api_key: Option<&str>,
) -> Result<(), String> {
    let api_key =
        normalized_string(input.api_key.as_deref()).or_else(|| normalized_string(existing_api_key));
    let auth_mode = resolved_auth_mode(input);

    let (provider_name, base_url, supports_websockets) = match input.preset {
        ModelProviderPreset::OpenaiApi => (
            "OpenAI".to_string(),
            normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_OPENAI_BASE_URL.to_string()),
            true,
        ),
        ModelProviderPreset::DeepSeek => (
            "DeepSeek".to_string(),
            provider_compat_bridge::base_url_for_kind(ModelProviderCompatKind::DeepSeek),
            false,
        ),
        ModelProviderPreset::Qwen => (
            "Qwen".to_string(),
            normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_QWEN_BASE_URL.to_string()),
            false,
        ),
        ModelProviderPreset::Doubao => (
            "Doubao".to_string(),
            provider_compat_bridge::base_url_for_kind(ModelProviderCompatKind::Doubao),
            false,
        ),
        ModelProviderPreset::Claude => (
            "Claude".to_string(),
            normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_CLAUDE_BASE_URL.to_string()),
            false,
        ),
        ModelProviderPreset::Gemini => (
            "Gemini".to_string(),
            normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_GEMINI_BASE_URL.to_string()),
            false,
        ),
        ModelProviderPreset::Zhipu => (
            "智谱AI".to_string(),
            provider_compat_bridge::base_url_for_kind(ModelProviderCompatKind::Zhipu),
            false,
        ),
        ModelProviderPreset::Moonshot => (
            "月之暗面".to_string(),
            provider_compat_bridge::base_url_for_kind(ModelProviderCompatKind::Moonshot),
            false,
        ),
        ModelProviderPreset::Baichuan => (
            "百川智能".to_string(),
            provider_compat_bridge::base_url_for_kind(ModelProviderCompatKind::Baichuan),
            false,
        ),
        ModelProviderPreset::Minimax => (
            "MiniMax".to_string(),
            provider_compat_bridge::base_url_for_kind(ModelProviderCompatKind::Minimax),
            false,
        ),
        ModelProviderPreset::Ollama => (
            "Ollama".to_string(),
            provider_compat_bridge::base_url_for_kind(ModelProviderCompatKind::Ollama),
            false,
        ),
        ModelProviderPreset::LmStudio => (
            "LM Studio".to_string(),
            provider_compat_bridge::base_url_for_kind(ModelProviderCompatKind::LmStudio),
            false,
        ),
        ModelProviderPreset::CustomResponses => {
            let provider_name = normalized_string(input.provider_name.as_deref())
                .unwrap_or_else(|| "Custom Responses API".to_string());
            let base_url = normalized_string(input.base_url.as_deref())
                .ok_or_else(|| "Custom Responses API requires a base URL.".to_string())?;
            (provider_name, base_url, false)
        }
        ModelProviderPreset::Chatgpt | ModelProviderPreset::AmazonBedrock => {
            return Err("Unsupported managed provider preset.".to_string());
        }
    };

    if matches!(auth_mode, ModelProviderAuthMode::ApiKey) && api_key.is_none() {
        return Err("This provider requires an API key. Paste one before saving.".to_string());
    }

    set_table_string(provider, "name", Some(provider_name.as_str()));
    set_table_string(provider, "base_url", Some(base_url.as_str()));
    provider["wire_api"] = value(RESPONSES_WIRE_API);
    set_table_bool(provider, "supports_websockets", Some(supports_websockets));

    match auth_mode {
        ModelProviderAuthMode::ApiKey => {
            set_table_string(provider, "experimental_bearer_token", api_key.as_deref());
            set_table_bool(provider, "requires_openai_auth", Some(false));
        }
        ModelProviderAuthMode::None => {
            remove_table_key(provider, "experimental_bearer_token");
            set_table_bool(provider, "requires_openai_auth", Some(false));
        }
        ModelProviderAuthMode::Aws | ModelProviderAuthMode::Chatgpt => {
            return Err("Unsupported auth mode for this provider preset.".to_string());
        }
    }

    remove_table_key(provider, "env_key");
    remove_table_key(provider, "env_key_instructions");
    remove_table_key(provider, "auth");
    remove_table_key(provider, "aws");

    Ok(())
}

fn resolved_auth_mode(input: &SaveModelProviderSettingsInput) -> ModelProviderAuthMode {
    match input.preset {
        ModelProviderPreset::OpenaiApi
        | ModelProviderPreset::DeepSeek
        | ModelProviderPreset::Qwen
        | ModelProviderPreset::Doubao
        | ModelProviderPreset::Claude
        | ModelProviderPreset::Gemini
        | ModelProviderPreset::Zhipu
        | ModelProviderPreset::Moonshot
        | ModelProviderPreset::Baichuan
        | ModelProviderPreset::Minimax => ModelProviderAuthMode::ApiKey,
        ModelProviderPreset::Ollama | ModelProviderPreset::LmStudio => ModelProviderAuthMode::None,
        ModelProviderPreset::CustomResponses => input
            .auth_mode
            .clone()
            .unwrap_or(ModelProviderAuthMode::ApiKey),
        ModelProviderPreset::Chatgpt => ModelProviderAuthMode::Chatgpt,
        ModelProviderPreset::AmazonBedrock => ModelProviderAuthMode::Aws,
    }
}

fn apply_provider_compat_settings(
    settings: &mut AppSettings,
    input: &SaveModelProviderSettingsInput,
) -> Result<(), String> {
    settings.model_provider_compat = match input.preset {
        ModelProviderPreset::DeepSeek => Some(ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::DeepSeek,
            upstream_base_url: normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_DEEPSEEK_BASE_URL.to_string()),
            supports_image_input: None,
        }),
        ModelProviderPreset::Qwen => None,
        ModelProviderPreset::Doubao => Some(ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::Doubao,
            upstream_base_url: normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_DOUBAO_BASE_URL.to_string()),
            supports_image_input: None,
        }),
        ModelProviderPreset::Zhipu => Some(ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::Zhipu,
            upstream_base_url: normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_ZHIPU_BASE_URL.to_string()),
            supports_image_input: None,
        }),
        ModelProviderPreset::Moonshot => Some(ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::Moonshot,
            upstream_base_url: normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_MOONSHOT_BASE_URL.to_string()),
            supports_image_input: None,
        }),
        ModelProviderPreset::Baichuan => Some(ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::Baichuan,
            upstream_base_url: normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_BAICHUAN_BASE_URL.to_string()),
            supports_image_input: None,
        }),
        ModelProviderPreset::Minimax => Some(ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::Minimax,
            upstream_base_url: normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_MINIMAX_BASE_URL.to_string()),
            supports_image_input: None,
        }),
        ModelProviderPreset::Ollama => Some(ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::Ollama,
            upstream_base_url: normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_OLLAMA_BASE_URL.to_string()),
            supports_image_input: None,
        }),
        ModelProviderPreset::LmStudio => Some(ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::LmStudio,
            upstream_base_url: normalized_string(input.base_url.as_deref())
                .unwrap_or_else(|| DEFAULT_LMSTUDIO_BASE_URL.to_string()),
            supports_image_input: None,
        }),
        _ => None,
    };
    Ok(())
}

async fn respawn_shared_session_after_provider_change<F, Fut>(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    spawn_session: F,
) -> Result<RespawnSharedSessionResult, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
    let _spawn_guard = workspace_session_spawn_lock().lock().await;
    let (current_session, workspace_ids) = {
        let sessions = sessions.lock().await;
        (
            sessions.values().next().cloned(),
            sessions.keys().cloned().collect::<Vec<_>>(),
        )
    };
    let Some(current_session) = current_session else {
        return Ok(RespawnSharedSessionResult {
            respawned: false,
            affected_workspace_count: 0,
        });
    };
    if workspace_ids.is_empty() {
        return Ok(RespawnSharedSessionResult {
            respawned: false,
            affected_workspace_count: 0,
        });
    }

    let owner_workspace_id = if workspace_ids
        .iter()
        .any(|workspace_id| workspace_id == &current_session.owner_workspace_id)
    {
        current_session.owner_workspace_id.clone()
    } else {
        workspace_ids[0].clone()
    };

    let (entry, parent_entry) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&owner_workspace_id)
            .cloned()
            .ok_or_else(|| "Unable to resolve workspace for provider refresh.".to_string())?;
        let parent_entry = entry
            .parent_id
            .as_ref()
            .and_then(|parent_id| workspaces.get(parent_id))
            .cloned();
        (entry, parent_entry)
    };

    let codex_home = resolve_workspace_codex_home(&entry, parent_entry.as_ref());
    clear_models_cache_for_provider_switch(codex_home.as_ref());
    let default_bin = app_settings.lock().await.codex_bin.clone();
    let next_session = spawn_session(
        entry.clone(),
        default_bin,
        current_session.codex_args.clone(),
        codex_home,
    )
    .await?;

    let workspace_paths = {
        let workspaces = workspaces.lock().await;
        workspace_ids
            .iter()
            .filter_map(|workspace_id| {
                workspaces
                    .get(workspace_id)
                    .map(|entry| (workspace_id.clone(), entry.path.clone()))
            })
            .collect::<Vec<_>>()
    };
    {
        let mut sessions = sessions.lock().await;
        for workspace_id in &workspace_ids {
            sessions.insert(workspace_id.clone(), Arc::clone(&next_session));
        }
    }
    for (workspace_id, workspace_path) in &workspace_paths {
        next_session
            .register_workspace_with_path(workspace_id, Some(workspace_path.as_str()))
            .await;
    }

    let mut child = current_session.child.lock().await;
    kill_child_process_tree(&mut child).await;

    Ok(RespawnSharedSessionResult {
        respawned: true,
        affected_workspace_count: workspace_ids.len(),
    })
}

fn clear_models_cache_for_provider_switch(codex_home: Option<&PathBuf>) {
    let Some(codex_home) = codex_home else {
        return;
    };
    let cache_path = codex_home.join(MODEL_CACHE_FILE);
    let _ = std::fs::remove_file(cache_path);
}

fn read_provider_table<'a>(document: &'a Document, provider_id: &str) -> Option<&'a Table> {
    document
        .get("model_providers")
        .and_then(Item::as_table_like)
        .and_then(|providers| providers.get(provider_id))
        .and_then(Item::as_table)
}

fn read_table_string(table: &Table, key: &str) -> Option<String> {
    table
        .get(key)
        .and_then(Item::as_str)
        .and_then(|value| normalized_string(Some(value)))
}

fn read_nested_table_string(table: &Table, table_key: &str, value_key: &str) -> Option<String> {
    table
        .get(table_key)
        .and_then(Item::as_table_like)
        .and_then(|nested| nested.get(value_key))
        .and_then(Item::as_str)
        .and_then(|value| normalized_string(Some(value)))
}

fn normalized_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn replace_provider_table<'a>(
    document: &'a mut Document,
    provider_id: &str,
) -> Result<&'a mut Table, String> {
    let providers = config_toml_core::ensure_table(document, "model_providers")?;
    providers[provider_id] = Item::Table(Table::new());
    providers[provider_id]
        .as_table_mut()
        .ok_or_else(|| format!("model_providers.{provider_id} must be a table"))
}

fn remove_provider_table(document: &mut Document, provider_id: &str) -> Result<(), String> {
    let providers = config_toml_core::ensure_table(document, "model_providers")?;
    let _ = providers.remove(provider_id);
    Ok(())
}

fn ensure_child_table<'a>(table: &'a mut Table, key: &str) -> Result<&'a mut Table, String> {
    table[key] = Item::Table(Table::new());
    table[key]
        .as_table_mut()
        .ok_or_else(|| format!("{key} must be a table"))
}

fn set_table_string(table: &mut Table, key: &str, value_raw: Option<&str>) {
    let Some(value_raw) = value_raw else {
        remove_table_key(table, key);
        return;
    };
    let trimmed = value_raw.trim();
    if trimmed.is_empty() {
        remove_table_key(table, key);
        return;
    }
    table[key] = value(trimmed);
}

fn set_table_bool(table: &mut Table, key: &str, value_raw: Option<bool>) {
    let Some(value_raw) = value_raw else {
        remove_table_key(table, key);
        return;
    };
    table[key] = value(value_raw);
}

fn remove_table_key(table: &mut Table, key: &str) {
    let _ = table.remove(key);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn document_from_str(contents: &str) -> Document {
        config_toml_core::parse_document(contents).expect("parse config.toml")
    }

    #[test]
    fn default_settings_use_chatgpt_preset() {
        let document = Document::new();
        let settings = read_settings_from_document(&document, None);
        assert_eq!(settings.preset, ModelProviderPreset::Chatgpt);
        assert_eq!(settings.provider_id, CHATGPT_PROVIDER_ID);
        assert_eq!(settings.auth_mode, ModelProviderAuthMode::Chatgpt);
        assert_eq!(
            settings.connection_mode,
            ModelProviderConnectionMode::ManagedLogin
        );
    }

    #[test]
    fn custom_provider_with_dashscope_maps_to_qwen() {
        let document = document_from_str(
            r#"
model_provider = "custom-provider"

[model_providers.custom-provider]
name = "Qwen"
base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
experimental_bearer_token = "sk-test"
wire_api = "responses"
"#,
        );
        let settings = read_settings_from_document(&document, None);
        assert_eq!(settings.preset, ModelProviderPreset::Qwen);
        assert_eq!(settings.auth_mode, ModelProviderAuthMode::ApiKey);
        assert!(settings.api_key_configured);
    }

    #[test]
    fn save_qwen_uses_direct_dashscope_responses() {
        let mut document = Document::new();
        apply_settings_to_document(
            &mut document,
            &SaveModelProviderSettingsInput {
                preset: ModelProviderPreset::Qwen,
                provider_name: None,
                base_url: None,
                auth_mode: None,
                api_key: Some("sk-qwen".to_string()),
                aws_profile: None,
                aws_region: None,
            },
        )
        .expect("save qwen provider settings");

        let provider = read_provider_table(&document, MANAGED_PROVIDER_ID).expect("provider table");
        assert_eq!(
            read_table_string(provider, "name"),
            Some("Qwen".to_string())
        );
        assert_eq!(
            read_table_string(provider, "base_url"),
            Some(DEFAULT_QWEN_BASE_URL.to_string())
        );

        let mut app_settings = AppSettings::default();
        apply_provider_compat_settings(
            &mut app_settings,
            &SaveModelProviderSettingsInput {
                preset: ModelProviderPreset::Qwen,
                provider_name: None,
                base_url: None,
                auth_mode: None,
                api_key: Some("sk-qwen".to_string()),
                aws_profile: None,
                aws_region: None,
            },
        )
        .expect("apply qwen compat settings");
        assert!(app_settings.model_provider_compat.is_none());

        let settings = read_settings_from_document(&document, None);
        assert_eq!(settings.preset, ModelProviderPreset::Qwen);
        assert_eq!(
            settings.connection_mode,
            ModelProviderConnectionMode::Direct
        );
        assert_eq!(settings.base_url.as_deref(), Some(DEFAULT_QWEN_BASE_URL));
        assert_eq!(
            settings.effective_base_url.as_deref(),
            Some(DEFAULT_QWEN_BASE_URL)
        );
        assert!(settings.bridge_base_url.is_none());
        assert!(settings.upstream_base_url.is_none());
    }

    #[test]
    fn managed_compat_provider_reports_bridge_and_upstream_routes() {
        let document = document_from_str(
            r#"
model_provider = "codexstudy-provider"

[model_providers.codexstudy-provider]
name = "DeepSeek"
base_url = "http://127.0.0.1:43189/v1"
experimental_bearer_token = "sk-test"
"#,
        );
        let compat = ModelProviderCompatSettings {
            kind: ModelProviderCompatKind::DeepSeek,
            upstream_base_url: "https://api.deepseek.com".to_string(),
            supports_image_input: None,
        };

        let settings = read_settings_from_document(&document, Some(&compat));
        assert_eq!(settings.preset, ModelProviderPreset::DeepSeek);
        assert_eq!(
            settings.connection_mode,
            ModelProviderConnectionMode::CompatibilityBridge
        );
        assert_eq!(
            settings.base_url.as_deref(),
            Some("https://api.deepseek.com")
        );
        assert_eq!(
            settings.bridge_base_url.as_deref(),
            Some("http://127.0.0.1:43189/v1")
        );
        assert_eq!(
            settings.effective_base_url.as_deref(),
            Some("http://127.0.0.1:43189/v1")
        );
        assert_eq!(
            settings.upstream_base_url.as_deref(),
            Some("https://api.deepseek.com")
        );
    }

    #[test]
    fn save_openai_api_writes_managed_provider() {
        let mut document = Document::new();
        apply_settings_to_document(
            &mut document,
            &SaveModelProviderSettingsInput {
                preset: ModelProviderPreset::OpenaiApi,
                provider_name: None,
                base_url: None,
                auth_mode: None,
                api_key: Some("sk-openai".to_string()),
                aws_profile: None,
                aws_region: None,
            },
        )
        .expect("save provider settings");

        assert_eq!(
            config_toml_core::read_top_level_string(&document, "model_provider"),
            Some(MANAGED_PROVIDER_ID.to_string())
        );
        let provider = read_provider_table(&document, MANAGED_PROVIDER_ID).expect("provider table");
        assert_eq!(
            read_table_string(provider, "name"),
            Some("OpenAI".to_string())
        );
        assert_eq!(
            read_table_string(provider, "base_url"),
            Some(DEFAULT_OPENAI_BASE_URL.to_string())
        );
        assert_eq!(
            read_table_string(provider, "experimental_bearer_token"),
            Some("sk-openai".to_string())
        );
    }

    #[test]
    fn chatgpt_mode_does_not_revive_hidden_managed_provider_api_keys() {
        let mut document = document_from_str(
            r#"
model_provider = "openai"

[model_providers.codexstudy-provider]
name = "Doubao"
base_url = "http://127.0.0.1:43189/v1"
experimental_bearer_token = "sk-old"
wire_api = "responses"
"#,
        );

        let error = apply_settings_to_document(
            &mut document,
            &SaveModelProviderSettingsInput {
                preset: ModelProviderPreset::Doubao,
                provider_name: None,
                base_url: None,
                auth_mode: None,
                api_key: None,
                aws_profile: None,
                aws_region: None,
            },
        )
        .expect_err("missing api key should fail");

        assert_eq!(
            error,
            "This provider requires an API key. Paste one before saving."
        );
    }

    #[test]
    fn remove_managed_provider_table_clears_saved_credentials() {
        let mut document = document_from_str(
            r#"
[model_providers.codexstudy-provider]
name = "Doubao"
base_url = "http://127.0.0.1:43189/v1"
experimental_bearer_token = "sk-old"
wire_api = "responses"
"#,
        );

        remove_provider_table(&mut document, MANAGED_PROVIDER_ID)
            .expect("remove managed provider table");

        assert!(read_provider_table(&document, MANAGED_PROVIDER_ID).is_none());
    }

    #[test]
    fn save_bedrock_overwrites_to_aws_only_table() {
        let mut document = document_from_str(
            r#"
[model_providers.amazon-bedrock]
name = "stale"
"#,
        );
        apply_settings_to_document(
            &mut document,
            &SaveModelProviderSettingsInput {
                preset: ModelProviderPreset::AmazonBedrock,
                provider_name: None,
                base_url: None,
                auth_mode: None,
                api_key: None,
                aws_profile: Some("default".to_string()),
                aws_region: Some("us-east-1".to_string()),
            },
        )
        .expect("save bedrock settings");

        let provider =
            read_provider_table(&document, AMAZON_BEDROCK_PROVIDER_ID).expect("bedrock table");
        assert_eq!(
            read_nested_table_string(provider, "aws", "profile"),
            Some("default".to_string())
        );
        assert_eq!(
            read_nested_table_string(provider, "aws", "region"),
            Some("us-east-1".to_string())
        );
        assert!(provider.get("name").is_none());
    }
}
