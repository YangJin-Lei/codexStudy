use std::env;
use std::path::Path;
use std::path::PathBuf;

use crate::types::WorkspaceEntry;

pub(crate) const CODEXSTUDY_HOME_ENV_VAR: &str = "CODEXSTUDY_CODEX_HOME";
pub(crate) const DEFAULT_CODEXSTUDY_HOME_DIR: &str = ".codexStudy";

pub(crate) fn resolve_workspace_codex_home(
    _entry: &WorkspaceEntry,
    _parent_entry: Option<&WorkspaceEntry>,
) -> Option<PathBuf> {
    resolve_default_codex_home()
}

pub(crate) fn default_codexstudy_home() -> Option<PathBuf> {
    resolve_home_dir().map(|home| home.join(DEFAULT_CODEXSTUDY_HOME_DIR))
}

/// Resolves the CodexStudy session/config home. Only `CODEXSTUDY_CODEX_HOME` overrides
/// the default `~/.codexStudy`; the process-wide `CODEX_HOME` env is not consulted so a
/// machine-wide Codex CLI install cannot silently redirect CodexStudy to `~/.codex`.
pub(crate) fn resolve_default_codex_home() -> Option<PathBuf> {
    if let Ok(value) = env::var(CODEXSTUDY_HOME_ENV_VAR) {
        if let Some(path) = normalize_codex_home(&value) {
            return Some(path);
        }
    }
    default_codexstudy_home()
}

const LEGACY_CODEX_HOME_DIR_NAMES: &[&str] = &[".codex", ".codex-home"];

pub(crate) fn detect_legacy_codex_homes(current_codex_home: &Path) -> Vec<PathBuf> {
    let Some(user_home) = resolve_home_dir() else {
        return Vec::new();
    };
    let current = current_codex_home.to_string_lossy();
    LEGACY_CODEX_HOME_DIR_NAMES
        .iter()
        .map(|name| user_home.join(name))
        .filter(|path| path.is_dir() && path.to_string_lossy() != current)
        .collect()
}

pub(crate) fn resolve_spawn_codex_home(explicit: Option<PathBuf>) -> Result<PathBuf, String> {
    let home = explicit
        .or_else(resolve_default_codex_home)
        .ok_or_else(|| {
            "Unable to resolve CodexStudy home directory (~/.codexStudy).".to_string()
        })?;
    std::fs::create_dir_all(&home).map_err(|err| {
        format!(
            "Unable to initialize CodexStudy home at {}: {err}",
            home.display()
        )
    })?;
    Ok(home)
}

pub(crate) fn configure_process_codex_home(_data_dir: &Path) -> Result<PathBuf, String> {
    let configured = resolve_spawn_codex_home(None)?;
    env::set_var("CODEX_HOME", &configured);
    Ok(configured)
}

fn normalize_codex_home(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(path) = expand_tilde(trimmed) {
        return Some(path);
    }
    if let Some(path) = expand_dollar_env(trimmed) {
        return Some(path);
    }
    if let Some(path) = expand_percent_env(trimmed) {
        return Some(path);
    }
    Some(PathBuf::from(trimmed))
}

fn expand_tilde(value: &str) -> Option<PathBuf> {
    if !value.starts_with('~') {
        return None;
    }
    let home_dir = resolve_home_dir()?;
    if value == "~" {
        return Some(home_dir);
    }
    let rest = value.strip_prefix("~/")?;
    Some(home_dir.join(rest))
}

