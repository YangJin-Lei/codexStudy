# codex-new 桌面端完整架构与产品设计

## 1. 项目定位

`codex-new` 不是简单复刻 Codex Desktop，也不是只给 Codex CLI 套一层桌面壳。它的定位是：

> 一个本地优先、隔离执行、可审计、可回溯、可选择性合并的 AI 编程桌面系统。

传统 AI 编程工具的核心体验是“让 AI 直接改项目”。`codex-new` 的核心体验是“让 AI 在隔离副本中工作，用户观察过程、审核结果、测试验证、选择性合并，并且每一步都能回溯”。

这意味着 `codex-new` 不是单纯追求更快自动改代码，而是把 AI 编程变成一个安全的本地变更流水线：

1. 原项目永远默认只读。
2. 每个 AI 任务都有独立工作区。
3. AI 的读取、思考、命令、编辑、测试都被流式记录。
4. 结果以 diff、快照、摘要、测试报告、审计清单呈现。
5. 用户只把确认过的部分合并回原项目。
6. 即使误合并，也可以通过回溯记录恢复。

## 2. 产品原则

### 2.1 本地优先

项目文件、任务记录、快照、diff、总结、测试结果默认保存在本机。除模型请求、网页搜索、用户显式启用的远程服务外，不主动上传项目内容。

### 2.2 原项目保护

AI 不能直接写原项目。所有 agent 写入都发生在隔离工作区中。原项目只有在用户审核并确认合并后才会被修改。

### 2.3 过程可见

AI 写代码的过程不是黑箱。用户应能看到：

- AI 正在读哪些文件。
- AI 正在计划什么。
- AI 正在调用什么工具。
- AI 正在修改哪些文件。
- AI 正在运行什么命令。
- 测试失败在哪里。
- AI 如何根据失败再次修复。

### 2.4 审核优先

任何进入原项目的代码都必须经过审核层。审核可以是：

- 用户手动审核。
- AI 自动 reviewer。
- 测试通过门禁。
- 用户配置的项目规则。

但最终默认仍由用户确认。

### 2.5 可回溯

每次合并都必须可撤销。回溯不是简单依赖 Git，因为用户项目可能没有 Git，或者用户可能误操作。`codex-new` 需要维护自己的变更日志、文件快照和 patch 记录。

### 2.6 记忆可控

AI 总结和记忆不是自动无限写入。长期记忆必须可查看、可编辑、可禁用、可删除。任务总结和长期项目记忆分离。

### 2.7 跨平台一致

Windows、macOS、Linux 都是一等平台。核心能力不依赖某个平台独有的桌面 API。

## 3. 总体技术可行性

`codex-new` 可以基于当前开源 Codex 构建。已有能力包括：

- `codex app-server`：本地 JSON-RPC 后端，提供 thread、turn、item、文件、命令、模型、账号、配置等能力。
- `codex-core`：agent 会话、工具调用、sandbox、MCP、skills、plugins、rollout。
- `codex-app-server-protocol`：桌面客户端可生成/复用的协议类型。
- `codex-cli`：登录、配置、sandbox、exec、app-server 启动能力。

缺失的是官方桌面客户端 UI 源码。因此 `codex-new` 应实现自己的桌面客户端，并把 Codex 作为 agent/runtime 底座。

## 4. 推荐技术栈

### 4.1 桌面框架

推荐：Tauri 2

原因：

- 支持 Windows/macOS/Linux。
- Rust 后端与 Codex Rust 生态天然匹配。
- 包体积比 Electron 小。
- 能安全管理本地文件、进程、sidecar。
- 适合本地优先产品。

备选：Electron

优点是开发快、生态成熟。缺点是包体积大、资源占用高，并且与 Codex Rust 运行时之间需要更多进程桥接。

最终建议：

> 使用 Tauri 2 + React + TypeScript + Rust sidecar。

### 4.2 前端

- React + TypeScript
- TanStack Query：客户端请求状态管理
- Zustand 或 Jotai：本地 UI 状态
- Monaco Editor：代码查看、diff、文件预览
- CodeMirror 可作为轻量备选
- xterm.js：命令输出/交互终端
- shadcn/ui 或自研组件系统：统一控件
- lucide-react：图标系统

### 4.3 后端

- Tauri Rust commands：桌面壳本地能力
- Codex app-server sidecar：AI agent 后端
- SQLite：任务、线程、索引、审计记录
- 文件系统存储：快照、patch、摘要、测试日志
- Git CLI/libgit2：worktree、diff、apply、status
- Docker/Podman CLI：仅作为未来占位能力，第一阶段不开发、不作为 MVP 依赖

### 4.4 通信

前端与 Tauri 后端：

- Tauri commands：请求/响应
- Tauri events：流式事件、任务状态、工具调用、文件变化

Tauri 后端与 Codex：

- 优先使用 `codex app-server --listen stdio://`
- 后续可支持 `ws://127.0.0.1:<port>`

## 5. 仓库与工程结构

建议在当前仓库新增：

```text
desktop/
  package.json
  src/
    main.tsx
    app/
      App.tsx
      routes.tsx
      layout/
      providers/
    features/
      chat/
      codexNew/
      projects/
      tasks/
      review/
      timeline/
      diffs/
      memory/
      testing/
      settings/
      plugins/
      skills/
      search/
    components/
      ui/
      icons/
      editor/
      terminal/
      split-pane/
    services/
      tauriClient.ts
      appServerClient.ts
      eventBus.ts
    stores/
    styles/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/
      main.rs
      commands/
        mod.rs
        project.rs
        task.rs
        review.rs
        memory.rs
        testing.rs
        settings.rs
      core/
        mod.rs
        app_server.rs
        event_bridge.rs
        project_registry.rs
        workspace_manager.rs
        task_orchestrator.rs
        review_engine.rs
        merge_engine.rs
        rollback_engine.rs
        memory_engine.rs
        test_engine.rs
        audit_log.rs
        policy.rs
        file_snapshot.rs
        git_adapter.rs
        docker_adapter.rs
        platform.rs
      db/
        schema.sql
        migrations/
      resources/
        bundled-codex/
  README.md
```

如果希望和 Codex Rust workspace 更深集成，也可以新增：

```text
codex-rs/codex-new-core/
codex-rs/codex-new-desktop-bridge/
```

但第一阶段建议把桌面端独立放在 `desktop/`，通过 `codex app-server` 协议集成，避免直接侵入 Codex core。

## 6. 桌面端 UI 设计

第一版 UI 的目标不是重新发明一套界面，而是尽量贴近截图中的 Codex Desktop 体验。后续可以重新设计品牌、交互和视觉语言，但第一阶段必须先保证用户一眼能理解：这是一个“Codex 桌面端增强版”，而不是一个完全陌生的新工具。

第一版 UI 硬性要求：

- 整体布局与截图保持一致：左侧导航、中间对话主视图、右侧详情面板、底部输入框。
- 视觉风格与截图保持高度相似：浅色、低对比、圆角、细分割线、轻量图标、克制阴影。
- 左侧项目列表、会话列表、设置入口保持截图类似的信息密度。
- 中间对话流保持截图类似的阅读体验，默认不变成复杂 IDE。
- 右侧详情面板保持截图中的卡片式浮层风格。
- 新增理念全部收敛到右侧 `codex-new` 按钮和对应面板中，不破坏主聊天体验。
- 后续重设计之前，不做大面积炫技视觉效果。

截图中的当前桌面布局可以抽象为：

