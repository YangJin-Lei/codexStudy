use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::bundle;
use super::PLUGIN_NAME;

pub(crate) fn marketplace_root(codex_home: &Path) -> PathBuf {
    codex_home
        .join("plugins")
        .join("marketplaces")
        .join(super::MARKETPLACE_NAME)
}

pub(crate) fn plugin_root(codex_home: &Path) -> PathBuf {
    marketplace_root(codex_home)
        .join("plugins")
        .join(PLUGIN_NAME)
}

pub(crate) fn is_installed(codex_home: &Path) -> bool {
    plugin_root(codex_home)
        .join(".codex-plugin")
        .join("plugin.json")
        .is_file()
}

pub(crate) fn read_installed_version(codex_home: &Path) -> Option<String> {
    let manifest_path = plugin_root(codex_home)
        .join(".codex-plugin")
        .join("plugin.json");
    let raw = fs::read_to_string(manifest_path).ok()?;
    let parsed: Value = serde_json::from_str(&raw).ok()?;
    parsed
        .get("version")
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub(crate) fn install_from_bundle(codex_home: &Path) -> Result<(), String> {
    let bundled_root =
        bundle::resolve_bundled_resources_root().ok_or_else(|| {
            "Bundled Computer Use resources were not found in this CodexStudy build.".to_string()
        })?;
    let bundled_marketplace = bundled_root.join("marketplace");
    if !bundled_marketplace.join("marketplace.json").is_file() {
        return Err(format!(
            "Invalid bundled Computer Use layout at {}",
            bundled_marketplace.display()
        ));
    }

    let destination = marketplace_root(codex_home);
    if destination.exists() {
        fs::remove_dir_all(&destination).map_err(|err| {
            format!(
                "Failed to remove existing Computer Use marketplace at {}: {err}",
                destination.display()
            )
        })?;
    }
    copy_dir_all(&bundled_marketplace, &destination).map_err(|err| {
        format!(
            "Failed to install bundled Computer Use marketplace to {}: {err}",
            destination.display()
        )
    })?;
    ensure_runtime_permissions(&plugin_root(codex_home))?;
    Ok(())
}

pub(crate) fn resolve_installed_runtime_path(codex_home: &Path) -> Result<PathBuf, String> {
    let plugin_root = plugin_root(codex_home);
    #[cfg(windows)]
    {
        let candidate = plugin_root.join("open-computer-use.exe");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    #[cfg(not(windows))]
    {
        let candidate = plugin_root.join("open-computer-use");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    #[cfg(target_os = "macos")]
    {
        for bundle_name in ["Open Computer Use.app", "Open Computer Use (Dev).app"] {
            let candidate = plugin_root.join(bundle_name).join("Contents/MacOS/OpenComputerUse");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    Err(format!(
        "Computer Use runtime was not found under {}",
        plugin_root.display()
    ))
}

pub(crate) fn runtime_path_ready(path: &Path) -> bool {
    if path.is_file() {
        return is_executable(path);
    }
    path.is_file()
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(path)
            .ok()
            .map(|meta| meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        path.is_file()
    }
}

fn ensure_runtime_permissions(plugin_root: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        let direct = plugin_root.join("open-computer-use");
        if direct.is_file() {
            set_executable(&direct)?;
        }
        let script = plugin_root.join("scripts/launch-open-computer-use.sh");
        if script.is_file() {
            set_executable(&script)?;
        }
        #[cfg(target_os = "macos")]
        {
            let app_binary = plugin_root
                .join("Open Computer Use.app")
                .join("Contents/MacOS/OpenComputerUse");
            if app_binary.is_file() {
                set_executable(&app_binary)?;
            }
            let dev_binary = plugin_root
                .join("Open Computer Use (Dev).app")
                .join("Contents/MacOS/OpenComputerUse");
            if dev_binary.is_file() {
                set_executable(&dev_binary)?;
            }
        }
    }
    Ok(())
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let metadata = fs::metadata(path)
        .map_err(|err| format!("Failed to read permissions for {}: {err}", path.display()))?;
    let mut permissions = metadata.permissions();
    permissions.set_mode(permissions.mode() | 0o755);
    fs::set_permissions(path, permissions).map_err(|err| {
        format!(
            "Failed to set executable permissions for {}: {err}",
            path.display()
        )
    })
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
