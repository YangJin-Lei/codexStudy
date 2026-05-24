//! AI工作区管理器
//!
//! 整合项目克隆、代码回溯和对话总结功能

use anyhow::Result;
use codex_utils_absolute_path::AbsolutePathBuf;
use std::path::PathBuf;

use crate::code_rollback::CodeRollbackManager;
use crate::conversation_summary::ConversationSummaryManager;
use crate::project_clone::ClonedProject;
use crate::project_clone::ProjectCloneConfig;
use crate::project_clone::ProjectCloneManager;

/// AI工作区管理器配置
#[derive(Debug, Clone)]
pub struct AIWorkspaceConfig {
    /// 项目克隆根目录
    pub clone_root: PathBuf,
    /// 回溯数据存储目录
    pub rollback_storage: PathBuf,
    /// 对话总结存储目录
    pub summary_storage: PathBuf,
    /// 是否启用自动克隆
    pub auto_clone_enabled: bool,
    /// 是否启用自动回溯
    pub auto_rollback_enabled: bool,
    /// 是否启用自动总结
    pub auto_summary_enabled: bool,
}

impl Default for AIWorkspaceConfig {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let codex_data = home.join(".codex").join("ai_workspace");

        Self {
            clone_root: codex_data.join("clones"),
            rollback_storage: codex_data.join("rollbacks"),
            summary_storage: codex_data.join("summaries"),
            auto_clone_enabled: true,
            auto_rollback_enabled: true,
            auto_summary_enabled: true,
        }
    }
}

/// AI工作区管理器
///
/// 统一管理AI代码编辑的完整生命周期：
/// 1. 自动克隆项目到临时工作区
/// 2. 在AI修改前创建回溯点
/// 3. 生成对话总结
pub struct AIWorkspaceManager {
    config: AIWorkspaceConfig,
    clone_manager: Option<ProjectCloneManager>,
    rollback_manager: CodeRollbackManager,
    summary_manager: ConversationSummaryManager,
    current_session_id: Option<String>,
}

impl AIWorkspaceManager {
    /// 创建新的AI工作区管理器
    pub fn new(config: AIWorkspaceConfig) -> Self {
        Self {
            rollback_manager: CodeRollbackManager::new(config.rollback_storage.clone()),
            summary_manager: ConversationSummaryManager::new(config.summary_storage.clone()),
            clone_manager: None,
            config,
            current_session_id: None,
        }
    }

    /// 初始化管理器
    pub async fn initialize(&mut self) -> Result<()> {
        self.rollback_manager.initialize().await?;
        self.summary_manager.initialize().await?;
        Ok(())
    }

    /// 打开项目（自动克隆）
    pub async fn open_project(
        &mut self,
        original_path: AbsolutePathBuf,
    ) -> Result<AbsolutePathBuf> {
        if !self.config.auto_clone_enabled {
            return Ok(original_path);
        }

        let clone_config =
            ProjectCloneConfig::new(original_path.clone(), self.config.clone_root.clone());

        let mut clone_manager = ProjectCloneManager::new(clone_config);
        let cloned = clone_manager.create_clone().await?;

        let cloned_path = AbsolutePathBuf::from_absolute_path(&cloned.cloned_path)?;
        self.clone_manager = Some(clone_manager);

        tracing::info!(
            "Project cloned: {} -> {}",
            original_path.display(),
            cloned_path.display()
        );

        Ok(cloned_path)
    }

    /// 开始新的AI会话
    pub async fn start_session(&mut self, session_id: String, title: String) -> Result<()> {
        if self.config.auto_summary_enabled {
            self.summary_manager
                .start_session(session_id.clone(), title)?;
        }
        self.current_session_id = Some(session_id);
        Ok(())
    }

    /// 在AI修改前创建回溯点
    pub async fn before_ai_modification(
        &mut self,
        turn_id: String,
        files: Vec<PathBuf>,
        description: String,
    ) -> Result<Option<String>> {
        if !self.config.auto_rollback_enabled {
            return Ok(None);
        }

        let session_id = self
            .current_session_id
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No active session"))?;

        let rollback_id = self
            .rollback_manager
            .create_rollback_point(session_id.clone(), Some(turn_id), files, description)
            .await?;

        tracing::info!("Created rollback point: {}", rollback_id);
        Ok(Some(rollback_id))
    }