```text
┌────────────────────────────────────────────────────────────────────┐
│ 顶部系统栏 / 菜单栏                                                  │
├───────────────┬─────────────────────────────────────┬──────────────┤
│ 左侧导航       │ 中间对话/任务主视图                  │ 右侧详情面板  │
│ 新对话         │                                     │ 分支详情      │
│ 搜索           │                                     │ 变更          │
│ 技能           │                                     │ Git 操作      │
│ 插件           │                                     │ 生成结果      │
│ 自动化         │                                     │ 来源          │
│ 项目列表       │                                     │              │
│ 设置           │                                     │              │
├───────────────┴─────────────────────────────────────┴──────────────┤
│ 底部输入框 / 权限 / 模型 / 分支 / 本地模式                           │
└────────────────────────────────────────────────────────────────────┘
```

`codex-new` 需要在这个布局基础上增加一个明确入口：

```text
右侧详情面板顶部：

[变更] [Git 操作] [测试] [记忆] [回溯] [codex-new]
```

或者作为右上角独立按钮。第一版推荐使用右侧详情面板顶部 tab/按钮，保证和截图中的右侧面板结构一致：

```text
┌───────────────────────────────┐
│ 分支详情              [pin]    │
│ [变更] [Git] [测试] [codex-new]│
└───────────────────────────────┘
```

点击 `codex-new` 后，右侧面板切换为新的安全工作流控制台。

### 6.1 主界面区域

#### 左侧导航

保留截图风格：

- 新对话
- 搜索
- 技能
- 插件
- 自动化
- 项目
- 设置

新增：

- codex-new 工作台
- 审核队列
- 回溯记录
- 任务记忆
- 测试环境

#### 中间主视图

中间区域仍是对话和 agent 输出，但需要增强为“过程流”：

每个任务 turn 以时间线方式呈现：

```text
用户目标
  ↓
AI 计划
  ↓
读取文件
  ↓
编辑文件
  ↓
运行命令
  ↓
测试结果
  ↓
生成 diff
  ↓
等待审核
```

每个步骤都可以展开：

- 读取文件：显示文件路径、读取片段、原因。
- 编辑文件：显示文件、hunk、实时生成状态。
- 命令执行：显示命令、cwd、耗时、退出码、stdout/stderr。
- 测试：显示测试名称、失败摘要、日志。
- 总结：显示 AI 对本轮任务的可读总结。

#### 右侧详情面板

右侧详情面板是 `codex-new` 的关键控制区。默认展示当前分支详情；点 `codex-new` 后展示：

```text
codex-new

任务状态
  隔离工作区: 已创建
  原项目保护: 开启
  AI 写入: 仅副本
  测试门禁: 未运行 / 已通过 / 失败

工作流
  1. 创建副本        done
  2. AI 执行任务      running
  3. 生成变更        pending
  4. 审核            pending
  5. 测试            pending
  6. 合并到原项目     locked

操作
  查看隔离副本
  打开 diff
  运行测试
  AI 审核
  选择性合并
  回滚本次合并
  生成任务总结
```

### 6.2 codex-new 面板子视图

`codex-new` 面板不是一个可选增强，而是本产品的核心区。第一版必须实现下面这些子视图中的核心闭环：工作区、过程、变更、审核、回溯、记忆。测试视图只实现本机测试占位和结果记录，Docker/devcontainer 只显示“未来能力/占位”，不进入第一阶段开发。

#### 6.2.1 工作区视图

展示：

- 原项目路径
- 隔离副本路径
- 创建方式：git worktree / clone / copy
- 分支名
- 当前任务 ID
- 文件变更数量
- 未跟踪文件数量
- 与原项目是否发生冲突

#### 6.2.2 过程视图

展示 agent 执行过程：

- 计划
- 文件读取
- 命令执行
- 文件编辑
- 测试
- 错误恢复
- 最终回答

#### 6.2.3 变更视图

功能：

- 文件级 diff
- hunk 级接受/拒绝
- 行级接受/拒绝
- 新文件预览
- 删除文件确认
- 二进制文件确认
- 重命名识别
- 冲突提示

#### 6.2.4 审核视图

功能：

- AI reviewer 结果
- 用户 reviewer checklist
- 风险分级
- 安全检查
- API 破坏性检查
- 测试覆盖提示
- 待确认问题

#### 6.2.5 测试视图

功能：

- 自动识别测试命令
- 用户配置测试命令
- 本机测试
- Docker/devcontainer 测试
- 测试日志
- 失败定位
- AI 根据失败继续修复

#### 6.2.6 回溯视图

功能：

- 本次合并记录
- 每个文件合并前快照
- 每个文件合并后快照
- 一键撤销合并
- 单文件恢复
- 从隔离副本重新导入某个文件
- 查看未合并但 AI 曾生成的版本

#### 6.2.7 记忆视图

功能：

- 当前任务总结
- AI 回答压缩摘要
- 用户目标摘要
- 关键决策
- 修改原因
- 测试结果
- 候选长期记忆
- 用户确认写入项目记忆

## 7. 核心架构

### 7.1 架构总览

```text
┌──────────────────────────────────────────────────────────────┐
│ Frontend: React/Tauri WebView                                │
│                                                              │
│ Chat UI | Timeline | Diff | Review | Memory | Rollback       │
└─────────────────────────────┬────────────────────────────────┘
                              │ Tauri commands/events
┌─────────────────────────────▼────────────────────────────────┐
│ Tauri Rust Backend                                            │
│                                                              │
│ ProjectRegistry                                               │
│ WorkspaceManager                                              │
│ TaskOrchestrator                                              │
│ AppServerBridge                                               │
│ EventBridge                                                   │
│ ReviewEngine                                                  │
│ MergeEngine                                                   │
│ RollbackEngine                                                │
│ MemoryEngine                                                  │
│ TestEngine                                                    │
│ AuditLog                                                      │
└───────────────┬───────────────────────────┬──────────────────┘
                │                           │
                │ stdio/ws JSON-RPC          │ fs/git/docker
                │                           │
┌───────────────▼──────────────┐  ┌────────▼───────────────────┐
│ codex app-server              │  │ Local Project + Workspaces │
│ thread/turn/item/tool events  │  │ snapshots/patches/memory   │
└───────────────┬──────────────┘  └────────────────────────────┘
                │
┌───────────────▼──────────────┐
│ codex-core / model runtime    │
│ tools / sandbox / mcp / skills│
└──────────────────────────────┘
```

### 7.2 模块职责

#### ProjectRegistry

负责项目登记：

- 项目路径
- 项目名称
- Git 状态
- 默认分支
- 最近任务
- 安全策略
- 测试策略
- 记忆策略

#### WorkspaceManager

负责隔离副本：

- 创建任务工作区
- 判断使用 git worktree、clone 还是 copy
- 清理过期工作区
- 维护原项目和副本映射
- 检测副本状态
- 处理大文件和忽略规则

#### TaskOrchestrator

任务总控：

- 创建任务
- 启动 Codex thread
- 向 app-server 发送 turn/start
- 订阅事件
- 维护任务状态机
- 协调 review、test、merge、rollback

#### AppServerBridge

负责 Codex app-server：

- 启动 sidecar
- initialize
- thread/start
- turn/start
- turn/interrupt
- thread/resume
- command/exec
- fs/readFile
- model/list
- account/read
- 连接断开恢复

#### EventBridge

负责事件归一化：

- app-server JSON-RPC notification 转为 UI event
- tool call 生命周期转为 timeline event
- shell command 转为 terminal event
- file edit 转为 diff event
- error 转为 user-facing issue

#### ReviewEngine

负责审核：

- 用户手动审核状态
- AI reviewer 调用
- 风险规则检查
- 破坏性变更检测
- 权限/安全检查
- 审核 checklist

#### MergeEngine

负责合并：

- 从副本生成 diff
- 文件级/hunk 级/行级选择
- patch 应用到原项目
- 合并前 hash 校验
- 冲突检测
- 原子写入
- 合并结果记录

#### RollbackEngine

负责回溯：

- 合并前快照
- 合并后快照
- patch 反向应用
- 单文件恢复
- 全任务撤销
- 误合并恢复

