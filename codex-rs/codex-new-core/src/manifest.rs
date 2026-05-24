use crate::models::ChangedFile;
use crate::models::EnvironmentBinding;
use crate::models::TaskStatus;
use chrono::DateTime;
use chrono::Utc;
use serde::Deserialize;
use serde::Serialize;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskManifest {
    pub task_id: String,
    pub project_id: String,
    pub original_root: PathBuf,
    pub workspace_root: PathBuf,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub status: TaskStatus,
    pub base_revision: Option<String>,
    pub environment_binding: Option<EnvironmentBinding>,
    pub changed_files: Vec<ChangedFile>,
}

impl TaskManifest {
    pub fn write_to_path(&self, path: &Path) -> crate::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_vec_pretty(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }

    pub fn read_from_path(path: &Path) -> crate::Result<Self> {
        let bytes = std::fs::read(path)?;
        Ok(serde_json::from_slice(bytes.as_slice())?)
    }
}
