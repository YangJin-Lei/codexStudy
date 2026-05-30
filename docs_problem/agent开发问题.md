# Chat Agent 开发问题追踪

> 记录 Chat Agent 产品化过程中的问题、根因、修复与验证。  
> 同一条目可能经历多轮迭代，请在对应章节追加 **修订记录**，不要覆盖历史。

---

## 如何使用本文档

| 字段 | 说明 |
|------|------|
| **ID** | 稳定编号，格式 `CA-YYYYMMDD-NN` |
| **状态** | `open` / `fixed` / `regression` / `wontfix` |
| **症状** | 用户可见现象（可附截图编号） |
| **根因** | 技术原因（尽量具体到文件/机制） |
| **修复** | 改动摘要 + 涉及文件 |
| **验证** | 如何确认已解决 |
| **修订记录** | 每次追加一行：`日期 — 说明` |

---

## 问题索引

| ID | 标题 | 状态 | 最后更新 |
|----|------|------|----------|
| [CA-20260528-01](#ca-20260528-01-主会话无聊天历史) | 主会话无聊天历史 | fixed | 2026-05-28 |
| [CA-20260528-02](#ca-20260528-02-一发消息就永久-working) | 一发消息就永久 Working | fixed | 2026-05-28 |
| [CA-20260528-03](#ca-20260528-03-暂停无效--新任务被-blocked) | 暂停无效 / 新任务被 blocked | fixed | 2026-05-28 |
| [CA-20260528-04](#ca-20260528-04-主线程-step-卡片过多) | 主线程 step 卡片过多 | fixed | 2026-05-28 |
| [CA-20260528-05](#ca-20260528-05-full-access-仍弹确认) | Full access 仍弹确认 | open | 2026-05-28 |
| [CA-20260528-06](#ca-20260528-06-工具审批与线程-reattach) | 工具审批与线程 reattach | fixed | 2026-05-28 |
| [CA-20260528-07](#ca-20260528-07-对话仍显示-new-agent) | 对话仍显示 New Agent | fixed | 2026-05-28 |
| [CA-20260528-08](#ca-20260528-08-助手回复重复两遍) | 助手回复重复两遍 | fixed | 2026-05-28 |
| [CA-20260528-09](#ca-20260528-09-resume-不刷新-access-mode) | resume 不刷新 access mode | fixed | 2026-05-28 |
| [CA-20260528-10](#ca-20260528-10-重启后对话消失) | 重启后对话消失 | fixed | 2026-05-28 |
| [CA-20260528-11](#ca-20260528-11-step-卡片置顶且发白) | step 卡片置顶且发白 | fixed | 2026-05-28 |

---

## CA-20260528-01 主会话无聊天历史

**状态：** `fixed`

### 症状

- 运行中：主区域显示大量 Ask/Shell step 卡片 +「规划中…」（截图 1）。
- 等待回复：只剩紫色 awaiting 横幅，**看不到之前问答**（截图 2）。
- 多轮后：整页空白，仅「Send a prompt to the agent」（截图 3）。

### 根因

1. `chat_agent` 发送路径（`useThreadMessaging.ts`）**未**像 `codex_core` 那样向 `itemsByThread` 写入用户/助手消息。
2. `ChatAgentThreadStepCards` 仅在 **in-flight** 时渲染；`awaiting_user` / `completed` 后 step strip 隐藏，线程无可见内容。
3. Chat Agent 运行状态存于 `localStorage`（`chat-agent.runs.v1`），与主线程消息列表未桥接。

### 修复

| 模块 | 改动 |
|------|------|
| `threadItemsSlice` + `useThreadsReducer` | 新增 `addUserMessage` |
| `chatAgentMirrorLedger.ts` | 去重 ledger（避免重复插入） |
| `chatAgentThreadMirror.ts` | 从 run / event 提取可展示文案 |
| `useChatAgentThreadMirror.ts` | 事件订阅 + 线程 hydration |
| `useThreadMessaging.ts` | `chat_agent` start/resume 时 mirror 用户消息 |
| `ChatAgentAwaitingUserBanner.tsx` | 问题已在消息区展示时仅保留简短提示 |

### 验证

- [ ] 发送消息后主区域出现用户气泡。
- [ ] Agent 提问（awaiting_user）后出现助手气泡；awaiting 横幅不重复大段文案。
- [ ] Run 完成后历史仍保留；刷新页面后 hydration 从 run store 恢复对话摘要。
- [ ] `npm --prefix desktop run typecheck` 通过。

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | 初版：定位根因，实施 thread mirror + hydration |

---

## CA-20260528-02 一发消息就永久 Working

**状态：** `fixed`

### 症状

选择 Chat Agent 发送任意消息后，底部长期显示 Working / 规划中，run 无进展。

### 根因

`desktop/src-tauri/src/chat_agent/execution.rs` 在 tokio async worker 内对 `tokio::sync::Mutex` 调用 `blocking_lock()` → panic：*Cannot block the current thread from within a runtime*。

### 修复

- `runs.rs`：`SharedRunState = Arc<std::sync::Mutex<RunState>>`
- 同步 callback 使用 `.lock()`；registry 仍用 `tokio::sync::Mutex`

### 验证

- [x] `cargo check`（desktop tauri）通过
- [ ] 本地发送消息 run 能进入 planning/executing 并结束或 awaiting

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | mutex 类型修复 |

---

## CA-20260528-03 暂停无效 / 新任务被 blocked

**状态：** `fixed`

### 症状

- Stop 后 UI 不再 Working，但后台 run 仍 in-flight。
- 新消息被 blocked，或旧 run 与新 run 并行。

### 根因

Stop 仅清 `activeTurnId`；localStorage 与 backend registry 中 run 未 supersede。

### 修复

- `chatAgentRunLookup.ts` / `chatAgentRunControl.ts`
- `useThreadMessaging`：blocked 时 cancel 重试；start 前 supersede
- 后端 `start_run`：`cancel_in_flight_for_thread`

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | supersede 语义对齐 Goose「新任务取代旧 run」 |

---

## CA-20260528-04 主线程 step 卡片过多

**状态：** `fixed`

### 症状

主会话顶部堆满 Ask/Shell 大卡片，挤占正常对话区域。

### 修复

- `Messages.tsx`：去掉 Codex New 桥接重复 UI
- `ChatAgentThreadStepCards`：仅 **in-flight** 显示 compact strip；完整面板在 Timeline

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | 主线程 UX pass |

---

## CA-20260528-05 Full access 仍弹确认

**状态：** `open`（部分场景已在 CA-09 修复）

### 症状

Composer 选 Full access，执行 edit/shell 仍出现确认弹窗；或 On-Request 下 resume 仍不提示。

### 可能原因（待验证）

- ~~UI access mode 未传入 `startChatAgentRun`~~（start 已传）
- **resume 沿用首次 start 的 policy**（见 CA-09，已修）
- On-Request 仅对 `run_command` / `edit_file` 审批，`read_file` / `search_code` 不弹窗（设计如此）

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | 记录待查项 |
| 2026-05-28 | CA-09：resume 刷新 access mode；浏览若仅 read/search 则属预期 |

---

## CA-20260528-06 工具审批与线程 reattach

**状态：** `fixed`

### 症状

切换对话再回来 in-flight run 丢失；On-Request 下 mutating 工具无审批 UI。

### 修复

- Core：`AwaitingToolApproval` + `confirm_pending_tool`
- Tauri：`chat_agent_confirm_tool`、`chat-agent-tool-approval-required`
- 前端：`ChatAgentToolApprovalBanner`、`useChatAgentThreadSync`

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | Goose 风格审批 + reattach |

---

## CA-20260528-07 对话仍显示 New Agent

**状态：** `fixed`

### 症状

Chat Agent 新对话发送首条消息后，侧栏仍显示 **New Agent**，不像 codex_core 那样自动生成标题（如「你好」）。

### 根因

`useThreadTitleAutogeneration.onUserMessageCreated` 仅由服务端 `upsertItem` 触发；Chat Agent 走 `addUserMessage` mirror，未触发 autogen。

### 修复

`useThreadMessaging` 在 `chat_agent` start/resume mirror 用户消息后调用 `onUserMessageCreated`。

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | 接入 title autogen |

---

## CA-20260528-08 助手回复重复两遍

**状态：** `fixed`

### 症状

同一句助手问候（如 ask_user）在主会话出现 **两条相同气泡**。

### 根因

`ask_user` step 与 `chat-agent-awaiting-user` 事件各 mirror 一次，ledger key 不同导致去重失败。

### 修复

- 统一 `assistant:content:{runId}:{hash}` 内容去重
- 实时 mirror 仅保留 `awaiting` / `finished` 事件，移除 step-added 双写

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | 内容 hash 去重 + 单路径 mirror |

---

## CA-20260528-09 resume 不刷新 access mode

**状态：** `fixed`

### 症状

首次 **Full access** 开 run，切 **On-Request** 后在同 run 内 resume（如「浏览整个项目」），shell 直接执行无审批。

### 根因

`chat_agent_resume_run` 使用 `record.context.request` 克隆，**tool_approval_policy 冻结在首次 start**。

### 修复

- `ResumeChatAgentRunInput.access_mode`
- resume 时按当前 composer `accessMode` 重算 `ToolApprovalPolicy`
- 前端 `resumeChatAgentRun(runId, text, accessMode)`

### 说明

- **Codex Core**：每次 `turn/start` 带当前 access mode，无此问题。
- **On-Request**：仅 `run_command` / `edit_file` 需确认；纯 `read_file`/`search_code` 浏览不弹窗（Goose 对齐）。

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | resume 传递并应用 access mode |

---

## CA-20260528-10 重启后对话消失

**状态：** `fixed`

### 症状

应用重启后，Chat Agent 对话内容为空（侧栏线程可能还在）。

### 根因

- 消息只存在内存 `itemsByThread`，未持久化。
- `thread/resume` 从服务端拉取 items；Chat Agent 未写入服务端 thread items → 重启后为空。

### 修复

- `chatAgentThreadItemsStorage.ts`：`localStorage` 键 `chat-agent.thread-items.v1`
- `useChatAgentThreadItemsPersistence`：切换线程时恢复；有 Chat Agent 活动时自动保存

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | 本地持久化 thread items |

---

## CA-20260528-11 step 卡片置顶且发白

**状态：** `fixed`

### 症状

Shell/Read 执行卡片固定在聊天**最顶部**；卡片背景偏白，暗色主题下难读。

### 根因

- `Messages.tsx` 在 `groupedItems` 之前渲染 `ChatAgentThreadStepCards`。
- `.chat-agent-step-card` 使用 `--cm-surface-base, #fff` 回退为白色。

### 修复

- `ChatAgentInlineStepStrip`：按用户轮次嵌在对应用户消息下方（`chatAgentStepSegments.ts`）。
- 暗色主题 CSS：`--cm-surface-panel` / `--text-strong` / semantic 颜色变量。

### 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | 内联 step + 主题色修复 |

---

## 待办（产品级，非 MVP）

| 优先级 | 项 | 参考 |
|--------|-----|------|
| P1 | 线程历史持久化与服务端 thread items 对齐 | app-server v2 |
| P1 | Full access 确认弹窗根因（CA-05） | tool_approval |
| P2 | Edit diff 产物展示 | Goose DiffViewer |
| P2 | 运行中「Stop and send now」消息队列 | Goose MessageQueue 模式 |
| P2 | Planner 流式 step / 取消 in-flight HTTP | chat-agent-core |
| P3 | 完成后折叠 run 摘要卡片（Timeline 已有完整 steps） | — |

---

## 变更日志（文档本身）

| 日期 | 说明 |
|------|------|
| 2026-05-28 | 创建文档；收录 blocking_lock、历史丢失、supersede、UX 等问题 |