    /// AI修改后记录总结
    pub async fn after_ai_modification(
        &mut self,
        turn_id: String,
        user_question: String,
        assistant_response: String,
        affected_files: Vec<String>,
        operations: Vec<String>,
    ) -> Result<()> {
        if !self.config.auto_summary_enabled {
            return Ok(());
        }

        self.summary_manager
            .add_turn_summary(
                turn_id,
                user_question,
                assistant_response,
                affected_files,
                operations,
            )
            .await?;

        tracing::info!("Turn summary saved");
        Ok(())
    }

    /// 回溯到指定版本
    pub async fn rollback(&self, rollback_id: &str) -> Result<Vec<String>> {
        let restored = self.rollback_manager.rollback_to_point(rollback_id).await?;
        tracing::info!("Rolled back {} files", restored.len());
        Ok(restored)
    }

    /// 结束会话
    pub async fn end_session(&mut self, overall_summary: Option<String>) -> Result<()> {
        if self.config.auto_summary_enabled {
            self.summary_manager.end_session(overall_summary).await?;
        }

        // 标记克隆为非活跃
        if let Some(clone_manager) = &mut self.clone_manager {
            // 先获取active_clone的id，避免借用冲突
            let active_clone_id = clone_manager.get_active_clone().map(|c| c.id.clone());

            if let Some(id) = active_clone_id {
                clone_manager.deactivate_clone(&id);
            }
        }

        self.current_session_id = None;
        Ok(())
    }

    /// 获取当前克隆的项目信息
    pub fn get_current_clone(&self) -> Option<&ClonedProject> {
        self.clone_manager
            .as_ref()
            .and_then(|m| m.get_active_clone())
    }

    /// 列出会话的所有回溯点
    pub async fn list_rollback_points(
        &self,
        session_id: &str,
    ) -> Result<Vec<crate::code_rollback::RollbackPoint>> {
        self.rollback_manager.list_rollback_points(session_id).await
    }

    /// 搜索对话总结
    pub async fn search_summaries(
        &self,
        query: &str,
    ) -> Result<Vec<crate::conversation_summary::TurnSummary>> {
        self.summary_manager.search_summaries(query).await
    }

    /// 清理旧数据
    pub async fn cleanup(&mut self, max_age_days: u64) -> Result<CleanupStats> {
        let mut stats = CleanupStats::default();

        if let Some(clone_manager) = &mut self.clone_manager {
            stats.removed_clones = clone_manager.cleanup_old_clones(max_age_days).await?;
        }

        stats.removed_rollbacks = self
            .rollback_manager
            .cleanup_old_rollbacks(max_age_days)
            .await?;
        stats.removed_summaries = self
            .summary_manager
            .cleanup_old_summaries(max_age_days)
            .await?;

        tracing::info!("Cleanup completed: {:?}", stats);
        Ok(stats)
    }
}

/// 清理统计
#[derive(Debug, Default, Clone)]
pub struct CleanupStats {
    pub removed_clones: usize,
    pub removed_rollbacks: usize,
    pub removed_summaries: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_ai_workspace_manager() {
        let temp_dir = tempdir().unwrap();
        let config = AIWorkspaceConfig {
            clone_root: temp_dir.path().join("clones"),
            rollback_storage: temp_dir.path().join("rollbacks"),
            summary_storage: temp_dir.path().join("summaries"),
            auto_clone_enabled: true,
            auto_rollback_enabled: true,
            auto_summary_enabled: true,
        };

        let mut manager = AIWorkspaceManager::new(config);
        manager.initialize().await.unwrap();

        // 开始会话
        manager
            .start_session("test-session".to_string(), "Test AI Session".to_string())
            .await
            .unwrap();

        // 创建回溯点
        let test_file = temp_dir.path().join("test.txt");
        tokio::fs::write(&test_file, "original").await.unwrap();

        let rollback_id = manager
            .before_ai_modification(
                "turn-1".to_string(),
                vec![test_file.clone()],
                "Before AI edit".to_string(),
            )
            .await
            .unwrap();

        assert!(rollback_id.is_some());

        // 记录总结
        manager
            .after_ai_modification(
                "turn-1".to_string(),
                "How to create a file?".to_string(),
                "Use fs_write...".to_string(),
                vec!["test.txt".to_string()],
                vec!["create_file".to_string()],
            )
            .await
            .unwrap();

        // 结束会话
        manager
            .end_session(Some("Session completed".to_string()))
            .await
            .unwrap();
    }
}
