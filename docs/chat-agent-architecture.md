# Chat Agent 架构可视化

本文档提供 Chat Agent 架构的可视化图表，配合主设计文档使用。

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         CodexStudy 桌面应用                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    前端 (React + TypeScript)                │ │
│  │                                                             │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │ │
│  │  │ Codex New   │  │ Chat Agent   │  │  Settings       │  │ │
│  │  │ Main View   │  │ Step Cards   │  │  Engine Switch  │  │ │
│  │  └─────────────┘  └──────────────┘  └─────────────────┘  │ │
│  │         │                 │                    │           │ │
│  └─────────┼─────────────────┼────────────────────┼───────────┘ │
│            │                 │                    │             │
│            └─────────────────┴────────────────────┘             │
│                              │                                  │
│                    Tauri IPC (invoke/listen)                    │
│                              │                                  │
├──────────────────────────────┼──────────────────────────────────┤
│                    后端 (Rust + Tauri)                           │
│                              │                                  │
│  ┌───────────────────────────▼──────────────────────────────┐  │
│  │              Runtime Selector                             │  │
│  │  (capability_map.rs + runtime_selector.rs)               │  │
│  └───────────────┬───────────────────────┬───────────────────┘  │
│                  │                       │                      │
│     ┌────────────▼──────────┐  ┌────────▼──────────────┐       │
│     │  CodexCoreRuntime     │  │  ChatAgentRuntime     │       │
│     │  (现有 app-server)     │  │  (新建 chat_agent/)    │       │
│     └────────────┬──────────┘  └────────┬──────────────┘       │
│                  │                       │                      │
│                  │              ┌────────▼──────────────┐       │
│                  │              │  Session Context      │       │
│                  │              │  (session_builder.rs) │       │
│                  │              └────────┬──────────────┘       │
│                  │                       │                      │
│                  │              ┌────────▼──────────────┐       │
│                  │              │  Planner              │       │
│                  │              │  (prompt + parse)     │       │
│                  │              └────────┬──────────────┘       │
│                  │                       │                      │
│                  │              ┌────────▼──────────────┐       │
│                  │              │  Executor             │       │
│                  │              │  (tools dispatcher)   │       │
│                  │              └────────┬──────────────┘       │
│                  │                       │                      │
│                  │              ┌────────▼──────────────┐       │
│                  │              │  Loop Control         │       │
│                  │              │  (guardrails)         │       │
│                  │              └───────────────────────┘       │
│                  │                                              │
│     ┌────────────▼──────────────────────────────────────────┐  │
│     │              Codex New Core (共享层)                    │  │
│     │  • Workspace  • Changeset  • Diff  • Review           │  │
│     │  • Summary    • Memory     • Test  • Rollback         │  │
│     └───────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Chat Agent 模块详细结构

```
chat_agent/
│
├── mod.rs                      # 模块导出
├── runtime.rs                  # ChatAgentRuntime 主入口
├── runtime_selector.rs         # 引擎选择逻辑
│
├── session/                    # 会话管理
│   ├── mod.rs
│   ├── session_context.rs      # 会话上下文（workspace, model, tools）
│   ├── session_builder.rs      # 会话构建器（借鉴 Goose）
│   └── capability_map.rs       # 模型能力映射
│
├── protocol/                   # 协议定义
│   ├── mod.rs
│   ├── action.rs               # Action 枚举（5 个基础动作）
│   ├── observation.rs          # Observation 结构
│   ├── prompt_contract.rs      # Prompt 模板
│   └── final_result.rs         # 最终结果
│
├── planner/                    # 规划器（与模型交互）
│   ├── mod.rs
│   ├── prompt_builder.rs       # 构造 chat messages
│   ├── response_parser.rs      # 解析 JSON 响应
│   └── planner_client.rs       # 调用模型 API
│
├── executor/                   # 执行器（工具调用）
│   ├── mod.rs
│   ├── dispatcher.rs           # 动作分派器
│   ├── file_tools.rs           # 文件操作（read/edit）
│   ├── search_tools.rs         # 代码搜索（ripgrep）
│   ├── command_tools.rs        # 命令执行（shell）
│   ├── approval_tools.rs       # 用户确认
│   └── core_delegate.rs        # Phase 2: 委托给 core
│
├── loop_control/               # 循环控制
│   ├── mod.rs
│   ├── run_loop.rs             # 主循环逻辑
│   ├── guardrails.rs           # 保护规则（重复检测）
│   ├── retry_policy.rs         # 重试策略
│   └── stop_conditions.rs      # 停止条件
│
├── state/                      # 状态管理
│   ├── mod.rs
│   ├── run_state.rs            # 运行时状态
│   ├── step_record.rs          # 步骤记录
│   └── event_mapper.rs         # 映射到 TimelineEvent
│
└── errors/                     # 错误定义
    ├── mod.rs
    ├── runtime_error.rs        # 运行时错误
    ├── parse_error.rs          # 解析错误
    └── tool_error.rs           # 工具错误
```