#### MemoryEngine

负责记忆：

- 任务总结
- 对话压缩
- 代码变更摘要
- 候选长期记忆
- 项目记忆写入
- 记忆冲突与过期

#### TestEngine

负责测试：

- 测试命令识别
- 本机测试执行
- Docker/devcontainer 执行
- 测试结果解析
- 失败摘要
- 测试门禁

#### AuditLog

负责审计：

- 每个任务的不可变事件日志
- 每次合并的来源
- 每个文件的 hash
- 用户确认记录
- AI reviewer 记录
- 测试记录

## 8. 任务状态机

```text
Created
  ↓
PreparingWorkspace
  ↓
WorkspaceReady
  ↓
AgentRunning
  ↓
ChangesGenerated
  ↓
ReviewPending
  ↓
Reviewing
  ↓
ReviewPassed / ReviewFailed
  ↓
TestingPending
  ↓
Testing
  ↓
TestingPassed / TestingFailed
  ↓
MergeReady
  ↓
Merging
  ↓
Merged
  ↓
RollbackAvailable
```

特殊状态：

- `Interrupted`：用户中断 AI。
- `AgentFailed`：AI 任务失败。
- `WorkspaceConflict`：原项目或副本状态冲突。
- `MergeConflict`：选择性合并无法干净应用。
- `RollbackFailed`：回滚失败，需要人工处理。
- `Archived`：任务已归档。

## 9. 工作区隔离策略

### 9.1 Git 项目

优先使用 `git worktree`：

```text
原项目:
  /Users/me/project

隔离工作区:
  ~/.codex-new/workspaces/<project-id>/<task-id>/worktree

分支:
  codex-new/task/<short-task-id>
```

优点：

- 速度快。
- 不复制完整仓库。
- 保留 Git 历史。
- diff 和 patch 可靠。

### 9.2 非 Git 项目

使用安全复制：

```text
~/.codex-new/workspaces/<project-id>/<task-id>/copy
```

复制规则：

- 默认忽略 `node_modules`、`target`、`.git`、`dist`、`build`、缓存目录。
- 可通过 `.codex-newignore` 配置。
- 对大文件只记录引用，不默认复制。

### 9.3 已有未提交修改

如果原项目是 Git 项目且有未提交修改：

策略：

1. 不阻止任务。
2. 创建基于当前工作树快照的隔离副本。
3. 记录原项目文件 hash。
4. 合并时逐文件校验原文件是否从任务开始后变化。
5. 如果变化，提示冲突并要求用户选择：
   - 重新生成 diff。
   - 手动合并。
   - 跳过该文件。

### 9.4 大项目

边界处理：

- 项目超过阈值时提示使用 worktree。
- 非 Git 大项目提示用户确认复制。
- 支持延迟复制：AI 读取/修改某文件时才复制该文件。
- 文件索引异步构建。

### 9.5 敏感文件

默认保护：

- `.env`
- `.env.*`
- private keys
- credentials
- token files
- SSH keys

AI 可读写策略由用户配置，默认不允许写入敏感文件，读取需要提醒。

## 10. AI 写代码流式展现

### 10.1 事件类型

统一为 `TimelineEvent`：

```ts
type TimelineEvent =
  | AgentPlanEvent
  | FileReadEvent
  | FileEditStartedEvent
  | FileEditDeltaEvent
  | FileEditCompletedEvent
  | CommandStartedEvent
  | CommandOutputEvent
  | CommandCompletedEvent
  | TestStartedEvent
  | TestCompletedEvent
  | ReviewEvent
  | ErrorEvent
  | SummaryEvent;
```

### 10.2 UI 展现

文件编辑过程不应只在完成后显示 diff。应有三层：

1. 实时状态：正在修改 `src/foo.ts`
2. 实时片段：如果 Codex 提供 patch/tool call delta，则流式展示
3. 完成 diff：编辑结束后生成稳定 diff

如果底层 Codex 不能提供逐字符编辑流，则使用事件补偿：

- tool call 开始时展示“准备修改”
- 文件 hash 变化时展示“检测到修改”
- turn 完成后生成 diff
- 通过时间线把过程串起来

### 10.3 不良边界

- AI 多次修改同一文件：合并为一个文件时间线，但保留内部版本。
- AI 生成巨型 diff：默认折叠，按模块摘要。
- AI 删除大量文件：高危提示，合并前二次确认。
- AI 修改锁文件：单独标记依赖影响。
- AI 改二进制文件：禁止自动合并，只能手动确认。

## 11. 审核与选择性合并

### 11.1 审核层级

```text
变更生成
  ↓
自动风险扫描
  ↓
AI reviewer
  ↓
测试门禁
  ↓
用户选择性审核
  ↓
应用 patch 到原项目
```

### 11.2 风险扫描规则

高危：

- 删除大量文件。
- 修改认证/支付/加密/权限代码。
- 修改 `.env`、密钥、证书。
- 修改 CI/CD 发布脚本。
- 修改 lockfile 且未说明依赖原因。
- 引入网络请求。
- 引入远程代码执行。
- 修改数据库 migration。
- 修改公共 API 类型。

中危：

- 大规模重构。
- 跨多个模块改动。
- 测试缺失。
- 快照更新。
- 格式化造成大 diff。

低危：

- 小 bugfix。
- 文案修改。
- 测试补充。
- 局部 UI 调整。

### 11.3 合并粒度

必须支持：

- 全部接受
- 文件接受
- hunk 接受
- 行级接受
- 新文件接受
- 删除文件接受
- 跳过文件

### 11.4 合并前校验

对每个待写入文件：

1. 读取任务开始时原文件 hash。
2. 读取当前原项目文件 hash。
3. 如果 hash 不一致，标记冲突。
4. 如果一致，应用 patch。
5. 应用后再读取 hash，写入合并记录。

### 11.5 合并失败处理

失败时不能留下半合并状态。策略：

- 尽可能事务化。
- 写入前创建临时备份。
- 逐文件 apply 时记录进度。
- 某文件失败则停止后续合并。
- 已成功文件可一键撤销。
- UI 显示准确失败原因。

## 12. 回溯系统

### 12.1 存储内容

每次任务保存：

```text
~/.codex-new/projects/<project-id>/tasks/<task-id>/
  manifest.json
  transcript.summary.md
  ai.final.md
  timeline.jsonl
  changes/
    full.diff
    accepted.diff
    rejected.diff
  snapshots/
    before/
      <encoded-path>.blob
    after-ai/
      <encoded-path>.blob
    after-merge/
      <encoded-path>.blob
  tests/
    test-run-001.json
    test-run-001.log
  review/
    ai-review.md
    user-review.json
  memory/
    task-summary.md
    candidate-memory.md
```

### 12.2 manifest

```json
{
  "taskId": "task_123",
  "projectId": "proj_abc",
  "originalRoot": "/path/to/project",
  "workspaceRoot": "/path/to/worktree",
  "createdAt": 1760000000,
  "status": "merged",
  "baseRevision": "git-sha-or-null",
  "changedFiles": [
    {
      "path": "src/main.ts",
      "beforeHash": "sha256:...",
      "afterAiHash": "sha256:...",
      "afterMergeHash": "sha256:...",
      "accepted": true,
      "mergeStatus": "applied"
    }
  ]
}
```

### 12.3 回滚方式

支持：

- 反向 patch 回滚。
- 从 `before` 快照恢复。
- 单文件恢复。
- 只回滚某个 hunk。
- 重新打开 AI 生成版本并再次审核。

### 12.4 回滚边界

如果用户在合并后又手动修改了同一文件：

- 不自动覆盖。
- 显示三方对比：
  - 合并前
  - 合并后
  - 当前文件
- 用户选择：
  - 保留当前。
  - 恢复合并前。
  - 手动挑选。

## 13. 记忆系统

