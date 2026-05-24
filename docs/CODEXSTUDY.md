# CodexStudy 产品与发布说明

仓库主页：[YangJin-Lei/codexStudy](https://github.com/YangJin-Lei/codexStudy)

本目录文档描述 **CodexStudy 衍生产品**（桌面端 + `codexstudy` CLI），与上游 [openai/codex](https://github.com/openai/codex) 的通用 CLI 文档并存。

## 产品组成

| 组件 | 路径 | 说明 |
|------|------|------|
| 桌面应用 | `desktop/` | Tauri + React，`CodexStudy` 图形界面 |
| CLI / TUI | `codex-rs/cli`、`codex-rs/tui` | 命令 `codexstudy`，配置目录 `~/.codexStudy` |
| codex-new | `codex-rs/codex-new-core/`、`codex-new.md` | 隔离工作区、diff/merge/rollback |
| Computer Use | `computer-use/` | 捆绑桌面自动化插件资源 |

## 本机打包

详见根目录 [README.md](../README.md) 中 **CodexStudy** 一节。

| 目标 | 命令 |
|------|------|
| Windows 安装包 | `corepack pnpm --dir desktop tauri:build:nsis:win` |
| 仅终端 CLI | `corepack pnpm --dir desktop package:cli:win` |
| macOS / Linux 桌面包 | 在对应系统执行 `corepack pnpm --dir desktop tauri:build` |

产物目录：`desktop/src-tauri/target/release/bundle/`。

## GitHub Actions 自动打包

工作流：[`.github/workflows/codexstudy-release.yml`](../.github/workflows/codexstudy-release.yml)

**触发方式：**

1. 推送版本标签：`git tag v0.7.68 && git push origin v0.7.68`
2. 在 GitHub **Actions** 页手动 **Run workflow**

**产物：** 三个平台的安装包以 **Artifacts** 形式上传（Windows NSIS、macOS DMG、Linux AppImage），保留 30 天。可在 Actions 运行结束后下载，或后续配置 `release` 步骤自动挂到 [Releases](https://github.com/YangJin-Lei/codexStudy/releases)。

> 首次全量编译约 30–60 分钟/平台，已启用 `rust-cache` 加速后续构建。

## 近期功能变更（摘要）

- **安装包修复**：CLI 侧车改名为 `codexstudy-cli-*`，不再覆盖桌面主程序 `codexstudy.exe`。
- **TUI 国内模型**：`codexstudy` 首次启动可配置 DeepSeek API，写入 `~/.codexStudy/config.toml`。
- **桌面 API 优先**：默认 `forced_login_method = api`，隐藏 ChatGPT 账户 UI（见 `desktop/src/codexStudyUiFlags.ts`）。

完整变更记录见根目录 [`log.md`](../log.md)。

## 待办

见 [`desktop/CODEXSTUDY_BACKLOG.md`](../desktop/CODEXSTUDY_BACKLOG.md)。
