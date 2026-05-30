use std::path::Path;
use std::sync::Arc;

use chat_agent_core::{CoreDelegate, EnginePreference};
use tauri::AppHandle;

use crate::remote_backend;
use crate::state::AppState;

use super::codex_delegate::CodexCoreDelegate;
use super::daemon_delegate::DaemonRpcCoreDelegate;

pub(crate) async fn build_hybrid_core_delegate(
    app: &AppHandle,
    state: &AppState,
    workspace_id: &str,
    workspace_root: &Path,
    run_id: &str,
    security_mode: bool,
) -> Option<Arc<dyn CoreDelegate>> {
    if remote_backend::is_remote_mode(state).await {
        return Some(Arc::new(DaemonRpcCoreDelegate::new(
            app.clone(),
            workspace_id.to_string(),
            run_id.to_string(),
        )));
    }
    Some(CodexCoreDelegate::build(
        app,
        workspace_id,
        workspace_root,
        run_id,
        security_mode,
    ))
}

pub(crate) async fn resolve_hybrid_delegate(
    preference: EnginePreference,
    app: &AppHandle,
    state: &AppState,
    workspace_id: &str,
    workspace_root: &Path,
    run_id: &str,
    security_mode: bool,
    existing: Option<Arc<dyn CoreDelegate>>,
) -> Option<Arc<dyn CoreDelegate>> {
    if let Some(delegate) = existing {
        return Some(delegate);
    }
    if preference == EnginePreference::Hybrid {
        return build_hybrid_core_delegate(
            app,
            state,
            workspace_id,
            workspace_root,
            run_id,
            security_mode,
        )
        .await;
    }
    None
}
