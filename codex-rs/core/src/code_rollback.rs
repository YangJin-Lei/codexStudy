//! 代码回溯系统
//!
//! 在AI修改代码前自动创建备份，支持回溯到任意历史版本

use anyhow::Context;
use anyhow::Result;
use serde::Deserialize;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::time::SystemTime;
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// 文件快照
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSnapshot {
    /// 文件路径
    pub path: String,
    /// 文件内容
    pub content: String,
    /// 快照时间戳
    pub timestamp: u64,
    /// 快照ID
    pub snapshot_id: String,
    /// 关联的会话ID
    pub session_id: String,
    /// 关联的轮次ID
    pub turn_id: Option<String>,
}

/// 回溯点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackPoint {
    /// 回溯点ID
    pub id: String,
    /// 创建时间
    pub created_at: u64,
    /// 会话ID
    pub session_id: String,
    /// 轮次ID
    pub turn_id: Option<String>,
    /// 描述
    pub description: String,
    /// 包含的文件快照
    pub snapshots: Vec<FileSnapshot>,
}

/// 代码回溯管理器
pub struct CodeRollbackManager {
    /// 回溯数据存储目录
    storage_dir: PathBuf,
    /// 当前会话的回溯点
    rollback_points: HashMap<String, RollbackPoint>,
}

impl CodeRollbackManager {
    /// 创建新的回溯管理器
    pub fn new(storage_dir: PathBuf) -> Self {
        Self {
            storage_dir,
            rollback_points: HashMap::new(),
        }
    }

    /// 初始化存储目录
    pub async fn initialize(&self) -> Result<()> {
        fs::create_dir_all(&self.storage_dir)
            .await
            .context("Failed to create rollback storage directory")?;
        Ok(())
    }

    /// 创建回溯点（在AI修改前调用）
    pub async fn create_rollback_point(
        &mut self,
        session_id: String,
        turn_id: Option<String>,
        files: Vec<PathBuf>,
        description: String,
    ) -> Result<String> {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        let rollback_id = uuid::Uuid::new_v4().to_string();
        let mut snapshots = Vec::new();

        // 为每个文件创建快照
        for file_path in files {
            if let Ok(snapshot) = self
                .create_file_snapshot(&file_path, &session_id, turn_id.as_deref(), &rollback_id)
                .await
            {
                snapshots.push(snapshot);
            }
        }

        let rollback_point = RollbackPoint {
            id: rollback_id.clone(),
            created_at: now,
            session_id: session_id.clone(),
            turn_id,
            description,
            snapshots,
        };

        // 持久化回溯点
        self.save_rollback_point(&rollback_point).await?;
        self.rollback_points
            .insert(rollback_id.clone(), rollback_point);

        Ok(rollback_id)
    }

    /// 创建单个文件的快照
    async fn create_file_snapshot(
        &self,
        file_path: &Path,
        session_id: &str,
        turn_id: Option<&str>,
        rollback_id: &str,
    ) -> Result<FileSnapshot> {
        let content = fs::read_to_string(file_path)
            .await
            .context("Failed to read file for snapshot")?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        Ok(FileSnapshot {
            path: file_path.to_string_lossy().to_string(),
            content,
            timestamp: now,
            snapshot_id: rollback_id.to_string(),
            session_id: session_id.to_string(),
            turn_id: turn_id.map(|s| s.to_string()),
        })
    }

    /// 保存回溯点到磁盘
    async fn save_rollback_point(&self, point: &RollbackPoint) -> Result<()> {
        let file_path = self.storage_dir.join(format!("{}.json", point.id));
        let json = serde_json::to_string_pretty(point)?;

        let mut file = fs::File::create(&file_path).await?;
        file.write_all(json.as_bytes()).await?;
        file.flush().await?;

        Ok(())
    }

    /// 加载回溯点
    pub async fn load_rollback_point(&self, rollback_id: &str) -> Result<RollbackPoint> {
        let file_path = self.storage_dir.join(format!("{}.json", rollback_id));
        let content = fs::read_to_string(&file_path).await?;
        let point: RollbackPoint = serde_json::from_str(&content)?;
        Ok(point)
    }

