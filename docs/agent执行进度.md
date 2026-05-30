# Agent 执行进度

## 执行目标
- 按 `codexnew-refactor_8f3d141a.plan.md` 逐项实现。
- 不修改计划文件本身。
- 每个 to-do 在执行时标记 `in_progress`，完成后标记 `completed`。

## 执行状态
- 当前状态：Daemon RPC 工具通道 + Review/Summary 桥接 + RunPanel 产品化（未改上游 `codex-rs/core`）
- 执行方式：在保持稳定性的前提下，持续交付可编译、可回归的增量能力

## To-do 执行记录

### [completed] backend-codexnew-split
- 拆分 `codex_new.rs` 中安全与 command 逻辑到独立模块。
- 原 command 对外签名保持不变，wrapper 化完成。

### [completed] backend-codexnew-frontendstate-extract
- `build_frontend_state` 聚合逻辑拆分为多个 mapping/build 小函数。
- 保持 `CodexNewFrontendState` 输出结构与行为一致。

### [completed] frontend-engine-handler-table
- `useThreadMessaging.ts` 已改为 engine handler table 处理 start/interrupt。
- chat-agent 与 codex_core 路径语义保持一致。

### [completed] frontend-codexnew-tabs-extract
- `CodexNewProcessWindow.tsx` 拆为四个 tab 子组件。
- timeline 子组件中保留并承接 `ChatAgentRunPanel`。

### [completed] frontend-mainapp-codexnew-wiring
- `MainApp.tsx` 中 codex-new 集成 wiring 抽为独立 hook。
- 降低主组件复杂度，不改变渲染输出。

### [completed] frontend-layoutsurfaces-codexnew-props
- `useMainAppLayoutSurfaces.ts` 抽取 codex-new security props 构建函数。
- 减少重复透传逻辑与分散判断。

### [completed] agent-resume-run-e2e
- `chat-agent-core`：`RunLoop::run_with_state`、`ChatAgentRuntime::resume` 从 prior steps 恢复。
- Tauri：`chat_agent_resume_run` 真正 spawn resume；`awaiting_user` 运行保留在 registry。
- 前端：`resumeChatAgentRun` 调 backend 并 refresh。

### [completed] agent-engine-switching-ui
- `ChatAgentSettingsPanel`：engine / maxTurns / showThoughts，持久化 `chat_agent_set_settings`。

### [completed] agent-step-cards-main-thread
- `ChatAgentThreadStepCards` 接入 `Messages.tsx`，监听 `CHAT_AGENT_STATE_EVENT`。

### [completed] agent-core-delegate-phase2
- `CoreDelegate` trait + `Dispatcher` 可选委托；默认仍走本地工具。

### [completed] agent-modularize-tauri-runtime
- `chat_agent/events.rs`、`chat_agent/execution.rs` 拆分；`mod.rs` 保持 command 薄封装。

### [completed] agent-daemon-rpc-review-runpanel-pass
- **Daemon RPC**：`chat_agent_execute_tool`（`rpc/chat_agent.rs`）+ `shared/chat_agent_tool_runner.rs`；Remote 模式 Hybrid 走 `DaemonRpcCoreDelegate`。
- **Review/Summary 桥接**：`ChatAgentCodexNewBridgePanel`（安全模式 armed 时显示 Run review / Write summary / 跳转 Changes）；`requestCodexNewProcessTab` 事件切换 Process 窗口 tab。
- **RunPanel 产品化**：`ChatAgentRunStepsSection`、`ChatAgentAwaitingUserReply` 复用 `ChatAgentStepCard`+`ChatAgentObservationView`；主线程 step cards 同步桥接面板。

### [completed] agent-product-observation-and-awaiting-ui
- `ChatAgentObservationView`：展开 artifacts、spill 路径、stdout/stderr 截断说明（对齐 Goose spill 产品体验）。
- `ChatAgentAwaitingUserBanner`：主消息区底部（靠近 composer）提示 `awaiting_user` 与问题文案。
- `useChatAgentThreadRun`：线程级 run 订阅复用；`observationPresentation.ts` 解析截断/spill 元数据。
- `codex_delegate` 拆为 `read.rs` + `shell.rs` + `mod.rs`，控制单文件规模。

### [completed] agent-phase2-core-delegate-hybrid
- **Hybrid 引擎**：设置 `enginePreference: hybrid` → Chat Agent 编排 + `CodexCoreDelegate` 执行 `ReadFile` / `EditFile` / `RunCommand`（`SearchCode` 仍本地 rg）。
- **模块**：`chat_agent/codex_delegate/`（`mod.rs` + `shell.rs`）、`runtime_factory.rs`；run context 持久化 `core_delegate` 供 resume 复用。
- **安全模式 shell**：经 `codex-new-core::run_command_request` 落盘 stdout/stderr，再经 spill 截断提示。
- **Goose spill**：`executor/output_spill.rs`，大输出写入 `.codex/chat-agent-spill/{runId}/*.log` 并附读取提示。
- **Resume / Interrupt**：主会话 `awaiting_user` 走 resume；loop 在工具执行后检查 cancel；resume 复用同一 delegate。

### [completed] agent-flow-hardening-next
- **主会话 composer**：`useThreadMessaging` 在 `awaiting_user` 时走 `resumeChatAgentRun`，避免重复 `start_run`；进行中 run 会 blocked 提示。
- **路由辅助**：`threadSendAction.ts` 集中 `resolveChatAgentThreadSend`。
- **状态乐观更新**：`resumeChatAgentRun` 先 patch 为 `running` 并清 `awaitingUserQuestion`。
- **Goose 工具语义**（`external/Goose` 只读参考）：
  - `executor/edit_replace.rs`：唯一匹配 / 无匹配预览 / 多匹配行上下文（对齐 `developer/edit.rs`）。
  - `executor/output_limits.rs` + `command_tools`：50KB / 2000 行截断策略（对齐 `developer/shell.rs` 常量）。

