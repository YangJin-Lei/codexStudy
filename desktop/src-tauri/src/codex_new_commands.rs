use super::*;

pub(crate) async fn codex_new_sync_viewing_context_impl(
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

pub(crate) async fn codex_new_get_state_impl(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    build_frontend_state(&app, &state).await
}

pub(crate) async fn codex_new_enable_security_impl(
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

pub(crate) async fn codex_new_sync_thread_titles_impl(
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

pub(crate) async fn codex_new_focus_session_impl(
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

pub(crate) async fn codex_new_disable_security_impl(
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

pub(crate) async fn codex_new_refresh_changes_impl(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    refresh_workspace_task(&app, &workspace_id).await?;
    build_frontend_state(&app, &state).await
}

pub(crate) async fn codex_new_run_review_impl(
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

pub(crate) async fn codex_new_merge_changes_impl(
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

pub(crate) async fn codex_new_rollback_task_impl(
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

        core.rollback(&manifest_path, &RollbackRequest { selection })
            .map_err(|err| err.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|err| err.to_string())??;
    build_frontend_state(&app, &state).await
}

pub(crate) async fn codex_new_write_summary_impl(
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

pub(crate) async fn codex_new_run_test_impl(
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

pub(crate) async fn codex_new_read_file_preview_impl(
    input: CodexNewFilePreviewInput,
    app: AppHandle,
) -> Result<CodexNewFilePreview, String> {
    if let Some(root_side) = input.root_side.as_deref() {
        let root = resolve_session_preview_root(&app, &input.workspace_id, root_side)?;
        return Ok(read_file_preview_from_root(&root, &input.path));
    }
    let roots = resolve_session_preview_roots(&app, &input.workspace_id)?;
    Ok(read_file_preview(&roots, &input.path))
}

pub(crate) async fn codex_new_list_traceback_impl(
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

pub(crate) async fn codex_new_restore_traceback_impl(
    input: CodexNewTracebackRestoreInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<CodexNewFrontendState, String> {
    let target = match input.target.as_str() {
        "project" => TracebackRestoreTarget::Project,
        "workspace" => TracebackRestoreTarget::Workspace,
        _ => {
            return Err(
                "Traceback restore target must be \"project\" or \"workspace\".".to_string(),
            );
        }
    };
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, record, manifest_path) =
            resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        let outcome = core
            .restore_traceback(&record.project_id, &record.task_id, &input.path, target)
            .map_err(|err| err.to_string())?;
        core.refresh_changes(&manifest_path)
            .map_err(|err| err.to_string())?;
        Ok::<TracebackRestoreOutcome, String>(outcome)
    })
    .await
    .map_err(|err| err.to_string())??;
    build_frontend_state(&app, &state).await
}

pub(crate) async fn codex_new_list_memory_candidates_impl(
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

pub(crate) async fn codex_new_apply_memory_candidates_impl(
    input: CodexNewMemoryApplyInput,
    app: AppHandle,
) -> Result<MemoryApplyOutcome, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || {
        let (core, record, _) = resolve_manifest_path(&app_for_task, &input.workspace_id)?;
        if input.candidate_ids.is_empty() {
            return Err("Select at least one memory candidate.".to_string());
        }
        core.apply_memory_candidates(&record.project_id, &record.task_id, &input.candidate_ids)
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}
