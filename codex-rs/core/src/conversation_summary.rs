//! 对话总结生成系统
//!
//! 每轮对话结束后自动生成总结文件，包含用户提问和AI回答的精简版本

use anyhow::Context;
use anyhow::Result;
use serde::Deserialize;
use serde::Serialize;
use std::path::PathBuf;
use std::time::SystemTime;
use tokio::fs;

/// 对话消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    /// 消息角色
    pub role: MessageRole,
    /// 消息内容
    pub content: String,
    /// 时间戳
    pub timestamp: u64,
}

/// 消息角色
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
}

/// 对话轮次总结
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnSummary {
    /// 轮次ID
    pub turn_id: String,
    /// 会话ID
    pub session_id: String,
    /// 用户提问
    pub user_question: String,
    /// AI回答总结
    pub assistant_summary: String,
    /// 涉及的文件列表
    pub affected_files: Vec<String>,
    /// 执行的操作类型
    pub operations: Vec<String>,
    /// 创建时间
    pub created_at: u64,
    /// 完整消息（可选，用于详细查看）
    pub full_messages: Option<Vec<ConversationMessage>>,
}

/// 会话总结
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    /// 会话ID
    pub session_id: String,
    /// 会话标题
    pub title: String,
    /// 开始时间
    pub started_at: u64,
    /// 结束时间
    pub ended_at: Option<u64>,
    /// 轮次总结列表
    pub turns: Vec<TurnSummary>,
    /// 总体摘要
    pub overall_summary: Option<String>,
}

/// 对话总结管理器
pub struct ConversationSummaryManager {
    /// 总结文件存储目录
    storage_dir: PathBuf,
    /// 当前会话的总结
    current_session: Option<SessionSummary>,
}

impl ConversationSummaryManager {
    /// 创建新的总结管理器
    pub fn new(storage_dir: PathBuf) -> Self {
        Self {
            storage_dir,
            current_session: None,
        }
    }

    /// 初始化存储目录
    pub async fn initialize(&self) -> Result<()> {
        fs::create_dir_all(&self.storage_dir)
            .await
            .context("Failed to create summary storage directory")?;
        Ok(())
    }

    /// 开始新会话
    pub fn start_session(&mut self, session_id: String, title: String) -> Result<()> {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        self.current_session = Some(SessionSummary {
            session_id,
            title,
            started_at: now,
            ended_at: None,
            turns: Vec::new(),
            overall_summary: None,
        });

        Ok(())
    }

    /// 添加轮次总结
    pub async fn add_turn_summary(
        &mut self,
        turn_id: String,
        user_question: String,
        assistant_response: String,
        affected_files: Vec<String>,
        operations: Vec<String>,
    ) -> Result<()> {
        let session = self.current_session.as_mut().context("No active session")?;

        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs();

        // 生成AI回答的总结（先计算，避免借用冲突）
        let assistant_summary = Self::summarize_response_static(&assistant_response);

        let turn_summary = TurnSummary {
            turn_id,
            session_id: session.session_id.clone(),
            user_question,
            assistant_summary,
            affected_files,
            operations,
            created_at: now,
            full_messages: None,
        };

        session.turns.push(turn_summary);

        // 自动保存
        self.save_session_summary().await?;

        Ok(())
    }

    /// 总结AI回答（简化长文本）- 静态方法避免借用冲突
    fn summarize_response_static(response: &str) -> String {
        const MAX_SUMMARY_LENGTH: usize = 500;

        if response.len() <= MAX_SUMMARY_LENGTH {
            return response.to_string();
        }

        // 提取关键信息
        let lines: Vec<&str> = response.lines().collect();
        let mut summary = String::new();
        let mut current_length = 0;

        for line in lines {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // 优先保留以特定标记开头的行
            if trimmed.starts_with("##")
                || trimmed.starts_with("###")
                || trimmed.starts_with("- ")
                || trimmed.starts_with("* ")
                || trimmed.starts_with("1.")
            {
                if current_length + trimmed.len() > MAX_SUMMARY_LENGTH {
                    break;
                }
                summary.push_str(trimmed);
                summary.push('\n');
                current_length += trimmed.len() + 1;
            }
        }

        if summary.is_empty() {
            // 如果没有找到结构化内容，取前N个字符
            let truncated: String = response.chars().take(MAX_SUMMARY_LENGTH).collect();
            format!("{}...", truncated)
        } else {
            summary
        }
    }

    /// 结束会话
    pub async fn end_session(&mut self, overall_summary: Option<String>) -> Result<()> {
        if let Some(session) = self.current_session.as_mut() {
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)?
                .as_secs();

            session.ended_at = Some(now);
            session.overall_summary = overall_summary;

            self.save_session_summary().await?;
        }

