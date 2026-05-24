use std::path::Path;

use toml_edit::{value, Document, Item, Table};

use crate::shared::config_toml_core;

use super::install;
use super::FEATURE_KEY;
use super::MARKETPLACE_NAME;
use super::PLUGIN_NAME;

pub(crate) fn write_enabled_config(codex_home: &Path, enabled: bool) -> Result<(), String> {
    let (_, mut document) = config_toml_core::load_global_config_document(codex_home)?;
    config_toml_core::set_feature_flag(&mut document, FEATURE_KEY, enabled)?;

    let plugin_key = format!("plugins.\"{PLUGIN_NAME}@{MARKETPLACE_NAME}\"");
    if enabled {
        set_plugin_enabled(&mut document, &plugin_key, true)?;
        set_marketplace_entry(&mut document, codex_home)?;
        if let Ok(runtime) = install::resolve_installed_runtime_path(codex_home) {
            set_notify_entry(&mut document, &runtime)?;
        }
        remove_legacy_mcp_entries(&mut document);
    } else {
        set_plugin_enabled(&mut document, &plugin_key, false)?;
    }

    config_toml_core::persist_global_config_document(codex_home, &document)
}

fn set_plugin_enabled(document: &mut Document, key: &str, enabled: bool) -> Result<(), String> {
    document[key] = table_with_bool("enabled", enabled);
    Ok(())
}

fn set_marketplace_entry(document: &mut Document, codex_home: &Path) -> Result<(), String> {
    let marketplace_path = install::marketplace_root(codex_home);
    let key = format!("marketplaces.{MARKETPLACE_NAME}");
    let mut table = Table::new();
    table.insert("source_type", value("local"));
    table.insert("source", value(marketplace_path.to_string_lossy().to_string()));
    document[&key] = Item::Table(table);
    Ok(())
}

fn set_notify_entry(document: &mut Document, runtime: &Path) -> Result<(), String> {
    let mut values = toml_edit::Array::new();
    values.push(runtime.to_string_lossy().to_string());
    values.push("turn-ended".to_string());
    document["notify"] = value(values);
    Ok(())
}

fn remove_legacy_mcp_entries(document: &mut Document) {
    for key in [
        "mcp_servers.\"open-computer-use\"",
        "mcp_servers.\"open-codex-computer-use\"",
        "mcp_servers.\"computer-use\"",
    ] {
        let _ = document.remove(key);
    }
}

fn table_with_bool(field: &str, enabled: bool) -> Item {
    let mut table = Table::new();
    table.insert(field, value(enabled));
    Item::Table(table)
}