fn expand_dollar_env(value: &str) -> Option<PathBuf> {
    let rest = value.strip_prefix('$')?;
    if rest.is_empty() {
        return None;
    }

    let (var, remainder) = if let Some(inner) = rest.strip_prefix('{') {
        let end = inner.find('}')?;
        let name = &inner[..end];
        let remaining = &inner[end + 1..];
        (name, remaining)
    } else {
        let end = rest
            .find(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_'))
            .unwrap_or(rest.len());
        let name = &rest[..end];
        let remaining = &rest[end..];
        (name, remaining)
    };

    if var.is_empty() {
        return None;
    }

    let value = resolve_env_var(var)?;
    Some(join_env_path(&value, remainder))
}

fn expand_percent_env(value: &str) -> Option<PathBuf> {
    let rest = value.strip_prefix('%')?;
    let end = rest.find('%')?;
    let var = &rest[..end];
    if var.is_empty() {
        return None;
    }
    let remainder = &rest[end + 1..];
    let value = resolve_env_var(var)?;
    Some(join_env_path(&value, remainder))
}

fn resolve_env_var(name: &str) -> Option<String> {
    if name.eq_ignore_ascii_case("HOME") {
        if let Some(home) = resolve_home_dir() {
            return Some(home.to_string_lossy().to_string());
        }
    }
    if let Some(value) = lookup_env_value(name) {
        return Some(value);
    }
    None
}

fn lookup_env_value(name: &str) -> Option<String> {
    if let Ok(value) = env::var(name) {
        if !value.trim().is_empty() {
            return Some(value);
        }
    }
    let upper = name.to_ascii_uppercase();
    if upper != name {
        if let Ok(value) = env::var(&upper) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    let lower = name.to_ascii_lowercase();
    if lower != name && lower != upper {
        if let Ok(value) = env::var(&lower) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn join_env_path(prefix: &str, remainder: &str) -> PathBuf {
    let mut base = PathBuf::from(prefix.trim());
    let trimmed_remainder = remainder.trim_start_matches(['/', '\\']);
    if trimmed_remainder.is_empty() {
        base
    } else {
        base.push(trimmed_remainder);
        base
    }
}

pub(crate) fn resolve_home_dir() -> Option<PathBuf> {
    if let Ok(value) = env::var("HOME") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value));
        }
    }
    if let Ok(value) = env::var("USERPROFILE") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value));
        }
    }
    #[cfg(unix)]
    {
        // Fallback for daemon environments that do not expose HOME.
        unsafe {
            let uid = libc::geteuid();
            let pwd = libc::getpwuid(uid);
            if !pwd.is_null() {
                let dir_ptr = (*pwd).pw_dir;
                if !dir_ptr.is_null() {
                    if let Ok(dir) = std::ffi::CStr::from_ptr(dir_ptr).to_str() {
                        if !dir.trim().is_empty() {
                            return Some(PathBuf::from(dir));
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{WorkspaceKind, WorkspaceSettings, WorktreeInfo};
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn workspace_entry(kind: WorkspaceKind, path: &str) -> WorkspaceEntry {
        let worktree = if kind.is_worktree() {
            Some(WorktreeInfo {
                branch: "feature/test".to_string(),
            })
        } else {
            None
        };
        WorkspaceEntry {
            id: "workspace-id".to_string(),
            name: "workspace".to_string(),
            path: path.to_string(),
            kind,
            parent_id: None,
            worktree,
            settings: WorkspaceSettings::default(),
        }
    }

    #[test]
    fn workspace_codex_home_ignores_global_codex_home_env() {
        let entry = workspace_entry(WorkspaceKind::Main, "/repo");
        let _guard = ENV_LOCK.lock().expect("lock env");
        let home_dir = std::env::temp_dir().join("codexstudy-workspace-home-test");
        let home_str = home_dir.to_string_lossy().to_string();

        let prev_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &home_str);
        let prev_codexstudy_home = std::env::var(CODEXSTUDY_HOME_ENV_VAR).ok();
        std::env::remove_var(CODEXSTUDY_HOME_ENV_VAR);
        let prev_codex_home = std::env::var("CODEX_HOME").ok();
        std::env::set_var("CODEX_HOME", "/tmp/codex-global");

        let resolved = resolve_workspace_codex_home(&entry, None);
        assert_eq!(
            resolved,
            Some(home_dir.join(DEFAULT_CODEXSTUDY_HOME_DIR))
        );

        match prev_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        match prev_codexstudy_home {
            Some(value) => std::env::set_var(CODEXSTUDY_HOME_ENV_VAR, value),
            None => {}
        }
        match prev_codex_home {
            Some(value) => std::env::set_var("CODEX_HOME", value),
            None => std::env::remove_var("CODEX_HOME"),
        }
    }

    #[test]
    fn default_codex_home_uses_codexstudy_directory() {
        let _guard = ENV_LOCK.lock().expect("lock env");
        let home_dir = std::env::temp_dir().join("codexstudy-home-test");
        let home_str = home_dir.to_string_lossy().to_string();

        let prev_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &home_str);
        let prev_codexstudy_home = std::env::var(CODEXSTUDY_HOME_ENV_VAR).ok();
        std::env::remove_var(CODEXSTUDY_HOME_ENV_VAR);
        let prev_codex_home = std::env::var("CODEX_HOME").ok();
        std::env::remove_var("CODEX_HOME");

        assert_eq!(
            default_codexstudy_home(),
            Some(home_dir.join(DEFAULT_CODEXSTUDY_HOME_DIR))
        );
        assert_eq!(
            resolve_default_codex_home(),
            Some(home_dir.join(DEFAULT_CODEXSTUDY_HOME_DIR))
        );

        match prev_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        match prev_codexstudy_home {
            Some(value) => std::env::set_var(CODEXSTUDY_HOME_ENV_VAR, value),
            None => {}
        }
        match prev_codex_home {
            Some(value) => std::env::set_var("CODEX_HOME", value),
            None => {}
        }
    }

    #[test]
    fn codex_home_expands_tilde_and_env_vars() {
        let _guard = ENV_LOCK.lock().expect("lock env");
        let home_dir = std::env::temp_dir().join("codex-home-test");
        let home_str = home_dir.to_string_lossy().to_string();

        let prev_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &home_str);

        let prev_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", "/tmp/appdata-root");

        let tilde = normalize_codex_home("~/.codex-api");
        assert_eq!(tilde, Some(home_dir.join(".codex-api")));

        let dollar = normalize_codex_home("$HOME/.codex-api");
        assert_eq!(dollar, Some(home_dir.join(".codex-api")));

        let braces = normalize_codex_home("${HOME}/.codex-api");
        assert_eq!(braces, Some(home_dir.join(".codex-api")));

        let appdata = normalize_codex_home("%APPDATA%/Codex");
        assert_eq!(appdata, Some(PathBuf::from("/tmp/appdata-root/Codex")));

        let appdata_lower = normalize_codex_home("$appdata/Codex");
        assert_eq!(
            appdata_lower,
            Some(PathBuf::from("/tmp/appdata-root/Codex"))
        );

        match prev_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }

        match prev_appdata {
            Some(value) => std::env::set_var("APPDATA", value),
            None => std::env::remove_var("APPDATA"),
        }
    }
}
