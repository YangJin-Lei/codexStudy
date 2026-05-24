use std::path::Path;

/// Detect likely test commands for a project root (original repo, not the isolated copy).
pub fn detect_test_commands(project_root: &Path) -> Vec<String> {
    let mut commands = Vec::new();
    commands.extend(detect_node_test_commands(project_root));
    commands.extend(detect_rust_test_commands(project_root));
    commands.extend(detect_python_test_commands(project_root));
    commands.extend(detect_just_test_commands(project_root));
    dedupe_commands(commands)
}

fn dedupe_commands(commands: Vec<String>) -> Vec<String> {
    let mut seen = Vec::new();
    for command in commands {
        if command.trim().is_empty() || seen.iter().any(|existing| existing == &command) {
            continue;
        }
        seen.push(command);
    }
    seen
}

fn detect_node_test_commands(project_root: &Path) -> Vec<String> {
    let package_json = project_root.join("package.json");
    let Ok(bytes) = std::fs::read(package_json) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return Vec::new();
    };
    let Some(scripts) = value.get("scripts").and_then(|entry| entry.as_object()) else {
        return Vec::new();
    };
    let mut commands = Vec::new();
    for key in ["test", "test:unit", "test:ci", "check", "lint"] {
        if scripts.contains_key(key) {
            let runner = if project_root.join("pnpm-lock.yaml").exists() {
                "pnpm"
            } else if project_root.join("bun.lockb").exists()
                || project_root.join("bun.lock").exists()
            {
                "bun"
            } else if project_root.join("yarn.lock").exists() {
                "yarn"
            } else {
                "npm"
            };
            commands.push(format!("{runner} run {key}"));
        }
    }
    if commands.is_empty() && scripts.contains_key("test") {
        commands.push("npm test".to_string());
    }
    commands
}

fn detect_rust_test_commands(project_root: &Path) -> Vec<String> {
    if !project_root.join("Cargo.toml").exists() {
        return Vec::new();
    }
    vec!["cargo test".to_string()]
}

fn detect_python_test_commands(project_root: &Path) -> Vec<String> {
    if !project_root.join("pyproject.toml").exists()
        && !project_root.join("pytest.ini").exists()
        && !project_root.join("setup.cfg").exists()
        && !project_root.join("requirements.txt").exists()
    {
        return Vec::new();
    }
    if project_root.join(".venv").exists() || project_root.join("venv").exists() {
        if cfg!(windows) {
            vec![
                ".\\.venv\\Scripts\\python.exe -m pytest".to_string(),
                "python -m pytest".to_string(),
            ]
        } else {
            vec![
                ".venv/bin/python -m pytest".to_string(),
                "python -m pytest".to_string(),
            ]
        }
    } else {
        vec!["python -m pytest".to_string(), "pytest".to_string()]
    }
}

fn detect_just_test_commands(project_root: &Path) -> Vec<String> {
    if !project_root.join("justfile").exists() && !project_root.join("Justfile").exists() {
        return Vec::new();
    }
    vec!["just test".to_string()]
}

pub(crate) fn merge_detected_test_commands(
    project_root: &Path,
    existing: &[String],
) -> Vec<String> {
    let mut merged = existing.to_vec();
    merged.extend(detect_test_commands(project_root));
    dedupe_commands(merged)
}

#[cfg(test)]
mod tests {
    use super::detect_test_commands;
    use std::fs;

    #[test]
    fn detects_package_json_test_script() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(
            temp.path().join("package.json"),
            r#"{"scripts":{"test":"vitest run"}}"#,
        )
        .expect("write package.json");
        let commands = detect_test_commands(temp.path());
        assert!(commands.iter().any(|command| command.contains("test")));
    }

    #[test]
    fn detects_cargo_test() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(
            temp.path().join("Cargo.toml"),
            "[package]\nname = \"demo\"\n",
        )
        .expect("write");
        let commands = detect_test_commands(temp.path());
        assert!(commands.contains(&"cargo test".to_string()));
    }
}
