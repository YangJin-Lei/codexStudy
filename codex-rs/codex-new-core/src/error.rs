use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, CodexNewError>;

#[derive(Debug, thiserror::Error)]
pub enum CodexNewError {
    #[error("path is outside the project root: {path}")]
    PathOutsideProject { path: PathBuf },

    #[error("merge conflict for {path}: expected before hash {expected:?}, found {found:?}")]
    MergeConflict {
        path: String,
        expected: Option<String>,
        found: Option<String>,
    },

    #[error("rollback conflict for {path}: expected merged hash {expected:?}, found {found:?}")]
    RollbackConflict {
        path: String,
        expected: Option<String>,
        found: Option<String>,
    },

    #[error("git command failed: {message}")]
    Git { message: String },

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}
