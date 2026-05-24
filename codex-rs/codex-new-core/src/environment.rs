use crate::Result;
use crate::models::DetectedTool;
use crate::models::EnvironmentBinding;
use crate::models::EnvironmentStrategy;
use crate::models::EnvironmentValidation;
use crate::models::ProjectRecord;
use crate::models::SharedPathKind;
use crate::models::SharedPathMount;
use chrono::Utc;
use sha2::Digest;
use std::collections::BTreeMap;
use std::env;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone)]
struct EnvironmentCandidate {
    environment_root: PathBuf,
    env_vars: BTreeMap<String, String>,
    path_entries: Vec<PathBuf>,
    shared_paths: Vec<SharedPathMount>,
    detected_tools: Vec<DetectedTool>,
    score: i32,
    notes: Vec<String>,
}

pub(crate) fn detect_environment_binding(
    project: &ProjectRecord,
    workspace_root: &Path,
) -> Result<Option<EnvironmentBinding>> {
    let candidates = discover_environment_candidates(&project.root_path);
    let Some(candidate) = candidates
        .into_iter()
        .max_by_key(|candidate| candidate.score)
    else {
        return Ok(None);
    };

    Ok(Some(bind_environment(
        project,
        workspace_root,
        candidate,
        EnvironmentStrategy::InheritProject,
    )))
}

pub(crate) fn validate_environment_binding(binding: &EnvironmentBinding) -> EnvironmentValidation {
    let mut notes = Vec::new();
    let mut is_valid = true;
    for mount in &binding.shared_paths {
        if !mount.source.exists() {
            is_valid = false;
            notes.push(format!("Missing shared path: {}", mount.source.display()));
        }
    }
    for tool in &binding.detected_tools {
        if !tool.executable.exists() {
            is_valid = false;
            notes.push(format!(
                "Missing tool {}: {}",
                tool.name,
                tool.executable.display()
            ));
        }
    }
    if binding.detected_tools.is_empty() {
        notes.push(
            "No project-local venv/node tools detected; shell uses .codex/config.toml plus system PATH.".to_string(),
        );
    }
    EnvironmentValidation {
        is_valid,
        checked_at: Utc::now(),
        notes,
    }
}

pub(crate) fn build_command_environment(
    binding: Option<&EnvironmentBinding>,
    overrides: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    let mut env_map = BTreeMap::new();
    if let Some(binding) = binding {
        env_map.extend(binding.env_vars.clone());
        if !binding.path_entries.is_empty() {
            let inherited = env::var_os("PATH")
                .map(|value| env::split_paths(&value).collect::<Vec<_>>())
                .unwrap_or_default();
            let joined = binding
                .path_entries
                .iter()
                .cloned()
                .chain(inherited)
                .collect::<Vec<_>>();
            if let Ok(value) = env::join_paths(joined) {
                env_map.insert("PATH".to_string(), value.to_string_lossy().into_owned());
            }
        }
    }
    env_map.extend(overrides.clone());
    env_map
}

fn bind_environment(
    project: &ProjectRecord,
    workspace_root: &Path,
    candidate: EnvironmentCandidate,
    strategy: EnvironmentStrategy,
) -> EnvironmentBinding {
    let fingerprint = fingerprint_environment(project, workspace_root, &candidate);
    EnvironmentBinding {
        profile_id: format!("env_{}", &fingerprint[..12]),
        project_id: project.id.clone(),
        workspace_root: workspace_root.to_path_buf(),
        environment_root: candidate.environment_root,
        strategy,
        fingerprint,
        detected_at: Utc::now(),
        env_vars: candidate.env_vars,
        path_entries: candidate.path_entries,
        shared_paths: candidate.shared_paths,
        detected_tools: candidate.detected_tools,
        validation: EnvironmentValidation {
            is_valid: true,
            checked_at: Utc::now(),
            notes: candidate.notes,
        },
    }
}

