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

1. **推送到 `main`**（与 Windows 一样会并行打三端）
2. 推送版本标签：`git tag v0.7.68 && git push origin v0.7.68`
3. 在 GitHub **Actions** 页手动 **Run workflow**

**产物（Artifacts，保留 30 天）：**

| 平台 | Artifact 名称 |
|------|----------------|
| Windows x64 | `codexstudy-nsis-Windows` |
| Linux x64 | `codexstudy-appimage-Linux` |
| macOS | `codexstudy-dmg-macOS` |

可在 Actions 运行结束后下载，再手动上传到 [Releases](https://github.com/YangJin-Lei/codexStudy/releases)。

**公开仓库与费用：** [YangJin-Lei/codexStudy](https://github.com/YangJin-Lei/codexStudy) 为 **Public** 时，使用标准 `windows-latest` / `ubuntu-*` / `macos-latest` 跑本工作流 **一般不扣 GitHub Free 的 2000 分钟额度**（公开库标准 runner 免费）。若账户设置了 **Budget $0 + Stop usage**，仍可能拦截任务，与是否公开无关。

**避免意外账单：** 根目录除 `codexstudy-release.yml` 外，上游 workflow（Bazel、rust-ci、rust-release 等）已改为 **仅 `openai/codex` 仓库** 才会执行 job（`workflow_dispatch` + `if: github.repository == 'openai/codex'`）。在 fork 上 **push/PR 不会**再自动跑 `macos-15-xlarge` 等计费 runner。`computer-use/.github/workflows/release.yml` 已改名为 `release.yml.disabled`（GitHub 本来也不会从子目录执行 workflow）。

> 三端**并行**各编本机架构的 CLI + Tauri（不能共用 Linux 二进制给 Windows/macOS）。首次可能要 **2–4 小时/平台**；单 job 超时上限 **6 小时**（360 分钟）。macOS DMG 在 CI 上**未签名**。

**常见失败：**

- **`exceeded the maximum execution time of 2h30m0s`**：旧版上限 150 分钟不够；已改为 360 分钟，并去掉全局 `CARGO_BUILD_JOBS=1`（会把编译拖慢到超时）。
- **`The operation was canceled`**：连续 push 取消旧 run；已关闭 `cancel-in-progress`，请 **Run workflow** 一次并少连推。
- **Linux `exit code 1`**：点进 **Build codexstudy CLI (shared)** 或 **Linux** job 看最后 30 行真实 `error:`，不要只看 Summary。

## 近期功能变更（摘要）

- **安装包修复**：CLI 侧车改名为 `codexstudy-cli-*`，不再覆盖桌面主程序 `codexstudy.exe`。
- **TUI 国内模型**：`codexstudy` 首次启动可配置 DeepSeek API，写入 `~/.codexStudy/config.toml`。
- **桌面 API 优先**：默认 `forced_login_method = api`，隐藏 ChatGPT 账户 UI（见 `desktop/src/codexStudyUiFlags.ts`）。

完整变更记录见根目录 [`log.md`](../log.md)。

## 待办

见 [`desktop/CODEXSTUDY_BACKLOG.md`](../desktop/CODEXSTUDY_BACKLOG.md)。
