use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use chat_agent_core::{CoreDelegate, RunRequest, RunState};
use tokio::sync::Mutex as AsyncMutex;

pub(crate) type SharedRunState = Arc<Mutex<RunState>>;

pub(crate) struct ChatAgentRunContext {
    pub(crate) request: RunRequest,
    pub(crate) executor_root: PathBuf,
    pub(crate) core_delegate: Option<Arc<dyn CoreDelegate>>,
}

pub(crate) struct ChatAgentRunRecord {
    pub(crate) state: SharedRunState,
    pub(crate) cancelled: Arc<AtomicBool>,
    pub(crate) context: Arc<ChatAgentRunContext>,
}

pub(crate) struct ChatAgentRunRegistry {
    runs: AsyncMutex<HashMap<String, ChatAgentRunRecord>>,
}

impl ChatAgentRunRegistry {
    pub(crate) fn new() -> Self {
        Self {
            runs: AsyncMutex::new(HashMap::new()),
        }
    }

    pub(crate) async fn cancel_in_flight_for_thread(&self, thread_id: &str) {
        let runs = self.runs.lock().await;
        for record in runs.values() {
            if record.context.request.thread_id.as_deref() == Some(thread_id) {
                record.cancelled.store(true, Ordering::SeqCst);
            }
        }
    }

    pub(crate) async fn insert(&self, run_id: String, record: ChatAgentRunRecord) {
        self.runs.lock().await.insert(run_id, record);
    }

    pub(crate) async fn get(&self, run_id: &str) -> Option<ChatAgentRunRecord> {
        self.runs.lock().await.get(run_id).cloned()
    }

    pub(crate) async fn remove(&self, run_id: &str) {
        self.runs.lock().await.remove(run_id);
    }

    pub(crate) async fn list_for_thread(&self, thread_id: &str) -> Vec<ChatAgentRunRecord> {
        let runs = self.runs.lock().await;
        runs.values()
            .filter(|record| record.context.request.thread_id.as_deref() == Some(thread_id))
            .cloned()
            .collect()
    }
}

impl ChatAgentRunRecord {
    pub(crate) fn read_state(&self) -> RunState {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub(crate) fn write_state(&self, next: RunState) {
        *self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = next;
    }

    pub(crate) fn update_state(&self, update: impl FnOnce(&mut RunState)) {
        update(
            &mut self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
        );
    }
}

impl Clone for ChatAgentRunRecord {
    fn clone(&self) -> Self {
        Self {
            state: Arc::clone(&self.state),
            cancelled: Arc::clone(&self.cancelled),
            context: Arc::clone(&self.context),
        }
    }
}
