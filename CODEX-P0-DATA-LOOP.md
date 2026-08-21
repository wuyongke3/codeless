# Codeless — 下一步开发细化指令

> 将本文件内容完整粘贴给 Codex / AI 编码助手作为实现指令。
> P0.5、P0.7（品牌与产品定位）以及 P1 任务 5、6、7 已完成；下一步进入 P1 任务 8（样式体系重构）。
> 本文档定义剩余 P1（架构治理）、P2（功能补全）、P3（工程化）三个阶段的实现任务。

---

## 一、已完成能力基线

| 模块 | 状态 | 说明 |
|------|------|------|
| 应用工作台 | ✅ 完成 | 卡片展示、新建、复制、删除、3 种模板（dashboard/form/blank） |
| 页面设计器 | ✅ 完成 | 拖放画布、属性编辑、撤销/重做（30 步上限）、预览、保存、发布 |
| 9 种组件渲染 | ✅ 完成 | heading / text / button / input / select / table / stat / image / divider |
| SQLite 持久化 | ✅ 完成 | projects + activities + customers / orders / tickets 共 5 张表 |
| 安全 IPC | ✅ 完成 | contextBridge 暴露 11 个方法，SQL 注入防护 |
| 数据模型 CRUD | ✅ 完成 | 浏览表结构、新增 / 编辑 / 删除记录、分页（每页 20 条） |
| 组件数据绑定 | ✅ 完成 | 表格 / 指标卡 / 下拉框可绑定 SQLite 表展示真实数据 |
| 表单提交 | ✅ 完成 | 按钮组件将表单字段写入目标表（含智能字段映射 aliases） |
| 浏览器降级 | ✅ 完成 | 无 Electron 时 fallback 到 localStorage |
| 种子数据 | ✅ 完成 | 3 个示例应用 + 客户 / 订单 / 工单各 3-4 条演示记录 |

### 已完成修复（P0.5 + P1 任务 5）

| 修复项 | 文件 | 说明 |
|--------|------|------|
| README 格式损坏 | `README.md` | 修复第 82-86 行 `` `npm run` `` 格式 |
| HTML 元信息 | `index.html` | `lang="zh-CN"`，`title="Formix - 本地低代码工作台"` |
| PowerShell 兼容 | `package.json` | 拆分为 `build:check` + `build:vite` 两个独立脚本 |
| EASYGO_ 残留 | `scripts/build.mjs` | 7 处 `EASYGO_` 前缀全部改为 `FORMIX_` |
| tableModels 硬编码 | `useLowcode.ts` | 删除 20 行重复表结构定义，`tables` 改为动态加载空数组初始化 |

### 当前代码结构（2026-08-21 更新）

```text
electron/main/index.ts              主进程 + SQLite + 安全 IPC handler
electron/preload/index.ts            contextBridge 安全暴露
src/App.vue                         73 行 · 应用外壳、侧边栏、顶栏、动态视图与弹窗挂载
src/views/WorkspaceView.vue          工作台视图
src/views/BuilderView.vue            页面设计器视图
src/views/DataModelView.vue          数据模型视图 + 行编辑辅助逻辑
src/views/FlowsView.vue              自动化流程视图
src/views/ActivityView.vue           运行日志视图
src/components/common/*.vue          预览、行编辑、新建应用、确认删除弹窗
src/composables/useLowcode.ts        61 行 · composable 协调器
src/composables/useDesigner.ts       设计器状态与交互逻辑
src/composables/useDataModel.ts      数据模型 CRUD 与绑定逻辑
src/composables/useProjectManager.ts 项目、活动与启动管理逻辑
src/composables/utils.ts             共享工具函数、常量与浏览器降级数据
src/components/WidgetRenderer.vue    组件渲染 + 动态数据加载
src/components/AppIcon.vue           SVG 图标系统
src/types/lowcode.ts                 领域类型定义
src/style.css                        全局与现有界面样式（待按任务 8 模块化）
src/main.ts                          应用入口（待按任务 15 增加错误处理）
```
---

## 二、已知问题清单（更新）

### A 类 · 文档 / 配置缺陷 — ✅ 全部已修复

### B 类 · 架构 / 代码质量

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| B1 | tableModels 硬编码重复 | `useLowcode.ts` | ✅ 已修复 |
| B2 | App.vue 过于庞大 | `App.vue` 73 行，视图已拆分 | ✅ 已修复（P1 任务 7） |
| B3 | useLowcode.ts 职责混杂 | `useLowcode.ts` 61 行，已拆分为多个 composable | ✅ 已修复（P1 任务 6） |
| B4 | style.css 不可维护 | `style.css` 40 行 | ⏳ 待重构（P1 任务 8） |
| B5 | main.ts 无错误处理 | `main.ts` 10 行 | ⏳ 待修复（P3 任务 15） |
| B6 | utils.ts 已创建但 useLowcode.ts 未引用 | 已从 `utils.ts` 导入共享函数 | ✅ 已修复（P1 任务 6） |

### C 类 · 功能缺失

