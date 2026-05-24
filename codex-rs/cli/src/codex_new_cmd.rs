use anyhow::Context;
use clap::Parser;
use codex_core::config::find_codex_home;
use codex_new_core::CodexNewCore;
use codex_new_core::CommandExecutionKind;
use codex_new_core::CommandExecutionRequest;
use codex_new_core::MergeRequest;
use codex_new_core::MergeSelection;
use codex_new_core::ProjectSettings;
use codex_new_core::ResolveTaskRequest;
use codex_new_core::RollbackRequest;
use codex_new_core::RollbackSelection;
use codex_new_core::TaskReusePolicy;
use codex_new_core::TestExecutionRequest;
use codex_new_core::TracebackRestoreTarget;
use codex_new_core::WorkspaceStrategy;
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Parser)]
pub struct CodexNewCli {
    #[command(subcommand)]
    subcommand: CodexNewSubcommand,

    /// Override codex-new state root. Defaults to $CODEX_HOME/codex-new.
    #[arg(long = "state-root", global = true)]
    state_root: Option<PathBuf>,
}

#[derive(Debug, clap::Subcommand)]
enum CodexNewSubcommand {
    /// Register or update a project in the codex-new state store.
    Project {
        #[command(subcommand)]
        subcommand: ProjectSubcommand,
    },

    /// Manage isolated codex-new tasks.
    Task {
        #[command(subcommand)]
        subcommand: TaskSubcommand,
    },
}

#[derive(Debug, clap::Subcommand)]
enum ProjectSubcommand {
    /// Register or update a project root.
    Add {
        #[arg(value_name = "PROJECT_ROOT")]
        root: PathBuf,

        /// Force copy-based isolation instead of git worktree.
        #[arg(long)]
        copy: bool,
    },
}

#[derive(Debug, clap::Subcommand)]
enum TaskSubcommand {
    /// Create an isolated task workspace for a registered project.
    Create {
        #[arg(long)]
        project_id: String,

        #[arg(value_name = "TITLE")]
        title: String,
    },

    /// Resolve the active task for a conversation, reusing unfinished work by default.
    Resolve {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        conversation_id: Option<String>,

        #[arg(long)]
        force_new: bool,

        #[arg(value_name = "TITLE")]
        title: String,
    },

    /// Print a task overview DTO for desktop integration.
    Overview {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// Read task activity events for timeline visualization.
    Events {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long)]
        after_seq: Option<u64>,

        #[arg(long, default_value_t = 100)]
        limit: usize,
    },

    /// List recorded command runs for a task.
    Commands {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long, default_value_t = 50)]
        limit: usize,
    },

    /// Execute a generic shell command inside the isolated workspace.
    Exec {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long)]
        no_env: bool,

        #[arg(long)]
        title: Option<String>,

        #[arg(long)]
        retry_of: Option<String>,

        #[arg(value_name = "COMMAND")]
        command: String,
    },

    /// Run review and policy checks for a task.
    Review {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// Refresh and print the current task manifest.
    Diff {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// Merge selected files from the isolated workspace back into the project.
    Merge {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        /// Relative paths to merge. Omit to merge all changed files.
        #[arg(long = "file")]
        files: Vec<String>,
    },

    /// Roll back files previously merged by this task.
    Rollback {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        /// Relative paths to roll back. Omit to roll back all merged files.
        #[arg(long = "file")]
        files: Vec<String>,
    },

    /// Run a local test command inside the isolated workspace.
    Test {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long)]
        no_env: bool,

        #[arg(value_name = "COMMAND")]
        command: String,
    },

    /// Inspect and validate the task's inherited environment binding.
    EnvInspect {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// Record an agent plan event for timeline visualization.
    Plan {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(value_name = "MESSAGE")]
        message: String,
    },

    /// Record an agent note such as diagnosis or next-step reasoning.
    Note {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long)]
        command_id: Option<String>,

        #[arg(long)]
        path: Option<String>,

        #[arg(value_name = "MESSAGE")]
        message: String,
    },

    /// Record that the agent read a file.
    FileRead {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(value_name = "PATH")]
        path: String,
    },

    /// Record that the agent started editing a file.
    FileEditStart {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(value_name = "PATH")]
        path: String,
    },

    /// Annotate a prior command run with diagnosis and next-step text.
    AnnotateCommand {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long)]
        command_id: String,

        #[arg(long)]
        diagnosis: Option<String>,

        #[arg(long)]
        next_step: Option<String>,
    },

    /// Resume a task after validating workspace and environment state.
    Resume {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// Archive a task and keep only its artifacts.
    Archive {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// Write a task summary and candidate memory file.
    Summary {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long)]
        goal: String,

        #[arg(long)]
        result: String,
    },

    /// List candidate memory records for a task.
    MemoryCandidates {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// Apply selected candidate memory entries into project memory.
    MemoryApply {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long = "candidate")]
        candidate_ids: Vec<String>,
    },

    /// Build the compressed resume context DTO for agent continuation.
    ResumeContext {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// List per-file traceback pairs (original vs isolated workspace).
    TracebackList {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,
    },

    /// Restore one file from traceback snapshots.
    TracebackRestore {
        #[arg(long)]
        project_id: String,

        #[arg(long)]
        task_id: String,

        #[arg(long)]
        file: String,

        /// `project` restores the original repo file; `workspace` resets the isolated copy.
        #[arg(long, default_value = "project")]
        target: String,
    },
}

