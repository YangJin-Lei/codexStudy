<p align="center">
  <strong>CodexStudy</strong><br />
  面向学习与本地开发的 AI 编程桌面环境
</p>

<p align="center">
  <a href="./README.md">English</a> | 简体中文
</p>

<p align="center">
  <a href="https://github.com/YangJin-Lei/codexStudy">GitHub</a> ·
  <a href="https://github.com/YangJin-Lei/codexStudy/releases">Releases</a> ·
  <a href="https://github.com/YangJin-Lei/codexStudy/actions/workflows/codexstudy-release.yml">自动打包</a> ·
  <a href="./docs/CODEXSTUDY.md">构建说明</a> ·
  <a href="./codex-new.md">codex-new 设计</a>
</p>

> **项目说明**  
> 本项目为作者**毕业设计**相关的开源实践，部分功能仍在完善中，**不建议用于生产环境**；问题与建议请走 [Issues](https://github.com/YangJin-Lei/codexStudy/issues)。

---

## CodexStudy 是什么

**CodexStudy** 是一款**本地优先**的 AI 编程环境：提供 **图形桌面端**（Tauri + React）和终端命令 **`codexstudy`**。AI 在隔离副本里改代码，你可以**流式观看过程**、**审核后再合并**、**按文件回溯**，并可选使用 **Computer Use** 控制本机应用。

- 配置目录默认 **`~/.codexStudy`**，与官方 Codex CLI 的 `~/.codex` 隔离
- **大陆用户**：无需 ChatGPT 登录；在 **设置 → Codex** 配置 **DeepSeek** 等 OpenAI 兼容 API 即可；构建说明见 [docs/CODEXSTUDY.md](./docs/CODEXSTUDY.md)

---

## 来源说明

本仓库为**二次开发**作品，在以下项目基础上演进：

| 来源 | 说明 |
|------|------|
| **[openai/codex](https://github.com/openai/codex)** | 核心 Agent、CLI、`codex-rs` 运行时（Apache-2.0） |
| **CodexMonitor** | 早期桌面壳思路；`desktop/` 已 rebranding 为 CodexStudy |
| **[computer-use](./computer-use/)** | 捆绑的 Open Computer Use 插件与 MCP 资源 |

上游 Codex 的安装说明见文末 **[上游参考](#upstream-openai-codex-reference)**，**不是** CodexStudy 的使用前提。

---

## 核心能力（codex-new 安全开发流程）

桌面端 **codex-new**（`desktop/` + `codex-rs/codex-new-core/`）实现「AI 不直接改原项目」的安全流水线。完整设计见 [codex-new.md](./codex-new.md)。

<p align="center">
  <img src="./docs/images/codexNewZH.png" alt="codex-new 安全模式" width="88%" />
</p>

| # | 能力 |
|---|------|
| 1 | **流式过程** — 时间线展示读取、命令、编辑，而非只看最终 diff |
| 2 | **隔离工作区** — 打开项目后自动创建副本（Git worktree 或目录拷贝），AI 只在副本中操作 |
| 3 | **审核合并** — 人工或 AI 审核，测试通过后再合并；支持按文件 / hunk 选择性覆盖 |
| 4 | **回溯** — 后台保存原文件与修改对照（traceback），误合并可恢复 |
| 5 | **任务总结与记忆** — 每轮生成叙述性总结与候选记忆，由你决定是否写入项目记忆 |
| 6 | **隔离测试**（可选） — 在原项目/副本上运行测试；Docker 独立环境为后续扩展 |

相关实现：`desktop/src/features/codex-new/`，`codex-rs/codex-new-core/`（`traceback.rs`、`memory.rs`、`engine.rs`）。

---

## Computer Use（计算机控制）

CodexStudy 捆绑 **Open Computer Use**（`computer-use/`），通过 MCP 在受控工作区内操作桌面应用（浏览器、Office 等），与 codex-new 的文件隔离策略相配合。

<p align="center">
  <img src="./docs/images/computerUseZH.png" alt="Computer Use" width="88%" />
</p>

相关代码：`desktop/src/features/computer-use/`，`desktop/src-tauri/src/computer_use/`

---

## 快速开始

### 安装

1. 从 [Releases](https://github.com/YangJin-Lei/codexStudy/releases) 或 [Actions 构建产物](https://github.com/YangJin-Lei/codexStudy/actions/workflows/codexstudy-release.yml) 下载安装包
2. 运行 **CodexStudy 图形程序**（不要与仅终端的 CLI sidecar 混淆）
3. 在 **设置 → Codex** 选择模型提供方，填入 **DeepSeek**（或其他兼容服务）的 API Key
4. 添加本地项目，在编码区开启 **安全模式（Security）**，用 **Process / Terminal** 打开过程窗口

### 自行编译

```shell
# Windows NSIS 安装包
corepack pnpm --dir desktop tauri:build:nsis:win

# 仅终端 CLI
corepack pnpm --dir desktop package:cli:win
```

未签名安装包在 Windows / macOS 上可能出现安全提示，选择「仍要运行」即可。

---

## 仓库结构

```text
codex/
├── desktop/                 # CodexStudy 桌面端
├── codex-rs/codex-new-core/ # 隔离任务、合并、回溯、总结
├── computer-use/            # Computer Use 捆绑资源
├── codex-new.md             # 产品设计
├── docs/CODEXSTUDY.md       # 构建与 CI
└── docs/images/             # README 配图
```

---

## 交流

- 问题、建议、学习交流：[GitHub Issues](https://github.com/YangJin-Lei/codexStudy/issues)
- 学习交流群二维码：项目关注度提升后会在本节补充（可先 Star 关注更新）

<!-- 群二维码就绪后取消注释：
<p align="center">
  <img src="./docs/images/community-qr.png" alt="CodexStudy 交流群" width="220" />
</p>
-->

---

## 许可与声明

- 含基于 [openai/codex](https://github.com/openai/codex) 的代码，遵循上游 **Apache-2.0** 要求
- 产品名 **CodexStudy** 由维护者独立发布，与 OpenAI 官方 Codex 产品**无隶属关系**

---

## 上游 OpenAI Codex 参考

<details>
<summary>官方 Codex CLI 文档（非 CodexStudy 产品说明）</summary>

```shell
npm install -g @openai/codex
# 或：brew install --cask codex
```

完整上游文档见 [openai/codex](https://github.com/openai/codex)。

</details>