### 13.1 三层记忆

#### Task Memory

每轮任务自动生成，默认保存：

- 用户目标
- AI 实施摘要
- 文件变更摘要
- 关键决策
- 测试结果
- 未解决问题

#### Project Memory

长期项目记忆，必须用户确认写入：

- 项目架构约定
- 常用命令
- 测试规则
- 代码风格
- 业务约束
- 用户偏好

#### Agent Context Memory

只在当前 thread/session 内使用：

- 当前任务上下文
- 临时计划
- 中间失败原因

### 13.2 总结文件格式

```md
# Task Summary

## User Goal

...

## AI Result

...

## Files Changed

- `src/main.ts`: ...

## Decisions

- ...

## Tests

- `npm test`: passed

## Risks

- ...

## Candidate Project Memory

- ...
```

### 13.3 记忆污染防护

规则：

- 不把失败尝试写入长期记忆，除非用户确认“这是项目事实”。
- 不把 AI 猜测写入长期记忆。
- 记忆必须可追溯到任务 ID。
- 长期记忆可编辑和删除。
- 冲突记忆需要提示用户选择。

## 14. 测试环境

### 14.1 第一阶段策略

第一阶段只做本机测试与测试结果记录，不开发 Docker 自动环境。Docker/devcontainer 相关内容仅作为 UI 占位和未来架构预留，不能阻塞核心功能。

先支持：

- 识别项目测试命令。
- 在隔离工作区本机运行测试。
- 测试通过后解锁合并。
- 测试失败时允许 AI 继续修复。

### 14.2 Docker/devcontainer 占位策略

该能力暂时不开发，只在架构和 UI 中保留占位。未来阶段可以支持：

- 检测 `Dockerfile`
- 检测 `compose.yaml`
- 检测 `.devcontainer/devcontainer.json`
- 检测 Nix/flake
- 检测 package manager

未来如果存在 devcontainer：

```text
使用 devcontainer 作为优先测试环境。
```

未来如果存在 Dockerfile：

```text
构建测试镜像，挂载隔离工作区，运行测试命令。
```

未来如果都不存在：

```text
AI 生成测试环境建议，但不自动启用。
```

### 14.3 测试门禁

可配置：

- 无测试也允许合并。
- 测试失败仍允许合并但高危提示。
- 必须测试通过才允许合并。
- 只要求指定命令通过。

默认：

> AI 改代码后建议运行测试，但不强制阻止高级用户合并。高风险文件可强制测试。

第一阶段默认不强制 Docker 测试，也不生成 Dockerfile，不自动修改项目测试环境。

## 15. Codex app-server 集成

### 15.1 启动流程

```text
用户打开桌面端
  ↓
Tauri 后端检查 codex binary
  ↓
启动 codex app-server --listen stdio://
  ↓
发送 initialize
  ↓
发送 initialized
  ↓
读取 account/model/config 状态
  ↓
UI 进入可用状态
```

### 15.2 任务执行流程

```text
用户输入任务
  ↓
TaskOrchestrator 创建隔离工作区
  ↓
AppServerBridge thread/start cwd=隔离工作区
  ↓
turn/start input=用户任务 + codex-new 安全上下文
  ↓
EventBridge 接收 item notifications
  ↓
Timeline UI 流式展示
  ↓
turn/completed
  ↓
MergeEngine 生成 diff
  ↓
ReviewEngine 审核
  ↓
TestEngine 测试
  ↓
等待用户合并
```

### 15.3 给 Codex 的系统上下文

每个任务应注入类似上下文：

```text
You are running inside a codex-new isolated workspace.
The original user project is protected and must not be modified directly.
All file edits should happen in this workspace.
At the end, summarize changed files, risks, and tests.
Do not attempt to copy files back to the original project.
The desktop client will handle review and merge.
```

### 15.4 app-server 断开处理

如果 app-server 崩溃：

- 保存当前 timeline。
- 标记任务 `AgentFailed`。
- 尝试重启 app-server。
- 尝试 resume thread。
- 如果无法 resume，保留隔离工作区并允许用户手动查看 diff。

## 16. 安全与权限

### 16.1 默认权限

默认：

- AI 可读隔离工作区。
- AI 可写隔离工作区。
- AI 不可写原项目。
- AI 不可访问敏感文件，除非用户允许。
- 网络访问遵循 Codex sandbox 配置。

### 16.2 权限升级

需要显式确认：

- 访问网络。
- 安装依赖。
- 运行 destructive command。
- 修改敏感文件。
- 删除大量文件。
- 写入原项目。

### 16.3 原项目写入保护

即使底层工具有能力访问原项目，也要在 `codex-new` 层做路径策略：

- 原项目路径标记为 protected root。
- 任务上下文不暴露原项目写权限。
- MergeEngine 是唯一允许写原项目的模块。

## 17. 数据库设计

使用 SQLite。

核心表：

```sql
projects(
  id text primary key,
  name text not null,
  root_path text not null,
  created_at integer not null,
  updated_at integer not null,
  git_remote text,
  default_branch text,
  settings_json text not null
);

tasks(
  id text primary key,
  project_id text not null,
  title text not null,
  status text not null,
  original_root text not null,
  workspace_root text not null,
  created_at integer not null,
  updated_at integer not null,
  completed_at integer,
  summary_path text,
  manifest_path text not null
);

timeline_events(
  id text primary key,
  task_id text not null,
  seq integer not null,
  type text not null,
  created_at integer not null,
  payload_json text not null
);

file_changes(
  id text primary key,
  task_id text not null,
  path text not null,
  change_type text not null,
  before_hash text,
  after_ai_hash text,
  after_merge_hash text,
  accepted integer not null,
  merge_status text not null
);

merge_records(
  id text primary key,
  task_id text not null,
  created_at integer not null,
  accepted_diff_path text not null,
  rollback_status text not null
);

memory_entries(
  id text primary key,
  project_id text not null,
  task_id text,
  scope text not null,
  title text not null,
  body text not null,
  source text not null,
  created_at integer not null,
  updated_at integer not null
);

test_runs(
  id text primary key,
  task_id text not null,
  command text not null,
  environment text not null,
  status text not null,
  exit_code integer,
  log_path text,
  created_at integer not null,
  completed_at integer
);
```

## 18. 边界处理总表

### 18.1 用户项目不是 Git

支持复制模式。合并通过文件 hash 和快照保护。

### 18.2 原项目有未保存/未提交改动

允许任务开始，但合并时逐文件校验。冲突文件不自动覆盖。

### 18.3 AI 修改了超大文件

默认折叠 diff，超过阈值需要单独确认。

### 18.4 AI 删除文件

删除操作单独列为高危。不能在“全部接受”里静默删除，必须二次确认。

### 18.5 AI 生成新依赖

标记 lockfile、package manifest、build config 变更。提示用户运行安装和测试。

### 18.6 测试失败

不默认阻止查看 diff。合并按钮根据项目策略决定是否锁定。

### 18.7 app-server 失败

保留工作区、保留 timeline、允许恢复或手动审核。

### 18.8 合并后用户后悔

从 merge record 进入回溯。默认先做三方校验，不盲目覆盖当前文件。

### 18.9 多任务并行

每个任务独立 worktree/copy。合并时如果多个任务改同一文件，需要冲突提示。

### 18.10 磁盘空间不足

创建工作区前估算。运行中监控。失败时保留 manifest，提示清理旧任务。

### 18.11 路径大小写问题

Windows/macOS 默认可能大小写不敏感。路径索引统一 canonicalize，并保存原始显示路径。

### 18.12 换行符问题

尊重 Git autocrlf 和原文件换行。快照保存二进制原文，不做文本归一化覆盖。

### 18.13 符号链接

默认保留 symlink。写入 symlink 目标前提示，避免越权写出隔离工作区。

## 19. 设置系统

