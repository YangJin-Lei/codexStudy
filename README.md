<p align="center">
  <strong>CodexStudy</strong><br />
  面向学习与本地开发的 AI 编程桌面环境 · Local-first AI coding desktop for learning and development
</p>

<p align="center">
  <a href="https://github.com/YangJin-Lei/codexStudy">GitHub</a> ·
  <a href="https://github.com/YangJin-Lei/codexStudy/actions/workflows/codexstudy-release.yml">CI Builds</a> ·
  <a href="./docs/CODEXSTUDY.md">Build Guide</a> ·
  <a href="./codex-new.md">codex-new Design</a>
</p>

<p align="center">
  <a href="#codexstudy-是什么--what-is-codexstudy">中文</a> ·
  <a href="#what-is-codexstudy">English</a>
</p>

> **项目说明 · Notice**  
> 本项目为作者**毕业设计**相关的开源实践，部分功能仍在完善中，**不建议用于生产环境**；问题与建议请走 [Issues](https://github.com/YangJin-Lei/codexStudy/issues)。  
> This repo supports the author's **graduation project**; features are still evolving—not production-ready. Please use [Issues](https://github.com/YangJin-Lei/codexStudy/issues) for feedback.

---

<h2 id="codexstudy-是什么">CodexStudy 是什么</h2>

**CodexStudy** 是一款**本地优先**的 AI 编程环境：提供 **图形桌面端**（Tauri + React）和终端命令 **`codexstudy`**。AI 在隔离副本里改代码，你可以**流式观看过程**、**审核后再合并**、**按文件回溯**，并可选使用 **Computer Use** 控制本机应用。

- 配置目录默认 **`~/.codexStudy`**，与官方 Codex CLI 的 `~/.codex` 隔离
- **大陆用户**：无需 ChatGPT 登录；在 **设置 → Codex** 配置 **DeepSeek** 等 OpenAI 兼容 API 即可；构建说明见 [docs/CODEXSTUDY.md](./docs/CODEXSTUDY.md)

<h2 id="what-is-codexstudy">What is CodexStudy</h2>

**CodexStudy** is a **local-first** AI coding environment with a **desktop app** (Tauri + React) and the **`codexstudy`** CLI. The agent works in an **isolated project copy** while you **stream the process**, **review before merge**, **roll back file changes**, and optionally use **Computer Use** for desktop automation.

- Default config home: **`~/.codexStudy`**, separate from upstream Codex CLI `~/.codex`
- **Mainland China users**: no ChatGPT login required—set **DeepSeek** or other OpenAI-compatible APIs under **Settings → Codex**; build guide: [docs/CODEXSTUDY.md](./docs/CODEXSTUDY.md)

---

<h2 id="来源说明">来源说明 · Attribution</h2>

本仓库为**二次开发**作品，在以下项目基础上演进：

| 来源 / Source | 说明 / Notes |
|------|------|
| **[openai/codex](https://github.com/openai/codex)** | 核心 Agent、CLI、`codex-rs` 运行时（Apache-2.0） |
| **CodexMonitor** | 早期桌面壳思路；`desktop/` 已 rebranding 为 CodexStudy |
| **[computer-use](./computer-use/)** | 捆绑的 Open Computer Use 插件与 MCP 资源 |

上游 Codex 安装说明见文末 **[上游参考 / Upstream reference](#upstream-openai-codex-reference)**，**不是** CodexStudy 的使用前提。

---

<h2 id="核心能力">核心能力 · Features</h2>

桌面端 **codex-new**（`desktop/` + `codex-rs/codex-new-core/`）实现「AI 不直接改原项目」的安全流水线。完整设计见 [codex-new.md](./codex-new.md)。

<p align="center">
  <img src="./docs/images/codexNewZH.png" alt="codex-new 安全模式（中文）" width="48%" />
  <img src="./docs/images/codexNewEN.png" alt="codex-new safe mode (English)" width="48%" />
</p>
<p align="center"><sub>左：中文界面 · Right: English UI — 过程 / 变更 / 审核 / 总结 / 终端</sub></p>

| # | 中文 | English |
|---|------|---------|
| 1 | **流式过程**：时间线展示读取、命令、编辑，而非只看最终 diff | **Streaming process**: timeline of reads, commands, and edits—not only the final diff |
| 2 | **隔离工作区**：打开项目后自动创建副本（Git worktree 或目录拷贝），AI 只在副本中操作 | **Isolated workspace**: auto clone/worktree; the agent only writes to the copy |
| 3 | **审核合并**：人工或 AI 审核，测试通过后再合并；支持按文件 / hunk 选择性覆盖 | **Review & merge**: human or AI review; merge only confirmed hunks after tests |
| 4 | **回溯**：后台保存原文件与修改对照（traceback），误合并可恢复 | **Rollback / traceback**: per-file snapshots to restore after mistaken merges |
| 5 | **任务总结与记忆**：每轮生成叙述性总结与候选记忆，由你决定是否写入项目记忆 | **Summaries & memory**: per-turn summaries and candidate memory you can apply or skip |
| 6 | **隔离测试**（可选）：在原项目/副本上运行测试；Docker 独立环境为后续扩展 | **Isolated testing** (optional): run tests on project/copy; Docker env is planned |

实现要点 / Implementation: `desktop/src/features/codex-new/`，`codex-rs/codex-new-core/`（`traceback.rs`、`memory.rs`、`engine.rs`）。

---

<h2 id="computer-use">Computer Use · 计算机控制</h2>

CodexStudy 捆绑 **Open Computer Use**（`computer-use/`），通过 MCP 在受控工作区内操作桌面应用（浏览器、Office 等），与 codex-new 的文件隔离策略相配合。

<p align="center">
  <img src="./docs/images/computerUseZH.png" alt="Computer Use（中文）" width="48%" />
  <img src="./docs/images/computerUseEN.png" alt="Computer Use (English)" width="48%" />
</p>
<p align="center"><sub>侧边栏会话与设置 · Sidebar sessions and settings</sub></p>

- 代码 / Code: `desktop/src/features/computer-use/`，`desktop/src-tauri/src/computer_use/`

---

<h2 id="快速开始">快速开始 · Quick start</h2>

### 安装 · Install

1. 从 [Releases](https://github.com/YangJin-Lei/codexStudy/releases) 或 [Actions 构建产物](https://github.com/YangJin-Lei/codexStudy/actions/workflows/codexstudy-release.yml) 下载安装包
2. 运行 **CodexStudy 图形程序**（不是仅终端的 CLI sidecar）
3. **设置 → Codex** 选择模型提供方，填入 **DeepSeek**（或其他兼容服务）的 API Key
4. 添加本地项目，在编码区开启 **安全模式（Security）**，用 **Process / Terminal** 打开过程窗口

### 自行编译 · Build from source

```shell
# Windows NSIS 安装包
corepack pnpm --dir desktop tauri:build:nsis:win

# 仅 CLI
corepack pnpm --dir desktop package:cli:win
```

未签名包在 Windows / macOS 上可能出现安全提示，安装时选择「仍要运行 / Open anyway」即可。

---

<h2 id="仓库结构">仓库结构 · Repository layout</h2>

```text
codex/
├── desktop/                 # CodexStudy 桌面端
├── codex-rs/codex-new-core/ # 隔离任务、合并、回溯、总结
├── computer-use/            # Computer Use 捆绑资源
├── codex-new.md             # 产品设计
├── docs/CODEXSTUDY.md       # 构建说明
└── docs/images/             # README 配图
```

---

<h2 id="交流">交流 · Community</h2>

- 问题、建议、学习交流：[GitHub Issues](https://github.com/YangJin-Lei/codexStudy/issues)
- 学习交流群二维码：项目关注度提升后会在本节补充（可先 Star 关注更新）

Questions and discussion: [GitHub Issues](https://github.com/YangJin-Lei/codexStudy/issues). A community chat QR code may be added here later.

<!-- 群二维码就绪后取消注释并替换路径：
<p align="center">
  <img src="./docs/images/community-qr.png" alt="CodexStudy 交流群" width="220" />
</p>
-->

---

<h2 id="许可">许可与声明 · License & disclaimer</h2>

- 含基于 [openai/codex](https://github.com/openai/codex) 的代码，遵循上游 **Apache-2.0**
- 产品名 **CodexStudy** 由维护者独立发布，与 OpenAI 官方 Codex **无隶属关系**

---

<h2 id="upstream-openai-codex-reference">上游 OpenAI Codex 参考 · Upstream reference</h2>

<details>
<summary>Official Codex CLI docs (not CodexStudy)</summary>

```shell
npm install -g @openai/codex
# or: brew install --cask codex
```

See [openai/codex](https://github.com/openai/codex) for upstream documentation.

</details>