| # | 问题 | 说明 |
|---|------|------|
| C1 | 动态建表不可用 | `assertValidTableName` 白名单仅允许 customers/orders/tickets，UI 按钮只弹 toast |
| C2 | 组件交互系统缺失 | 除按钮提交外，组件无点击事件、值变化联动、运行时/设计模式区分 |
| C3 | 单页限制 | 每个应用仅支持一个页面（`layout.pageName`），无多页面创建与切换 |
| C4 | 自动化流程为纯静态 UI | 硬编码的流程展示，无数据模型、无编辑器、无执行引擎 |
| C5 | 全局搜索为空壳 | 顶栏搜索框无任何功能实现 |

### D 类 · 品牌 / 产品定位 — ✅ 全部完成

| # | 问题 | 涉及位置 | 说明 |
|---|------|---------|------|
| D1 | 软件名需从 Formix 改为 Codeless | 全项目 | ✅ 已完成品牌重命名 |
| D2 | 侧边栏显示虚假用户信息 | `App.vue` | ✅ 已移除用户概念 |
| D3 | 缺少产品标语 | `App.vue` 侧边栏底部 | ✅ 已添加产品标语 |
| D4 | Logo 仍为占位符 | `public/logo.png` + 侧边栏 brand-mark | ✅ 已生成 Codeless Logo 并接入构建图标 |

---

## 三、P0.7 品牌与产品定位（立即执行，共 < 1h）

### 任务 A：全项目品牌重命名 Formix → Codeless

**产品名**：Codeless
**简介词**：Codeless — 快速原型工具，全本地，下载即用，永久免费

需要修改的完整文件清单（共 10 个文件，约 30 处替换）：

| 文件 | 行 | 当前值 | 替换为 |
|------|---|--------|--------|
| `index.html` | 8 | `Formix - 本地低代码工作台` | `Codeless — 快速原型工具` |
| `package.json` | 2 | `"formix-local"` | `"codeless"` |
| `package.json` | 5 | `Formix local-first low-code platform...` | `Codeless — local-first rapid prototyping tool...` |
| `package.json` | 6 | `"Formix"` | `"Codeless"` |
| `package.json` | 10 | `"formix"` | `"codeless"` |
| `electron-builder.json` | 3 | `com.formix.local` | `com.codeless.local` |
| `electron-builder.json` | 5 | `Formix` | `Codeless` |
| `electron-builder.json` | 6 | `Copyright (c) 2026 Formix` | `Copyright (c) 2026 Codeless` |
| `electron-builder.json` | 51-53 | `Formix` / `formix` | `Codeless` / `codeless` |
| `electron/main/index.ts` | 33 | `FORMIX_SMOKE_TEST` | `CODELESS_SMOKE_TEST` |
| `electron/main/index.ts` | 148 | `formix-local.sqlite` | `codeless.sqlite` |
| `electron/main/index.ts` | 443 | `Formix - 本地低代码工作台` | `Codeless — 快速原型工具` |
| `electron/main/index.ts` | 461 | `FORMIX_SMOKE_OK` | `CODELESS_SMOKE_OK` |
| `scripts/build.mjs` | 148-154 | `FORMIX_` 前缀（7 处） | `CODELESS_` |
| `src/App.vue` | 79 | `Formix` | `Codeless` |
| `src/App.vue` | 85 | `Formix` / `Local Studio` | `Codeless` / `Rapid Prototyper` |
| `src/App.vue` | 110 | `Formix Workspace` | `Codeless Workspace` |
| `src/App.vue` | 251 | `formix.local/` | `codeless.local/` |
| `src/composables/useLowcode.ts` | 80,361,376,397 | `formix-projects` (localStorage key) | `codeless-projects` |
| `src/composables/useLowcode.ts` | 302,313 | `application/formix-widget` | `application/codeless-widget` |
| `src/composables/utils.ts` | 79 | `formix-projects` | `codeless-projects` |
| `README.md` | 全文 | `Formix` / `formix` | `Codeless` / `codeless` |

**注意**：`FORMIX_` 环境变量前缀（`build.mjs`）也需改为 `CODELESS_`。

---

### 任务 B：移除用户概念

**目标**：单机本地工具，不需要显示用户信息。

**文件**：`src/App.vue`

1. **删除** 第 102 行 `profile-button`（整个按钮）：
   ```html
   <!-- 删除以下整行 -->
   <button class="profile-button">...</button>
   ```

2. **替换为** 产品标语卡片：
   ```html
   <div class="sidebar-tagline">
     <AppIcon name="sparkle" :size="14" />
     <span>快速原型 · 全本地 · 下载即用 · 永久免费</span>
   </div>
   ```

3. **删除** `style.css` 第 23 行中 `.profile-button` 相关样式（约 80 个字符）

4. **新增** `.sidebar-tagline` 样式（在 `sidebar-bottom` 区域内）：
   ```css
   .sidebar-tagline { display:flex; align-items:center; gap:6px; padding:8px 10px; margin:8px 3px 0; border-radius:8px; background:#ffffff08; color:#666a7d; font-size:7.5px; line-height:1.5; }
   ```

---

### 任务 C：设计 Codeless Logo

**目标**：为 Codeless 设计一个简洁的图表/图标 Logo。

#### 设计要求

- **风格**：极简几何，体现"无代码 / 快速搭建"概念
- **主色**：`#665cf6`（当前品牌紫）
- **形状建议**：
  - 方案 A：抽象积木/方块组合（代表组件拼装）—— 2-3 个圆角方块以错位方式叠加
  - 方案 B：闪电 + 画布框（代表快速原型）—— 圆角矩形内嵌一道闪电
  - 方案 C：字母 C 变形 —— 将 C 设计为展开的画布/折叠面板形态