项目级设置 `.codex-new/config.toml`：

```toml
[workspace]
strategy = "auto" # auto | worktree | clone | copy
keep_days = 30
max_copy_size_mb = 2048

[merge]
require_review = true
require_tests = false
allow_partial_apply = true
protect_sensitive_files = true

[testing]
default_commands = ["npm test"]
prefer_devcontainer = true
prefer_docker = false

[memory]
auto_task_summary = true
auto_project_memory = false
require_user_confirmation = true

[risk]
large_delete_threshold = 5
large_diff_lines = 1000
```

全局设置：

```text
~/.codex-new/config.toml
```

## 20. 开发路线

### Phase 0: 技术验证

目标：证明桌面端能启动 Codex app-server 并跑通一轮任务。

交付：

- Tauri app shell
- 启动 app-server
- initialize
- thread/start
- turn/start
- 流式接收事件
- 简单聊天 UI，布局必须贴近截图：左侧导航、中间对话、右侧详情、底部输入框

### Phase 1: 隔离工作区 MVP

目标：实现第一个新理念闭环：AI 不直接修改原项目，只在隔离副本中工作。

交付：

- 项目打开
- git worktree 创建
- 非 Git copy 模式
- 任务创建
- Codex cwd 指向隔离工作区
- 任务结束后生成 diff
- 基础 timeline

### Phase 2: 审核与合并 MVP

目标：实现第二个新理念闭环：用户审核后只把确认部分合并回原项目。

交付：

- 文件 diff
- 文件级接受/拒绝
- hunk 级接受/拒绝
- patch apply 到原项目
- hash 校验
- 合并记录

### Phase 3: 回溯系统

目标：实现第三个新理念闭环：误合并可恢复，且恢复不依赖用户项目本身是否使用 Git。

交付：

- before/after 快照
- accepted diff
- 单文件恢复
- 全任务撤销
- 三方冲突提示

### Phase 4: codex-new 右侧工作台

目标：把所有新理念集中到右侧 `codex-new` 面板，保持主 UI 与截图一致。

交付：

- 右侧 `codex-new` 按钮
- 工作流状态面板
- 过程视图
- 变更视图
- 审核视图
- 回溯视图
- 记忆视图

### Phase 5: 记忆与总结

目标：实现第四个新理念闭环：每轮任务都有总结文件，长期记忆由用户确认。

交付：

- 自动任务总结
- 候选长期记忆
- 用户确认写入
- 项目记忆管理
- 记忆搜索

### Phase 6: 本机测试门禁

目标：实现本机测试验证，不开发 Docker 自动环境。

交付：

- 测试命令识别
- 本机测试运行
- 测试日志 UI
- 测试失败继续让 AI 修复
- 合并门禁策略

### Phase 7: Docker/devcontainer 占位

目标：只保留 UI 和架构占位，不进入第一版开发。

交付：

- 右侧测试视图显示“Docker 测试环境：未来能力”
- 配置文件预留字段
- 架构文档保留接口
- 不实现容器构建
- 不实现容器测试运行

### Phase 8: 开源产品化

目标：成为可维护开源项目。

交付：

- 插件 API
- 主题系统
- 国际化
- 自动更新
- 崩溃日志
- 贡献文档
- 安全模型文档
- 示例项目

## 21. MVP 范围建议

第一版必须做。这里的“必须”指你的新理念闭环，不能再压缩成普通聊天桌面端：

1. Tauri 桌面端，UI 第一版高度贴近截图。
2. 启动/连接 Codex app-server。
3. 打开项目并登记项目。
4. 自动创建隔离 worktree/copy。
5. AI 只在副本中执行任务。
6. AI 写代码过程流式展示。
7. 任务结束生成完整 diff。
8. 文件级/hunk 级审核。
9. 只把用户确认的部分合并到原项目。
10. 合并前保存原文件快照。
11. 合并后保存结果快照。
12. 一键回滚本次合并。
13. 单文件回溯恢复。
14. 每轮任务生成用户问题 + AI 总结文件。
15. 候选长期记忆必须由用户确认。
16. 右侧新增 `codex-new` 按钮和完整工作台。

第一版暂缓：

- Docker 自动生成环境。
- Docker/devcontainer 测试运行。
- 复杂长期记忆。
- 插件市场。
- 多 agent 协作。
- 团队云同步。

## 22. 开源产品合理性

`codex-new` 适合作为开源产品，因为它的核心价值是信任：

- 用户能审计 AI 做过什么。
- 用户能验证合并前后的文件。
- 用户能确认长期记忆写入。
- 用户能回滚误操作。
- 用户能看到本地数据如何存储。
- 企业能审查安全边界。

开源叙事：

> The safe desktop workflow for AI coding: isolated workspaces, streaming execution, reviewable diffs, test gates, memory summaries, and reversible merges.

中文叙事：

> AI 不直接改你的项目。它在隔离副本中工作，你观察、审核、测试、选择性合并，并且每一步都能回溯。

## 23. 第一版验收标准

第一版不能只做成普通 Codex 聊天窗口。只有满足以下标准，才算 `codex-new` MVP 成立：

### 23.1 UI 验收

- 主界面与截图保持同类结构。
- 左侧有新对话、搜索、技能、插件、自动化、项目、设置。
- 中间是对话和任务流。
- 底部是输入框、权限、模型、模式、分支等状态区。
- 右侧是详情面板。
- 右侧必须有 `codex-new` 入口。
- 点击 `codex-new` 后进入新理念工作台。

### 23.2 新理念验收

- AI 任务开始前自动创建隔离工作区。
- Codex 的 cwd 必须指向隔离工作区。
- 原项目不能被 agent 直接写入。
- 用户能看到 AI 执行过程时间线。
- 用户能看到副本相对原项目的 diff。
- 用户能选择性接受文件或 hunk。
- 合并前必须保存快照。
- 合并后必须保存合并记录。
- 用户能一键回滚已合并任务。
- 用户能恢复单个文件。
- 每轮任务必须生成总结文件。
- 长期记忆写入必须需要用户确认。

### 23.3 暂不验收

以下内容第一版不作为完成标准：

- Docker 自动环境。
- devcontainer 自动运行。
- 云同步。
- 插件市场。
- 团队协作。
- 官方 Codex Desktop 完全复刻。
- 复杂主题系统。
- AI 自动创建完整 CI。

## 24. 最终体验目标

用户打开 `codex-new` 后应该感觉：

1. 它像 Codex Desktop 一样自然，有对话、项目、技能、插件、搜索。
2. 它比传统 AI 编辑器更安全，因为原项目默认不被 AI 触碰。
3. 它比 Git diff 更懂 AI，因为能展示 AI 写代码的过程。
4. 它比普通聊天更适合开发，因为有审核、测试、合并、回滚。
5. 它比普通记忆更可控，因为长期记忆需要确认。
6. 它适合真实项目，而不只是 demo。

## 25. 一句话总结

`codex-new` 的本质是：

> Codex agent + 隔离工作区 + 流式过程可视化 + 审核合并 + 快照回溯 + 可控记忆 + 测试门禁。

这套架构完整覆盖当前 AI 编程工具最薄弱的几个地方：黑箱、不安全、难审核、难回滚、记忆污染、测试断裂。它不是普通桌面壳，而是一个面向真实工程的 AI 编码操作系统雏形。

## 26. 后端完整落地蓝图与代码位置

这一节不是产品概念，而是给 `codex-rs/codex-new-core`、`codex-rs/cli` 和未来 `desktop/` 直接施工用的后端蓝图。目标是把前面提到但尚未完全落地的能力一次性收口：

- 未完成 task 复用，而不是每次都开全新副本
- 项目运行环境发现、绑定、继承、验证
- 更完整的 project memory / memory candidate 提炼
- 更成熟的 task 生命周期约束、恢复和恢复后的继续执行
- 更丰富的 merge policy / 审批语义
- 更细的 diff/summary 表达和后续 agent 消费接口
- 真正与前端和上层编排整合后的端到端协议
- worktree 边角行为、失败恢复、并发细节