        Ok(())
    }

    /// 保存会话总结到文件
    async fn save_session_summary(&self) -> Result<()> {
        let session = self.current_session.as_ref().context("No active session")?;

        // 保存为JSON格式
        let json_path = self
            .storage_dir
            .join(format!("{}.json", session.session_id));
        let json = serde_json::to_string_pretty(session)?;
        fs::write(&json_path, json).await?;

        // 同时保存为Markdown格式（更易读）
        let md_path = self.storage_dir.join(format!("{}.md", session.session_id));
        let markdown = self.generate_markdown(session)?;
        fs::write(&md_path, markdown).await?;

        Ok(())
    }

    /// 生成Markdown格式的总结
    fn generate_markdown(&self, session: &SessionSummary) -> Result<String> {
        let mut md = String::new();

        // 标题
        md.push_str(&format!("# {}\n\n", session.title));
        md.push_str(&format!("**会话ID**: {}\n\n", session.session_id));
        md.push_str(&format!(
            "**开始时间**: {}\n\n",
            self.format_timestamp(session.started_at)
        ));

        if let Some(ended_at) = session.ended_at {
            md.push_str(&format!(
                "**结束时间**: {}\n\n",
                self.format_timestamp(ended_at)
            ));
        }

        // 总体摘要
        if let Some(summary) = &session.overall_summary {
            md.push_str("## 总体摘要\n\n");
            md.push_str(summary);
            md.push_str("\n\n");
        }

        // 轮次详情
        md.push_str("## 对话轮次\n\n");
        for (index, turn) in session.turns.iter().enumerate() {
            md.push_str(&format!(
                "### 轮次 {} ({})\n\n",
                index + 1,
                self.format_timestamp(turn.created_at)
            ));

            md.push_str("**用户提问**:\n\n");
            md.push_str(&format!("{}\n\n", turn.user_question));

            md.push_str("**AI回答总结**:\n\n");
            md.push_str(&format!("{}\n\n", turn.assistant_summary));

            if !turn.operations.is_empty() {
                md.push_str("**执行操作**:\n\n");
                for op in &turn.operations {
                    md.push_str(&format!("- {}\n", op));
                }
                md.push_str("\n");
            }

            if !turn.affected_files.is_empty() {
                md.push_str("**涉及文件**:\n\n");
                for file in &turn.affected_files {
                    md.push_str(&format!("- `{}`\n", file));
                }
                md.push_str("\n");
            }

            md.push_str("---\n\n");
        }

        Ok(md)
    }

    /// 格式化时间戳
    fn format_timestamp(&self, timestamp: u64) -> String {
        use chrono::DateTime;
        use chrono::Utc;
        let dt = DateTime::<Utc>::from_timestamp(timestamp as i64, 0).unwrap_or_else(|| Utc::now());
        dt.format("%Y-%m-%d %H:%M:%S UTC").to_string()
    }

    /// 加载会话总结
    pub async fn load_session_summary(&self, session_id: &str) -> Result<SessionSummary> {
        let json_path = self.storage_dir.join(format!("{}.json", session_id));
        let content = fs::read_to_string(&json_path).await?;
        let summary: SessionSummary = serde_json::from_str(&content)?;
        Ok(summary)
    }

    /// 列出所有会话总结
    pub async fn list_sessions(&self) -> Result<Vec<SessionSummary>> {
        let mut sessions = Vec::new();
        let mut entries = fs::read_dir(&self.storage_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path).await {
                    if let Ok(session) = serde_json::from_str::<SessionSummary>(&content) {
                        sessions.push(session);
                    }
                }
            }
        }

        // 按开始时间排序
        sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        Ok(sessions)
    }

    /// 搜索总结
    pub async fn search_summaries(&self, query: &str) -> Result<Vec<TurnSummary>> {
        let sessions = self.list_sessions().await?;
        let mut results = Vec::new();

        let query_lower = query.to_lowercase();

        for session in sessions {
            for turn in session.turns {
                if turn.user_question.to_lowercase().contains(&query_lower)
                    || turn.assistant_summary.to_lowercase().contains(&query_lower)
                {
                    results.push(turn);
                }
            }
        }

        Ok(results)
    }

    /// 清理旧的总结
    pub async fn cleanup_old_summaries(&self, max_age_days: u64) -> Result<usize> {
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
                    if let Ok(session) = serde_json::from_str::<SessionSummary>(&content) {
                        if (now - session.started_at) > max_age_secs {
                            // 删除JSON和MD文件
                            fs::remove_file(&path).await?;
                            let md_path = path.with_extension("md");
                            let _ = fs::remove_file(&md_path).await;
                            removed_count += 1;
                        }
                    }
                }
            }
        }

        Ok(removed_count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_conversation_summary() {
        let temp_dir = tempdir().unwrap();
        let storage_dir = temp_dir.path().join("summaries");

        let mut manager = ConversationSummaryManager::new(storage_dir);
        manager.initialize().await.unwrap();

        manager
            .start_session("session-1".to_string(), "Test Session".to_string())
            .unwrap();

        manager
            .add_turn_summary(
                "turn-1".to_string(),
                "How do I create a new file?".to_string(),
                "You can create a new file using fs_write tool...".to_string(),
                vec!["test.txt".to_string()],
                vec!["create_file".to_string()],
            )
            .await
            .unwrap();

        manager
            .end_session(Some("Session completed successfully".to_string()))
            .await
            .unwrap();

        // 验证文件已创建
        let json_path = temp_dir.path().join("summaries/session-1.json");
        assert!(json_path.exists());

        let md_path = temp_dir.path().join("summaries/session-1.md");
        assert!(md_path.exists());
    }
}
