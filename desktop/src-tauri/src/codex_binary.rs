use std::path::{Path, PathBuf};

/// Legacy sidecar names from older CodexStudy bundles (before `codexstudy-cli` rename).
const LEGACY_SIDECAR_PREFIXES: &[&str] = &["codexstudy-x86_64", "codexstudy-aarch64", "codexstudy"];

pub(crate) fn bundled_codex_binary_candidates() -> &'static [&'static str] {
    if cfg!(windows) {
        &[
            "codexstudy-cli-x86_64-pc-windows-msvc.exe",
            "codexstudy-cli.exe",
            "codexstudy-x86_64-pc-windows-msvc.exe",
            "codexstudy.exe",
            "codex.exe",
        ]
    } else {
        &[
            "codexstudy-cli",
            "codexstudy",
            "codex",
        ]
    }
}

fn bundled_codex_search_dirs(executable_dir: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    let mut push_unique = |path: PathBuf| {
        if !dirs.iter().any(|entry| entry == &path) {
            dirs.push(path);
        }
    };

    push_unique(executable_dir.to_path_buf());

    #[cfg(target_os = "macos")]
    {
        if let Some(contents_dir) = executable_dir.parent() {
            push_unique(contents_dir.join("Resources"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = executable_dir.parent() {
            push_unique(parent.join("lib").join(env!("CARGO_PKG_NAME")));
        }

        if let Ok(appdir) = std::env::var("APPDIR") {
            push_unique(
                Path::new(&appdir)
                    .join("usr")
                    .join("lib")
                    .join(env!("CARGO_PKG_NAME")),
            );
        }
    }

    dirs
}

fn find_codexstudy_sidecar_in_dir(search_dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(search_dir).ok()?;
    let mut matches: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            name.starts_with("codexstudy-cli")
                || LEGACY_SIDECAR_PREFIXES
                    .iter()
                    .any(|prefix| name.starts_with(prefix))
        })
        .collect();
    matches.sort_by(|left, right| {
        let left_cli = left
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("codexstudy-cli"));
        let right_cli = right
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("codexstudy-cli"));
        right_cli.cmp(&left_cli)
    });
    matches.into_iter().next()
}

fn resolve_bundled_codex_binary_from_dir(executable_dir: &Path) -> Option<PathBuf> {
    for search_dir in bundled_codex_search_dirs(executable_dir) {
        if let Some(sidecar) = find_codexstudy_sidecar_in_dir(&search_dir) {
            return Some(sidecar);
        }
        for name in bundled_codex_binary_candidates() {
            let candidate = search_dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

pub(crate) fn resolve_bundled_codex_binary_path() -> Option<PathBuf> {
    if let Ok(explicit_raw) = std::env::var("CODEX_CLI_PATH") {
        let explicit = explicit_raw.trim();
        if !explicit.is_empty() {
            let explicit_path = PathBuf::from(explicit);
            if explicit_path.is_file() {
                return Some(explicit_path);
            }
            if explicit_path.is_dir() {
                for name in bundled_codex_binary_candidates() {
                    let candidate = explicit_path.join(name);
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
                if let Some(sidecar) = find_codexstudy_sidecar_in_dir(&explicit_path) {
                    return Some(sidecar);
                }
            }
        }
    }

    let current_exe = std::env::current_exe().ok()?;
    let executable_dir = current_exe.parent()?;
    resolve_bundled_codex_binary_from_dir(executable_dir)
}

pub(crate) fn resolve_effective_codex_bin(configured: Option<&str>) -> Option<String> {
    let configured = configured
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    configured.or_else(|| {
        resolve_bundled_codex_binary_path().map(|path| path.to_string_lossy().to_string())
    })
}

fn normalize_path_for_compare(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

pub(crate) fn is_bundled_codex_bin(configured: Option<&str>) -> bool {
    let Some(effective) = resolve_effective_codex_bin(configured) else {
        return false;
    };
    let Some(bundled) = resolve_bundled_codex_binary_path() else {
        return false;
    };

    normalize_path_for_compare(Path::new(&effective)) == normalize_path_for_compare(&bundled)
}

#[cfg(test)]
mod tests {
    use super::{bundled_codex_binary_candidates, find_codexstudy_sidecar_in_dir, resolve_bundled_codex_binary_from_dir};
    use std::fs;
    use std::path::Path;
    use uuid::Uuid;

    fn make_temp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("codexstudy-codex-bin-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn cleanup_temp_dir(path: &Path) {
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn bundled_codex_candidates_prefer_codexstudy_cli_sidecar() {
        if cfg!(windows) {
            assert_eq!(
                bundled_codex_binary_candidates()[0],
                "codexstudy-cli-x86_64-pc-windows-msvc.exe"
            );
        } else {
            assert_eq!(bundled_codex_binary_candidates()[0], "codexstudy-cli");
        }
    }

    #[test]
    fn resolves_bundled_codex_from_executable_dir() {
        let temp_dir = make_temp_dir();
        let candidate_path = temp_dir.join(bundled_codex_binary_candidates()[0]);
        fs::write(&candidate_path, b"binary").expect("write candidate");

        let resolved = resolve_bundled_codex_binary_from_dir(&temp_dir);
        assert_eq!(resolved.as_deref(), Some(candidate_path.as_path()));

        cleanup_temp_dir(&temp_dir);
    }

    #[test]
    fn prefers_codexstudy_cli_sidecar_over_legacy_names() {
        let temp_dir = make_temp_dir();
        let legacy = temp_dir.join("codexstudy-x86_64-pc-windows-msvc.exe");
        let sidecar = temp_dir.join("codexstudy-cli-x86_64-pc-windows-msvc.exe");
        fs::write(&legacy, b"legacy").expect("write legacy");
        fs::write(&sidecar, b"sidecar").expect("write sidecar");

        let resolved = find_codexstudy_sidecar_in_dir(&temp_dir).expect("resolve sidecar");
        assert_eq!(resolved, sidecar);

        cleanup_temp_dir(&temp_dir);
    }
}