### 26.1 当前已存在的代码位置

当前 MVP 的主要代码在这些文件里：

- [H:\codex\codex-rs\codex-new-core\src\engine.rs](/H:/codex/codex-rs/codex-new-core/src/engine.rs)
  - `register_project`
  - `create_task`
  - `refresh_changes`
  - `merge`
  - `rollback`
  - `run_test_command`
  - `write_task_summary`
- [H:\codex\codex-rs\codex-new-core\src\workspace.rs](/H:/codex/codex-rs/codex-new-core/src/workspace.rs)
  - `prepare_workspace`
  - `git worktree` / `copy` 的选择
- [H:\codex\codex-rs\codex-new-core\src\models.rs](/H:/codex/codex-rs/codex-new-core/src/models.rs)
  - `ProjectRecord`
  - `TaskRecord`
  - `TaskStatus`
  - `ChangedFile`
  - `TimelineEvent`
- [H:\codex\codex-rs\codex-new-core\src\manifest.rs](/H:/codex/codex-rs/codex-new-core/src/manifest.rs)
  - `TaskManifest`
- [H:\codex\codex-rs\codex-new-core\src\fsx.rs](/H:/codex/codex-rs/codex-new-core/src/fsx.rs)
  - 文件复制、快照、hash、路径保护
- [H:\codex\codex-rs\codex-new-core\src\git.rs](/H:/codex/codex-rs/codex-new-core/src/git.rs)
  - Git root、branch、revision、worktree、diff
- [H:\codex\codex-rs\cli\src\codex_new_cmd.rs](/H:/codex/codex-rs/cli/src/codex_new_cmd.rs)
  - `project add`
  - `task create/diff/merge/rollback/test/summary`

这一版已经能表达“单 task 隔离 + diff + merge + rollback + local test record”，但还没有形成桌面端需要的完整后端协议和恢复模型。

### 26.2 目标代码布局

为了避免 `engine.rs` 继续膨胀，推荐把 `codex-new-core` 收敛成下面的模块结构：

```text
codex-rs/codex-new-core/src/
  lib.rs
  error.rs
  models.rs
  manifest.rs
  engine.rs
  fsx.rs
  git.rs
  workspace.rs
  sessions.rs
  environment.rs
  memory.rs
  policy.rs
  review.rs
  diff.rs
  timeline.rs
  recovery.rs
  protocol.rs
```

各文件职责如下：

- `engine.rs`
  - 只保留高层 orchestration API
  - 不再直接容纳所有细节算法
- `sessions.rs`
  - conversation / thread / active task 绑定
  - task 复用选择
  - active task 切换
- `environment.rs`
  - 运行环境发现
  - 环境画像评分
  - 环境变量注入
  - 共享依赖路径推断
- `memory.rs`
  - task summary
  - candidate memory 生成
  - project memory 冲突合并
- `policy.rs`
  - 审批策略
  - merge policy
  - 文件保护策略
  - 测试门禁策略
- `review.rs`
  - 风险分级
  - reviewer checklist
  - review result 聚合
- `diff.rs`
  - 文件级 / hunk 级 / 行级 diff 表达
  - diff stats、lockfile 标记、binary 标记
- `timeline.rs`
  - timeline event schema
  - agent/tool/test/review/merge 事件序列化
- `recovery.rs`
  - 中断恢复
  - worktree 失效恢复
  - merge 失败恢复
  - rollback 失败恢复
- `protocol.rs`
  - 给 CLI、桌面端和 app-server bridge 的稳定 DTO

如果后面把桌面端桥接也并进 Rust workspace，则另建：

```text
codex-rs/codex-new-bridge/
  src/
    lib.rs
    app_server.rs
    desktop_protocol.rs
    stream.rs
```

### 26.3 Task 复用与“新对话才新建”的核心语义

#### 26.3.1 产品语义

新的规则是：

1. 新对话，默认新建 task
2. 同一个对话继续，默认复用最近一个未完成 task
3. 用户显式要求“重新开始 / fork / 新建隔离区”，才新建 task
4. 已经 `Merged`、`Archived`、`Abandoned`、`Superseded` 的 task，不再被默认复用

#### 26.3.2 新增模型

这些类型加在 [models.rs](/H:/codex/codex-rs/codex-new-core/src/models.rs)：

```rust
pub enum TaskTerminalReason {
    Merged,
    Abandoned,
    Archived,
    Superseded,
}

pub enum TaskReusePolicy {
    ReuseActive,
    ForceNew,
    ForkFromTask { task_id: String },
}

pub struct ConversationBinding {
    pub project_id: String,
    pub conversation_id: String,
    pub active_task_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

#### 26.3.3 新增持久化位置

放到：

```text
<state_root>/projects/<project_id>/conversations/<conversation_id>.json
```

以及：

```text
<state_root>/projects/<project_id>/tasks/index.json
```

#### 26.3.4 复用选择算法

放到 `sessions.rs`：

1. 如果请求带 `task_id`，直接绑定该 task
2. 如果请求带 `ForceNew`，创建新 task
3. 如果请求带 `ForkFromTask(task_id)`，复制该 task 的 workspace 状态生成新 task
4. 否则按 `conversation_id` 查 `ConversationBinding`
5. 若存在 `active_task_id` 且 task 非终态，返回它
6. 若 conversation 没绑定 task，则找该 project 最近一个未完成 task：
   - 状态不在终态
   - workspace 健康
   - environment binding 仍可验证
   - 若通过，绑定并返回
7. 否则新建 task

这个算法的关键不是“永远只认 conversation”，而是 conversation 失联后也能尽量延续最近可恢复 task。

### 26.4 Task 生命周期、约束与恢复

#### 26.4.1 状态机升级

把 [models.rs](/H:/codex/codex-rs/codex-new-core/src/models.rs) 里的 `TaskStatus` 扩成：

```rust
pub enum TaskStatus {
    Created,
    PreparingWorkspace,
    WorkspaceReady,
    AgentQueued,
    AgentRunning,
    AgentInterrupted,
    AgentFailed,
    ChangesDetected,
    SummaryReady,
    ReviewPending,
    Reviewing,
    ReviewBlocked,
    ReviewPassed,
    ReviewFailed,
    TestingPending,
    TestingRunning,
    TestingPassed,
    TestingFailed,
    MergeQueued,
    MergeReady,
    Merging,
    Merged,
    RollbackAvailable,
    RollingBack,
    RollbackFailed,
    WorkspaceConflict,
    MergeConflict,
    EnvironmentBroken,
    Superseded,
    Abandoned,
    Archived,
}
```

新增终态集合：

- `Merged`
- `Superseded`
- `Abandoned`
- `Archived`

新增“可恢复但非终态”集合：

- `AgentInterrupted`
- `AgentFailed`
- `TestingFailed`
- `WorkspaceConflict`
- `EnvironmentBroken`
- `MergeConflict`
- `RollbackFailed`

#### 26.4.2 恢复逻辑

放到 `recovery.rs`：

- `recover_task_workspace(task_id)`
  - 校验 workspace root 是否存在
  - 校验 manifest 中记录的 base revision / branch / hashes
  - 若 worktree 丢失但 repo 仍在，尝试重建 worktree
  - 若 copy workspace 部分缺失但 snapshots 足够，重建 copy root
- `recover_environment_binding(task_id)`
  - 重跑 environment 验证
  - 若原环境路径失效，重做自动发现
  - 如果发现结果与旧环境 fingerprint 差异过大，标记 `EnvironmentBroken`
- `resume_task(task_id)`
  - 先恢复 workspace
  - 再恢复 environment
  - 再根据上次 stage 进入下一步

#### 26.4.3 任务恢复后的继续执行

恢复后不应该简单丢给 agent 一个“继续”。应该给 agent 一份压缩后的恢复上下文：

- task summary
- changed files
- 上次测试结果
- 未处理 review comments
- 当前 merge blockers

这部分由 `memory.rs` 和 `protocol.rs` 一起提供给上层。

### 26.5 运行环境发现、绑定、继承与自动查找算法

这是桌面端可用性的关键点。设计目标不是把环境复制一遍，而是：

> 新 workspace 使用自己的代码目录，但尽量继承源项目已经可运行的本地环境。

#### 26.5.1 核心抽象

在 [models.rs](/H:/codex/codex-rs/codex-new-core/src/models.rs) 新增：

```rust
pub struct EnvironmentBinding {
    pub profile_id: String,
    pub project_id: String,
    pub workspace_root: PathBuf,
    pub environment_root: PathBuf,
    pub strategy: EnvironmentStrategy,
    pub fingerprint: String,
    pub detected_at: DateTime<Utc>,
    pub env_vars: BTreeMap<String, String>,
    pub path_entries: Vec<PathBuf>,
    pub shared_paths: Vec<SharedPathMount>,
    pub detected_tools: Vec<DetectedTool>,
    pub validation: EnvironmentValidation,
}

