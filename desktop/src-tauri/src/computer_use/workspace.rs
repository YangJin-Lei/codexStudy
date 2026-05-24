use std::fs;
use std::path::{Path, PathBuf};

const AGENTS_MD_MARKER: &str = "<!-- codexstudy-computer-use-agents v1 -->";

pub(crate) fn prepare_workspace_dir(codex_home: &Path) -> Result<PathBuf, String> {
    let path = codex_home.join("computer-use");
    fs::create_dir_all(&path).map_err(|err| {
        format!("Failed to create Computer Use workspace directory: {err}")
    })?;
    write_workspace_agents_md(&path)?;
    Ok(path)
}

pub(crate) fn ensure_workspace_agents_md(codex_home: &Path) -> Result<(), String> {
    let path = codex_home.join("computer-use");
    if !path.is_dir() {
        return Ok(());
    }
    write_workspace_agents_md(&path)
}

fn write_workspace_agents_md(workspace_path: &Path) -> Result<(), String> {
    let agents_path = workspace_path.join("AGENTS.md");
    if agents_path.is_file() {
        let existing = fs::read_to_string(&agents_path).unwrap_or_default();
        if existing.contains(AGENTS_MD_MARKER) {
            let next = workspace_agents_md_content();
            if existing != next {
                fs::write(&agents_path, next).map_err(|err| {
                    format!(
                        "Failed to update Computer Use AGENTS.md at {}: {err}",
                        agents_path.display()
                    )
                })?;
            }
            return Ok(());
        }
        return Ok(());
    }

    fs::write(&agents_path, workspace_agents_md_content()).map_err(|err| {
        format!(
            "Failed to write Computer Use AGENTS.md at {}: {err}",
            agents_path.display()
        )
    })
}

fn workspace_agents_md_content() -> String {
    format!(
        r#"{AGENTS_MD_MARKER}

# Computer Use workspace (CodexStudy)

This workspace drives **real desktop control** through the bundled `open-computer-use` MCP tools. It is not a code sandbox.

## Safe mode

CodexStudy does **not** use codex-new isolated/safe mode in this workspace. Actions run against the logged-in desktop session.

## Core workflow

1. Call `list_apps` before targeting any application.
2. Use exact app names returned by `list_apps` in later tool calls.
3. Call `get_app_state` immediately before click, type, set_value, or scroll actions.
4. Re-run `get_app_state` after navigation, dialogs, or failed actions. Do not reuse stale `element_index` values.

## Windows: resolve executables before changing strategy

When you need to launch an app or open a file with a specific program, **do not abandon desktop discovery after one failed guess**. Work through these steps in order:

1. `list_apps` — pick the exact running or installed name shown in the output.
2. `get_app_state` for that app if it should already be open.
3. Registry App Paths (PowerShell), for example:
   `Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\wps.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty '(default)'`
4. Start menu inventory:
   `Get-StartApps | Where-Object {{ $_.Name -match '<keyword>' }}`
5. `where.exe <likely-exe-name>` for names such as `wps`, `WINWORD`, `EXCEL`, `notepad`.
6. Search common install roots:
   `$env:ProgramFiles`, `${{env:ProgramFiles(x86)}}`, `$env:LocalAppData\Programs`, `$env:APPDATA`.
7. Launch with the resolved path:
   `Start-Process -FilePath '<full-path-to.exe>' -ArgumentList '<file-or-args>'`
8. Run `list_apps` again and confirm the app is running before UI automation.

Only after these steps fail should you ask the user for the install path or choose a clearly equivalent alternative app.

## macOS and Linux

- macOS: prefer names from `list_apps`. Use `open -a 'App Name' file` only when MCP cannot open the file directly.
- Linux: use AT-SPI names from `list_apps` and confirm you are in a logged-in graphical session.

## Safety

Ask before send, delete, purchase, upload, or other externally visible changes unless the user explicitly requested them.
"#
    )
}