- **输出**：
  - `public/logo.png`（512×512，用于浏览器 favicon）
  - `build/icons/icon.ico`（Windows 应用图标）
  - `build/icons/icon.icns`（macOS 应用图标）
  - `build/icons/1024x1024.png`（Linux 应用图标）

#### 侧边栏 brand-mark 改造

当前 `App.vue` 第 85 行的 brand-mark 使用 CSS 绘制，需同步更新：
```html
<div class="brand-mark">
  <img src="/logo.png" alt="Codeless" width="34" height="34" style="border-radius:10px" />
</div>
```
或保留纯 CSS 方案但改为新 Logo 造型。

---

## 四、P1 架构治理（当前迭代）

### 任务 6：拆分 useLowcode.ts 为多个 composable（✅ 已完成）

**完成状态**：已完成 6.0-6.4；`useLowcode.ts` 已精简为协调器，并接入 `useDesigner`、`useDataModel`、`useProjectManager`。

#### 6.0 完成已有工作（首要 — 消除重复）

`useLowcode.ts` 第 1-85 行与 `utils.ts` 完全重复，需要：

1. **删除** `useLowcode.ts` 第 2-85 行（从 `import type` 到 `fallbackBootstrap` 函数结束）
2. **替换为** 从 `utils.ts` 导入：
   ```typescript
   import type { ActivityItem, BootstrapData, LowCodeProject, LowCodeWidget, PageLayout, QueryResult, TableMeta, WidgetProps, WidgetType } from '../types/lowcode'
   import { type Area, paletteGroups, clone, makeId, createWidget, widgetDefaults, createTemplateLayout, fallbackBootstrap } from './utils'
   ```
3. **确认** `App.vue` 第 4 行 `import { navItems, paletteGroups, useLowcode } from './composables/useLowcode'` 改为：
   ```typescript
   import { navItems, paletteGroups } from './composables/utils'
   import { useLowcode } from './composables/useLowcode'
   ```
4. **确认** `utils.ts` 已导出 `navItems`（当前已有）

#### 6.1 新建 `src/composables/useDesigner.ts`

从 `useLowcode.ts` 提取设计器专属逻辑（约 120 行）：

**状态**：`selectedWidgetId`, `paletteSearch`, `paletteTab`, `inspectorTab`, `zoom`, `dirty`, `saving`, `canvasRef`, `historyStack`, `futureStack`

**计算属性**：`selectedWidget`, `filteredGroups`

**函数**：`pushHistory`, `undo`, `redo`, `startPaletteDrag`, `addWidget`, `onCanvasDrop`, `startWidgetMove`, `moveWidget`, `stopWidgetMove`, `removeSelectedWidget`, `duplicateSelectedWidget`, `updateColumns`, `widgetStyle`

**键盘快捷键**：`onKeydown`（仅设计器相关部分：Delete/Backspace 删除、Ctrl+Z 撤销/重做、Ctrl+S 保存）

导出签名：
```typescript
import type { ComputedRef } from 'vue'
import type { LowCodeProject } from '../types/lowcode'
import { clone, makeId, createWidget, widgetDefaults, paletteGroups } from './utils'
import type { PaletteItem } from './utils'

export function useDesigner(
  currentProject: ComputedRef<LowCodeProject | undefined>,
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void,
  saveProject: (message?: string) => Promise<void>,
) {
  // 状态声明
  const selectedWidgetId = ref('')
  const paletteSearch = ref('')
  const paletteTab = ref<'components' | 'pages'>('components')
  const inspectorTab = ref<'properties' | 'events'>('properties')
  const zoom = ref(0.78)
  const dirty = ref(false)
  const saving = ref(false)
  const canvasRef = ref<HTMLElement | null>(null)
  const historyStack = ref<PageLayout[]>([])
  const futureStack = ref<PageLayout[]>([])

  // 计算属性
  const selectedWidget = computed(() =>
    currentProject.value?.layout.widgets.find(w => w.id === selectedWidgetId.value)
  )
  const filteredGroups = computed(() => {
    const keyword = paletteSearch.value.trim().toLowerCase()
    if (!keyword) return paletteGroups
    return paletteGroups.map(g => ({
      ...g,
      items: g.items.filter(i => `${i.name}${i.description}`.toLowerCase().includes(keyword))
    })).filter(g => g.items.length)
  })

  // 方法实现...
  function pushHistory() { /* ... */ }
  function undo() { /* ... */ }
  function redo() { /* ... */ }
  function startPaletteDrag(event: DragEvent, type: WidgetType) { /* ... */ }
  function addWidget(type: WidgetType, x?: number, y?: number) { /* ... */ }
  function onCanvasDrop(event: DragEvent) { /* ... */ }

  let moveState: { widget: LowCodeWidget; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null
  function startWidgetMove(event: PointerEvent, widget: LowCodeWidget) { /* ... */ }
  function moveWidget(event: PointerEvent) { /* ... */ }
  function stopWidgetMove() { /* ... */ }
  function removeSelectedWidget() { /* ... */ }
  function duplicateSelectedWidget() { /* ... */ }
  function updateColumns(event: Event) { /* ... */ }
  function widgetStyle(widget: LowCodeWidget) { /* ... */ }

  function onKeydown(event: KeyboardEvent) {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)
    if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) removeSelectedWidget()
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject() }
    if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
  }

  return {
    selectedWidgetId, paletteSearch, paletteTab, inspectorTab,
    zoom, dirty, saving, canvasRef, historyStack, futureStack,
    selectedWidget, filteredGroups,
    pushHistory, undo, redo, startPaletteDrag, addWidget, onCanvasDrop,
    startWidgetMove, moveWidget, stopWidgetMove,
    removeSelectedWidget, duplicateSelectedWidget, updateColumns, widgetStyle,
    onKeydown,
  }
}
```