pub enum EnvironmentStrategy {
    InheritProject,
    InheritTask,
    RebindAuto,
    ManualProfile,
}

pub struct SharedPathMount {
    pub kind: SharedPathKind,
    pub source: PathBuf,
    pub target_hint: Option<PathBuf>,
    pub read_only: bool,
}
```

#### 26.5.2 自动查找算法

放到 `environment.rs`，算法分四段：

1. `discover_environment_candidates(project_root)`
2. `score_environment_candidates(candidates)`
3. `validate_environment_candidate(candidate, workspace_root)`
4. `bind_environment(candidate, workspace_root)`

#### 26.5.3 候选发现

扫描这些信号：

- Node
  - `package.json`
  - `pnpm-lock.yaml`
  - `package-lock.json`
  - `yarn.lock`
  - `bun.lockb`
  - `node_modules/.bin`
  - `.nvmrc`
  - `.node-version`
  - `volta`
  - `mise.toml`
  - `.tool-versions`
- Python
  - `pyproject.toml`
  - `requirements.txt`
  - `poetry.lock`
  - `uv.lock`
  - `.venv`
  - `venv`
  - `Pipfile`
  - `pixi.toml`
- Rust
  - `Cargo.toml`
  - `Cargo.lock`
  - `rust-toolchain.toml`
  - `.cargo/config.toml`
- Java / Kotlin
  - `gradlew`
  - `mvnw`
  - `.mvn`
  - `build.gradle`
  - `pom.xml`
- Go
  - `go.mod`
  - `go.work`
- Ruby
  - `Gemfile`
  - `.ruby-version`
- PHP
  - `composer.json`
- 通用
  - `.env`
  - `.env.local`
  - `direnv`
  - `.devcontainer/devcontainer.json`
  - `Dockerfile`
  - `compose.yaml`

#### 26.5.4 候选评分

每个生态都形成一个 `EnvironmentCandidate`，按以下指标打分：

- 本地依赖是否存在
  - 例如 `.venv/bin/python`、`.venv/Scripts/python.exe`
  - `node_modules/.bin`
  - `gradlew`
- 锁文件与依赖目录是否匹配
- 当前 shell PATH 是否能找到对应工具
- 是否有项目级 wrapper
  - `./gradlew`
  - `./mvnw`
  - `.venv`
- 是否已在源项目里成功执行过命令
  - 从历史 task / terminal 记录回溯
- 版本一致性
  - `rust-toolchain.toml`
  - `.nvmrc`
  - `.python-version`

最终算法选择：

1. 优先项目局部环境
2. 再选项目 wrapper
3. 再选用户级工具链
4. 最后选系统 PATH

#### 26.5.5 绑定策略

不建议依赖符号链接，因为 Windows 上 symlink 权限不稳定。绑定策略应是：

- 执行目录总是 `workspace_root`
- 注入 `PATH`
- 注入生态特定变量
- 允许把“依赖根路径”当共享路径记录下来，但不要求真的 mount

例如：

- Python
  - `VIRTUAL_ENV=<project_root>/.venv`
  - `PATH=<project_root>/.venv/Scripts;...`
- Node
  - `PATH=<project_root>/node_modules/.bin;...`
  - `npm_config_prefix`、`PNPM_HOME` 继承
- Rust
  - `CARGO_HOME`
  - `RUSTUP_HOME`
  - `PATH` 中加入 toolchain bin
- Java
  - `JAVA_HOME`
  - wrapper 脚本优先

#### 26.5.6 环境指纹

环境不是只存 env var，而是要存 fingerprint：

- 项目根
- 生态类型
- 关键可执行路径
- lockfile hash
- venv / node_modules / toolchain 的存在性摘要
- 关键 env var 子集

这样 task 恢复时能快速判断“还是不是同一个可运行环境”。

#### 26.5.7 自动测试如何使用环境

`run_test_command` 不应继续只收一个 `command`。应扩成：

```rust
pub struct TestExecutionRequest {
    pub task_id: String,
    pub command: String,
    pub use_environment_binding: bool,
    pub env_overrides: BTreeMap<String, String>,
    pub profile_id: Option<String>,
}
```

实现放在 `engine.rs` 调 `environment.rs`：

1. 读取 task 的 `EnvironmentBinding`
2. 以 `workspace_root` 为 `cwd`
3. 注入绑定环境
4. 合并用户 override
5. 执行命令
6. 记录本次使用的环境 fingerprint

这就是“新代码目录使用源项目运行环境”的正式实现方式。

### 26.6 Project Memory / Candidate Memory 完整设计

#### 26.6.1 三层对象

`memory.rs` 内定义：

```rust
pub struct TaskSummaryRecord { ... }
pub struct CandidateMemoryRecord { ... }
pub struct ProjectMemoryRecord { ... }
```

对应落盘：

```text
<task_root>/memory/task-summary.md
<task_root>/memory/candidate-memory.json
<state_root>/projects/<project_id>/memory/project-memory.json
```

#### 26.6.2 Candidate Memory 提炼算法

输入：

- 用户目标
- AI 最终回答
- changed files
- 测试结果
- review 结论
- 多轮命令历史

提炼出四类候选：

1. `ArchitectureFact`
   - 例如“前端路由在 `src/app/routes.tsx`”
2. `WorkflowRule`
   - 例如“提交前先跑 `pnpm test --filter app`”
3. `StyleRule`
   - 例如“图标统一用 lucide-react”
4. `Constraint`
   - 例如“不要改 `generated/`，由代码生成器覆盖”

#### 26.6.3 Candidate Memory 的过滤规则

只允许进入候选区的内容：

- 被文件结构、配置或多次行为证实
- 在本任务里被明确执行并成功
- 非一次性偶然细节

明确过滤：

- AI 猜测
- 失败尝试
- 临时 workaround
- 用户情绪或一次性偏好
- 路径中含随机临时目录的记录

#### 26.6.4 Project Memory 合并

算法在 `memory.rs`：

1. 读取现有 `project-memory.json`
2. 对新候选做 normalization
3. 与现有 memory 用 key 比较
4. 冲突时不自动覆盖，标记：
   - `same`
   - `compatible-update`
   - `conflict`
5. 交给前端审核确认后再写入

### 26.7 Merge Policy / 审批语义

`policy.rs` 和 `review.rs` 共同承载。

#### 26.7.1 Merge Policy 对象

```rust
pub struct MergePolicy {
    pub require_user_approval: bool,
    pub require_clean_review: bool,
    pub require_test_pass: bool,
    pub blocked_file_patterns: Vec<String>,
    pub sensitive_file_patterns: Vec<String>,
    pub max_auto_merge_files: u32,
    pub allow_lockfile_merge_without_reason: bool,
    pub allow_binary_merge: bool,
}
```

#### 26.7.2 审批语义

不是简单的“review 过 / 不过”，而是：

- `Informational`
- `NeedsUserApproval`
- `Blocked`

具体规则：

- 修改敏感文件 -> `Blocked`
- lockfile 变化但无依赖说明 -> `NeedsUserApproval`
- 测试没过而策略要求测试 -> `Blocked`
- 只改 docs / 测试 / 小范围 UI -> `Informational`

#### 26.7.3 合并粒度模型

当前 `MergeSelection` 只有 `All` / `Files(Vec<String>)`，不够。

扩成：

```rust
pub enum MergeSelection {
    All,
    Files(Vec<String>),
    Hunks(Vec<HunkSelection>),
    Lines(Vec<LineSelection>),
}
```

具体 diff 元数据放在 `diff.rs`，供桌面端做精细选择。

### 26.8 更细的 Diff / Summary 表达与 Agent 消费接口

#### 26.8.1 Diff 表达

`diff.rs` 输出三层结构：

```rust
pub struct DiffBundle {
    pub files: Vec<FileDiff>,
    pub stats: DiffStats,
    pub risk_markers: Vec<RiskMarker>,
}

