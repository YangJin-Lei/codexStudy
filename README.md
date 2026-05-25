<p align="center">
  <strong style="font-size: 1.35em;">CodexStudy</strong><br />
  <sub>Local-first · Learn by building · Ready for mainland China</sub>
</p>

<p align="center">
  <strong>AI coding desktop for learning and local development</strong><br />
  Your code stays on disk; the agent edits a sandbox copy—you review, then merge.
</p>

<p align="center">
  <code>local data</code> · <code>safe sandbox</code> · <code>DeepSeek</code> · <code>graduation OSS</code>
</p>

<p align="center">
  English | <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/YangJin-Lei/codexStudy">GitHub</a> ·
  <a href="https://github.com/YangJin-Lei/codexStudy/releases">Releases</a> ·
  <a href="https://github.com/YangJin-Lei/codexStudy/actions/workflows/codexstudy-release.yml">CI Builds</a> ·
  <a href="./docs/CODEXSTUDY.md">Build Guide</a> ·
  <a href="./codex-new.md">codex-new Design</a>
</p>

> **🇨🇳 Mainland China**  
> No ChatGPT or overseas account required. Open **Settings → Codex**, pick **DeepSeek** (or any OpenAI-compatible API), add your key, and start.  
> Config is separate from upstream Codex CLI (`~/.codexStudy` by default). See [docs/CODEXSTUDY.md](./docs/CODEXSTUDY.md).

> **Notice**  
> This repo supports the author's **graduation project**. Features are still evolving and it is **not production-ready**. Please use [Issues](https://github.com/YangJin-Lei/codexStudy/issues) for feedback.

---

## What is CodexStudy

**CodexStudy** = **desktop app** (Tauri + React) + **`codexstudy`** CLI for **students, thesis work, and self-paced learning**:

| You care about | How we handle it |
|----------------|------------------|
| **Local-first** | Projects, sandbox copies, snapshots, and task logs stay on your machine by default |
| **Learning** | Stream the full process; roll back mistakes—built for practice, not black-box edits |
| **Mainland China** | **DeepSeek** and other domestic-friendly OpenAI-compatible APIs—no ChatGPT login |

Optional **Computer Use** automates desktop apps (browser, Office, etc.) inside a controlled workspace, alongside file isolation.

---

## Attribution

This is a **derivative work** built on:

| Source | Notes |
|--------|--------|
| **[openai/codex](https://github.com/openai/codex)** | Core agent, CLI, `codex-rs` runtime (Apache-2.0) |
| **CodexMonitor** | Early desktop shell ideas; `desktop/` rebranded as CodexStudy |
| **[computer-use](./computer-use/)** | Bundled Open Computer Use plugin and MCP resources |

Upstream Codex install docs are in **[Upstream reference](#upstream-openai-codex-reference)** at the end—they are **not** required to use CodexStudy.

---

## Features (codex-new safe workflow)

If you have ever let an agent edit your repo in place, you have probably said something like this—**maybe not out loud, but definitely in your head**:

> **“Why the fuck did you delete my files?!”**  
> **“Where the fuck did my source code go?!”**  
> **“I asked for one line. Why did you rewrite half the fucking project?”**  
> **“I merged and *then* noticed everything is wrong. Git says clean working tree. What the fuck.”**  
> **“My UI is in Chinese. Why is the approval dialog in fucking English?”**

So we built **codex-new safe mode**: not to make the AI timid—to keep your **real project alive** until you explicitly accept changes.

<p align="center">
  <img src="./docs/images/codexNewEN.png" alt="codex-new safe mode" width="88%" />
</p>

| What you shouted | What we shipped |
|------------------|-----------------|
| “Stop fucking touching my main tree!” | **Isolated workspace** — the agent writes only to a copy |
| “Deletes are permanent?” | **Review before merge** — nothing hits the main project until you approve |
| “Undo after merge?” | **Rollback** — pre-merge snapshots; per file or per hunk |
| “I can’t see what it did” | **Streaming process** — reads, commands, and edits on a timeline |
| “What about files deleted only in the copy?” | **Edit traceback** — project vs copy pairs; restore before/after merge |
| “Tests failed—why merge?” | **Isolated testing** (optional) — run commands first, merge later |
| “What did it remember?” | **Summaries & memory** — you choose what gets written |

Stack: `desktop/` + `codex-rs/codex-new-core/`. Design: [codex-new.md](./codex-new.md). Code: `traceback.rs`, `memory.rs`, `engine.rs`.

**TL;DR:** the agent can experiment in a sandbox; **your main project moves only when you merge.**

---

## Computer Use

CodexStudy bundles **Open Computer Use** (`computer-use/`) to operate desktop apps (browser, Office, etc.) via MCP inside a controlled workspace, alongside codex-new file isolation.

<p align="center">
  <img src="./docs/images/computerUseEN.png" alt="Computer Use" width="88%" />
</p>

Code: `desktop/src/features/computer-use/`, `desktop/src-tauri/src/computer_use/`

---

## Quick start

### Install

1. Download from [Releases](https://github.com/YangJin-Lei/codexStudy/releases) or [Actions artifacts](https://github.com/YangJin-Lei/codexStudy/actions/workflows/codexstudy-release.yml)
2. Run the **CodexStudy desktop app** (not the CLI sidecar alone)
3. **Settings → Codex** — choose a provider and enter your **DeepSeek** (or compatible) API key
4. Add a local project, enable **Security mode** in the coding panel, open **Process / Terminal** for the live workflow window

### Build from source

```shell
# Windows NSIS installer
corepack pnpm --dir desktop tauri:build:nsis:win

# CLI only
corepack pnpm --dir desktop package:cli:win
```

Unsigned builds may show security prompts on Windows/macOS—choose **Run anyway** / **Open anyway**.

---

## Repository layout

```text
codex/
├── desktop/                 # CodexStudy desktop (Tauri + React)
├── codex-rs/codex-new-core/ # Isolated tasks, merge, rollback, summaries
├── computer-use/            # Computer Use bundle
├── codex-new.md             # Product design
├── docs/CODEXSTUDY.md       # Build & CI
└── docs/images/             # README screenshots
```

---

## Community

- Questions and discussion: [GitHub Issues](https://github.com/YangJin-Lei/codexStudy/issues)
- Community chat QR code may be added here when the project gains more traction (Star to follow updates)

<!-- When ready, uncomment:
<p align="center">
  <img src="./docs/images/community-qr.png" alt="CodexStudy community chat" width="220" />
</p>
-->

---

## License & disclaimer

- Contains code from [openai/codex](https://github.com/openai/codex), under upstream **Apache-2.0** terms
- **CodexStudy** is independently maintained and **not affiliated** with OpenAI's official Codex product

---

## Upstream OpenAI Codex reference

<details>
<summary>Official Codex CLI docs (not CodexStudy)</summary>

```shell
npm install -g @openai/codex
# or: brew install --cask codex
```

See [openai/codex](https://github.com/openai/codex) for upstream documentation.

</details>