    /// 执行回溯（恢复文件到指定回溯点）
    pub async fn rollback_to_point(&self, rollback_id: &str) -> Result<Vec<String>> {
        let point = self.load_rollback_point(rollback_id).await?;
        let mut restored_files = Vec::new();

        for snapshot in &point.snapshots {
            let file_path = Path::new(&snapshot.path);

            // 创建父目录（如果不存在）
            if let Some(parent) = file_path.parent() {
                fs::create_dir_all(parent).await?;
            }

            // 恢复文件内容
            fs::write(file_path, &snapshot.content)
                .await
                .with_context(|| format!("Failed to restore file: {}", snapshot.path))?;

            restored_files.push(snapshot.path.clone());
        }

        Ok(restored_files)
    }

    /// 列出会话的所有回溯点
    pub async fn list_rollback_points(&self, session_id: &str) -> Result<Vec<RollbackPoint>> {
        let mut points = Vec::new();
        let mut entries = fs::read_dir(&self.storage_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path).await {
                    if let Ok(point) = serde_json::from_str::<RollbackPoint>(&content) {
                        if point.session_id == session_id {
                            points.push(point);
                        }
                    }
                }
            }
        }

        // 按时间排序
        points.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(points)
    }

    /// 清理旧的回溯点
    pub async fn cleanup_old_rollbacks(&self, max_age_days: u64) -> Result<usize> {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        let max_age_secs = max_age_days * 24 * 60 * 60;
        let mut removed_count = 0;

        let mut entries = fs::read_dir(&self.storage_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path).await {
                    if let Ok(point) = serde_json::from_str::<RollbackPoint>(&content) {
                        if (now - point.created_at) > max_age_secs {
                            fs::remove_file(&path).await?;
                            removed_count += 1;
                        }
                    }
                }
            }
        }

        Ok(removed_count)
    }

    /// 比较两个回溯点的差异
    pub async fn diff_rollback_points(&self, from_id: &str, to_id: &str) -> Result<Vec<FileDiff>> {
        let from_point = self.load_rollback_point(from_id).await?;
        let to_point = self.load_rollback_point(to_id).await?;

        let mut diffs = Vec::new();

        // 创建文件路径到快照的映射
        let from_map: HashMap<_, _> = from_point
            .snapshots
            .iter()
            .map(|s| (s.path.as_str(), s))
            .collect();

        let to_map: HashMap<_, _> = to_point
            .snapshots
            .iter()
            .map(|s| (s.path.as_str(), s))
            .collect();

        // 检查修改和删除的文件
        for (path, from_snapshot) in &from_map {
            if let Some(to_snapshot) = to_map.get(path) {
                if from_snapshot.content != to_snapshot.content {
                    diffs.push(FileDiff {
                        path: path.to_string(),
                        diff_type: DiffType::Modified,
                        old_content: Some(from_snapshot.content.clone()),
                        new_content: Some(to_snapshot.content.clone()),
                    });
                }
            } else {
                diffs.push(FileDiff {
                    path: path.to_string(),
                    diff_type: DiffType::Deleted,
                    old_content: Some(from_snapshot.content.clone()),
                    new_content: None,
                });
            }
        }

        // 检查新增的文件
        for (path, to_snapshot) in &to_map {
            if !from_map.contains_key(path) {
                diffs.push(FileDiff {
                    path: path.to_string(),
                    diff_type: DiffType::Added,
                    old_content: None,
                    new_content: Some(to_snapshot.content.clone()),
                });
            }
        }

        Ok(diffs)
    }
}

/// 文件差异类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiffType {
    Added,
    Modified,
    Deleted,
}

/// 文件差异
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub diff_type: DiffType,
    pub old_content: Option<String>,
    pub new_content: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_create_rollback_point() {
        let temp_dir = tempdir().unwrap();
        let storage_dir = temp_dir.path().join("rollbacks");

        let mut manager = CodeRollbackManager::new(storage_dir);
        manager.initialize().await.unwrap();

        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "original content").await.unwrap();

        let rollback_id = manager
            .create_rollback_point(
                "session-1".to_string(),
                Some("turn-1".to_string()),
                vec![test_file.clone()],
                "Before AI modification".to_string(),
            )
            .await
            .unwrap();

        assert!(!rollback_id.is_empty());

        // 修改文件
        fs::write(&test_file, "modified content").await.unwrap();

        // 回溯
        let restored = manager.rollback_to_point(&rollback_id).await.unwrap();
        assert_eq!(restored.len(), 1);

        // 验证内容已恢复
        let content = fs::read_to_string(&test_file).await.unwrap();
        assert_eq!(content, "original content");
    }
}