pub struct FileDiff {
    pub path: String,
    pub status: ChangedFileStatus,
    pub is_binary: bool,
    pub is_lockfile: bool,
    pub hunks: Vec<DiffHunk>,
}
```

这样前端不必自己从 unified diff 再 parse 一遍。

#### 26.8.2 Summary 表达

`write_task_summary` 不应只写 Markdown，还应同时写结构化 JSON：

```text
<task_root>/memory/task-summary.md
<task_root>/memory/task-summary.json
```

JSON 要包含：

- user goal
- ai result
- files changed
- key decisions
- tests
- risks
- candidate memory
- blockers
- recovery hints

#### 26.8.3 给 Agent 的消费接口

恢复或继续执行时，不直接把整段 transcript 塞回去，而是注入一个 `TaskResumeContext`：

```rust
pub struct TaskResumeContext {
    pub task_id: String,
    pub summary: StructuredTaskSummary,
    pub changed_files: Vec<ChangedFile>,
    pub pending_reviews: Vec<ReviewIssue>,
    pub latest_test: Option<TestOutcome>,
    pub environment_binding: Option<EnvironmentBinding>,
}
```

这由 `protocol.rs` 提供，给 CLI 或 app-server bridge 使用。

### 26.9 与前端 / 上层编排整合后的端到端协议

桌面端真正需要的不是散装 CLI 命令，而是一套稳定的任务协议。

#### 26.9.1 Core API

由 `engine.rs` 暴露：

- `register_project`
- `resolve_or_create_task`
- `get_task_overview`
- `refresh_task_changes`
- `run_task_tests`
- `review_task`
- `merge_task_changes`
- `rollback_task_merge`
- `archive_task`
- `resume_task`

#### 26.9.2 Protocol DTO

放到 `protocol.rs`：

- `ResolveTaskRequest`
- `ResolveTaskResponse`
- `TaskOverview`
- `WorkspaceDescriptor`
- `EnvironmentDescriptor`
- `ReviewDescriptor`
- `DiffBundle`
- `StructuredTaskSummary`
- `TaskResumeContext`

#### 26.9.3 CLI 位置

CLI 入口仍在 [codex_new_cmd.rs](/H:/codex/codex-rs/cli/src/codex_new_cmd.rs)，但应新增这些子命令：

- `task resolve`
- `task overview`
- `task resume`
- `task review`
- `task archive`
- `task memory candidates`
- `task memory apply`
- `task env inspect`

#### 26.9.4 桌面端位置

未来 `desktop/` 里建议这样收口：

```text
desktop/src/features/codexNew/
  api/
    resolveTask.ts
    getTaskOverview.ts
    runTaskTests.ts
    mergeTask.ts
    rollbackTask.ts
    reviewTask.ts
  state/
    taskStore.ts
  views/
    CodexNewPanel.tsx
    WorkspaceView.tsx
    DiffView.tsx
    ReviewView.tsx
    MemoryView.tsx
    RecoveryView.tsx
```

右侧面板不应该直接拼 shell 命令，而应消费上述稳定 DTO。

### 26.10 Worktree 边角行为、失败恢复与并发

#### 26.10.1 Worktree 创建失败

放到 `workspace.rs`：

策略顺序：

1. 尝试 `git worktree add`
2. 如果 repo 已脏且策略允许，退化到 copy
3. 如果 worktree 因 branch 已存在失败：
   - branch 对应同 task -> 复用
   - branch 被别处占用 -> 重新生成唯一 branch
4. 如果 worktree metadata 损坏：
   - 尝试 `git worktree prune`
   - 仍失败则退化 copy

#### 26.10.2 多 task 并发

同一 project 允许多个 task 并发，但要加约束：

- 一个 conversation 同时只有一个 active task
- 多个 task 可以并行运行 agent / test
- merge 到原项目时按文件加锁

建议在 `engine.rs` + `recovery.rs` 做文件锁：

```text
<state_root>/projects/<project_id>/locks/
  merge.lock
  task-<task_id>.lock
  path-<encoded-file>.lock
```

#### 26.10.3 Merge 并发冲突

两个 task 都改了 `src/foo.ts` 时：

- 不是创建时就阻止
- merge 前比较 `before_hash`
- 不同则进入 `MergeConflict`
- 提供三方信息给前端：
  - task baseline
  - task ai version
  - current original version

#### 26.10.4 Copy workspace 的增量复制

大型非 Git 项目不应总是全量 copy。`workspace.rs` 后续要支持：

- initial skeleton copy
- lazy file materialization
- ignore rules
- 读取时复制
- 修改前复制

这能把大目录的创建成本压下来。

#### 26.10.5 删除 / 归档策略

归档时：

- 保留 task artifacts
- 删除可重建 workspace
- 保留 manifest、summary、timeline、diff、snapshots、tests、review、memory

位置不变，状态为 `Archived`。

### 26.11 具体实现顺序

为了让桌面端能尽快接入，建议按下面顺序改代码：

1. `models.rs`
   - 扩对象：task reuse、environment、review、summary、diff bundle
2. `manifest.rs`
   - 扩 manifest 字段，加入 environment / review / summary 指针
3. `sessions.rs`
   - 实现 active task 复用
4. `environment.rs`
   - 实现自动发现、评分、绑定、验证
5. `workspace.rs`
   - 接环境绑定、worktree fallback、lazy copy 预留
6. `diff.rs`
   - 输出结构化 diff
7. `memory.rs`
   - 输出 structured summary + candidate memory
8. `policy.rs` + `review.rs`
   - merge policy、审批语义、review result
9. `recovery.rs`
   - workspace / environment / task resume
10. `protocol.rs`
   - 前后端稳定 DTO
11. `engine.rs`
   - 只做编排整合
12. `cli/src/codex_new_cmd.rs`
   - 暴露 resolve / overview / env / review / archive 命令

### 26.12 这份设计对桌面端的直接价值

当这些对象和边界被固定后，桌面端就可以稳定依赖下面这些事实：

- “当前 task 是哪个”有确定答案
- “该不该复用上一次”有确定算法
- “新 workspace 怎么跑起来”有确定环境绑定方案
- “变更怎么展示”有结构化 diff
- “能不能合并”有结构化审批语义
- “恢复继续执行时给 agent 什么”有结构化 resume context
- “一个 task 的事实存在哪”有固定路径和 DTO

这意味着桌面端不需要自己发明后端语义，只需要消费这套协议。
