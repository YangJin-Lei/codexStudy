# 安全模式新UI - 实现进度

## ✅ 已完成 (Phase 1-2)

### Phase 1: 布局与结构 (100%)

#### 1. WorkbenchShell - 主容器
- ✅ 三栏布局（左侧文件树、中间会话列表、右侧终端）
- ✅ 可调整面板宽度（拖拽分隔条）
- ✅ localStorage 持久化窗口布局
- ✅ 全局键盘快捷键支持：
  - `Esc`: 关闭 diff 面板
  - `Ctrl+F`: 聚焦搜索框
  - `Ctrl+1/2/3`: 聚焦左/中/右面板
  - `Ctrl+M`: 触发合并操作
  - `Ctrl+Shift+Z`: 触发回滚操作
- ✅ 响应式状态管理

#### 2. DualTreePanel - 左侧文件树
- ✅ 双树视图（原项目 vs 克隆）
- ✅ 文件搜索功能
- ✅ 过滤模式：
  - All: 所有文件（默认）
  - Changed: 仅变更文件
  - Pending: 待合并文件
  - Conflicts: 冲突文件
- ✅ 树形结构展示
- ✅ 文件状态图标（新增/修改/删除/冲突/已合并）
- ✅ 点击文件打开 diff 视图
- ✅ 可调整面板宽度

#### 3. SessionWorkbench - 中间会话列表
- ✅ 会话列表展示
- ✅ 可展开/折叠会话详情
- ✅ localStorage 持久化展开状态
- ✅ 显示会话统计信息（新增/修改/删除文件数）
- ✅ 文件列表（最多显示10个，超出显示"还有X个文件..."）
- ✅ 点击文件打开 diff 视图
- ✅ 操作按钮：
  - Merge to project（主按钮）
  - Rollback merged
  - Traceback
  - Review（如果需要）
- ✅ 按钮状态管理（loading、disabled）
- ✅ 激活会话高亮显示

#### 4. SandboxTerminal - 右侧终端
- ✅ 终端运行记录展示
- ✅ 命令输出显示
- ✅ 可调整面板宽度
- ✅ 滚动查看历史记录

### Phase 2: Diff 视图与 Hunk 操作 (100%)

#### 1. FileDiffPane - 文件 diff 面板
- ✅ 文件路径和状态显示
- ✅ 关闭按钮
- ✅ Diff 模式切换：
  - 原项目 vs 克隆
  - 克隆历史
  - 三路合并（Phase 4+，当前禁用）
- ✅ Hunk 级别选择（checkbox）
- ✅ 全选/取消全选 hunk
- ✅ 显示选中 hunk 数量
- ✅ Diff 内容渲染：
  - 添加行（绿色）
  - 删除行（红色）
  - 上下文行（灰色）
- ✅ 特殊文件处理：
  - 新建文件
  - 删除文件
  - 二进制文件
  - 无变更文件

#### 2. Hunk 选择状态管理
- ✅ sessionStorage 持久化（key: `codex-new:hunks:${threadId}`）
- ✅ 跨组件状态同步
- ✅ 切换会话时自动恢复选择状态

#### 3. 合并/回滚操作
- ✅ `mergeCodexNewChanges` 集成
  - 支持全文件合并
  - 支持 hunk 级别合并
  - Loading 状态显示
  - 成功后清空 hunk 选择
- ✅ `rollbackCodexNewTask` 集成
  - 确认对话框
  - 支持全文件回滚
  - 支持 hunk 级别回滚
  - Loading 状态显示
  - 成功后清空 hunk 选择
- ✅ 错误处理和用户反馈

#### 4. Toast 通知系统
- ✅ 成功/错误/信息三种类型
- ✅ 自动消失（默认3秒）
- ✅ 手动关闭按钮
- ✅ 进入/退出动画
- ✅ 多个 toast 堆叠显示
- ✅ 固定在右上角

### 技术实现细节

#### 状态管理
- 使用 `useCodexNewState` hook 获取全局状态
- localStorage 用于窗口布局和会话展开状态
- sessionStorage 用于 hunk 选择状态（按 threadId 隔离）

#### 样式系统
- CSS 变量用于主题适配
- 响应式设计
- 平滑过渡动画
- 自定义滚动条样式

#### 图标系统
- 使用 lucide-react 图标库
- 单独导入避免打包体积过大
- 一致的图标尺寸和颜色

#### 国际化
- 使用 `useI18n` + `messages.ts` 的 `codexNew.workbench.*` 键
- 中英文双语支持

## 🚧 Phase 3: 完整目录树与性能优化（进行中，核心已完成）

