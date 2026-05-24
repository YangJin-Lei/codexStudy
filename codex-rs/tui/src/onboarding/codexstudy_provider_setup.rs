//! CodexStudy-specific provider onboarding (domestic API keys, config.toml persistence).

use std::path::Path;

use crate::legacy_core::config::edit::ConfigEdit;
use crate::legacy_core::config::edit::ConfigEditsBuilder;

pub(crate) const MANAGED_PROVIDER_ID: &str = "codexstudy-provider";
const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const DEFAULT_MODEL: &str = "deepseek-chat";

/// True when the running executable is the `codexstudy` CLI binary (not `codex`).
pub(crate) fn is_codexstudy_cli() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|path| {
            path.file_stem()
                .and_then(|stem| stem.to_str())
                .map(str::to_owned)
        })
        .is_some_and(|stem| stem.eq_ignore_ascii_case("codexstudy"))
}

/// Writes DeepSeek (OpenAI-compatible) provider settings into `~/.codexStudy/config.toml`.
pub(crate) fn persist_domestic_provider_api_key(
    codex_home: &Path,
    api_key: &str,
) -> anyhow::Result<()> {
    let provider = MANAGED_PROVIDER_ID;
    ConfigEditsBuilder::new(codex_home)
        .with_edits([
            ConfigEdit::SetPath {
                segments: vec!["forced_login_method".to_string()],
                value: "api".into(),
            },
            ConfigEdit::SetPath {
                segments: vec!["model_provider".to_string()],
                value: provider.into(),
            },
            ConfigEdit::SetPath {
                segments: vec!["model".to_string()],
                value: DEFAULT_MODEL.into(),
            },
            ConfigEdit::SetPath {
                segments: vec![
                    "model_providers".to_string(),
                    provider.to_string(),
                    "name".to_string(),
                ],
                value: "DeepSeek".into(),
            },
            ConfigEdit::SetPath {
                segments: vec![
                    "model_providers".to_string(),
                    provider.to_string(),
                    "base_url".to_string(),
                ],
                value: DEEPSEEK_BASE_URL.into(),
            },
            ConfigEdit::SetPath {
                segments: vec![
                    "model_providers".to_string(),
                    provider.to_string(),
                    "wire_api".to_string(),
                ],
                value: "responses".into(),
            },
            ConfigEdit::SetPath {
                segments: vec![
                    "model_providers".to_string(),
                    provider.to_string(),
                    "supports_websockets".to_string(),
                ],
                value: false.into(),
            },
            ConfigEdit::SetPath {
                segments: vec![
                    "model_providers".to_string(),
                    provider.to_string(),
                    "requires_openai_auth".to_string(),
                ],
                value: false.into(),
            },
            ConfigEdit::SetPath {
                segments: vec![
                    "model_providers".to_string(),
                    provider.to_string(),
                    "experimental_bearer_token".to_string(),
                ],
                value: api_key.into(),
            },
        ])
        .apply_blocking()
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn persist_domestic_provider_writes_codexstudy_provider_block() {
        let home = TempDir::new().expect("temp home");
        persist_domestic_provider_api_key(home.path(), "sk-test-key").expect("persist");

        let config_path = home.path().join("config.toml");
        let contents = fs::read_to_string(config_path).expect("read config");
        assert!(contents.contains("forced_login_method = \"api\""));
        assert!(contents.contains("model_provider = \"codexstudy-provider\""));
        assert!(contents.contains("experimental_bearer_token = \"sk-test-key\""));
        assert!(contents.contains("requires_openai_auth = false"));
        assert!(contents.contains("https://api.deepseek.com"));
    }
}