#### 6.2 新建 `src/composables/useDataModel.ts`

从 `useLowcode.ts` 提取数据模型操作（约 100 行）：

**状态**：`tables`, `tableRows`, `tableColumns`, `tableTotal`, `tableLoading`, `tablePage`, `showRowEditor`, `editingRow`, `newRowData`, `selectedTableId`

**计算属性**：`selectedTable`

**函数**：`loadTables`, `loadTableRows`, `insertTableRow`, `updateTableRow`, `deleteTableRow`, `loadWidgetData`, `submitFormToTable`

**watch**：`selectedTableId` 变化时重置分页并加载

导出签名：
```typescript
import type { ComputedRef } from 'vue'
import type { LowCodeProject, LowCodeWidget, QueryResult, TableMeta } from '../types/lowcode'

export function useDataModel(
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void,
  currentProject: ComputedRef<LowCodeProject | undefined>,
) {
  const TABLE_PAGE_SIZE = 20
  const tables = ref<TableMeta[]>([])
  const tableRows = ref<Record<string, unknown>[]>([])
  const tableColumns = ref<string[]>([])
  const tableTotal = ref(0)
  const tableLoading = ref(false)
  const tablePage = ref(0)
  const showRowEditor = ref(false)
  const editingRow = ref<Record<string, unknown> | null>(null)
  const newRowData = ref<Record<string, unknown>>({})
  const selectedTableId = ref('')

  const selectedTable = computed(() =>
    tables.value.find(t => t.name === selectedTableId.value) ?? tables.value[0]
  )

  async function loadTables() { /* 从 useLowcode.ts 161-175 行迁移 */ }
  async function loadTableRows(tableName?: string) { /* 178-196 行 */ }
  async function insertTableRow(data: Record<string, unknown>) { /* 198-209 行 */ }
  async function updateTableRow(id: unknown, data: Record<string, unknown>) { /* 211-222 行 */ }
  async function deleteTableRow(id: unknown) { /* 224-235 行 */ }
  async function loadWidgetData(widget: LowCodeWidget): Promise<QueryResult | null> { /* 237-246 行 */ }
  async function submitFormToTable(buttonWidget: LowCodeWidget) { /* 248-282 行 */ }

  watch(selectedTableId, () => { tablePage.value = 0; void loadTableRows() })

  return {
    tables, tableRows, tableColumns, tableTotal, tableLoading, tablePage,
    showRowEditor, editingRow, newRowData, selectedTableId, selectedTable,
    loadTables, loadTableRows, insertTableRow, updateTableRow, deleteTableRow,
    loadWidgetData, submitFormToTable,
  }
}
```

#### 6.3 新建 `src/composables/useProjectManager.ts`

从 `useLowcode.ts` 提取项目管理（约 90 行）：

**状态**：`projects`, `activities`, `currentProjectId`, `showCreateModal`, `showDeleteConfirm`, `createForm`

**计算属性**：`publishedCount`, `totalWidgets`

**函数**：`saveProject`, `publishProject`, `duplicateProject`, `openCreateProject`, `createProject`, `confirmDeleteProject`, `openBuilder`

导出签名：
```typescript
import type { LowCodeProject } from '../types/lowcode'
import { clone, makeId, createTemplateLayout } from './utils'

export function useProjectManager(
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void,
) {
  const projects = ref<LowCodeProject[]>([])
  const activities = ref<ActivityItem[]>([])
  const currentProjectId = ref('')
  const showCreateModal = ref(false)
  const showDeleteConfirm = ref(false)
  const createForm = reactive({
    name: '', description: '', category: '业务应用',
    template: 'dashboard' as 'dashboard' | 'form' | 'blank'
  })

  const publishedCount = computed(() => projects.value.filter(p => p.status === 'published').length)
  const totalWidgets = computed(() => projects.value.reduce((sum, p) => sum + p.layout.widgets.length, 0))

  async function saveProject(project: LowCodeProject, projects_list: Ref<LowCodeProject[]>, message = '页面已保存到本地 SQLite') { /* 355-365 行逻辑 */ }
  async function publishProject(currentProject: LowCodeProject) { /* 366-369 行 */ }
  async function duplicateProject(project: LowCodeProject) { /* 370-381 行 */ }
  function openCreateProject() { /* 382-385 行 */ }
  async function createProject() { /* 386-392 行 */ }
  async function confirmDeleteProject() { /* 393-400 行 */ }
  function openBuilder(projectId: string, resetDesigner?: () => void) { /* 284-287 行，resetDesigner 回调重置设计器状态 */ }

  return {
    projects, activities, currentProjectId,
    showCreateModal, showDeleteConfirm, createForm,
    publishedCount, totalWidgets,
    saveProject, publishProject, duplicateProject,
    openCreateProject, createProject, confirmDeleteProject, openBuilder,
  }
}
```

