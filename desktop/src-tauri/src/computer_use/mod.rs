//! Bundled Open Computer Use integration for CodexStudy.

mod bundle;
mod config;
mod install;
mod respawn;
mod workspace;

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::shared::config_toml_core;
use crate::state::AppState;

pub(crate) const MARKETPLACE_NAME: &str = "codexstudy-bundled";
pub(crate) const PLUGIN_NAME: &str = "open-computer-use";
pub(crate) const FEATURE_KEY: &str = "computer_use";
pub(crate) const MCP_SERVER_NAME: &str = "computer-use";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComputerUseStatus {
    pub enabled: bool,
    pub installed: bool,
    pub bundled_available: bool,
    pub version: Option<String>,
    pub runtime_ready: bool,
    pub runtime_path: Option<String>,
    pub marketplace_path: Option<String>,
    pub plugin_path: Option<String>,
    pub platform_notes: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComputerUseActionResult {
    pub status: ComputerUseStatus,
    pub respawned: bool,
}

#[tauri::command]
pub(crate) async fn computer_use_get_status(
    _state: State<'_, AppState>,
) -> Result<ComputerUseStatus, String> {
    let codex_home = resolve_codex_home()?;
    build_status(&codex_home, read_enabled_from_config(&codex_home)?).await
}

#[tauri::command]
pub(crate) async fn computer_use_set_enabled(
    enabled: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ComputerUseActionResult, String> {
    let codex_home = resolve_codex_home()?;
    if enabled {
        install::install_from_bundle(&codex_home)?;
        config::write_enabled_config(&codex_home, true)?;
        workspace::ensure_workspace_agents_md(&codex_home)?;
    } else {
        config::write_enabled_config(&codex_home, false)?;
    }

    let status = build_status(&codex_home, enabled).await?;
    let respawned = respawn::respawn_shared_sessions(&state, &app).await?;
    Ok(ComputerUseActionResult { status, respawned })
}

#[tauri::command]
pub(crate) async fn computer_use_repair_install(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ComputerUseActionResult, String> {
    let codex_home = resolve_codex_home()?;
    install::install_from_bundle(&codex_home)?;
    config::write_enabled_config(&codex_home, true)?;
    workspace::ensure_workspace_agents_md(&codex_home)?;
    let status = build_status(&codex_home, true).await?;
    let respawned = respawn::respawn_shared_sessions(&state, &app).await?;
    Ok(ComputerUseActionResult { status, respawned })
}

#[tauri::command]
pub(crate) async fn computer_use_run_doctor() -> Result<String, String> {
    let codex_home = resolve_codex_home()?;
    let runtime = install::resolve_installed_runtime_path(&codex_home)?;
    bundle::run_doctor(&runtime)
}

#[tauri::command]
pub(crate) fn computer_use_prepare_workspace_dir() -> Result<String, String> {
    let codex_home = resolve_codex_home()?;
    let path = workspace::prepare_workspace_dir(&codex_home)?;
    Ok(path.to_string_lossy().to_string())
}

pub(crate) async fn ensure_installed_when_enabled() -> Result<(), String> {
    let codex_home = resolve_codex_home()?;
    if !read_enabled_from_config(&codex_home)? {
        return Ok(());
    }
    if install::is_installed(&codex_home)
        && install::runtime_path_ready(&install::resolve_installed_runtime_path(&codex_home)?)
    {
        return Ok(());
    }
    if !bundle::bundled_resources_available() {
        return Ok(());
    }
    install::install_from_bundle(&codex_home)?;
    config::write_enabled_config(&codex_home, true)?;
    workspace::ensure_workspace_agents_md(&codex_home)?;
    Ok(())
}

fn resolve_codex_home() -> Result<PathBuf, String> {
    crate::codex::home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CodexStudy config home.".to_string())
}

fn read_enabled_from_config(codex_home: &PathBuf) -> Result<bool, String> {
    let (_, document) = config_toml_core::load_global_config_document(codex_home)?;
    Ok(config_toml_core::read_feature_flag(&document, FEATURE_KEY).unwrap_or(true))
}

async fn build_status(codex_home: &PathBuf, enabled: bool) -> Result<ComputerUseStatus, String> {
    let bundled_available = bundle::bundled_resources_available();
    let installed = install::is_installed(codex_home);
    let version = install::read_installed_version(codex_home);
    let marketplace_path = install::marketplace_root(codex_home);
    let plugin_path = install::plugin_root(codex_home);
    let runtime_path = install::resolve_installed_runtime_path(codex_home).ok();
    let runtime_ready = runtime_path
        .as_ref()
        .map(|path| install::runtime_path_ready(path.as_path()))
        .unwrap_or(false);
    let platform_notes = bundle::platform_notes();
    let last_error = if enabled && bundled_available && !runtime_ready {
        Some(
            "Computer Use runtime is missing or not executable. Try Repair install in Settings."
                .to_string(),
        )
    } else if enabled && !bundled_available {
        Some(
            "Bundled Computer Use resources were not found. Rebuild CodexStudy with computer-use support."
                .to_string(),
        )
    } else {
        None
    };

    Ok(ComputerUseStatus {
        enabled,
        installed,
        bundled_available,
        version,
        runtime_ready,
        runtime_path: runtime_path.map(|path| path.to_string_lossy().to_string()),
        marketplace_path: Some(marketplace_path.to_string_lossy().to_string()),
        plugin_path: Some(plugin_path.to_string_lossy().to_string()),
        platform_notes,
        last_error,
    })
}
