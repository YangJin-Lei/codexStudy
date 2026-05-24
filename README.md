<p align="center"><code>npm i -g @openai/codex</code><br />or <code>brew install --cask codex</code></p>
<p align="center"><strong>Codex CLI</strong> is a coding agent from OpenAI that runs locally on your computer.
<p align="center">
  <img src="https://github.com/openai/codex/blob/main/.github/codex-cli-splash.png" alt="Codex CLI splash" width="80%" />
</p>
</br>
If you want Codex in your code editor (VS Code, Cursor, Windsurf), <a href="https://developers.openai.com/codex/ide">install in your IDE.</a>
</br>If you want the desktop app experience, run <code>codex app</code> or visit <a href="https://chatgpt.com/codex?app-landing-page=true">the Codex App page</a>.
</br>If you are looking for the <em>cloud-based agent</em> from OpenAI, <strong>Codex Web</strong>, go to <a href="https://chatgpt.com/codex">chatgpt.com/codex</a>.</p>

---

## CodexStudy（本仓库衍生桌面端）

**仓库**：[YangJin-Lei/codexStudy](https://github.com/YangJin-Lei/codexStudy) · **发布构建**：[GitHub Actions](https://github.com/YangJin-Lei/codexStudy/actions/workflows/codexstudy-release.yml) · **产品文档**：[docs/CODEXSTUDY.md](./docs/CODEXSTUDY.md)

本仓库在 [openai/codex](https://github.com/openai/codex) 基础上增加了 **CodexStudy** 桌面应用与 **codex-new** 隔离工作流，与上游 CLI 文档并存。

| 模块 | 路径 | 说明 |
|------|------|------|
| 桌面应用 | `desktop/` | React + Tauri，`productName`: **CodexStudy** |
| codex-new 核心 | `codex-rs/codex-new-core/` | 任务隔离、diff/merge/rollback 等 |
| CLI / TUI | `codex-rs/cli`、`codex-rs/tui` | 主命令 **`codexstudy`**；打包默认只编此二进制；需要 `codex` 时 `cargo build -p codex-cli --bin codex`；配置 **`~/.codexStudy`** |
| CLI 子命令 | `codex-rs/cli/src/codex_new_cmd.rs` | `codexstudy new ...` |
| Computer Use | `computer-use/` | 捆绑桌面自动化资源 |
| 设计说明 | `codex-new.md` | codex-new 产品/协议说明 |

### 目录结构（节选）

```text
codex/
├── desktop/                 # CodexStudy 桌面端（Tauri）
│   ├── src/                 # React 前端
│   └── src-tauri/           # Rust 后端与打包配置
├── codex-rs/
│   ├── codex-new-core/      # codex-new 库
│   └── cli/                 # codex CLI（含 `new` 子命令）
├── computer-use/            # Open Computer Use 插件与构建
├── codex-new.md
├── log.md                   # 变更记录
└── README.md
```

### 开发与打包

```shell
# 前端类型检查
corepack pnpm --dir desktop typecheck

# Windows 开发
corepack pnpm --dir desktop tauri:dev:win

# Windows 桌面安装包（Tauri GUI，需本机 Rust / 构建工具链）
corepack pnpm --dir desktop tauri:build:nsis:win   # NSIS → setup.exe（捆绑桌面 + CLI sidecar）
corepack pnpm --dir desktop tauri:build:msi:win    # MSI

# 若 CLI / 前端已编好，只打 NSIS 安装包（跳过 beforeBuildCommand，约分钟级）
corepack pnpm --dir desktop tauri:bundle-only:nsis:win

# 仅打包终端 TUI（codexstudy.exe，约 240MB，不含桌面 GUI）
corepack pnpm --dir desktop package:cli:win
```

**安装包输出目录**（成功 `tauri build` 之后）：

```text
desktop/src-tauri/target/release/bundle/
├── nsis/     # CodexStudy_<version>_x64-setup.exe
├── msi/      # CodexStudy_<version>_x64_en-US.msi
├── macos/    # CodexStudy.app
└── appimage/ # Linux AppImage
```

- 仅 `tauri dev` **不会**生成上述安装包，只会在 `target/debug/` 下产生开发用可执行文件。
- Codex 配置目录默认 **`~/.codexStudy`**（可用 `CODEXSTUDY_CODEX_HOME` 或 `CODEX_HOME` 覆盖），与官方 CLI 的 `~/.codex` 隔离。
- 在桌面端设置里保存 API 后，**TUI / CLI 共用**同一份 `config.toml`（`model_providers.codexstudy-provider`）；默认 **`forced_login_method = "api"`**，不引导 ChatGPT 登录。
- 终端主命令：**`codexstudy`**（兼容 `codex` 需另行 `cargo build -p codex-cli --bin codex`，日常打包不编）。
- **首次** `release` 编译 codex-rs 可能需 30–40 分钟（`lto = "fat"`、`codegen-units = 1`）；改 `codex-rs` 后也会触发大范围重编。之后若二进制未变，`prepare:bundled-codex` 会自动跳过 cargo；强制重编：`pnpm --dir desktop prepare:bundled-codex:force --release`。
- 变更历史见根目录 [`log.md`](./log.md)；待办见 [`desktop/CODEXSTUDY_BACKLOG.md`](./desktop/CODEXSTUDY_BACKLOG.md)。
- 推送标签 `v*` 可触发 [自动打包工作流](./.github/workflows/codexstudy-release.yml)（Windows / macOS / Linux 安装包产物在 Actions Artifacts 中下载）。

---

## Quickstart

### Installing and running Codex CLI

Install globally with your preferred package manager:

```shell
# Install using npm
npm install -g @openai/codex
```

```shell
# Install using Homebrew
brew install --cask codex
```

Then simply run `codex` to get started.

<details>
<summary>You can also go to the <a href="https://github.com/openai/codex/releases/latest">latest GitHub Release</a> and download the appropriate binary for your platform.</summary>

Each GitHub Release contains many executables, but in practice, you likely want one of these:

- macOS
  - Apple Silicon/arm64: `codex-aarch64-apple-darwin.tar.gz`
  - x86_64 (older Mac hardware): `codex-x86_64-apple-darwin.tar.gz`
- Linux
  - x86_64: `codex-x86_64-unknown-linux-musl.tar.gz`
  - arm64: `codex-aarch64-unknown-linux-musl.tar.gz`

Each archive contains a single entry with the platform baked into the name (e.g., `codex-x86_64-unknown-linux-musl`), so you likely want to rename it to `codex` after extracting it.

</details>

### Using Codex with your ChatGPT plan

Run `codex` and select **Sign in with ChatGPT**. We recommend signing into your ChatGPT account to use Codex as part of your Plus, Pro, Business, Edu, or Enterprise plan. [Learn more about what's included in your ChatGPT plan](https://help.openai.com/en/articles/11369540-codex-in-chatgpt).

You can also use Codex with an API key, but this requires [additional setup](https://developers.openai.com/codex/auth#sign-in-with-an-api-key).

## Docs

- [**Codex Documentation**](https://developers.openai.com/codex)
- [**Contributing**](./docs/contributing.md)
- [**Installing & building**](./docs/install.md)
- [**Open source fund**](./docs/open-source-fund.md)

## 关于未签名安装包的安全警告绕过说明 (仅限学习与开发用途)

由于本仓库（CodexStudy）是用于学习和研究目的的开源衍生项目，分发的桌面安装包没有使用付费的微软 Windows 代码签名证书或苹果开发者证书进行数字签名。在安装或运行打包的二进制文件时，操作系统可能会弹出安全警告。

### Windows 系统 (SmartScreen 拦截)
1. 运行安装包时，如果弹出“Windows 已保护你的电脑”提示；
2. 点击提示信息中的 **“更多信息” (More Info)**；
3. 点击右下角出现的 **“仍要运行” (Run anyway)** 按钮继续安装。

### macOS 系统 (无法打开/未识别的开发者)
1. 双击运行程序时，如果提示“无法打开，因为苹果无法检查其是否包含恶意软件”；
2. 打开 **“系统设置” -> “隐私与安全” (Privacy & Security)**；
3. 向下滑动到“安全性”部分，您会看到提示：“已阻止使用‘CodexStudy’，因为其不是来自识别的开发者”；
4. 点击 **“仍要打开” (Open Anyway)**，并输入您的 Mac 开机密码确认。

This repository is licensed under the [Apache-2.0 License](LICENSE).
