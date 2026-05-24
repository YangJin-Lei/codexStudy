use crate::CodexNewError;
use crate::Result;
use crate::activity;
use crate::diff;
use crate::environment;
use crate::fsx;
use crate::git;
use crate::manifest::TaskManifest;
use crate::memory;
use crate::models::ChangedFile;
use crate::models::ChangedFileStatus;
use crate::models::CommandExecutionKind;
use crate::models::CommandExecutionRequest;
use crate::models::CommandOutputStream;
use crate::models::CommandRunRecord;
use crate::models::CommandRunStatus;
use crate::models::HashIndex;
use crate::models::MergeOutcome;
use crate::models::MergeRequest;
use crate::models::MergeSelection;
use crate::models::ProjectRecord;
use crate::models::ProjectSettings;
use crate::models::ResolveTaskRequest;
use crate::models::ResolveTaskResponse;
use crate::models::ReviewDisposition;
use crate::models::ReviewReport;
use crate::models::RollbackOutcome;
use crate::models::RollbackRequest;
use crate::models::RollbackSelection;
use crate::models::StructuredTaskSummary;
use crate::models::TaskActivityFeed;
use crate::models::TaskOverview;
use crate::models::TaskRecord;
use crate::models::TaskReusePolicy;
use crate::models::TaskStatus;
use crate::models::TestExecutionRequest;
use crate::models::TestOutcome;
use crate::models::TimelineEvent;
use crate::models::TimelineEventKind;
use crate::policy;
use crate::recovery;
use crate::review;
use crate::sessions;
use crate::traceback;
use crate::workspace;
use chrono::Utc;
use serde_json::json;
use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::fs;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;
use std::sync::mpsc;
use std::thread;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct CodexNewCore {
    state_root: PathBuf,
}

impl CodexNewCore {
    pub fn new(state_root: PathBuf) -> Self {
        Self { state_root }
    }

    pub fn register_project(
        &self,
        root_path: PathBuf,
        settings: ProjectSettings,
    ) -> Result<ProjectRecord> {
        let root_path = root_path.canonicalize()?;
        let now = Utc::now();
        let id = stable_project_id(&root_path);
        let mut settings = settings;
        if settings.default_test_commands.is_empty() {
            settings.default_test_commands = crate::detect_test_commands(&root_path);
        }
        let project = ProjectRecord {
            id,
            name: root_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("project")
                .to_string(),
            git_root: git::git_root(&root_path),
            default_branch: git::branch_name(&root_path),
            root_path,
            created_at: now,
            updated_at: now,
            settings,
        };
        fs::create_dir_all(self.project_root(&project.id))?;
        self.write_project(&project)?;
        Ok(project)
    }

    pub fn read_project(&self, project_id: &str) -> Result<ProjectRecord> {
        let path = self.project_root(project_id).join("project.json");
        let bytes = fs::read(path)?;
        Ok(serde_json::from_slice(bytes.as_slice())?)
    }

    pub fn resolve_or_create_task(
        &self,
        request: ResolveTaskRequest,
    ) -> Result<ResolveTaskResponse> {
        let project = self.read_project(&request.project_id)?;
        let project_root = self.project_root(&project.id);
        let mut reused_existing = false;
        let task = match (&request.conversation_id, &request.reuse_policy) {
            (_, TaskReusePolicy::ForceNew) => None,
            (_, TaskReusePolicy::ForkFromTask { task_id }) => {
                let source = sessions::read_task_record(&project_root, task_id)?;
                return self.fork_task(&project, source, request.title, request.conversation_id);
            }
            (Some(conversation_id), TaskReusePolicy::ReuseActive) => {
                sessions::read_conversation_binding(&project_root, conversation_id)?
                    .and_then(|binding| binding.active_task_id)
                    .map(|task_id| sessions::read_task_record(&project_root, &task_id))
                    .transpose()?
                    .flatten()
            }
            (None, TaskReusePolicy::ReuseActive) => None,
        };

        let task = if let Some(task) = task.filter(|task| !task.status.is_terminal()) {
            reused_existing = true;
            task
        } else if request.conversation_id.is_some() {
            // Each chat thread gets its own isolated task directory; never attach a
            // new conversation to another thread's unfinished task.
            self.create_task(&project, request.title.clone())?.0
        } else if matches!(request.reuse_policy, TaskReusePolicy::ReuseActive) {
            if let Some(task) = sessions::find_latest_unfinished_task(&project_root)? {
                reused_existing = true;
                task
            } else {
                self.create_task(&project, request.title.clone())?.0
            }
        } else {
            self.create_task(&project, request.title.clone())?.0
        };

        let manifest = self.read_manifest(&task.project_id, &task.id)?;
        let conversation_binding = if let Some(conversation_id) = request.conversation_id {
            Some(sessions::write_conversation_binding(
                &project_root,
                &project.id,
                &conversation_id,
                Some(task.id.clone()),
            )?)
        } else {
            None
        };
        Ok(ResolveTaskResponse {
            task,
            manifest,
            reused_existing,
            conversation_binding,
        })
    }

    pub fn read_manifest(&self, project_id: &str, task_id: &str) -> Result<TaskManifest> {
        TaskManifest::read_from_path(&self.task_root(project_id, task_id).join("manifest.json"))
    }

    pub fn task_artifact_root(&self, project_id: &str, task_id: &str) -> PathBuf {
        self.task_root(project_id, task_id)
    }

    pub fn create_task(
        &self,
        project: &ProjectRecord,
        title: String,
    ) -> Result<(TaskRecord, TaskManifest)> {
        let task_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let prepared =
            workspace::prepare_workspace(project, &task_id, self.workspaces_root(), now)?;
        let task_root = self.task_root(&project.id, &task_id);
        fs::create_dir_all(task_root.join("changes"))?;
        fs::create_dir_all(task_root.join("snapshots").join("before"))?;
        fs::create_dir_all(task_root.join("snapshots").join("after-ai"))?;
        fs::create_dir_all(task_root.join("snapshots").join("after-merge"))?;
        traceback::ensure_traceback_dirs(&task_root)?;
        fs::create_dir_all(task_root.join("tests"))?;
        fs::create_dir_all(task_root.join("terminal"))?;
        fs::create_dir_all(task_root.join("memory"))?;

        let manifest_path = task_root.join("manifest.json");
        let summary_path = task_root.join("memory").join("task-summary.md");
        let task = TaskRecord {
            id: task_id.clone(),
            project_id: project.id.clone(),
            title,
            status: TaskStatus::WorkspaceReady,
            original_root: project.root_path.clone(),
            workspace_root: prepared.workspace_root.clone(),
            created_at: now,
            updated_at: now,
            completed_at: None,
            manifest_path: manifest_path.clone(),
            summary_path,
        };
        let mut environment_binding =
            environment::detect_environment_binding(project, &prepared.workspace_root)?;
        if let Some(binding) = environment_binding.as_mut() {
            let _ = environment::configure_isolated_workspace_environment(
                &prepared.workspace_root,
                binding,
            );
        }
        let manifest = TaskManifest {
            task_id: task_id.clone(),
            project_id: project.id.clone(),
            original_root: project.root_path.clone(),
            workspace_root: prepared.workspace_root,
            created_at: now,
            updated_at: now,
            status: TaskStatus::WorkspaceReady,
            base_revision: prepared.base_revision,
            environment_binding,
            changed_files: Vec::new(),
        };
        manifest.write_to_path(&manifest_path)?;
        sessions::write_task_record(&self.project_root(&project.id), &task)?;
        self.append_timeline(
            &project.id,
            &task_id,
            TimelineEventKind::WorkspaceCreated,
            json!({ "strategy": prepared.strategy, "branchName": prepared.branch_name }),
        )?;
        Ok((task, manifest))
    }

