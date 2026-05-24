# CodexStudy 待办（非上游 Codex）

记录产品向、尚未排期的改动，避免和 [openai/codex](https://github.com/openai/codex) 上游贡献混淆。

产品仓库：[YangJin-Lei/codexStudy](https://github.com/YangJin-Lei/codexStudy)

## 已完成（近期）

### 安装包：桌面主程序与 CLI 侧车分离

- NSIS 不再用 `codexstudy-cli-*` 覆盖 Tauri 主程序 `codexstudy.exe`。
- 侧车资源名：`binaries/codexstudy-cli-{target-triple}.exe`。

### TUI 国内模型 API（DeepSeek）

- `codexstudy` 首次登录仅展示「国内模型 API」入口，配置写入 `~/.codexStudy/config.toml`。
- 实现：`codex-rs/tui/src/onboarding/codexstudy_provider_setup.rs`。

### GitHub 发布准备

- 工作流：`.github/workflows/codexstudy-release.yml`（标签 `v*` / 手动触发）。
- 产品文档：`docs/CODEXSTUDY.md`。
- 桌面 Release 链接统一：`desktop/src/codexStudyRepo.ts`。

### 暂时隐藏「登录账户」相关 UI

- **开关**：`desktop/src/codexStudyUiFlags.ts` → `SHOW_ACCOUNT_LOGIN_UI = false`（改为 `true` 即恢复）。
- **隐藏范围**：侧边栏 Account / 用量条、Home「账户限额」、设置里 ChatGPT 托管登录预设。
- **未改**：后端 `account/read`、`codex_login` 等逻辑仍保留。

## 待办（产品化）

- [ ] 根目录 LICENSE / README 与 GitHub 仓库声明对齐（MIT vs Apache 上游）
- [ ] 代码签名（Windows / macOS）
- [ ] Release 工作流自动上传到 GitHub Releases（当前仅 Artifacts）
- [ ] 面向用户的安装与排错文档（简中）
- [ ] 清理上游 OpenAI 文案（TUI 非 `codexstudy` 路径仍保留）
