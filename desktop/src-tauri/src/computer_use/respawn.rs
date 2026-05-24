use std::sync::Arc;

use tauri::AppHandle;

use crate::codex::home::resolve_workspace_codex_home;
use crate::codex::spawn_workspace_session;
use crate::shared::process_core::kill_child_process_tree;
use crate::shared::workspaces_core::workspace_session_spawn_lock;
use crate::state::AppState;

pub(crate) async fn respawn_shared_sessions(
    state: &AppState,
    app: &AppHandle,
) -> Result<bool, String> {
    let _spawn_guard = workspace_session_spawn_lock().lock().await;
    let (current_session, workspace_ids) = {
        let sessions = state.sessions.lock().await;
        (
            sessions.values().next().cloned(),
            sessions.keys().cloned().collect::<Vec<_>>(),
        )
    };
    let Some(current_session) = current_session else {
        return Ok(false);
    };
    if workspace_ids.is_empty() {
        return Ok(false);
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
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&owner_workspace_id)
            .cloned()
            .ok_or_else(|| "Unable to resolve workspace for Computer Use refresh.".to_string())?;
        let parent_entry = entry
            .parent_id
            .as_ref()
            .and_then(|parent_id| workspaces.get(parent_id))
            .cloned();
        (entry, parent_entry)
    };

    let codex_home = resolve_workspace_codex_home(&entry, parent_entry.as_ref());
    let default_bin = state.app_settings.lock().await.codex_bin.clone();
    let app_handle = app.clone();
    let next_session = spawn_workspace_session(
        entry,
        default_bin,
        current_session.codex_args.clone(),
        app_handle,
        codex_home,
    )
    .await?;

    let workspace_paths = {
        let workspaces = state.workspaces.lock().await;
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
        let mut sessions = state.sessions.lock().await;
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

    Ok(true)
}