**注意**：`saveProject` 和 `openBuilder` 需要跨 composable 协作：
- `saveProject` 需要访问 `projects` 列表和 `dirty` 状态 → 通过参数传入
- `openBuilder` 需要重置 `selectedWidgetId`, `historyStack`, `futureStack`, `dirty` → 通过回调函数传入

#### 6.4 精简 `src/composables/useLowcode.ts` 为协调器

最终目标：约 80-100 行，仅负责初始化和组合。

```typescript
import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import type { ActivityItem, BootstrapData, LowCodeProject } from '../types/lowcode'
import { type Area, fallbackBootstrap } from './utils'
import { useDesigner } from './useDesigner'
import { useDataModel } from './useDataModel'
import { useProjectManager } from './useProjectManager'

export function useLowcode() {
  const loading = ref(true)
  const databasePath = ref('')
  const activeArea = ref<Area>('builder')
  const showPreview = ref(false)
  const toast = reactive({ show: false, message: '', tone: 'success' as 'success' | 'info' | 'danger' })

  function notify(message: string, tone: 'success' | 'info' | 'danger' = 'success') {
    toast.message = message; toast.tone = tone; toast.show = true
    window.setTimeout(() => { toast.show = false }, 2600)
  }

  // 组合子 composable
  const pm = useProjectManager(notify)
  const currentProject = computed(() => pm.projects.value.find(p => p.id === pm.currentProjectId.value))
  const dm = useDataModel(notify, currentProject)
  const designer = useDesigner(currentProject, notify, (msg) => pm.saveProject(currentProject.value, pm.projects, msg))

  // openBuilder 需要重置设计器状态
  function openBuilder(projectId: string) {
    pm.openBuilder(projectId, () => {
      designer.selectedWidgetId.value = ''
      designer.historyStack.value = []
      designer.futureStack.value = []
      designer.dirty.value = false
    })
  }

  async function bootstrap() {
    loading.value = true
    try {
      const result = window.lowcode ? await window.lowcode.bootstrap() : fallbackBootstrap()
      pm.projects.value = result.projects
      pm.activities.value = result.activities
      databasePath.value = result.databasePath
      pm.currentProjectId.value = result.projects[0]?.id || ''
      await dm.loadTables()
    } catch (error) {
      console.error(error)
      const result = fallbackBootstrap()
      pm.projects.value = result.projects
      databasePath.value = result.databasePath
      notify('数据库连接失败，已进入演示模式', 'danger')
    } finally { loading.value = false }
  }

  function navigate(area: Area) { activeArea.value = area }
  function formatRelative(value: string) { /* 保留原有实现 */ }
  function formatDate(value: string) { /* 保留原有实现 */ }

  onMounted(() => { void bootstrap(); window.addEventListener('keydown', designer.onKeydown) })
  onBeforeUnmount(() => { window.removeEventListener('keydown', designer.onKeydown); window.removeEventListener('pointermove', designer.moveWidget) })

  return {
    loading, databasePath, activeArea, toast, showPreview,
    navigate, notify, formatRelative, formatDate, openBuilder,
    // 展开子 composable
    ...designer, ...dm, ...pm,
    currentProject,
  }
}
```

**验证**：完成后运行 `npx vue-tsc --noEmit` 确认零错误。

---

### 任务 7：拆分 App.vue 为独立视图组件（✅ 已完成）

**目标**：将 261 行模板拆分为 5 个视图组件 + 4 个弹窗组件。

#### 7.1 新建视图组件

```text
src/views/
  WorkspaceView.vue    -- 工作台（welcome-banner + metric-grid + project-grid）
  BuilderView.vue      -- 设计器（toolbar + component-panel + canvas + inspector）
  DataModelView.vue    -- 数据模型（hero + banner + data-layout + row-editor）
  FlowsView.vue        -- 自动化流程（flow-toolbar + flow-canvas）
  ActivityView.vue     -- 运行日志（hero + summary + activity-card）
```

每个视图组件通过 `defineProps` 接收所需数据，通过 `defineEmits` 向上通知操作事件。

**App.vue 中各视图对应行范围**（便于迁移）：

| 视图 | App.vue 行范围 | 核心 CSS 类名前缀 |
|------|---------------|-----------------|
| WorkspaceView | 120-139 | `.welcome-`, `.metric-`, `.section-`, `.project-` |
| BuilderView | 141-216 | `.builder-`, `.component-`, `.panel-`, `.canvas-`, `.design-`, `.inspector-`, `.property-`, `.events-`, `.page-` |
| DataModelView | 218-230 | `.module-`, `.database-`, `.data-`, `.model-`, `.schema-` |
| FlowsView | 232-242 | `.flow-`, `.connector` |
| ActivityView | 244-248 | `.activity-` |

