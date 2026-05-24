# CodexStudy 变更记录

按时间倒序追加；最新记录在文件末尾。

## 2026-05-23 - 桌面端收口（类型检查 / 品牌存储 / gitignore）

- 修改人：AI助手
- 影响文件：
  - `desktop/src/**/*.ts(x)` （修改：修复 8 处 TypeScript 错误）
  - `desktop/src/lib/migrateCodexstudyStorage.ts` （新增：localStorage 自 CodexMonitor 键迁移）
  - `desktop/src/features/**/threadStorage.ts` 等 （修改：`codexmonitor.*` → `codexstudy.*`）
  - `desktop/src-tauri/src/shared/git_ui_core/diff.rs` （修改：git ignore 探测文件名）
  - `.gitignore` （修改：desktop 构建产物与个人脚本）
  - `README.md` （修改：CodexStudy 目录与打包说明）
  - `log.md` （新增）
- 变更概要：
  - `corepack pnpm --dir desktop typecheck` 已通过。
  - 前端 localStorage 统一为 `codexstudy.*`，启动时一次性迁移旧 `codexmonitor.*` 键。
  - 更新链接（`openai/codex` release）按产品决定暂不改。
  - `.gitignore` 明确忽略 `desktop` 构建目录与 `configure-deepseek.ps1`，保留图标与源码可提交。
- 关联需求：桌面端完整收口

## 2026-05-23 - CLI/TUI 品牌与配置统一（codexstudy / ~/.codexStudy）

- 修改人：AI助手
- 影响文件：
  - `codex-rs/cli/Cargo.toml`、`codex-rs/cli/src/main.rs` （`codexstudy` 主二进制 + `codex` 别名）
  - `codex-rs/utils/home-dir/src/lib.rs` （默认 `~/.codexStudy`）
  - `codex-rs/tui/src/lib.rs`、`status/card.rs`、`pets/catalog.rs` （API 优先、文案）
  - `desktop/src-tauri/**` （捆绑 `codexstudy`、提供商保存写 `forced_login_method=api`）
  - `desktop/scripts/prepare-bundled-codex.mjs`
  - `README.md`
- 变更概要：
  - 用户可见命令与帮助统一为 **codexstudy**；内部 crate/环境变量名仍为 codex。
  - CLI/TUI 与桌面端共用 **`~/.codexStudy/config.toml`**，桌面保存 API 后终端可直接用同一模型。
  - 默认隐藏 ChatGPT 登录引导（`forced_login_method=api` + 非 OpenAI 认证提供商跳过登录屏）。
- 关联需求：命令行与 API 配置统一

## 2026-05-23 - 打包仅编译 codexstudy 二进制

- 修改人：AI助手
- 影响文件：
  - `desktop/scripts/prepare-bundled-codex.mjs` （修改）
  - `codex-rs/cli/Cargo.toml` （注释说明）
  - `README.md` （修改）
- 变更概要：
  - `prepare:bundled-codex` 默认只 `--bin codexstudy`，缩短桌面构建时间；功能不变。
  - 需要 `codex` 兼容命令时手动：`cargo build -p codex-cli --bin codex`。
- 关联需求：减少重复编译

## 2026-05-24 - 修复 Tauri 打包找不到 codex_monitor_daemon.exe

- 修改人：AI助手
- 影响文件：
  - `desktop/src-tauri/Cargo.toml` （修改）
  - `desktop/src-tauri/src/daemon_binary.rs` （修改）
  - `desktop/scripts/macos-fix-openssl.sh` （修改）
- 变更概要：
  - Tauri 按 `src/bin/codex_monitor_daemon.rs` 文件名打包 sidecar，与 `[[bin]] name = codexstudy-daemon` 产出名不一致导致 NSIS 失败。
  - 将 daemon 二进制名改回 `codex_monitor_daemon` / `codex_monitor_daemonctl`（内部文件名），对外产品仍为 CodexStudy。
- 关联需求：Windows 安装包打包失败

## 2026-05-24 - Daemon 侧车统一为 codexstudy-daemon 命名