## 3. 数据流图

### 3.1 用户发起任务

```
用户输入 "修复登录页面的 bug"
    │
    ▼
前端: ChatInput.tsx
    │ invoke('start_chat_agent_run', { prompt, workspaceId })
    ▼
后端: runtime_selector.rs
    │ select_engine(model, task_requirements)
    ▼
ChatAgentRuntime::run()
    │
    ├─► SessionBuilder::build()
    │   └─► 装配 workspace, model, tools
    │
    └─► RunLoop::start()
        │
        └─► [进入主循环]
```

### 3.2 主循环单轮执行

```
RunLoop (第 N 轮)
    │
    ├─► Planner::plan_next_action()
    │   │
    │   ├─► PromptBuilder::build()
    │   │   └─► 构造 messages: [system, history, user]
    │   │
    │   ├─► PlannerClient::call_model()
    │   │   └─► POST /v1/chat/completions
    │   │       └─► {"thought": "...", "action": {...}}
    │   │
    │   └─► ResponseParser::parse()
    │       └─► Action::ReadFile { path: "..." }
    │
    ├─► Executor::execute(action)
    │   │
    │   ├─► Dispatcher::route(action)
    │   │   └─► FileTools::read_file(path)
    │   │       └─► fs::read_to_string(path)
    │   │
    │   └─► Observation {
    │           ok: true,
    │           summary: "读取成功",
    │           artifacts: [{ kind: "file_content", ... }]
    │       }
    │
    ├─► Guardrails::check()
    │   │
    │   ├─► 检查重复动作
    │   ├─► 检查失败次数
    │   └─► 检查最大轮数
    │
    └─► 决策下一步
        │
        ├─► Continue → 回到循环开始
        ├─► AskUser → emit('chat-agent-awaiting-user')
        └─► Finalize → emit('chat-agent-finished')
```

### 3.3 前端事件流

```
后端事件                          前端响应
    │
    ├─► chat-agent-run-updated
    │   └─► useChatAgentRun() 更新状态
    │       └─► ChatAgentRunPanel 重新渲染
    │
    ├─► chat-agent-step-added
    │   └─► chatAgentStore.addStep()
    │       └─► ChatAgentStepList 添加新卡片
    │           └─► ChatAgentStepCard 显示动作 + 结果
    │
    ├─► chat-agent-awaiting-user
    │   └─► 显示输入框 / 选项按钮
    │       └─► 用户回复 → invoke('resume_chat_agent_run')
    │
    └─► chat-agent-finished
        └─► 显示完成状态 + 总结
            └─► 提供 "查看变更" / "运行测试" 按钮
```

## 4. 引擎选择决策流程

```
                    ┌─────────────────┐
                    │  用户发起任务    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ 用户强制指定？   │
                    └────┬───────┬────┘
                         │ Yes   │ No
                         │       │
                ┌────────▼──┐    │
                │ 使用指定   │    │
                │ 引擎      │    │
                └───────────┘    │
                                 │
                        ┌────────▼────────┐
                        │ 需要 MCP/Skills? │
                        └────┬───────┬────┘
                             │ Yes   │ No
                             │       │
                    ┌────────▼──┐    │
                    │ CodexCore │    │
                    │ Runtime   │    │
                    └───────────┘    │
                                     │
                            ┌────────▼────────┐
                            │ 模型工具调用     │
                            │ 不可靠？         │
                            └────┬───────┬────┘
                                 │ Yes   │ No
                                 │       │
                        ┌────────▼──┐    │
                        │ ChatAgent │    │
                        │ Runtime   │    │
                        └───────────┘    │
                                         │
                                ┌────────▼────────┐
                                │ 支持 Responses? │
                                └────┬───────┬────┘
                                     │ Yes   │ No
                                     │       │
                            ┌────────▼──┐    │
                            │ CodexCore │    │
                            │ Runtime   │    │
                            └───────────┘    │
                                             │
                                    ┌────────▼────────┐
                                    │ 仅 Chat API     │
                                    └────┬───────┬────┘
                                         │       │
                                         │       │
                            ┌────────────▼──┐ ┌─▼────────────┐
                            │ 需要全功能？   │ │ 需要步骤卡片？│
                            └────┬──────────┘ └─┬────────────┘
                                 │              │
                        ┌────────▼──────┐  ┌───▼──────┐
                        │ CodexCore +   │  │ ChatAgent│
                        │ compat_bridge │  │ Runtime  │
                        └───────────────┘  └──────────┘
```

## 5. 错误处理流程

