use std::path::{Path, PathBuf};
use std::process::Command;

pub(crate) fn bundled_resources_available() -> bool {
    resolve_bundled_resources_root()
        .map(|root| root.join("marketplace").join("marketplace.json").is_file())
        .unwrap_or(false)
}

pub(crate) fn resolve_bundled_resources_root() -> Option<PathBuf> {
    let mut search_dirs = Vec::new();
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(executable_dir) = current_exe.parent() {
            search_dirs.push(executable_dir.to_path_buf());
            #[cfg(target_os = "macos")]
            if let Some(contents_dir) = executable_dir.parent() {
                search_dirs.push(contents_dir.join("Resources"));
            }
            #[cfg(target_os = "linux")]
            {
                if let Some(parent) = executable_dir.parent() {
                    search_dirs.push(parent.join("lib").join(env!("CARGO_PKG_NAME")));
                }
                if let Ok(appdir) = std::env::var("APPDIR") {
                    search_dirs.push(
                        Path::new(&appdir)
                            .join("usr")
                            .join("lib")
                            .join(env!("CARGO_PKG_NAME")),
                    );
                }
            }
        }
    }

    if let Ok(explicit) = std::env::var("CODEXSTUDY_COMPUTER_USE_RESOURCES") {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            search_dirs.insert(0, PathBuf::from(trimmed));
        }
    }

    // Dev fallback: resources next to the repo when running `tauri dev`.
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        search_dirs.push(
            PathBuf::from(manifest_dir)
                .join("resources")
                .join("computer-use"),
        );
    }

    search_dirs.into_iter().find_map(|dir| {
        let candidate = dir.join("computer-use");
        if candidate
            .join("marketplace")
            .join("marketplace.json")
            .is_file()
        {
            Some(candidate)
        } else if dir.join("marketplace").join("marketplace.json").is_file() {
            Some(dir)
        } else {
            None
        }
    })
}

pub(crate) fn platform_notes() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        Some(
            "macOS requires Accessibility and Screen Recording permissions for Open Computer Use."
                .to_string(),
        )
    }
    #[cfg(target_os = "windows")]
    {
        Some(
            "Windows Computer Use requires a logged-in desktop session and UI Automation support."
                .to_string(),
        )
    }
    #[cfg(target_os = "linux")]
    {
        Some(
            "Linux Computer Use requires AT-SPI2 accessibility and a compatible desktop session."
                .to_string(),
        )
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

pub(crate) fn run_doctor(runtime: &Path) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new(runtime)
            .arg("doctor")
            .output()
            .map_err(|err| format!("Failed to run computer-use doctor: {err}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if output.status.success() {
            return Ok(if stdout.is_empty() { stderr } else { stdout });
        }
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = runtime;
        let output = Command::new(runtime)
            .arg("-h")
            .output()
            .map_err(|err| format!("Failed to verify computer-use runtime: {err}"))?;
        if !output.status.success() {
            return Err("Computer Use runtime failed to start.".to_string());
        }
        Ok("Runtime binary responds to -h.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_bundled_resources_root;

    #[test]
    fn bundled_root_resolution_does_not_panic() {
        let _ = resolve_bundled_resources_root();
    }
}