#### 1. 完整目录树
- ✅ 显示完整项目结构（`All` 模式接入 `list_workspace_files`）
- ✅ 左栏默认 `All` 模式
- ✅ 双树差异化来源：
  - 原项目树：workspace 文件全集
  - 隔离克隆树：workspace 文件全集 + changedFiles 补集
- ✅ 首次进入 `All` 时自动展开根目录（便于看到完整结构）
- ✅ 目录折叠状态持久化（按 workspace + filterMode）
- ✅ 子目录懒加载骨架（分批渲染 + `Load more`）
- ✅ 虚拟滚动（`@tanstack/react-virtual`，按可见行渲染）
- ✅ 模块拆分（避免单文件过大）：
  - `utils/dualTreeModel.ts` — 路径归一化与树构建
  - `utils/dualTreeFlatten.ts` — 展平为虚拟列表行
  - `services/dualTreePreferences.ts` — 筛选/展开持久化
  - `hooks/useDualTreeExpansion.ts`
  - `hooks/useDualTreeWorkspaceFiles.ts`
  - `hooks/useDualTreeData.ts`
  - `components/VirtualizedExplorerTree.tsx`
  - `components/DualTreeSection.tsx`
  - `components/DualTreePanel.tsx` — 编排层

#### 2. 刷新机制
- ✅ 手动刷新按钮（WorkbenchShell）
- ✅ 搜索输入防抖（300ms）
- ⏳ 自动刷新（可配置间隔）
- ⏳ 刷新时完整保持展开/滚动位置

#### 3. 错误处理 UI
- ✅ 三栏面板错误边界（`WorkbenchPanelErrorBoundary` + 降级 UI + 重试）
- ✅ 全局刷新失败横幅（`WorkbenchRefreshErrorBanner` + 重试/关闭）
- ✅ 目录树加载失败重试（`ExplorerLoadErrorBanner` + `useDualTreeWorkspaceFiles.reload`）
- ⏳ 全局降级方案（部分面板失败时其余面板继续可用 — 已具备基础隔离）

#### 4. 性能优化
- ✅ 目录树虚拟滚动
- ✅ Diff hunk/行分页加载（`DiffHunkList` / `DiffHunkBody` + `constants/diffPagination.ts`）
- ✅ 终端输出分页（`PaginatedTerminalOutput`）
- ✅ Diff 对比模式 localStorage 持久化（`diffPanePreferences.ts`）
- ❌ 组件懒加载
- ❌ Diff 预览缓存（LRU）

## 🚧 Phase 4: 冲突检测与解决（核心已完成）

#### 1. 冲突检测
- ✅ `utils/conflictFiles.ts` — 基于 `task.status === mergeConflict` + 待合并文件推导冲突列表（兼容未来 `mergeStatus === conflict`）
- ✅ 合并失败时解析错误路径并置顶（`sessionStorage`）
- ✅ 冲突横幅操作：查看冲突 / 刷新改动 / 强制覆盖（占位禁用）
- ✅ 资源管理器冲突统计条（`ConflictStatsStrip`）
- ✅ 左树「冲突」筛选与 `mergeConflict` 状态对齐

#### 2. 冲突解决 UI
- ✅ 三路合并视图（`components/diff/ThreeWayMergeView.tsx`）— 原项目 vs 克隆双栏预览 + AI diff hunks
- ✅ 冲突文件自动切换三路模式；diff 面板 i18n
- ✅ 树节点 ⚠️ 角标与冲突路径集合同步
- ⏳ 「采用左侧/右侧」需后端强制覆盖 API，当前为占位按钮
- ❌ 冲突解决历史

#### 3. 操作确认
- ✅ 批量合并确认已有
- ✅ 回滚已合并确认对话框（`SessionConfirmDialog` + 文件列表预览）
- ❌ 操作预览
- ❌ 撤销/重做支持

#### 4. Traceback/Review 集成
- ✅ 工作台会话内 Traceback 侧栏（`SessionTracebackPanel` + `useCodexNewTraceback`）
- ✅ Review/测试门禁侧栏（`SessionReviewPanel` + `SessionTestSummary`）
- ✅ 会话项门禁状态条（`SessionGateStatusRow`）；合并前校验审查/测试
- ✅ `utils/reviewGate.ts` 统一门禁逻辑（与进程窗口一致）

## 📝 已知问题

1. **目录树首次体验**：根目录会自动展开，深层目录仍需手动展开（符合编辑器习惯，后续可加“全部展开”）
2. **类型定义**：部分 CSS 变量可能在不同主题下未定义，需要添加 fallback
3. **测试**：缺少单元测试和集成测试
4. **可访问性**：键盘导航需要进一步优化

