use crate::error::Result;
use crate::protocol::Action;
use crate::protocol::Observation;

/// Phase 2 hook: delegate tool execution to codex-rs/core instead of local tools.
pub trait CoreDelegate: Send + Sync {
    fn execute(
        &self,
        action: &Action,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Observation>> + Send + '_>>;
}