**BuilderView.vue 拆分要点**（最复杂，约 75 行模板）：
- 接收 props：`currentProject`, `selectedWidget`, `selectedWidgetId`, `paletteTab`, `paletteSearch`, `inspectorTab`, `zoom`, `dirty`, `saving`, `historyStack`, `futureStack`, `filteredGroups`, `tables`, `paletteGroups`
- emits：`update:selectedWidgetId`, `update:paletteTab`, `update:paletteSearch`, `update:inspectorTab`, `update:zoom`, `update:dirty`, `undo`, `redo`, `save`, `publish`, `preview`, `addWidget`, `removeWidget`, `duplicateWidget`, `notify`
- 内部保留属性面板的表单绑定逻辑

**DataModelView.vue 拆分要点**（约 12 行模板 + 行编辑逻辑）：
- 将 App.vue 第 19-74 行的行编辑辅助函数（`startNewRow`, `startEditRow`, `rowEditorValue`, `setRowEditorValue`, `rowId`, `formatCell`, `commitRowEditor`, `removeRow`）迁移到此组件内部
- 接收 props：`tables`, `selectedTable`, `selectedTableId`, `tableRows`, `tableColumns`, `tableTotal`, `tableLoading`, `tablePage`, `databasePath`
- emits：`update:selectedTableId`, `loadTableRows`, `insertRow`, `updateRow`, `deleteRow`

#### 7.2 新建弹窗组件

```text
src/components/common/
  PreviewModal.vue         -- 预览弹窗（App.vue 第 251 行）
  RowEditorDialog.vue      -- 行编辑弹窗（App.vue 第 254 行）
  CreateProjectDialog.vue  -- 新建应用弹窗（App.vue 第 255 行）
  ConfirmDialog.vue        -- 通用确认删除弹窗（App.vue 第 257 行）
```

#### 7.3 精简 App.vue

App.vue 仅保留外壳（目标约 80-100 行模板）：
- 启动画面（boot-screen）：第 78-80 行
- 侧边栏（sidebar）：第 83-104 行
- 顶栏（topbar）：第 107-118 行
- `<component :is="currentView" />` 动态视图切换
- Toast 通知：第 258 行

---

### 任务 8：样式体系重构

**目标**：将 40 行超密集 `style.css` 拆分为可维护的模块化样式。

#### 8.1 提取设计令牌