### [completed] workbench-product-shape-pass-1
- 抽取 `useWorkbenchHotkeys`，统一快捷键入口，新增会话切换快捷键事件派发。
- 新增 `services/uiEvents.ts`，定义会话导航事件，解耦 Workbench 与 SessionWorkbench。
- `SessionWorkbench` 实现基于事件的前后会话激活切换逻辑。
- `WorkbenchShell` 增加手动刷新能力（`refreshCodexNewChanges`）。
- `DualTreePanel` 从单列表升级为双分区视图（Original Project / Isolated Clone）。
- 左/中/右面板补齐可编程聚焦支撑，保证快捷键聚焦行为一致。

### [completed] agent-tool-approval-and-reattach
- **Goose 风格工具审批**（参考 `external/Goose/.../ToolApprovalButtons.tsx`）：
  - `session/tool_approval.rs`：Access mode → Auto / On-Request / Read-only 策略。
  - `RunStatus::AwaitingToolApproval` + `resume_pending_tool` / `confirm_pending_tool`。
  - On-Request：`edit_file` / `run_command` 暂停并 emit `chat-agent-tool-approval-required`。
  - Full access：自动执行；Read-only：自动拒绝 mutating 工具。
- **前端**：`ChatAgentToolApprovalBanner`（Allow once / Deny）、`ChatAgentRunPhaseStrip`（planning/executing 阶段提示）。
- **线程 reattach**：`chat_agent_list_thread_runs` + `useChatAgentThreadSync` 从 backend registry 恢复 in-flight 状态。
- **Composer access mode** 传入 `startChatAgentRun` → backend `tool_approval_policy`。

### [completed] agent-execution-blocking-lock-fix
- **根因**：`execution.rs` 在 tokio async worker 内对 `tokio::sync::Mutex` 调用 `blocking_lock()`，触发 panic：`Cannot block the current thread from within a runtime`，导致 Chat Agent 一发消息就卡死 Working。
- **修复**：`RunState` 改用 `std::sync::Mutex`（`SharedRunState`），同步 callback 内直接 `.lock()`，registry 仍用 `tokio::sync::Mutex`。

### [completed] agent-run-lifecycle-supersede
- **Working 卡住**：Chat Agent 发送 blocked 时未 `markProcessing(false)`，线程永久 Working；已修复。
- **暂停无效 / 新任务续跑旧任务**：Stop 仅清 UI turn，后台 run 与 localStorage 仍 in-flight；新 send 被 blocked 或并行续跑。
- **修复**：
  - `chatAgentRunLookup.ts` / `chatAgentRunControl.ts`：按 thread 解析 active/in-flight run，批量 cancel。
  - `useThreadMessaging`：blocked 时 cancel 重试；start 前 supersede；interrupt 按 thread fallback cancel。
  - 后端 `start_run`：`cancel_in_flight_for_thread` 对齐 Goose/OpenHands「新任务取代旧 run」语义。

### [completed] agent-main-thread-ux-pass
- **主会话顶部**：去掉 Codex New 工作流桥接与大块 RunPanel 重复 UI；仅保留运行中 compact step strip（完整面板仍在 Timeline）。
- **Composer 下方**：新增 `ChatAgentComposerEngineSelect`（Auto / Chat Agent / Hybrid / Codex Core），与 access mode 并列。
- **awaiting_user 修复**：Tauri `execution.rs` 在 step/status 回调中同步 `run_state`，resume 不再报 *not awaiting user input*。
- **发送逻辑**：`threadSendAction` 在 `awaitingUserQuestion` 存在时走 resume。

### [completed] agent-thread-history-mirror
- **问题**：Chat Agent 路径不向 `itemsByThread` 写入消息；step strip 仅在 in-flight 显示，完成后主会话空白（见 `docs_problem/agent开发问题.md` CA-20260528-01）。
- **修复**：
  - `addUserMessage` reducer；`chatAgentThreadMirror` + `chatAgentMirrorLedger` + `useChatAgentThreadMirror`。
  - `useThreadMessaging`：`chat_agent` start/resume 时 mirror 用户消息。
  - 切换线程时 hydration 从 `chat-agent.runs.v1` 恢复问答摘要。
  - `ChatAgentAwaitingUserBanner` 不再重复展示问题全文（问题在消息气泡中）。
  - `state.ts` 损坏的 import 行已修复。

### [completed] agent-persistence-and-inline-steps
- **重启丢对话**：`chat-agent.thread-items.v1` 持久化 + `useChatAgentThreadItemsPersistence`（CA-10）。
- **Step 卡片置顶/发白**：按用户轮次内联 `ChatAgentInlineStepStrip`；暗色主题样式修复（CA-11）。

### [completed] agent-chat-agent-ux-fixes-pass2
- **New Agent 命名**：Chat Agent 首条消息触发 `onUserMessageCreated` → `generateRunMetadata` 自动标题（CA-07）。
- **重复回复**：ask step + awaiting 双 mirror → 内容 hash 去重，仅 awaiting/finished 实时 mirror（CA-08）。
- **Access mode on resume**：resume 传入当前 composer `accessMode`，后端重算 `tool_approval_policy`（CA-09）；Codex Core 每 turn 自带 mode 不受影响。

## 质量校验
- 前端改动文件静态诊断：无新增 lints。
- 前端类型检查：通过（`npm --prefix desktop run typecheck`）。

## 备注
- 本文档仅记录本轮 refactor 计划执行情况。
- 当前已从“纯等价重构”进入“目标产品形态增强”，后续将继续以小步快跑方式推进复杂能力，避免大爆炸式改动。

