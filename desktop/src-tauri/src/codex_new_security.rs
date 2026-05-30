use super::*;

pub(crate) async fn security_exec_approval_isolated_impl(
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

pub(crate) async fn turn_access_mode_for_workspace_impl(
    app: &AppHandle,
    workspace_id: &str,
    requested: Option<String>,
) -> Result<String, String> {
    if workspace_security_enabled(app, workspace_id).await? {
        return Ok("current".to_string());
    }
    Ok(requested.unwrap_or_else(|| "current".to_string()))
}

pub(crate) async fn resolve_turn_workspace_path_impl(
    app: &AppHandle,
    state: &AppState,
    workspace_id: &str,
    thread_id: Option<&str>,
) -> Result<String, String> {
    if let Some(path) =
        prepare_workspace_for_thread_impl(app, state, workspace_id, thread_id).await?
    {
        return Ok(path);
    }
    let (workspace, _) = resolve_workspace_context(state, workspace_id).await?;
    Ok(workspace.path)
}

pub(crate) async fn prepare_workspace_for_thread_impl(
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

pub(crate) async fn bind_workspace_thread_impl(
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