fn fingerprint_environment(
    project: &ProjectRecord,
    workspace_root: &Path,
    candidate: &EnvironmentCandidate,
) -> String {
    let mut hasher = sha2::Sha256::new();
    hasher.update(project.id.as_bytes());
    hasher.update(project.root_path.to_string_lossy().as_bytes());
    hasher.update(workspace_root.to_string_lossy().as_bytes());
    hasher.update(candidate.environment_root.to_string_lossy().as_bytes());
    for (key, value) in &candidate.env_vars {
        hasher.update(key.as_bytes());
        hasher.update(value.as_bytes());
    }
    for entry in &candidate.path_entries {
        hasher.update(entry.to_string_lossy().as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

fn discover_environment_candidates(project_root: &Path) -> Vec<EnvironmentCandidate> {
    let mut candidates = Vec::new();
    let mut fallback = EnvironmentCandidate {
        environment_root: project_root.to_path_buf(),
        env_vars: BTreeMap::new(),
        path_entries: Vec::new(),
        shared_paths: Vec::new(),
        detected_tools: Vec::new(),
        score: 1,
        notes: vec!["Using inherited shell environment.".to_string()],
    };

    if let Some(candidate) = detect_python(project_root) {
        candidates.push(candidate);
    }
    if let Some(candidate) = detect_node(project_root) {
        candidates.push(candidate);
    }
    if let Some(candidate) = detect_rust(project_root) {
        candidates.push(candidate);
    }
    if let Some(candidate) = detect_java(project_root) {
        candidates.push(candidate);
    }

    if let Some(path) = env::var_os("PATH") {
        fallback.path_entries = env::split_paths(&path).collect();
    }
    candidates.push(fallback);
    candidates
}

fn detect_python(project_root: &Path) -> Option<EnvironmentCandidate> {
    let venv = [".venv", "venv"]
        .into_iter()
        .map(str::trim)
        .map(|name| project_root.join(name))
        .find(|path| path.exists())?;
    let python = if cfg!(windows) {
        venv.join("Scripts").join("python.exe")
    } else {
        venv.join("bin").join("python")
    };
    let bin_dir = python.parent()?.to_path_buf();
    let mut env_vars = BTreeMap::new();
    env_vars.insert(
        "VIRTUAL_ENV".to_string(),
        venv.to_string_lossy().into_owned(),
    );
    Some(EnvironmentCandidate {
        environment_root: project_root.to_path_buf(),
        env_vars,
        path_entries: vec![bin_dir.clone()],
        shared_paths: vec![SharedPathMount {
            kind: SharedPathKind::VirtualEnv,
            source: venv.clone(),
            target_hint: Some(bin_dir.clone()),
            read_only: true,
        }],
        detected_tools: vec![DetectedTool {
            ecosystem: "python".to_string(),
            name: "python".to_string(),
            executable: python,
            version_hint: None,
        }],
        score: 100,
        notes: vec!["Detected project virtual environment.".to_string()],
    })
}

fn detect_node(project_root: &Path) -> Option<EnvironmentCandidate> {
    let package_json = project_root.join("package.json");
    if !package_json.exists() {
        return None;
    }
    let bin_dir = project_root.join("node_modules").join(".bin");
    let mut path_entries = Vec::new();
    let mut shared_paths = Vec::new();
    let mut detected_tools = Vec::new();
    let mut score = 20;
    let mut notes = vec!["Detected Node project metadata.".to_string()];
    if bin_dir.exists() {
        path_entries.push(bin_dir.clone());
        shared_paths.push(SharedPathMount {
            kind: SharedPathKind::NodeModules,
            source: project_root.join("node_modules"),
            target_hint: Some(bin_dir.clone()),
            read_only: true,
        });
        score += 80;
        notes.push("Detected project-local node_modules/.bin.".to_string());
    }
    for tool in ["node", "npm", "pnpm", "yarn", "bun"] {
        if let Some(path) = find_on_path(tool) {
            detected_tools.push(DetectedTool {
                ecosystem: "node".to_string(),
                name: tool.to_string(),
                executable: path,
                version_hint: None,
            });
        }
    }
    Some(EnvironmentCandidate {
        environment_root: project_root.to_path_buf(),
        env_vars: BTreeMap::new(),
        path_entries,
        shared_paths,
        detected_tools,
        score,
        notes,
    })
}

fn detect_rust(project_root: &Path) -> Option<EnvironmentCandidate> {
    if !project_root.join("Cargo.toml").exists() {
        return None;
    }
    let mut env_vars = BTreeMap::new();
    if let Some(home) = env::var_os("CARGO_HOME") {
        env_vars.insert(
            "CARGO_HOME".to_string(),
            home.to_string_lossy().into_owned(),
        );
    }
    if let Some(home) = env::var_os("RUSTUP_HOME") {
        env_vars.insert(
            "RUSTUP_HOME".to_string(),
            home.to_string_lossy().into_owned(),
        );
    }
    let mut detected_tools = Vec::new();
    for tool in ["cargo", "rustc", "rustup"] {
        if let Some(path) = find_on_path(tool) {
            detected_tools.push(DetectedTool {
                ecosystem: "rust".to_string(),
                name: tool.to_string(),
                executable: path,
                version_hint: None,
            });
        }
    }
    Some(EnvironmentCandidate {
        environment_root: project_root.to_path_buf(),
        env_vars,
        path_entries: Vec::new(),
        shared_paths: Vec::new(),
        detected_tools,
        score: 60,
        notes: vec!["Detected Rust project metadata.".to_string()],
    })
}

fn detect_java(project_root: &Path) -> Option<EnvironmentCandidate> {
    let gradlew = project_root.join(if cfg!(windows) {
        "gradlew.bat"
    } else {
        "gradlew"
    });
    let mvnw = project_root.join(if cfg!(windows) { "mvnw.cmd" } else { "mvnw" });
    if !gradlew.exists() && !mvnw.exists() && !project_root.join("pom.xml").exists() {
        return None;
    }
    let mut detected_tools = Vec::new();
    for tool in ["java", "javac"] {
        if let Some(path) = find_on_path(tool) {
            detected_tools.push(DetectedTool {
                ecosystem: "java".to_string(),
                name: tool.to_string(),
                executable: path,
                version_hint: None,
            });
        }
    }
    let mut shared_paths = Vec::new();
    if gradlew.exists() {
        shared_paths.push(SharedPathMount {
            kind: SharedPathKind::Wrapper,
            source: gradlew,
            target_hint: None,
            read_only: true,
        });
    }
    if mvnw.exists() {
        shared_paths.push(SharedPathMount {
            kind: SharedPathKind::Wrapper,
            source: mvnw,
            target_hint: None,
            read_only: true,
        });
    }
    Some(EnvironmentCandidate {
        environment_root: project_root.to_path_buf(),
        env_vars: BTreeMap::new(),
        path_entries: Vec::new(),
        shared_paths,
        detected_tools,
        score: 40,
        notes: vec!["Detected Java wrapper or build metadata.".to_string()],
    })
}

fn find_on_path(tool: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .flat_map(|entry| candidate_paths(entry, tool))
        .find(|candidate| candidate.exists())
}

fn candidate_paths(entry: PathBuf, tool: &str) -> Vec<PathBuf> {
    if cfg!(windows) {
        vec![
            entry.join(format!("{tool}.exe")),
            entry.join(format!("{tool}.cmd")),
            entry.join(format!("{tool}.bat")),
            entry.join(tool),
        ]
    } else {
        vec![entry.join(tool)]
    }
}

/// Link shared environment directories (venv, node_modules) from the original project
/// into the isolated workspace when they are missing after copy.
pub fn materialize_shared_paths(
    workspace_root: &Path,
    binding: &mut EnvironmentBinding,
) -> Result<Vec<String>> {
    let mut linked = Vec::new();
    for mount in &binding.shared_paths {
        let dest = match mount.kind {
            SharedPathKind::VirtualEnv => workspace_root.join(".venv"),
            SharedPathKind::NodeModules => workspace_root.join("node_modules"),
            SharedPathKind::Toolchain
            | SharedPathKind::Cache
            | SharedPathKind::Wrapper
            | SharedPathKind::Other => continue,
        };
        if dest.exists() {
            continue;
        }
        if !mount.source.is_dir() {
            continue;
        }
        crate::fsx::link_dir_if_missing(&mount.source, &dest)?;
        linked.push(format!("{} -> {}", dest.display(), mount.source.display()));
    }
    if !linked.is_empty() {
        binding.validation.notes.extend(
            linked
                .iter()
                .map(|entry| format!("Linked from original project: {entry}")),
        );
    }
    Ok(linked)
}

#[derive(serde::Serialize)]
struct IsolatedShellEnvironmentConfig {
    shell_environment_policy: IsolatedShellEnvironmentPolicy,
}

#[derive(serde::Serialize)]
struct IsolatedShellEnvironmentPolicy {
    inherit: String,
    set: std::collections::BTreeMap<String, String>,
}

/// Writes `.codex/config.toml` into the isolated workspace so Codex shell inherits project tools.
pub fn write_shell_environment_config(
    workspace_root: &Path,
    binding: &EnvironmentBinding,
) -> Result<()> {
    let codex_dir = workspace_root.join(".codex");
    std::fs::create_dir_all(&codex_dir)?;
    let config_path = codex_dir.join("config.toml");
    let mut set = binding.env_vars.clone();
    if !binding.path_entries.is_empty() {
        let separator = if cfg!(windows) { ';' } else { ':' };
        let path_prefix = binding
            .path_entries
            .iter()
            .map(|entry| entry.to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join(&separator.to_string());
        let inherited = env::var("PATH").unwrap_or_default();
        let full_path = if inherited.is_empty() {
            path_prefix
        } else if path_prefix.is_empty() {
            inherited
        } else {
            format!("{path_prefix}{separator}{inherited}")
        };
        set.insert("PATH".to_string(), full_path);
    }
    let config = IsolatedShellEnvironmentConfig {
        shell_environment_policy: IsolatedShellEnvironmentPolicy {
            inherit: "core".to_string(),
            set,
        },
    };
    let mut body = String::from(
        "# Generated by CodexStudy security mode.\n# Shell commands in this isolated workspace inherit the linked project environment.\n",
    );
    body.push_str(
        &toml::to_string(&config).map_err(|err| crate::CodexNewError::Other(err.into()))?,
    );
    std::fs::write(config_path, body)?;
    Ok(())
}

/// Link shared paths and install Codex shell config for an isolated workspace.
pub fn configure_isolated_workspace_environment(
    workspace_root: &Path,
    binding: &mut EnvironmentBinding,
) -> Result<()> {
    let _ = materialize_shared_paths(workspace_root, binding)?;
    binding.validation = validate_environment_binding(binding);
    if binding.validation.is_valid || !binding.detected_tools.is_empty() {
        let _ = write_shell_environment_config(workspace_root, binding);
    }
    Ok(())
}
