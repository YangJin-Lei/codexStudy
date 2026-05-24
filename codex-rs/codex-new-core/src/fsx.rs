use crate::CodexNewError;
use crate::Result;
use sha2::Digest;
use sha2::Sha256;
use std::ffi::OsStr;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::path::PathBuf;
use walkdir::WalkDir;

const DEFAULT_IGNORES: &[&str] = &[
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
];

pub(crate) fn file_hash(path: &Path) -> Result<Option<String>> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.into()),
    };
    if !metadata.is_file() {
        return Ok(None);
    }

    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(Some(format!("sha256:{:x}", hasher.finalize())))
}

pub(crate) fn copy_project(source: &Path, destination: &Path) -> Result<()> {
    fs::create_dir_all(destination)?;
    for entry in WalkDir::new(source).follow_links(false) {
        let entry = entry.map_err(anyhow::Error::from)?;
        let source_path = entry.path();
        let relative = source_path
            .strip_prefix(source)
            .map_err(anyhow::Error::from)?;
        if relative.as_os_str().is_empty() || ignored(relative) {
            continue;
        }
        let destination_path = destination.join(relative);
        let metadata = entry.metadata().map_err(anyhow::Error::from)?;
        if metadata.is_dir() {
            fs::create_dir_all(destination_path)?;
        } else if metadata.is_file() {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source_path, destination_path)?;
        }
    }
    Ok(())
}

pub(crate) fn copy_file_or_remove(
    source_root: &Path,
    destination_root: &Path,
    path: &str,
) -> Result<()> {
    let source = checked_join(source_root, path)?;
    let destination = checked_join(destination_root, path)?;
    if source.is_file() {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source, destination)?;
    } else if destination.exists() {
        fs::remove_file(destination)?;
    }
    Ok(())
}

pub(crate) fn snapshot_file(source_root: &Path, snapshot_root: &Path, path: &str) -> Result<()> {
    let source = checked_join(source_root, path)?;
    let destination = snapshot_blob_path(snapshot_root, path);
    let missing_marker = snapshot_missing_path(snapshot_root, path);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    if source.is_file() {
        if missing_marker.exists() {
            fs::remove_file(missing_marker)?;
        }
        fs::copy(source, destination)?;
    } else {
        if destination.exists() {
            fs::remove_file(destination)?;
        }
        fs::write(missing_marker, [])?;
    }
    Ok(())
}

pub(crate) fn snapshot_blob_exists(snapshot_root: &Path, path: &str) -> bool {
    snapshot_blob_path(snapshot_root, path).exists()
}

pub(crate) fn restore_snapshot(
    snapshot_root: &Path,
    destination_root: &Path,
    path: &str,
) -> Result<()> {
    let snapshot = snapshot_blob_path(snapshot_root, path);
    let missing_marker = snapshot_missing_path(snapshot_root, path);
    let destination = checked_join(destination_root, path)?;
    if missing_marker.exists() {
        if destination.exists() {
            fs::remove_file(destination)?;
        }
    } else if snapshot.exists() {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(snapshot, destination)?;
    } else if destination.exists() {
        fs::remove_file(destination)?;
    }
    Ok(())
}

pub(crate) fn checked_join(root: &Path, relative: &str) -> Result<PathBuf> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(CodexNewError::PathOutsideProject {
            path: PathBuf::from(relative),
        });
    }
    Ok(root.join(path))
}

fn ignored(relative: &Path) -> bool {
    relative.components().any(|component| {
        DEFAULT_IGNORES
            .iter()
            .any(|ignore| component.as_os_str() == OsStr::new(ignore))
    })
}

fn snapshot_blob_path(snapshot_root: &Path, path: &str) -> PathBuf {
    snapshot_root.join(format!("{}.blob", encode_path(path)))
}

fn snapshot_missing_path(snapshot_root: &Path, path: &str) -> PathBuf {
    snapshot_root.join(format!("{}.missing", encode_path(path)))
}

fn encode_path(path: &str) -> String {
    path.replace('\\', "__").replace('/', "__")
}

/// Create a directory symlink from `dest` to `source` when `dest` does not exist yet.
pub(crate) fn link_dir_if_missing(source: &Path, dest: &Path) -> Result<()> {
    if dest.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, dest)?;
    }
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_dir(source, dest).map_err(|err| {
            CodexNewError::Other(anyhow::anyhow!(
                "failed to link {} -> {}: {err}. Enable Developer Mode or run as admin for directory symlinks.",
                dest.display(),
                source.display()
            ))
        })?;
    }
    Ok(())
}
