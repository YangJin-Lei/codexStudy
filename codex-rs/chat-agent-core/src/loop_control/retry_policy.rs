use std::time::Duration;

/// Exponential backoff for model API retries.
pub fn backoff_delay(attempt: u32, base_ms: u64, max_ms: u64) -> Duration {
    let factor = 2u64.saturating_pow(attempt);
    let delay_ms = base_ms.saturating_mul(factor).min(max_ms);
    Duration::from_millis(delay_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_caps_at_max() {
        assert_eq!(backoff_delay(10, 1000, 8000), Duration::from_millis(8000));
    }
}