- 修改人：AI助手
- 影响文件：
  - `desktop/src-tauri/src/bin/codexstudy-daemon.rs` （由 codex_monitor_daemon.rs 重命名）
  - `desktop/src-tauri/src/bin/codexstudy-daemonctl.rs` （由 codex_monitor_daemonctl.rs 重命名）
  - `desktop/src-tauri/src/bin/codexstudy_daemon/` （由 codex_monitor_daemon/ 重命名）
  - `desktop/src-tauri/Cargo.toml`、`daemon_binary.rs`、`macos-fix-openssl.sh`
- 变更概要：
  - `src/bin` 入口文件名与 `[[bin]] name` 均为 `codexstudy-daemon`，满足 Tauri 打包规则。
  - 安装包内 sidecar 为 `codexstudy-daemon.exe`；仍保留对旧文件名的查找以兼容旧构建。
- 关联需求：daemon 命名与 CodexStudy 品牌一致

## 2026-05-24 - 修复 Tauri sidecar 连字符/下划线不一致

- 修改人：AI助手
- 影响文件：
  - `desktop/src-tauri/src/bin/codexstudy_daemon.rs` （由 codexstudy-daemon.rs 重命名）
  - `desktop/src-tauri/src/bin/codexstudy_daemonctl.rs`
  - `desktop/src-tauri/Cargo.toml`、`daemon_binary.rs`、`macos-fix-openssl.sh`
- 变更概要：
  - Cargo 产出 `codexstudy-daemon.exe`，Tauri 打包却查找 `codexstudy_daemon.exe`（`-` → `_`）。
  - 统一 sidecar 为 `codexstudy_daemon` / `codexstudy_daemonctl`（源文件名、`[[bin]] name`、exe 一致）。
  - CLI 帮助文案仍可使用 `codexstudy-daemon` 作为命令名展示。
- 关联需求：NSIS 打包找不到 sidecar exe

## 2026-05-24 - 加速桌面打包：跳过已编译 CLI

- 修改人：AI助手
- 影响文件：
  - `desktop/scripts/prepare-bundled-codex.mjs` （修改）
  - `desktop/package.json` （修改）
  - `desktop/src-tauri/tauri.bundle-only.conf.json` （新增）
  - `README.md` （修改）
- 变更概要：
  - `prepare:bundled-codex` 在 staged 二进制已是最新时跳过 `cargo build`；本机目标不再传 `--target`，与 `cargo build -p codex-cli --bin codexstudy --release` 共用缓存。
  - 新增 `tauri:bundle-only:nsis:win`：CLI/前端已就绪时只跑 Tauri 打包，避免每次 NSIS 都重编 1300+ crate。
  - 强制重编：`pnpm --dir desktop prepare:bundled-codex:force --release`。
- 关联需求：tauri build 每次 40+ 分钟重编

## 2026-05-24 - 安装包侧车命名修复 + TUI 国内 API

- 修改人：AI助手
- 影响文件：
  - `desktop/src-tauri/tauri.conf.json`、`tauri.windows.conf.json`（`externalBin` → `codexstudy-cli`）
  - `desktop/scripts/prepare-bundled-codex.mjs`、`desktop/src-tauri/src/codex_binary.rs`
  - `codex-rs/tui/src/onboarding/auth.rs`、`codexstudy_provider_setup.rs`
  - `desktop/package.json`（`package:cli:win`）
- 变更概要：
  - 修复 NSIS 将 240MB CLI 覆盖 39MB 桌面主程序的问题。
  - `codexstudy` TUI 增加 DeepSeek 国内 API 配置入口。
- 关联需求：Windows 安装后打开的是终端而非桌面

## 2026-05-24 - GitHub 发布准备（codexStudy 仓库）

- 修改人：AI助手
- 影响文件：
  - `.gitignore`、`desktop/.gitignore`
  - `.github/workflows/codexstudy-release.yml`（新增）
  - `docs/CODEXSTUDY.md`（新增）
  - `desktop/src/codexStudyRepo.ts`（新增）
  - `README.md`、`desktop/CODEXSTUDY_BACKLOG.md`
  - `desktop/src/features/update/utils/postUpdateRelease.ts`
  - `desktop/src/features/about/components/AboutView.tsx`
- 变更概要：
  - 忽略 `.cursor/`、`agent-transcripts/`、本地 `.codexStudy/` 等。
  - 产品链接统一为 [YangJin-Lei/codexStudy](https://github.com/YangJin-Lei/codexStudy)。
  - 标签 `v*` 触发三平台 Tauri 打包（Artifacts）。
- 关联需求：发布到 GitHub