```
                    ┌─────────────┐
                    │  错误发生    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  错误分类    │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
   │ 解析错误 │      │ API 错误  │     │ 工具错误  │
   └────┬────┘      └─────┬─────┘     └─────┬─────┘
        │                 │                  │
   ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
   │重试 < 2?│      │ 429 限流? │     │生成详细   │
   └─┬──┬───┘      └─┬───┬────┘     │observation│
     │  │            │   │           └─────┬─────┘
   Yes│  │No       Yes│  │No               │
     │  │            │   │                 │
   ┌─▼──▼───┐    ┌──▼───▼──┐         ┌────▼────┐
   │重新请求│    │指数退避 │         │让模型   │
   │+ 错误  │    │重试 3 次│         │调整策略 │
   │提示    │    └────┬────┘         └────┬────┘
   └────┬───┘         │                   │
        │             │                   │
        │      ┌──────▼──────┐            │
        │      │ 5xx 错误?   │            │
        │      └──┬───┬──────┘            │
        │       Yes│  │No                 │
        │         │  │                    │
        │    ┌────▼──▼────┐               │
        │    │ 记录日志   │               │
        │    │ Failed 状态│               │
        │    └────────────┘               │
        │                                 │
        └─────────────┬───────────────────┘
                      │
              ┌───────▼───────┐
              │ 连续失败 > 2? │
              └───┬───────┬───┘
                Yes│     │No
                   │     │
          ┌────────▼──┐  │
          │ AskUser   │  │
          │ 状态      │  │
          └───────────┘  │
                         │
                    ┌────▼────┐
                    │ 继续循环 │
                    └─────────┘
```

## 6. Phase 2 Hybrid 架构

```
┌─────────────────────────────────────────────────────────┐
│                  ChatAgentRuntime                        │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐      │
│  │  Planner   │  │ Loop Ctrl  │  │    State     │      │
│  │ (JSON协议) │  │(Guardrails)│  │  (步骤记录)   │      │
│  └────────────┘  └────────────┘  └──────────────┘      │
│         │                                               │
│         │ Action { type, input }                        │
│         │                                               │
│  ┌──────▼──────────────────────────────────────────┐   │
│  │              Executor                            │   │
│  │                                                  │   │
│  │  ┌──────────┐  ┌──────────────────────────┐    │   │
│  │  │ AskUser  │  │   CoreToolDelegate       │    │   │
│  │  │ Finalize │  │   (委托给 core)           │    │   │
│  │  └──────────┘  └──────────┬───────────────┘    │   │
│  │                            │                    │   │
│  └────────────────────────────┼────────────────────┘   │
│                               │                        │
└───────────────────────────────┼────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Codex Core Runtime   │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │  ToolRouter     │  │
                    │  │  (统一派发)     │  │
                    │  └────────┬────────┘  │
                    │           │           │
                    │  ┌────────▼────────┐  │
                    │  │  Sandbox        │  │
                    │  │  (安全隔离)     │  │
                    │  └────────┬────────┘  │
                    │           │           │
                    │  ┌────────▼────────┐  │
                    │  │  MCP / Skills   │  │
                    │  │  (扩展工具)     │  │
                    │  └─────────────────┘  │
                    │                       │
                    └───────────────────────┘

优势:
• Chat Agent 保留 JSON 协议优势（步骤透明、强 guardrails）
• 工具实现统一（避免两套 sandbox）
• 复用 core 的 MCP / skills 生态
• 降低长期维护成本
```

## 7. 性能监控点

```
用户请求
    │
    ├─► [监控点 1] 引擎选择延迟
    │   目标: < 10ms
    │
    ▼
SessionBuilder
    │
    ├─► [监控点 2] 会话初始化
    │   目标: < 100ms
    │
    ▼
主循环开始
    │
    ├─► [监控点 3] Prompt 构造
    │   目标: < 50ms
    │
    ├─► [监控点 4] 模型 API 调用
    │   目标: < 3s (P95)
    │
    ├─► [监控点 5] 响应解析
    │   目标: < 200ms
    │
    ├─► [监控点 6] 工具执行
    │   目标: < 1s (文件操作)
    │           < 30s (命令执行)
    │
    ├─► [监控点 7] Observation 生成
    │   目标: < 100ms
    │
    └─► [监控点 8] Guardrails 检查
        目标: < 10ms

总体目标: 单轮 < 5s (P95)
```

## 8. 测试覆盖矩阵

```
                    单元测试    集成测试    E2E测试
                    ────────    ────────    ───────
protocol/           ✓✓✓         ✓           -
planner/            ✓✓✓         ✓✓          ✓
executor/           ✓✓✓         ✓✓          ✓
loop_control/       ✓✓✓         ✓           ✓
state/              ✓✓          ✓           -
runtime_selector    ✓✓          ✓✓          ✓
前端组件             ✓           ✓✓          ✓✓
引擎切换             -           ✓✓          ✓✓
错误恢复             ✓           ✓✓          ✓
多模型兼容           -           ✓✓          ✓

图例:
✓✓✓ = 高覆盖 (> 90%)
✓✓  = 中覆盖 (60-90%)
✓   = 低覆盖 (30-60%)
-   = 不适用
```

---

**说明**: 本文档中的图表使用 ASCII art 和 Mermaid 语法，可在支持 Mermaid 的 Markdown 渲染器中查看完整效果。
