//! 自动项目克隆机制
//!
//! 当用户打开一个项目时，自动创建一个克隆副本用于AI操作，
//! 保护原始项目不被直接修改。

use anyhow::Context;
use anyhow::Result;
use codex_utils_absolute_path::AbsolutePathBuf;
use std::path::Path;
use std::path::PathBuf;
use std::time::SystemTime;
use tokio::fs;

/// 项目克隆配置
#[derive(Debug, Clone)]
pub struct ProjectCloneConfig {
    /// 原始项目路径
    pub original_path: AbsolutePathBuf,
    /// 克隆项目存储根目录
    pub clone_root: PathBuf,
    /// 是否启用自动克隆
    pub auto_clone_enabled: bool,
}

/// 克隆的项目信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClonedProject {
    /// 克隆项目的唯一ID
    pub id: String,
    /// 原始项目路径
    pub original_path: String,
    /// 克隆项目路径
    pub cloned_path: String,
    /// 创建时间（Unix时间戳）
    pub created_at: u64,
    /// 最后使用时间
    pub last_used_at: u64,
    /// 是否为活跃克隆
    pub is_active: bool,
}

impl ProjectCloneConfig {
    /// 创建新的项目克隆配置
    pub fn new(original_path: AbsolutePathBuf, clone_root: PathBuf) -> Self {
        Self {
            original_path,
            clone_root,
            auto_clone_enabled: true,
        }
    }

    /// 生成克隆项目的路径
    fn generate_clone_path(&self) -> Result<PathBuf> {
        let timestamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        let project_name = self
            .original_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("project");

        let clone_name = format!("{}_clone_{}", project_name, timestamp);
        Ok(self.clone_root.join(clone_name))
    }

    /// 克隆项目
    pub async fn clone_project(&self) -> Result<ClonedProject> {
        if !self.auto_clone_enabled {
            anyhow::bail!("Auto clone is disabled");
        }

        let clone_path = self.generate_clone_path()?;

        // 确保克隆根目录存在
        fs::create_dir_all(&self.clone_root)
            .await
            .context("Failed to create clone root directory")?;

        // 执行项目克隆
        self.perform_clone(&self.original_path, &clone_path).await?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        Ok(ClonedProject {
            id: uuid::Uuid::new_v4().to_string(),
            original_path: self.original_path.to_string_lossy().to_string(),
            cloned_path: clone_path.to_string_lossy().to_string(),
            created_at: now,
            last_used_at: now,
            is_active: true,
        })
    }

    /// 执行实际的克隆操作
    async fn perform_clone(&self, source: &Path, dest: &Path) -> Result<()> {
        // 检查是否为Git仓库
        let git_dir = source.join(".git");
        if git_dir.exists() {
            // 使用git clone --local进行快速克隆
            self.git_clone(source, dest).await?;
        } else {
            // 普通文件复制
            self.copy_directory(source, dest).await?;
        }
        Ok(())
    }

    /// 使用Git克隆
    async fn git_clone(&self, source: &Path, dest: &Path) -> Result<()> {
        let output = tokio::process::Command::new("git")
            .arg("clone")
            .arg("--local")
            .arg(source)
            .arg(dest)
            .output()
            .await
            .context("Failed to execute git clone")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Git clone failed: {}", stderr);
        }

        Ok(())
    }

    /// 递归复制目录
    async fn copy_directory(&self, source: &Path, dest: &Path) -> Result<()> {
        fs::create_dir_all(dest)
            .await
            .context("Failed to create destination directory")?;

        let mut entries = fs::read_dir(source)
            .await
            .context("Failed to read source directory")?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let file_name = entry.file_name();
            let dest_path = dest.join(&file_name);

            // 跳过某些目录
            if self.should_skip(&file_name) {
                continue;
            }

            if path.is_dir() {
                Box::pin(self.copy_directory(&path, &dest_path)).await?;
            } else {
                fs::copy(&path, &dest_path)
                    .await
                    .with_context(|| format!("Failed to copy file: {:?}", path))?;
            }
        }

        Ok(())
    }

    /// 判断是否应该跳过某些文件/目录
    fn should_skip(&self, name: &std::ffi::OsStr) -> bool {
        let skip_list = [
            "node_modules",
            "target",
            ".git",
            "dist",
            "build",
            ".next",
            ".cache",
            "__pycache__",
        ];

        name.to_str()
            .map(|s| skip_list.contains(&s))
            .unwrap_or(false)
    }
}

/// 项目克隆管理器
pub struct ProjectCloneManager {
    /// 克隆项目列表
    clones: Vec<ClonedProject>,
    /// 配置
    config: ProjectCloneConfig,
}

impl ProjectCloneManager {
    /// 创建新的管理器
    pub fn new(config: ProjectCloneConfig) -> Self {
        Self {
            clones: Vec::new(),
            config,
        }
    }

    /// 创建新的克隆
    pub async fn create_clone(&mut self) -> Result<&ClonedProject> {
        let clone = self.config.clone_project().await?;
        self.clones.push(clone);
        Ok(self.clones.last().unwrap())
    }

    /// 获取活跃的克隆
    pub fn get_active_clone(&self) -> Option<&ClonedProject> {
        self.clones.iter().find(|c| c.is_active)
    }

    /// 清理旧的克隆
    pub async fn cleanup_old_clones(&mut self, max_age_days: u64) -> Result<usize> {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        let max_age_secs = max_age_days * 24 * 60 * 60;
        let mut removed_count = 0;

        let mut i = 0;
        while i < self.clones.len() {
            let clone = &self.clones[i];
            if !clone.is_active && (now - clone.last_used_at) > max_age_secs {
                // 删除克隆目录
                if let Err(e) = fs::remove_dir_all(&clone.cloned_path).await {
                    tracing::warn!("Failed to remove clone directory: {}", e);
                }
                self.clones.remove(i);
                removed_count += 1;
            } else {
                i += 1;
            }
        }

        Ok(removed_count)
    }

    /// 标记克隆为非活跃
    pub fn deactivate_clone(&mut self, clone_id: &str) {
        if let Some(clone) = self.clones.iter_mut().find(|c| c.id == clone_id) {
            clone.is_active = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_skip() {
        let config = ProjectCloneConfig::new(
            AbsolutePathBuf::from_absolute_path("/test").unwrap(),
            PathBuf::from("/clones"),
        );

        assert!(config.should_skip(std::ffi::OsStr::new("node_modules")));
        assert!(config.should_skip(std::ffi::OsStr::new("target")));
        assert!(!config.should_skip(std::ffi::OsStr::new("src")));
    }
}