## 🎯 下一步计划

### 立即执行
1. ✅ Phase 3 虚拟滚动接入与模块拆分
2. ✅ Phase 4 核心：冲突检测 + 三路合并 UI
3. ✅ 错误边界与刷新失败恢复
4. ✅ Traceback / Review 与工作台操作条打通（核心）
5. ✅ Phase 7 产品化 UI：统一面板头、主题化控件、Diff 底栏布局、路径展示优化

### 短期计划（1-2周）
1. 自动刷新偏好与刷新时保持展开/滚动位置
2. Diff 预览 LRU 缓存
3. 性能压测（万级文件目录）

### 中期计划（3-4周）
1. 完整冲突解决工作流
2. 单元测试与集成测试
3. 可访问性优化

## 📚 参考文档

- 设计文档：`h:\codex\docs\安全模式新UI.md`
- 状态管理：`h:\codex\desktop\src\features\codex-new\state.ts`
- 类型定义：`h:\codex\desktop\src\features\codex-new\types.ts`

## 🔧 开发命令

```bash
# 启动开发服务器
npm run dev

# 类型检查
npm run typecheck

# 构建
npm run build
```

## 📦 新增/拆分文件清单（Phase 3）

### 目录树模块
- `utils/dualTreeModel.ts`
- `utils/dualTreeFlatten.ts`
- `services/dualTreePreferences.ts`
- `hooks/useDualTreeExpansion.ts`
- `hooks/useDualTreeWorkspaceFiles.ts`
- `hooks/useDualTreeData.ts`
- `components/VirtualizedExplorerTree.tsx`
- `components/DualTreeSection.tsx`
- `components/DualTreePanel.tsx` / `.css`

### Phase 6（容错 + 分页 + 确认）
- `constants/diffPagination.ts`
- `services/diffPanePreferences.ts`
- `hooks/useDiffHunkPagination.ts`
- `hooks/usePaginatedLines.ts`
- `components/workbench/WorkbenchPanelErrorBoundary.tsx`
- `components/workbench/WorkbenchPanelErrorFallback.tsx`
- `components/workbench/WorkbenchRefreshErrorBanner.tsx`
- `components/diff/DiffHunkBody.tsx`
- `components/diff/DiffHunkList.tsx`
- `components/terminal/PaginatedTerminalOutput.tsx`
- `components/session/SessionConfirmDialog.tsx`

### Phase 7（产品化 UI）
- `utils/displayPath.ts`
- `components/workbench/WorkbenchPanelHeader.tsx`
- `components/workbench/WorkbenchFilterPills.tsx`
- `components/workbench/WorkbenchSelect.tsx`
- `components/workbench/workbench-controls.css`
- `components/session/SessionChangedFileRow.tsx`
- `workbench-surfaces.css`（三栏 surface token）
- 中间栏：会话滚动区 + Diff 底栏（`session-workbench-diff-dock`）
- 移除开发用 panel strip / 默认 alignment note

### Phase 5（Traceback / Review / 探索器重试）
- `utils/reviewGate.ts`
- `utils/formatWorkbenchTime.ts`
- `hooks/useCodexNewTraceback.ts`
- `components/session/SessionWorkbenchSidePanel.tsx`
- `components/session/SessionTracebackPanel.tsx`
- `components/session/SessionReviewPanel.tsx`
- `components/session/SessionGateStatusRow.tsx`
- `components/session/SessionTestSummary.tsx`
- `components/explorer/ExplorerLoadErrorBanner.tsx`

### Phase 4（冲突）
- `utils/conflictFiles.ts`
- `hooks/useCodexNewConflicts.ts`
- `hooks/useThreeWayPreviews.ts`
- `components/diff/DiffHunk.tsx`
- `components/diff/ThreeWayPreviewColumn.tsx`
- `components/diff/ThreeWayMergeView.tsx`
- `components/diff/FileDiffPane.tsx`
- `components/ConflictStatsStrip.tsx`
- `CodexNewConflictBanner.tsx`（操作条 + i18n）

### Phase 1-2（此前）
- `WorkbenchShell.tsx` / `.css`
- `SessionWorkbench.tsx` / `.css`
- `SandboxTerminal.tsx` / `.css`
- `FileDiffPane.tsx`（re-export）/ `.css`
- `Toast.tsx` / `.css`

---

**最后更新**: 2026-05-28
**实现进度**: Phase 1-6 完成；Phase 7 产品化 UI 首轮完成
**下一里程碑**: 自动刷新偏好；Diff 预览缓存；强制覆盖合并（待后端 API）；Diff 底栏可拖拽高度