    pub fn refresh_changes(&self, manifest_path: &Path) -> Result<TaskManifest> {
        let mut manifest = TaskManifest::read_from_path(manifest_path)?;
        let previous_changes = manifest.changed_files.clone();
        let changed_files = compare_roots(
            &manifest.original_root,
            &manifest.workspace_root,
            &manifest.changed_files,
        )?;
        manifest.status = if changed_files.is_empty() {
            TaskStatus::WorkspaceReady
        } else {
            TaskStatus::ChangesDetected
        };
        manifest.updated_at = Utc::now();
        manifest.changed_files = changed_files;
        let diff = render_diff(&manifest)?;
        let task_root = self.task_root(&manifest.project_id, &manifest.task_id);
        fs::write(task_root.join("changes").join("full.diff"), diff)?;
        manifest.write_to_path(manifest_path)?;
        self.write_task_status(&manifest.project_id, &manifest.task_id, manifest.status)?;
        for changed in diff::detect_changed_file_events(&previous_changes, &manifest.changed_files)
        {
            let traceback = traceback::record_edit_traceback(&manifest, &task_root, &changed)?;
            self.append_timeline(
                &manifest.project_id,
                &manifest.task_id,
                TimelineEventKind::FileEditCompleted,
                json!({
                    "path": changed.path,
                    "status": changed.status,
                    "beforeHash": changed.before_hash,
                    "afterHash": changed.after_ai_hash,
                    "tracebackRevision": traceback.revision,
                }),
            )?;
        }
        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::DiffUpdated,
            json!({
                "changedFiles": manifest.changed_files,
                "stats": diff::diff_stats(&manifest.changed_files),
            }),
        )?;
        Ok(manifest)
    }

    pub fn merge(&self, manifest_path: &Path, request: &MergeRequest) -> Result<MergeOutcome> {
        let mut manifest = self.refresh_changes(manifest_path)?;
        let project_root = self.project_root(&manifest.project_id);
        let _merge_lock = recovery::MergeLockGuard::acquire(&project_root, &manifest.task_id)?;
        let accepted = selected_paths(&manifest.changed_files, &request.selection);
        let hunk_selections = hunk_selections(&request.selection);
        let task_root = self.task_root(&manifest.project_id, &manifest.task_id);
        let before_snapshot = task_root.join("snapshots").join("before");
        let after_merge_snapshot = task_root.join("snapshots").join("after-merge");
        let mut accepted_paths = Vec::new();
        let mut skipped_paths = Vec::new();

        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::MergeStarted,
            json!({ "selection": request.selection }),
        )?;

        for changed in &manifest.changed_files {
            if !accepted.contains(&changed.path) {
                continue;
            }
            let current_hash =
                fsx::file_hash(&fsx::checked_join(&manifest.original_root, &changed.path)?)?;
            if current_hash != changed.before_hash {
                manifest.status = TaskStatus::MergeConflict;
                manifest.write_to_path(manifest_path)?;
                self.write_task_status(&manifest.project_id, &manifest.task_id, manifest.status)?;
                return Err(CodexNewError::MergeConflict {
                    path: changed.path.clone(),
                    expected: changed.before_hash.clone(),
                    found: current_hash,
                });
            }
        }

        for changed in &mut manifest.changed_files {
            if !accepted.contains(&changed.path) {
                skipped_paths.push(changed.path.clone());
                continue;
            }
            let _path_lock = recovery::MergeLockGuard::acquire_path(&project_root, &changed.path)?;
            fsx::snapshot_file(&manifest.original_root, &before_snapshot, &changed.path)?;
            if hunk_selections
                .iter()
                .any(|selection| selection.path == changed.path)
            {
                diff::apply_selected_hunks(
                    &manifest.original_root,
                    &manifest.workspace_root,
                    &changed.path,
                    &hunk_selections,
                )?;
            } else {
                fsx::copy_file_or_remove(
                    &manifest.workspace_root,
                    &manifest.original_root,
                    &changed.path,
                )?;
            }
            fsx::snapshot_file(
                &manifest.original_root,
                &after_merge_snapshot,
                &changed.path,
            )?;
            changed.after_merge_hash =
                fsx::file_hash(&fsx::checked_join(&manifest.original_root, &changed.path)?)?;
            let path_hunks = hunk_selections
                .iter()
                .filter(|selection| selection.path == changed.path)
                .map(|selection| selection.hunk_index)
                .collect::<BTreeSet<_>>();
            changed.merged_hunks = if path_hunks.is_empty() {
                None
            } else {
                Some(path_hunks.into_iter().collect())
            };
            changed.accepted = true;
            changed.merge_status = "applied".to_string();
            accepted_paths.push(changed.path.clone());
        }

        let accepted_diff = render_selected_diff(&manifest, &accepted_paths)?;
        fs::write(
            task_root.join("changes").join("accepted.diff"),
            accepted_diff,
        )?;
        manifest.status = TaskStatus::RollbackAvailable;
        manifest.updated_at = Utc::now();
        manifest.write_to_path(manifest_path)?;
        self.write_task_status(&manifest.project_id, &manifest.task_id, manifest.status)?;
        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::MergeCompleted,
            json!({ "acceptedPaths": accepted_paths, "skippedPaths": skipped_paths }),
        )?;
        Ok(MergeOutcome {
            task_id: manifest.task_id,
            accepted_paths,
            skipped_paths,
            changed_files: manifest.changed_files,
        })
    }

    pub fn rollback(
        &self,
        manifest_path: &Path,
        request: &RollbackRequest,
    ) -> Result<RollbackOutcome> {
        let mut manifest = TaskManifest::read_from_path(manifest_path)?;
        let task_root = self.task_root(&manifest.project_id, &manifest.task_id);
        let before_snapshot = task_root.join("snapshots").join("before");
        let rollback_paths = selected_rollback_paths(&manifest.changed_files, &request.selection);
        let rollback_hunks = rollback_hunk_selections(&request.selection);
        let mut restored_paths = Vec::new();
        let skipped_paths = Vec::new();

        if rollback_paths.is_empty() {
            return Err(CodexNewError::Other(anyhow::anyhow!(
                "No merged files selected for rollback."
            )));
        }

        for changed in &manifest.changed_files {
            if !changed.accepted || !rollback_paths.contains(&changed.path) {
                continue;
            }
            let current_hash =
                fsx::file_hash(&fsx::checked_join(&manifest.original_root, &changed.path)?)?;
            if current_hash != changed.after_merge_hash {
                manifest.status = TaskStatus::RollbackFailed;
                manifest.write_to_path(manifest_path)?;
                self.write_task_status(&manifest.project_id, &manifest.task_id, manifest.status)?;
                return Err(CodexNewError::RollbackConflict {
                    path: changed.path.clone(),
                    expected: changed.after_merge_hash.clone(),
                    found: current_hash,
                });
            }
        }

        for changed in &mut manifest.changed_files {
            if !changed.accepted || !rollback_paths.contains(&changed.path) {
                continue;
            }
            let path_rollback_hunks = rollback_hunks
                .iter()
                .filter(|selection| selection.path == changed.path)
                .map(|selection| selection.hunk_index)
                .collect::<BTreeSet<_>>();
            let merged_hunks = changed.merged_hunks.clone().unwrap_or_default();
            let remaining_hunks = if path_rollback_hunks.is_empty() || merged_hunks.is_empty() {
                BTreeSet::new()
            } else {
                merged_hunks
                    .iter()
                    .copied()
                    .filter(|index| !path_rollback_hunks.contains(index))
                    .collect::<BTreeSet<_>>()
            };

            if !path_rollback_hunks.is_empty()
                && !merged_hunks.is_empty()
                && !remaining_hunks.is_empty()
            {
                fsx::restore_snapshot(&before_snapshot, &manifest.original_root, &changed.path)?;
                let selections = remaining_hunks
                    .into_iter()
                    .map(|hunk_index| crate::models::HunkSelection {
                        path: changed.path.clone(),
                        hunk_index,
                    })
                    .collect::<Vec<_>>();
                diff::apply_selected_hunks(
                    &manifest.original_root,
                    &manifest.workspace_root,
                    &changed.path,
                    &selections,
                )?;
                changed.after_merge_hash =
                    fsx::file_hash(&fsx::checked_join(&manifest.original_root, &changed.path)?)?;
                changed.merged_hunks = Some(
                    changed
                        .merged_hunks
                        .clone()
                        .unwrap_or_default()
                        .into_iter()
                        .filter(|index| !path_rollback_hunks.contains(index))
                        .collect(),
                );
                changed.merge_status = "applied".to_string();
            } else {
                fsx::restore_snapshot(&before_snapshot, &manifest.original_root, &changed.path)?;
                changed.accepted = false;
                changed.after_merge_hash = None;
                changed.merged_hunks = None;
                changed.merge_status = "pending".to_string();
            }
            restored_paths.push(changed.path.clone());
        }

        let any_accepted = manifest
            .changed_files
            .iter()
            .any(|changed| changed.accepted);
        manifest.status = if any_accepted {
            TaskStatus::RollbackAvailable
        } else {
            TaskStatus::MergeReady
        };
        manifest.updated_at = Utc::now();
        manifest.write_to_path(manifest_path)?;
        self.write_task_status(&manifest.project_id, &manifest.task_id, manifest.status)?;
        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::RollbackCompleted,
            json!({ "restoredPaths": restored_paths, "skippedPaths": skipped_paths }),
        )?;
        Ok(RollbackOutcome {
            task_id: manifest.task_id,
            restored_paths,
            skipped_paths,
        })
    }

    pub fn write_task_summary(
        &self,
        manifest_path: &Path,
        user_goal: &str,
        ai_result: &str,
    ) -> Result<PathBuf> {
        let manifest = TaskManifest::read_from_path(manifest_path)?;
        let task_root = self.task_root(&manifest.project_id, &manifest.task_id);
        let structured =
            memory::build_structured_summary(&manifest, user_goal, ai_result, &task_root)?;
        let (path, json_path) = memory::write_summary_artifacts(&task_root, &structured)?;
        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::SummaryGenerated,
            json!({ "path": path, "jsonPath": json_path }),
        )?;
        self.write_task_status(
            &manifest.project_id,
            &manifest.task_id,
            TaskStatus::SummaryReady,
        )?;
        Ok(path)
    }

    pub fn list_memory_candidates(
        &self,
        project_id: &str,
        task_id: &str,
    ) -> Result<Vec<crate::models::CandidateMemoryRecord>> {
        memory::read_candidate_memory_records(&self.task_root(project_id, task_id))
    }

    pub fn apply_memory_candidates(
        &self,
        project_id: &str,
        task_id: &str,
        candidate_ids: &[String],
    ) -> Result<crate::models::MemoryApplyOutcome> {
        memory::apply_candidate_memory(
            &self.project_root(project_id),
            &self.task_root(project_id, task_id),
            candidate_ids,
        )
    }

    pub fn build_task_resume_context(
        &self,
        project_id: &str,
        task_id: &str,
    ) -> Result<crate::protocol::TaskResumeContext> {
        let overview = self.get_task_overview(project_id, task_id)?;
        Ok(crate::protocol::build_task_resume_context(&overview))
    }

    pub fn list_traceback(
        &self,
        project_id: &str,
        task_id: &str,
    ) -> Result<Vec<crate::traceback::TracebackEntry>> {
        traceback::list_traceback_entries(&self.task_root(project_id, task_id))
    }

    pub fn restore_traceback(
        &self,
        project_id: &str,
        task_id: &str,
        path: &str,
        target: crate::traceback::TracebackRestoreTarget,
    ) -> Result<crate::traceback::TracebackRestoreOutcome> {
        let manifest = self.read_manifest(project_id, task_id)?;
        let task_root = self.task_root(project_id, task_id);
        let outcome = traceback::restore_file(&manifest, &task_root, path, target)?;
        self.append_timeline(
            project_id,
            task_id,
            TimelineEventKind::RollbackCompleted,
            json!({
                "path": path,
                "target": outcome.target,
                "tracebackRevision": outcome.revision,
                "kind": "tracebackRestore",
            }),
        )?;
        Ok(outcome)
    }

    pub fn run_test_command(&self, manifest_path: &Path, command: &str) -> Result<TestOutcome> {
        self.run_test_command_request(
            manifest_path,
            TestExecutionRequest {
                command: command.to_string(),
                use_environment_binding: true,
                env_overrides: BTreeMap::new(),
                profile_id: None,
                retry_of: None,
                title: Some("Test run".to_string()),
            },
        )
    }

    pub fn run_command_request(
        &self,
        manifest_path: &Path,
        request: CommandExecutionRequest,
    ) -> Result<CommandRunRecord> {
        let manifest = TaskManifest::read_from_path(manifest_path)?;
        let task_root = self.task_root(&manifest.project_id, &manifest.task_id);
        let terminal_root = task_root.join("terminal");
        fs::create_dir_all(&terminal_root)?;

        let env_binding = if request.use_environment_binding {
            manifest.environment_binding.as_ref()
        } else {
            None
        };
        let env_map = environment::build_command_environment(env_binding, &request.env_overrides);
        let run_id = Uuid::new_v4().to_string();
        let stdout_path = terminal_root.join(format!("{run_id}.stdout.log"));
        let stderr_path = terminal_root.join(format!("{run_id}.stderr.log"));
        let mut record = CommandRunRecord {
            id: run_id.clone(),
            task_id: manifest.task_id.clone(),
            kind: request.kind,
            title: request.title.clone(),
            command: request.command.clone(),
            cwd: manifest.workspace_root.clone(),
            environment_profile: request
                .profile_id
                .clone()
                .or_else(|| env_binding.map(|binding| binding.profile_id.clone())),
            environment_fingerprint: env_binding.map(|binding| binding.fingerprint.clone()),
            retry_of: request.retry_of.clone(),
            started_at: Utc::now(),
            completed_at: None,
            status: CommandRunStatus::Running,
            exit_code: None,
            stdout_path: stdout_path.clone(),
            stderr_path: stderr_path.clone(),
            stdout_bytes: 0,
            stderr_bytes: 0,
            diagnosis: None,
            failure_summary: None,
            next_step: None,
        };
        activity::write_command_run(&task_root, &record)?;
        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::CommandStarted,
            json!({
                "commandId": run_id,
                "command": request.command,
                "kind": record.kind,
                "cwd": manifest.workspace_root,
                "retryOf": record.retry_of,
                "title": record.title,
                "environmentProfile": record.environment_profile,
            }),
        )?;

        let mut child = build_shell_command(&request.command);
        child.current_dir(&manifest.workspace_root);
        child.envs(&env_map);
        child.stdout(Stdio::piped());
        child.stderr(Stdio::piped());
        let mut child = child.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| CodexNewError::Other(anyhow::anyhow!("missing stdout pipe")))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| CodexNewError::Other(anyhow::anyhow!("missing stderr pipe")))?;

        let (tx, rx) = mpsc::channel();
        let stdout_handle = spawn_output_reader(stdout, CommandOutputStream::Stdout, tx.clone());
        let stderr_handle = spawn_output_reader(stderr, CommandOutputStream::Stderr, tx);
        let mut stdout_file = fs::File::create(&stdout_path)?;
        let mut stderr_file = fs::File::create(&stderr_path)?;
        let mut stderr_excerpt = Vec::new();
        let mut open_streams = 2u8;

        while open_streams > 0 {
            match rx.recv() {
                Ok(StreamMessage::Chunk { stream, text }) => {
                    match stream {
                        CommandOutputStream::Stdout => {
                            stdout_file.write_all(text.as_bytes())?;
                            record.stdout_bytes += text.len() as u64;
                        }
                        CommandOutputStream::Stderr => {
                            stderr_file.write_all(text.as_bytes())?;
                            record.stderr_bytes += text.len() as u64;
                            push_excerpt(&mut stderr_excerpt, &text);
                        }
                    }
                    self.append_timeline(
                        &manifest.project_id,
                        &manifest.task_id,
                        TimelineEventKind::CommandOutput,
                        json!({
                            "commandId": run_id,
                            "stream": stream,
                            "text": text,
                        }),
                    )?;
                }
                Ok(StreamMessage::Closed) => {
                    open_streams -= 1;
                }
                Err(_) => break,
            }
        }

        let status = child.wait()?;
        stdout_handle
            .join()
            .map_err(|_| CodexNewError::Other(anyhow::anyhow!("stdout reader panicked")))?;
        stderr_handle
            .join()
            .map_err(|_| CodexNewError::Other(anyhow::anyhow!("stderr reader panicked")))?;

        record.completed_at = Some(Utc::now());
        record.exit_code = status.code();
        record.status = if status.success() {
            CommandRunStatus::Succeeded
        } else {
            CommandRunStatus::Failed
        };
        record.failure_summary = if matches!(record.status, CommandRunStatus::Failed) {
            summarize_failure(&stderr_excerpt, &request.command, status.code())
        } else {
            None
        };
        activity::write_command_run(&task_root, &record)?;
        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::CommandCompleted,
            json!({
                "commandId": run_id,
                "status": record.status,
                "exitCode": record.exit_code,
                "stdoutBytes": record.stdout_bytes,
                "stderrBytes": record.stderr_bytes,
                "failureSummary": record.failure_summary,
            }),
        )?;
        Ok(record)
    }

    pub fn run_test_command_request(
        &self,
        manifest_path: &Path,
        request: TestExecutionRequest,
    ) -> Result<TestOutcome> {
        let manifest = TaskManifest::read_from_path(manifest_path)?;
        let task_root = self.task_root(&manifest.project_id, &manifest.task_id);
        let test_dir = task_root.join("tests");
        fs::create_dir_all(&test_dir)?;
        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::TestStarted,
            json!({ "command": request.command }),
        )?;
        self.write_task_status(
            &manifest.project_id,
            &manifest.task_id,
            TaskStatus::TestingRunning,
        )?;
        let command_run = self.run_command_request(
            manifest_path,
            CommandExecutionRequest {
                command: request.command.to_string(),
                use_environment_binding: request.use_environment_binding,
                env_overrides: request.env_overrides.clone(),
                profile_id: request.profile_id.clone(),
                title: request.title.clone().or(Some("Test run".to_string())),
                kind: CommandExecutionKind::Test,
                retry_of: request.retry_of.clone(),
            },
        )?;
        let outcome = TestOutcome {
            command_run_id: command_run.id.clone(),
            command: request.command.to_string(),
            environment: command_run
                .environment_profile
                .unwrap_or_else(|| "local".to_string()),
            status: if matches!(command_run.status, CommandRunStatus::Succeeded) {
                "passed"
            } else {
                "failed"
            }
            .to_string(),
            exit_code: command_run.exit_code,
            stdout_path: command_run.stdout_path.clone(),
            stderr_path: command_run.stderr_path.clone(),
        };
        fs::write(
            test_dir.join(format!("{}.json", command_run.id)),
            serde_json::to_vec_pretty(&outcome)?,
        )?;
        self.write_task_status(
            &manifest.project_id,
            &manifest.task_id,
            if outcome.status == "passed" {
                TaskStatus::TestingPassed
            } else {
                TaskStatus::TestingFailed
            },
        )?;
        self.append_timeline(
            &manifest.project_id,
            &manifest.task_id,
            TimelineEventKind::TestCompleted,
            json!({ "outcome": outcome }),
        )?;
        Ok(outcome)
    }

    pub fn get_task_overview(&self, project_id: &str, task_id: &str) -> Result<TaskOverview> {
        let project_root = self.project_root(project_id);
        let manifest = self.read_manifest(project_id, task_id)?;
        let task = sessions::read_task_record(&project_root, task_id)?.ok_or_else(|| {
            CodexNewError::Other(anyhow::anyhow!("missing task record for {task_id}"))
        })?;
        let summary_path = self
            .task_root(project_id, task_id)
            .join("memory")
            .join("task-summary.json");
        let latest_summary = if summary_path.exists() {
            Some(serde_json::from_slice::<StructuredTaskSummary>(&fs::read(
                &summary_path,
            )?)?)
        } else {
            None
        };
        let review_path = self
            .task_root(project_id, task_id)
            .join("review")
            .join("latest-review.json");
        let review = if review_path.exists() {
            Some(serde_json::from_slice::<ReviewReport>(&fs::read(
                &review_path,
            )?)?)
        } else {
            None
        };
        let diff = diff::build_diff_bundle(&manifest)?;
        let task_root = self.task_root(project_id, task_id);
        let recent_activity = activity::read_timeline_events(&task_root, task_id, None, 40)?;
        let command_runs = activity::list_command_runs(&task_root, 20)?;
        Ok(TaskOverview {
            task,
            environment: manifest.environment_binding.clone(),
            latest_summary,
            diff,
            review,
            latest_event_seq: recent_activity.latest_seq,
            recent_activity: recent_activity.events,
            command_runs,
            timeline_path: task_root.join("timeline.jsonl"),
            manifest,
        })
    }

    pub fn inspect_task_environment(
        &self,
        project_id: &str,
        task_id: &str,
    ) -> Result<Option<crate::models::EnvironmentBinding>> {
        self.refresh_environment_links(project_id, task_id)
    }

    pub fn refresh_environment_links(
        &self,
        project_id: &str,
        task_id: &str,
    ) -> Result<Option<crate::models::EnvironmentBinding>> {
        let mut manifest = self.read_manifest(project_id, task_id)?;
        let workspace_root = manifest.workspace_root.clone();
        if let Some(binding) = manifest.environment_binding.as_mut() {
            let _ = environment::configure_isolated_workspace_environment(&workspace_root, binding);
            manifest.updated_at = Utc::now();
            let snapshot = binding.clone();
            manifest.write_to_path(&self.task_root(project_id, task_id).join("manifest.json"))?;
            return Ok(Some(snapshot));
        }
        Ok(None)
    }

    pub fn get_task_activity(
        &self,
        project_id: &str,
        task_id: &str,
        after_seq: Option<u64>,
        limit: usize,
    ) -> Result<TaskActivityFeed> {
        activity::read_timeline_events(
            &self.task_root(project_id, task_id),
            task_id,
            after_seq,
            limit,
        )
    }

    pub fn list_command_runs(
        &self,
        project_id: &str,
        task_id: &str,
        limit: usize,
    ) -> Result<Vec<CommandRunRecord>> {
        activity::list_command_runs(&self.task_root(project_id, task_id), limit)
    }

    pub fn annotate_command_run(
        &self,
        project_id: &str,
        task_id: &str,
        command_id: &str,
        diagnosis: Option<String>,
        next_step: Option<String>,
    ) -> Result<CommandRunRecord> {
        let task_root = self.task_root(project_id, task_id);
        let mut record = activity::read_command_run(&task_root, command_id)?.ok_or_else(|| {
            CodexNewError::Other(anyhow::anyhow!("missing command record for {command_id}"))
        })?;
        if let Some(diagnosis) = diagnosis.clone() {
            record.diagnosis = Some(diagnosis);
        }
        if let Some(next_step) = next_step.clone() {
            record.next_step = Some(next_step);
        }
        activity::write_command_run(&task_root, &record)?;
        self.append_timeline(
            project_id,
            task_id,
            TimelineEventKind::AgentNote,
            json!({
                "commandId": command_id,
                "diagnosis": diagnosis,
                "nextStep": next_step,
            }),
        )?;
        Ok(record)
    }

    pub fn record_agent_plan(
        &self,
        project_id: &str,
        task_id: &str,
        message: &str,
    ) -> Result<TimelineEvent> {
        self.append_timeline(
            project_id,
            task_id,
            TimelineEventKind::AgentPlan,
            json!({ "message": message }),
        )
    }

    pub fn record_agent_note(
        &self,
        project_id: &str,
        task_id: &str,
        message: &str,
        command_id: Option<&str>,
        path: Option<&str>,
    ) -> Result<TimelineEvent> {
        self.append_timeline(
            project_id,
            task_id,
            TimelineEventKind::AgentNote,
            json!({
                "message": message,
                "commandId": command_id,
                "path": path,
            }),
        )
    }

    pub fn record_file_read(
        &self,
        project_id: &str,
        task_id: &str,
        path: &str,
    ) -> Result<TimelineEvent> {
        self.append_timeline(
            project_id,
            task_id,
            TimelineEventKind::FileRead,
            json!({ "path": path }),
        )
    }

    pub fn record_file_edit_started(
        &self,
        project_id: &str,
        task_id: &str,
        path: &str,
    ) -> Result<TimelineEvent> {
        self.append_timeline(
            project_id,
            task_id,
            TimelineEventKind::FileEditStarted,
            json!({ "path": path }),
        )
    }

    pub fn review_task(&self, project_id: &str, task_id: &str) -> Result<ReviewReport> {
        let project = self.read_project(project_id)?;
        let manifest = self.read_manifest(project_id, task_id)?;
        let diff = diff::build_diff_bundle(&manifest)?;
        let report = review::review_manifest(
            &manifest,
            &diff,
            &policy::merge_policy_for_project(&project),
        );
        let review_root = self.task_root(project_id, task_id).join("review");
        fs::create_dir_all(&review_root)?;
        fs::write(
            review_root.join("latest-review.json"),
            serde_json::to_vec_pretty(&report)?,
        )?;
        self.write_task_status(
            project_id,
            task_id,
            match report.disposition {
                ReviewDisposition::Blocked => TaskStatus::ReviewBlocked,
                _ => TaskStatus::ReviewPassed,
            },
        )?;
        self.append_timeline(
            project_id,
            task_id,
            TimelineEventKind::ReviewCompleted,
            json!({ "report": report }),
        )?;
        Ok(report)
    }

    pub fn archive_task(&self, project_id: &str, task_id: &str) -> Result<TaskRecord> {
        let project_root = self.project_root(project_id);
        let mut task = sessions::read_task_record(&project_root, task_id)?.ok_or_else(|| {
            CodexNewError::Other(anyhow::anyhow!("missing task record for {task_id}"))
        })?;
        task.status = TaskStatus::Archived;
        task.updated_at = Utc::now();
        task.completed_at = task.completed_at.or(Some(Utc::now()));
        sessions::write_task_record(&project_root, &task)?;

        let manifest_path = self.task_root(project_id, task_id).join("manifest.json");
        if manifest_path.exists() {
            let mut manifest = TaskManifest::read_from_path(&manifest_path)?;
            manifest.status = TaskStatus::Archived;
            manifest.updated_at = Utc::now();
            manifest.write_to_path(&manifest_path)?;
        }
        Ok(task)
    }

    pub fn resume_task(&self, project_id: &str, task_id: &str) -> Result<TaskOverview> {
        let manifest_path = self.task_root(project_id, task_id).join("manifest.json");
        let project = self.read_project(project_id)?;
        let mut manifest = self.read_manifest(project_id, task_id)?;
        recovery::recover_task_workspace(&project, &mut manifest, &self.workspaces_root())?;
        if let Some(binding) = &mut manifest.environment_binding {
            binding.validation = environment::validate_environment_binding(binding);
        }
        let manifest = recovery::recover_manifest(manifest);
        manifest.write_to_path(&manifest_path)?;
        self.write_task_status(project_id, task_id, manifest.status)?;
        self.get_task_overview(project_id, task_id)
    }

    fn fork_task(
        &self,
        project: &ProjectRecord,
        source: Option<TaskRecord>,
        title: String,
        conversation_id: Option<String>,
    ) -> Result<ResolveTaskResponse> {
        let source = source.ok_or_else(|| {
            CodexNewError::Other(anyhow::anyhow!("fork source task was not found"))
        })?;
        let source_manifest = self.read_manifest(&project.id, &source.id)?;
        let (task, mut manifest) = self.create_task(project, title)?;
        if source_manifest.workspace_root.exists() {
            fsx::copy_project(&source_manifest.workspace_root, &manifest.workspace_root)?;
            let manifest_path = self.task_root(&project.id, &task.id).join("manifest.json");
            manifest = self.refresh_changes(&manifest_path)?;
        }
        let project_root = self.project_root(&project.id);
        let conversation_binding = if let Some(conversation_id) = conversation_id {
            Some(sessions::write_conversation_binding(
                &project_root,
                &project.id,
                &conversation_id,
                Some(task.id.clone()),
            )?)
        } else {
            None
        };
        Ok(ResolveTaskResponse {
            task,
            manifest,
            reused_existing: false,
            conversation_binding,
        })
    }

    fn project_root(&self, project_id: &str) -> PathBuf {
        self.state_root.join("projects").join(project_id)
    }

    fn task_root(&self, project_id: &str, task_id: &str) -> PathBuf {
        self.project_root(project_id).join("tasks").join(task_id)
    }

    fn workspaces_root(&self) -> PathBuf {
        self.state_root.join("workspaces")
    }

    fn write_project(&self, project: &ProjectRecord) -> Result<()> {
        let path = self.project_root(&project.id).join("project.json");
        fs::write(path, serde_json::to_vec_pretty(project)?)?;
        Ok(())
    }

    fn write_task_status(&self, project_id: &str, task_id: &str, status: TaskStatus) -> Result<()> {
        let project_root = self.project_root(project_id);
        if let Some(mut task) = sessions::read_task_record(&project_root, task_id)? {
            task.status = status;
            task.updated_at = Utc::now();
            if status.is_terminal() {
                task.completed_at = Some(Utc::now());
            }
            sessions::write_task_record(&project_root, &task)?;
        }
        Ok(())
    }

    fn append_timeline(
        &self,
        project_id: &str,
        task_id: &str,
        kind: TimelineEventKind,
        payload: serde_json::Value,
    ) -> Result<TimelineEvent> {
        activity::append_timeline_event(
            &self.task_root(project_id, task_id),
            task_id,
            kind,
            payload,
        )
    }
}