新建 `src/styles/tokens.css`：
```css
:root {
  /* 品牌色 */
  --purple: #665cf6; --purple-dark: #5549ea; --purple-light: #eeecff;
  /* 语义色 */
  --green: #20b486; --orange: #f59e0b; --red: #e35568; --blue: #3698f5;
  /* 中性色 */
  --ink: #171a2b; --ink-secondary: #22263a; --muted: #74798c; --muted-light: #969aaa;
  --line: #e8e9f0; --line-light: #f0f0f4; --bg: #f5f6fa; --bg-sidebar: #111321; --white: #ffffff;
  /* 间距 */
  --space-xs: 4px; --space-sm: 8px; --space-md: 12px; --space-lg: 16px; --space-xl: 24px; --space-2xl: 32px;
  /* 圆角 */
  --radius-sm: 6px; --radius-md: 9px; --radius-lg: 13px; --radius-xl: 18px;
  /* 阴影 */
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.04); --shadow-md: 0 6px 18px rgba(0,0,0,0.06); --shadow-lg: 0 16px 40px rgba(0,0,0,0.10);
  /* 字体 */
  --font-sans: 'DM Sans', 'Noto Sans SC', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

#### 8.2 全局基础样式

保留 `src/style.css` 仅包含全局 reset 和 `.app-shell` 布局：
```css
@import './styles/tokens.css';
* { box-sizing: border-box; }
html, body, #app { margin: 0; width: 100%; height: 100%; overflow: hidden; font-family: var(--font-sans); }
button, input, textarea, select { font: inherit; }
button { border: 0; cursor: pointer; color: inherit; }
button:disabled { opacity: .35; cursor: not-allowed; }
input, textarea, select { outline: none; }
.app-shell { display: grid; grid-template-columns: 226px minmax(0, 1fr); width: 100vw; height: 100vh; background: var(--bg); }
```

#### 8.3 样式迁移映射表

从 `style.css` 按类名前缀迁移到各组件的 `<style scoped>`：

| CSS 行 | 类名前缀 | 迁移目标 |
|--------|---------|---------|
| 第 10-12 行 | `.boot-` | `App.vue` scoped |
| 第 13-23 行 | `.sidebar`, `.brand`, `.nav-`, `.recent-`, `.local-`, `.profile-` | `App.vue` scoped |
| 第 24-25 行 | `.topbar`, `.status-pill`, `.icon-button`, `.primary-button`, `.ghost-` | `App.vue` scoped |
| 第 27 行 | `.view-scroll` | 各视图共享，保留全局 |
| 第 28 行 | `.welcome-`, `.metric-`, `.section-`, `.project-` | `WorkspaceView.vue` scoped |
| 第 31 行 | `.builder-`, `.component-`, `.panel-`, `.canvas-`, `.design-`, `.page-` | `BuilderView.vue` scoped |
| 第 33 行 | `.render-`, `.widget-`, `.handle`, `.table-` | `WidgetRenderer.vue` scoped |
| 第 34 行 | `.inspector-`, `.property-`, `.events-` | `BuilderView.vue` scoped |
| 第 35 行 | `.module-`, `.database-`, `.data-`, `.model-`, `.schema-` | `DataModelView.vue` scoped |
| 第 36 行 | `.flow-`, `.connector`, `.activity-` | 分别迁移到 `FlowsView.vue` 和 `ActivityView.vue` scoped |
| 第 37 行 | `.modal-`, `.dialog`, `.preview-`, `.confirm-`, `.toast-` | 各弹窗组件 scoped |
| 第 38-40 行 | `@media` 响应式 | 保留全局或迁移到对应组件 |

---

## 五、P2 功能补全（中期迭代）

### 任务 9：动态建表能力

**目标**：用户可通过 UI 创建新数据表、添加字段，突破硬编码白名单限制。

#### 9.1 类型扩展

**文件**：`src/types/lowcode.ts`

```typescript
export interface CreateTableInput {
  name: string; title: string; color: string
  fields: Array<{ name: string; type: 'INTEGER' | 'TEXT' | 'REAL' | 'DATETIME'; description: string; isPrimaryKey: boolean; isNotNull: boolean }>
}
export interface AddFieldInput {
  name: string; type: 'INTEGER' | 'TEXT' | 'REAL' | 'DATETIME'; description: string; isNotNull: boolean
}
// LowCodeApi 追加：
//   createTable: (input: CreateTableInput) => Promise<TableMeta>
//   addField: (table: string, field: AddFieldInput) => Promise<TableMeta>
```

#### 9.2 主进程新增 IPC

**文件**：`electron/main/index.ts`

1. 新增运行时注册表：`const registeredTables: Map<string, { title: string; color: string; descriptions: Record<string, string> }> = new Map()`
2. 修改 `assertValidTableName`：允许 `BUSINESS_TABLES` + `registeredTables` 中的表名
3. 新增 `lowcode:create-table` handler：校验表名 → 构建 DDL → 执行 → 注册 → 返回 TableMeta
4. 新增 `lowcode:add-field` handler：`ALTER TABLE ADD COLUMN` → 更新 descriptions → 返回 TableMeta
5. 修改 `listBusinessTables`：遍历 `BUSINESS_TABLES` + `registeredTables`

#### 9.3 预加载暴露

追加 `createTable` 和 `addField` 两个方法到 `electron/preload/index.ts`。

#### 9.4 前端 UI

在 `DataModelView.vue` 中：
1. "新建数据表"按钮弹出创建向导弹窗
2. "添加字段"按钮弹出字段创建弹窗

---

### 任务 10：组件事件系统

**目标**：让画布组件在运行时（预览模式）具备交互能力。

#### 10.1 类型扩展

```typescript
export type WidgetEventType = 'click' | 'change' | 'submit'
export interface WidgetEventAction { type: 'navigate' | 'setValue' | 'submitData' | 'showToast'; target?: string; value?: string }
export interface WidgetEvent { id: string; event: WidgetEventType; actions: WidgetEventAction[] }
// WidgetProps 追加：events?: WidgetEvent[]
```

#### 10.2 WidgetRenderer 运行时模式

新增 `runtime` prop，设计模式不可交互，运行时模式触发事件动作。

#### 10.3 事件执行引擎

新建 `src/composables/useRuntime.ts`，实现 `executeWidgetEvent`。

#### 10.4 属性面板"交互"Tab 实现

将 `events-panel` 空壳替换为事件配置界面。

---

### 任务 11：多页面支持

**目标**：每个应用支持创建多个页面，支持页面间切换。

#### 11.1 类型扩展

```typescript
// PageLayout 追加 pageId: string
// LowCodeProject 追加 pages: PageLayout[] 和 activePageId: string
// layout 字段标记为 @deprecated
```

**向后兼容迁移**：在 `electron/main/index.ts` 的 `mapProject` 中增加迁移逻辑。

#### 11.2 页面管理 UI

设计器左侧"页面"Tab 显示页面列表、支持新建/重命名/删除/切换。

---

### 任务 12：自动化流程数据模型

**目标**：流程从静态 UI 原型变为可持久化的数据驱动功能。

#### 12.1 类型定义

```typescript
export type FlowNodeType = 'trigger' | 'condition' | 'action'
export interface FlowNode { id: string; type: FlowNodeType; title: string; config: Record<string, unknown>; position: { x: number; y: number } }
export interface FlowEdge { id: string; source: string; target: string; label?: string }
export interface AutomationFlow { id: string; name: string; description: string; enabled: boolean; nodes: FlowNode[]; edges: FlowEdge[]; createdAt: string; updatedAt: string }
```

#### 12.2 数据库表

```sql
CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1, flow_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

#### 12.3 IPC 接口

| IPC Channel | 说明 |
|-------------|------|
| `lowcode:list-flows` | 获取所有流程 |
| `lowcode:save-flow` | 创建或更新流程 |
| `lowcode:delete-flow` | 删除流程 |
| `lowcode:toggle-flow` | 启用/禁用流程 |

#### 12.4 前端流程编辑器

第一期：列表 + 配置面板模式；第二期：可视化节点拖放 + 连线编辑器。

---

### 任务 13：全局搜索

**目标**：实现顶栏搜索框的跨项目、跨数据表搜索。