impl CodexNewCli {
    pub fn run(self) -> anyhow::Result<()> {
        let core = CodexNewCore::new(self.state_root()?);
        match self.subcommand {
            CodexNewSubcommand::Project { subcommand } => match subcommand {
                ProjectSubcommand::Add { root, copy } => {
                    let settings = ProjectSettings {
                        workspace_strategy: if copy {
                            WorkspaceStrategy::Copy
                        } else {
                            WorkspaceStrategy::Auto
                        },
                        ..ProjectSettings::default()
                    };
                    let project = core.register_project(root, settings)?;
                    print_json(&project)?;
                }
            },
            CodexNewSubcommand::Task { subcommand } => match subcommand {
                TaskSubcommand::Create { project_id, title } => {
                    let project = core.read_project(&project_id)?;
                    let (task, manifest) = core.create_task(&project, title)?;
                    print_json(&serde_json::json!({
                        "task": task,
                        "manifest": manifest,
                    }))?;
                }
                TaskSubcommand::Resolve {
                    project_id,
                    conversation_id,
                    force_new,
                    title,
                } => {
                    let response = core.resolve_or_create_task(ResolveTaskRequest {
                        project_id,
                        title,
                        conversation_id,
                        reuse_policy: if force_new {
                            TaskReusePolicy::ForceNew
                        } else {
                            TaskReusePolicy::ReuseActive
                        },
                    })?;
                    print_json(&response)?;
                }
                TaskSubcommand::Overview {
                    project_id,
                    task_id,
                } => {
                    let overview = core.get_task_overview(&project_id, &task_id)?;
                    print_json(&overview)?;
                }
                TaskSubcommand::Events {
                    project_id,
                    task_id,
                    after_seq,
                    limit,
                } => {
                    let feed = core.get_task_activity(&project_id, &task_id, after_seq, limit)?;
                    print_json(&feed)?;
                }
                TaskSubcommand::Commands {
                    project_id,
                    task_id,
                    limit,
                } => {
                    let commands = core.list_command_runs(&project_id, &task_id, limit)?;
                    print_json(&commands)?;
                }
                TaskSubcommand::Exec {
                    project_id,
                    task_id,
                    no_env,
                    title,
                    retry_of,
                    command,
                } => {
                    let manifest_path = core
                        .task_artifact_root(&project_id, &task_id)
                        .join("manifest.json");
                    let run = core.run_command_request(
                        &manifest_path,
                        CommandExecutionRequest {
                            command,
                            use_environment_binding: !no_env,
                            env_overrides: BTreeMap::new(),
                            profile_id: None,
                            title,
                            kind: CommandExecutionKind::Generic,
                            retry_of,
                        },
                    )?;
                    print_json(&run)?;
                }
                TaskSubcommand::Review {
                    project_id,
                    task_id,
                } => {
                    let report = core.review_task(&project_id, &task_id)?;
                    print_json(&report)?;
                }
                TaskSubcommand::Diff {
                    project_id,
                    task_id,
                } => {
                    let manifest_path = core
                        .task_artifact_root(&project_id, &task_id)
                        .join("manifest.json");
                    let manifest = core.refresh_changes(&manifest_path)?;
                    print_json(&manifest)?;
                }
                TaskSubcommand::Merge {
                    project_id,
                    task_id,
                    files,
                } => {
                    let manifest_path = core
                        .task_artifact_root(&project_id, &task_id)
                        .join("manifest.json");
                    let request = MergeRequest {
                        selection: if files.is_empty() {
                            MergeSelection::All
                        } else {
                            MergeSelection::Files(files)
                        },
                    };
                    let outcome = core.merge(&manifest_path, &request)?;
                    print_json(&outcome)?;
                }
                TaskSubcommand::Rollback {
                    project_id,
                    task_id,
                    files,
                } => {
                    let manifest_path = core
                        .task_artifact_root(&project_id, &task_id)
                        .join("manifest.json");
                    let selection = if files.is_empty() {
                        RollbackSelection::All
                    } else {
                        RollbackSelection::Files(files)
                    };
                    let outcome = core.rollback(&manifest_path, &RollbackRequest { selection })?;
                    print_json(&outcome)?;
                }
                TaskSubcommand::Test {
                    project_id,
                    task_id,
                    no_env,
                    command,
                } => {
                    let manifest_path = core
                        .task_artifact_root(&project_id, &task_id)
                        .join("manifest.json");
                    let outcome = core.run_test_command_request(
                        &manifest_path,
                        TestExecutionRequest {
                            command,
                            use_environment_binding: !no_env,
                            env_overrides: BTreeMap::new(),
                            profile_id: None,
                            retry_of: None,
                            title: Some("Test run".to_string()),
                        },
                    )?;
                    print_json(&outcome)?;
                }
                TaskSubcommand::EnvInspect {
                    project_id,
                    task_id,
                } => {
                    let environment = core.inspect_task_environment(&project_id, &task_id)?;
                    print_json(&serde_json::json!({ "environment": environment }))?;
                }
                TaskSubcommand::Plan {
                    project_id,
                    task_id,
                    message,
                } => {
                    let event = core.record_agent_plan(&project_id, &task_id, &message)?;
                    print_json(&event)?;
                }
                TaskSubcommand::Note {
                    project_id,
                    task_id,
                    command_id,
                    path,
                    message,
                } => {
                    let event = core.record_agent_note(
                        &project_id,
                        &task_id,
                        &message,
                        command_id.as_deref(),
                        path.as_deref(),
                    )?;
                    print_json(&event)?;
                }
                TaskSubcommand::FileRead {
                    project_id,
                    task_id,
                    path,
                } => {
                    let event = core.record_file_read(&project_id, &task_id, &path)?;
                    print_json(&event)?;
                }
                TaskSubcommand::FileEditStart {
                    project_id,
                    task_id,
                    path,
                } => {
                    let event = core.record_file_edit_started(&project_id, &task_id, &path)?;
                    print_json(&event)?;
                }
                TaskSubcommand::AnnotateCommand {
                    project_id,
                    task_id,
                    command_id,
                    diagnosis,
                    next_step,
                } => {
                    let run = core.annotate_command_run(
                        &project_id,
                        &task_id,
                        &command_id,
                        diagnosis,
                        next_step,
                    )?;
                    print_json(&run)?;
                }
                TaskSubcommand::Resume {
                    project_id,
                    task_id,
                } => {
                    let overview = core.resume_task(&project_id, &task_id)?;
                    print_json(&overview)?;
                }
                TaskSubcommand::Archive {
                    project_id,
                    task_id,
                } => {
                    let task = core.archive_task(&project_id, &task_id)?;
                    print_json(&task)?;
                }
                TaskSubcommand::Summary {
                    project_id,
                    task_id,
                    goal,
                    result,
                } => {
                    let manifest_path = core
                        .task_artifact_root(&project_id, &task_id)
                        .join("manifest.json");
                    let path = core.write_task_summary(&manifest_path, &goal, &result)?;
                    print_json(&serde_json::json!({ "path": path }))?;
                }
                TaskSubcommand::MemoryCandidates {
                    project_id,
                    task_id,
                } => {
                    let candidates = core.list_memory_candidates(&project_id, &task_id)?;
                    print_json(&candidates)?;
                }
                TaskSubcommand::MemoryApply {
                    project_id,
                    task_id,
                    candidate_ids,
                } => {
                    let outcome =
                        core.apply_memory_candidates(&project_id, &task_id, &candidate_ids)?;
                    print_json(&outcome)?;
                }
                TaskSubcommand::ResumeContext {
                    project_id,
                    task_id,
                } => {
                    let context = core.build_task_resume_context(&project_id, &task_id)?;
                    print_json(&context)?;
                }
                TaskSubcommand::TracebackList {
                    project_id,
                    task_id,
                } => {
                    let entries = core.list_traceback(&project_id, &task_id)?;
                    print_json(&entries)?;
                }
                TaskSubcommand::TracebackRestore {
                    project_id,
                    task_id,
                    file,
                    target,
                } => {
                    let restore_target = Self::parse_traceback_target(&target)?;
                    let outcome =
                        core.restore_traceback(&project_id, &task_id, &file, restore_target)?;
                    print_json(&outcome)?;
                }
            },
        }
        Ok(())
    }

    fn parse_traceback_target(value: &str) -> anyhow::Result<TracebackRestoreTarget> {
        match value.trim().to_ascii_lowercase().as_str() {
            "project" | "original" => Ok(TracebackRestoreTarget::Project),
            "workspace" | "isolated" => Ok(TracebackRestoreTarget::Workspace),
            other => anyhow::bail!("unknown traceback target {other:?}; use project or workspace"),
        }
    }

    fn state_root(&self) -> anyhow::Result<PathBuf> {
        if let Some(state_root) = &self.state_root {
            return Ok(state_root.clone());
        }
        Ok(find_codex_home()
            .context("resolve CODEX_HOME")?
            .join("codex-new")
            .into_path_buf())
    }
}

fn print_json<T: serde::Serialize>(value: &T) -> anyhow::Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}