fn stable_project_id(root: &Path) -> String {
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(root.to_string_lossy().as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    format!("proj_{}", &digest[..16])
}

fn compare_roots(
    original_root: &Path,
    workspace_root: &Path,
    previous_changes: &[ChangedFile],
) -> Result<Vec<ChangedFile>> {
    let original = hash_index(original_root)?;
    let workspace = hash_index(workspace_root)?;
    let previous = previous_changes
        .iter()
        .map(|change| (change.path.as_str(), change))
        .collect::<BTreeMap<_, _>>();
    let all_paths = original
        .keys()
        .chain(workspace.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut changed = Vec::new();
    for path in all_paths {
        let before_hash = previous
            .get(path.as_str())
            .map(|change| change.before_hash.clone())
            .unwrap_or_else(|| original.get(&path).cloned().flatten());
        let after_ai_hash = workspace.get(&path).cloned().flatten();
        if before_hash == after_ai_hash {
            continue;
        }
        let status = match (&before_hash, &after_ai_hash) {
            (None, Some(_)) => ChangedFileStatus::Added,
            (Some(_), None) => ChangedFileStatus::Deleted,
            (Some(_), Some(_)) => ChangedFileStatus::Modified,
            (None, None) => continue,
        };
        changed.push(ChangedFile {
            path,
            status,
            before_hash,
            after_ai_hash,
            after_merge_hash: None,
            merged_hunks: None,
            accepted: false,
            merge_status: "pending".to_string(),
        });
    }
    Ok(changed)
}

fn hash_index(root: &Path) -> Result<HashIndex> {
    let mut index = HashIndex::new();
    for entry in WalkDir::new(root).follow_links(false) {
        let entry = entry.map_err(anyhow::Error::from)?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path
            .components()
            .any(|component| component.as_os_str() == ".git")
        {
            continue;
        }
        let relative = path.strip_prefix(root).map_err(anyhow::Error::from)?;
        let relative = relative.to_string_lossy().replace('\\', "/");
        index.insert(relative, fsx::file_hash(path)?);
    }
    Ok(index)
}

fn render_diff(manifest: &TaskManifest) -> Result<String> {
    if manifest.workspace_root.join(".git").exists()
        && let Ok(diff) = git::workspace_diff(&manifest.workspace_root)
        && !diff.is_empty()
    {
        return Ok(diff);
    }
    render_synthetic_diff(manifest)
}

fn render_selected_diff(manifest: &TaskManifest, paths: &[String]) -> Result<String> {
    let mut selected = manifest.clone();
    selected
        .changed_files
        .retain(|change| paths.iter().any(|path| path == &change.path));
    render_synthetic_diff(&selected)
}

fn render_synthetic_diff(manifest: &TaskManifest) -> Result<String> {
    let mut diff = String::new();
    for change in &manifest.changed_files {
        diff.push_str(&format!("diff --codex-new a/{0} b/{0}\n", change.path));
        diff.push_str(&format!("status {:?}\n", change.status));
        diff.push_str(&format!("before {:?}\n", change.before_hash));
        diff.push_str(&format!("after {:?}\n", change.after_ai_hash));
    }
    Ok(diff)
}

fn selected_paths(changes: &[ChangedFile], selection: &MergeSelection) -> BTreeSet<String> {
    match selection {
        MergeSelection::All => changes.iter().map(|change| change.path.clone()).collect(),
        MergeSelection::Files(paths) => paths.iter().cloned().collect(),
        MergeSelection::Hunks(hunks) => hunks.iter().map(|hunk| hunk.path.clone()).collect(),
        MergeSelection::Lines(lines) => lines.iter().map(|line| line.path.clone()).collect(),
    }
}

fn hunk_selections(selection: &MergeSelection) -> Vec<crate::models::HunkSelection> {
    match selection {
        MergeSelection::Hunks(hunks) => hunks.clone(),
        _ => Vec::new(),
    }
}

fn selected_rollback_paths(
    changes: &[ChangedFile],
    selection: &RollbackSelection,
) -> BTreeSet<String> {
    let requested = match selection {
        RollbackSelection::All => changes
            .iter()
            .filter(|change| change.accepted)
            .map(|change| change.path.clone())
            .collect::<BTreeSet<_>>(),
        RollbackSelection::Files(paths) => paths.iter().cloned().collect(),
        RollbackSelection::Hunks(hunks) => hunks.iter().map(|hunk| hunk.path.clone()).collect(),
    };
    changes
        .iter()
        .filter(|change| change.accepted && requested.contains(&change.path))
        .map(|change| change.path.clone())
        .collect()
}

fn rollback_hunk_selections(selection: &RollbackSelection) -> Vec<crate::models::HunkSelection> {
    match selection {
        RollbackSelection::Hunks(hunks) => hunks.clone(),
        _ => Vec::new(),
    }
}

fn build_shell_command(command: &str) -> Command {
    if cfg!(windows) {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command]);
        cmd
    } else {
        let mut cmd = Command::new("sh");
        cmd.args(["-lc", command]);
        cmd
    }
}