- `Cmd+K` / `Ctrl+K` 快捷键唤起搜索弹窗
- 输入关键词后实时搜索（debounce 300ms）
- 结果分组显示：应用 / 数据记录
- 点击结果跳转

---

## 六、P3 工程化提升（持续改进）

### 任务 14：引入测试

```bash
npm install -D vitest @vue/test-utils
```

优先覆盖：
| 测试文件 | 覆盖内容 |
|---------|---------|
| `src/composables/__tests__/utils.spec.ts` | `clone`, `makeId`, `widgetDefaults`, `createWidget`, `createTemplateLayout` |
| `src/composables/__tests__/useDataModel.spec.ts` | `loadTables` 降级模式 |
| `electron/main/__tests__/security.spec.ts` | `parseWhere`, `parseOrderBy`, `sanitizeWriteData`, `assertValidIdentifier` |

---

### 任务 15：错误边界与日志

**文件**：`src/main.ts` — 追加 `app.config.errorHandler` 和 `app.config.warnHandler`。

**文件**：`electron/main/index.ts` — 新增结构化日志函数，替换所有 `console.error`。

---

### 任务 16：数据备份与导出

新增 `lowcode:export-data` IPC，前端触发导出为 JSON 文件。

---

## 七、执行顺序与依赖关系

```text
已完成 ✅：
  P0.5: [1] [2] [3] [4] [5]
  P0.7: [A] [B] [C]              品牌重命名 + 去用户概念 + Logo
  P1:   [5] [6] [7]              消除硬编码 + composable 拆分 + App.vue 拆分

当前下一步 🔄：
  P1:   [8]                      样式体系重构

后续 ⏳：
  P2:   [9] [10] [11] [12] [13]   功能补全
  P3:   [14] [15] [16]            测试、错误边界、备份导出
```

### 即时下一步（推荐执行顺序）

1. **任务 8**（约 5h）：提取设计令牌，拆分全局样式并迁移到组件样式模块
2. **任务 15**（约 1h）：为 `main.ts` 增加全局错误边界与结构化日志
3. **任务 14**（约 3h）：引入测试，覆盖工具函数、项目管理与数据模型逻辑
4. **任务 9-13**（约 25h）：继续完成动态建表、组件事件、多页面、流程数据模型和全局搜索
## 八、技术约束（延续）

- 数据库使用 `node:sqlite` 的 `DatabaseSync`（同步 API），运行在 Electron 主进程
- 渲染进程通过 `contextBridge` 暴露的 `window.lowcode` 对象与主进程通信
- 所有 IPC 使用 `ipcMain.handle` / `ipcRenderer.invoke` 模式
- TypeScript strict 模式，`verbatimModuleSyntax: true`（类型导入必须用 `import type`）
- **不引入任何新的运行时 npm 依赖**（测试相关的 vitest / jsdom 除外）
- 保持现有的代码风格：紧凑写法、中文 UI 文案
- 所有新增 IPC 必须经过表名/字段名安全校验（`assertValidIdentifier`）
- 保持浏览器降级兼容：`window.lowcode` 不存在时静默降级
- 所有新增类型需同步更新 `src/types/lowcode.ts` 和 `src/vite-env.d.ts`（如涉及）

---

## 九、验证清单

### P0.7 验证
- [x] 源码、配置与构建脚本无 "Formix" / "formix" 残留（文档中的历史替换说明除外）
- [x] `index.html` title 显示 "Codeless"
- [x] 侧边栏无用户信息按钮，显示产品标语"快速原型 · 全本地 · 下载即用 · 永久免费"
- [x] Logo 正常显示（favicon + 侧边栏 brand-mark）
- [x] `npm run typecheck` 通过
- [ ] `npm run dev` 启动正常

### P1 验证
- [x] `npx vue-tsc --noEmit` 零错误
- [ ] `npm run dev` 启动正常，无控制台错误（待桌面环境复测）\n- [x] `npm run build:vite` 构建通过
- [x] `useLowcode.ts` ≤ 100 行（协调器）
- [x] `useDesigner.ts` / `useDataModel.ts` / `useProjectManager.ts` 各自职责清晰
- [x] `utils.ts` 无重复代码（useLowcode.ts 从 utils.ts 导入）
- [x] `App.vue` 模板 ≤ 100 行（仅外壳）
- [ ] 所有视图组件使用 `<style scoped>`（待任务 8 样式迁移）
- [ ] 所有现有功能不受影响（工作台、设计器、数据模型、流程页、日志页）

### P2 验证
- [ ] 数据模型页：新建数据表 → 创建成功 → 可浏览/编辑数据
- [ ] 数据模型页：添加字段 → 表结构更新
- [ ] 设计器：组件属性面板"交互"Tab 可配置事件
- [ ] 预览模式：按钮点击触发事件动作
- [ ] 多页面：创建第二个页面 → 切换 → 保存 → 重启后恢复
- [ ] 流程页：创建流程 → 保存 → 列表显示 → 可编辑
- [ ] 全局搜索：Cmd+K 唤起 → 输入关键词 → 显示结果 → 点击跳转

### P3 验证
- [ ] 测试：`npm test` 通过
- [ ] 全局错误处理：触发错误时控制台有结构化输出
- [ ] 数据导出：点击导出 → 生成 JSON 文件 → 内容完整