enum StreamMessage {
    Chunk {
        stream: CommandOutputStream,
        text: String,
    },
    Closed,
}

fn spawn_output_reader<R: std::io::Read + Send + 'static>(
    reader: R,
    stream: CommandOutputStream,
    tx: mpsc::Sender<StreamMessage>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if tx
                        .send(StreamMessage::Chunk { stream, text: line })
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = tx.send(StreamMessage::Closed);
    })
}

fn push_excerpt(excerpt: &mut Vec<String>, text: &str) {
    for line in text.lines() {
        if !line.trim().is_empty() {
            excerpt.push(line.trim().to_string());
        }
    }
    if excerpt.len() > 8 {
        let keep_from = excerpt.len() - 8;
        excerpt.drain(0..keep_from);
    }
}

fn summarize_failure(
    stderr_excerpt: &[String],
    command: &str,
    exit_code: Option<i32>,
) -> Option<String> {
    if !stderr_excerpt.is_empty() {
        return Some(stderr_excerpt.join(" | "));
    }
    exit_code.map(|code| format!("Command `{command}` exited with code {code}."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CommandExecutionKind;
    use crate::models::CommandExecutionRequest;
    use crate::models::CommandRunStatus;
    use crate::models::WorkspaceStrategy;
    use pretty_assertions::assert_eq;

    #[test]
    fn copy_task_merge_and_rollback_round_trip() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let project_root = temp.path().join("project");
        fs::create_dir_all(project_root.join("src"))?;
        fs::write(project_root.join("src").join("main.rs"), "fn main() {}\n")?;
        fs::write(project_root.join("README.md"), "hello\n")?;

        let core = CodexNewCore::new(temp.path().join("state"));
        let project = core.register_project(
            project_root.clone(),
            ProjectSettings {
                workspace_strategy: WorkspaceStrategy::Copy,
                ..ProjectSettings::default()
            },
        )?;
        let (_task, manifest) = core.create_task(&project, "change greeting".to_string())?;
        fs::write(
            manifest.workspace_root.join("src").join("main.rs"),
            "fn main() { println!(\"hi\"); }\n",
        )?;
        fs::write(manifest.workspace_root.join("new.txt"), "new\n")?;

        let manifest = core.refresh_changes(&manifest_path(&manifest))?;
        assert_eq!(manifest.changed_files.len(), 2);

        let outcome = core.merge(
            &manifest_path(&manifest),
            &MergeRequest {
                selection: MergeSelection::Files(vec!["src/main.rs".to_string()]),
            },
        )?;
        assert_eq!(outcome.accepted_paths, vec!["src/main.rs".to_string()]);
        assert_eq!(
            fs::read_to_string(project_root.join("src").join("main.rs"))?,
            "fn main() { println!(\"hi\"); }\n"
        );
        assert!(!project_root.join("new.txt").exists());

        let rollback = core.rollback(
            &manifest_path(&manifest),
            &RollbackRequest {
                selection: RollbackSelection::All,
            },
        )?;
        assert_eq!(rollback.restored_paths, vec!["src/main.rs".to_string()]);
        assert_eq!(
            fs::read_to_string(project_root.join("src").join("main.rs"))?,
            "fn main() {}\n"
        );
        Ok(())
    }

    #[test]
    fn rollback_removes_merged_added_files() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let project_root = temp.path().join("project");
        fs::create_dir_all(project_root.join("src"))?;
        fs::write(project_root.join("README.md"), "hello\n")?;

        let core = CodexNewCore::new(temp.path().join("state"));
        let project = core.register_project(
            project_root.clone(),
            ProjectSettings {
                workspace_strategy: WorkspaceStrategy::Copy,
                ..ProjectSettings::default()
            },
        )?;
        let (_task, manifest) = core.create_task(&project, "add game".to_string())?;
        fs::write(
            manifest.workspace_root.join("src").join("game.py"),
            "print('play')\n",
        )?;

        let manifest = core.refresh_changes(&manifest_path(&manifest))?;
        core.merge(
            &manifest_path(&manifest),
            &MergeRequest {
                selection: MergeSelection::Files(vec!["src/game.py".to_string()]),
            },
        )?;
        assert!(project_root.join("src").join("game.py").is_file());

        let rollback = core.rollback(
            &manifest_path(&manifest),
            &RollbackRequest {
                selection: RollbackSelection::Files(vec!["src/game.py".to_string()]),
            },
        )?;
        assert_eq!(rollback.restored_paths, vec!["src/game.py".to_string()]);
        assert!(!project_root.join("src").join("game.py").exists());
        Ok(())
    }

    #[test]
    fn merge_detects_original_file_conflict() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let project_root = temp.path().join("project");
        fs::create_dir_all(&project_root)?;
        fs::write(project_root.join("lib.rs"), "old\n")?;

        let core = CodexNewCore::new(temp.path().join("state"));
        let project = core.register_project(
            project_root.clone(),
            ProjectSettings {
                workspace_strategy: WorkspaceStrategy::Copy,
                ..ProjectSettings::default()
            },
        )?;
        let (_task, manifest) = core.create_task(&project, "change".to_string())?;
        fs::write(manifest.workspace_root.join("lib.rs"), "ai\n")?;
        let manifest = core.refresh_changes(&manifest_path(&manifest))?;
        fs::write(project_root.join("lib.rs"), "user\n")?;

        let err = core
            .merge(
                &manifest_path(&manifest),
                &MergeRequest {
                    selection: MergeSelection::All,
                },
            )
            .expect_err("merge should detect conflict");
        assert!(matches!(err, CodexNewError::MergeConflict { .. }));
        Ok(())
    }

    #[test]
    fn summary_writes_structured_json_with_memory_candidates() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let project_root = temp.path().join("project");
        fs::create_dir_all(&project_root)?;
        fs::write(project_root.join("README.md"), "hello\n")?;

        let core = CodexNewCore::new(temp.path().join("state"));
        let project = core.register_project(
            project_root,
            ProjectSettings {
                workspace_strategy: WorkspaceStrategy::Copy,
                ..ProjectSettings::default()
            },
        )?;
        let (_task, manifest) = core.create_task(&project, "memory".to_string())?;
        let path = core.write_task_summary(&manifest_path(&manifest), "goal", "result")?;
        assert!(path.exists());
        let json_path = path.parent().expect("parent").join("task-summary.json");
        let summary: StructuredTaskSummary = serde_json::from_slice(&fs::read(json_path)?)?;
        assert_eq!(summary.user_goal, "goal");
        assert!(!summary.candidate_memory.is_empty());
        let candidates = core.list_memory_candidates(&project.id, &manifest.task_id)?;
        assert!(!candidates.is_empty());
        Ok(())
    }

    #[test]
    fn memory_apply_writes_project_memory() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let project_root = temp.path().join("project");
        fs::create_dir_all(&project_root)?;
        fs::write(project_root.join("README.md"), "hello\n")?;

        let core = CodexNewCore::new(temp.path().join("state"));
        let project = core.register_project(
            project_root,
            ProjectSettings {
                workspace_strategy: WorkspaceStrategy::Copy,
                ..ProjectSettings::default()
            },
        )?;
        let (_task, manifest) = core.create_task(&project, "memory apply".to_string())?;
        core.write_task_summary(&manifest_path(&manifest), "goal", "result")?;
        let candidates = core.list_memory_candidates(&project.id, &manifest.task_id)?;
        let candidate_id = candidates[0].id.clone();
        let outcome =
            core.apply_memory_candidates(&project.id, &manifest.task_id, &[candidate_id.clone()])?;
        assert_eq!(outcome.applied, vec![candidate_id]);
        Ok(())
    }

    #[test]
    fn build_task_resume_context_includes_summary_and_diff() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let project_root = temp.path().join("project");
        fs::create_dir_all(&project_root)?;
        fs::write(project_root.join("README.md"), "hello\n")?;

        let core = CodexNewCore::new(temp.path().join("state"));
        let project = core.register_project(
            project_root,
            ProjectSettings {
                workspace_strategy: WorkspaceStrategy::Copy,
                ..ProjectSettings::default()
            },
        )?;
        let (_task, manifest) = core.create_task(&project, "resume".to_string())?;
        core.write_task_summary(&manifest_path(&manifest), "goal", "result")?;
        let context = core.build_task_resume_context(&project.id, &manifest.task_id)?;
        assert_eq!(context.task_id, manifest.task_id);
        assert!(context.summary.is_some());
        Ok(())
    }

    #[test]
    fn command_run_records_activity_and_logs() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let project_root = temp.path().join("project");
        fs::create_dir_all(&project_root)?;
        fs::write(project_root.join("README.md"), "hello\n")?;

        let core = CodexNewCore::new(temp.path().join("state"));
        let project = core.register_project(
            project_root.clone(),
            ProjectSettings {
                workspace_strategy: WorkspaceStrategy::Copy,
                ..ProjectSettings::default()
            },
        )?;
        let (_task, manifest) = core.create_task(&project, "stream command".to_string())?;
        let command = if cfg!(windows) {
            "echo hello & echo fail 1>&2 & exit /b 3"
        } else {
            "echo hello; echo fail 1>&2; exit 3"
        };

        let run = core.run_command_request(
            &manifest_path(&manifest),
            CommandExecutionRequest {
                command: command.to_string(),
                use_environment_binding: false,
                env_overrides: BTreeMap::new(),
                profile_id: None,
                title: Some("Smoke command".to_string()),
                kind: CommandExecutionKind::Generic,
                retry_of: None,
            },
        )?;

        assert_eq!(run.status, CommandRunStatus::Failed);
        assert_eq!(run.exit_code, Some(3));
        assert!(fs::read_to_string(&run.stdout_path)?.contains("hello"));
        assert!(fs::read_to_string(&run.stderr_path)?.contains("fail"));

        let feed = core.get_task_activity(&project.id, &manifest.task_id, None, 100)?;
        assert!(
            feed.events
                .iter()
                .any(|event| event.kind == TimelineEventKind::CommandStarted)
        );
        assert!(
            feed.events
                .iter()
                .any(|event| event.kind == TimelineEventKind::CommandOutput)
        );
        assert!(
            feed.events
                .iter()
                .any(|event| event.kind == TimelineEventKind::CommandCompleted)
        );
        Ok(())
    }

    fn manifest_path(manifest: &TaskManifest) -> PathBuf {
        temp_state_root(&manifest.original_root)
            .join("projects")
            .join(&manifest.project_id)
            .join("tasks")
            .join(&manifest.task_id)
            .join("manifest.json")
    }

    fn temp_state_root(project_root: &Path) -> PathBuf {
        project_root.parent().expect("project parent").join("state")
    }

    #[test]
    fn each_conversation_gets_its_own_task_directory() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let project_root = temp.path().join("project");
        fs::create_dir_all(&project_root)?;
        fs::write(project_root.join("README.md"), "hello\n")?;

        let core = CodexNewCore::new(temp.path().join("state"));
        let project = core.register_project(
            project_root,
            ProjectSettings {
                workspace_strategy: WorkspaceStrategy::Copy,
                ..ProjectSettings::default()
            },
        )?;
        let first = core.resolve_or_create_task(ResolveTaskRequest {
            project_id: project.id.clone(),
            title: "first chat".to_string(),
            conversation_id: Some("thread-a".to_string()),
            reuse_policy: TaskReusePolicy::ReuseActive,
        })?;
        let second = core.resolve_or_create_task(ResolveTaskRequest {
            project_id: project.id.clone(),
            title: "second chat".to_string(),
            conversation_id: Some("thread-b".to_string()),
            reuse_policy: TaskReusePolicy::ReuseActive,
        })?;
        assert_ne!(first.task.id, second.task.id);
        assert_ne!(
            first.manifest.workspace_root,
            second.manifest.workspace_root
        );
        Ok(())
    }
}
