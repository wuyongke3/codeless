﻿# Codeless 本地化优化实施清单

> **目标**：在不改变 Electron、完全本地、永久免费三项核心约束的前提下，持续实施 `docs/COMPARATIVE_ANALYSIS_PIXSO_FIGMA.md` 中的优化建议。
>
> **实施规则**：每完成一项优化，必须立即更新本文件对应状态、变更文件、验证结果和已知限制。
>
> **创建日期**：2026-08-22  
> **工作目录**：`E:\codeless`  
> **状态说明**：`待开始` / `进行中` / `已完成` / `部分完成` / `阻塞`

## 1. 不可变约束

| 约束 | 实施要求 |
|---|---|
| Electron | 桌面容器和主进程/渲染进程模型继续使用 Electron |
| 完全本地 | 项目、数据库、快照、插件和导出文件默认只保存在本机；不引入云同步或远程项目存储 |
| 完全免费 | 不增加订阅、付费功能、按席位限制或付费插件门槛 |
| 离线可用 | 核心编辑、预览、数据绑定、保存、恢复和导出不依赖互联网 |

## 2. 优化项总览

| 编号 | 优化项 | 优先级 | 状态 | 主要文件/模块 | 完成日期 |
|---|---|---:|---|---|---|
| P0-01 | Electron 安全边界：上下文隔离、sandbox、导航与 IPC 来源校验 | P0 | 已完成 | `electron/main/index.ts` | 2026-08-22 |
| P0-02 | `.codeless` 本地项目文件、版本迁移、原子保存和崩溃恢复 | P0 | 已完成 | `electron/main/`、`electron/preload/`、`src/types/projectFile.ts`、`src/composables/browserData.ts`、`src/composables/useProjectManager.ts` | 2026-08-22 |
| P0-03 | 自动保存与退出前保存队列，降低数据丢失风险 | P0 | 已完成 | `src/composables/useDesigner.ts` | 2026-08-22 |
| P0-04 | SQLite 数据访问从主进程迁移到 UtilityProcess/专用 Worker | P0 | 已完成 | `electron/main/index.ts`、`electron/database/client.ts`、`electron/database/worker.ts`、`vite.config.ts` | 2026-08-22 |
| P0-05 | 增量 command/patch history，减少完整布局深克隆 | P0 | 已完成 | `src/composables/layoutHistory.ts`、`src/composables/useDesigner.ts` | 2026-08-22 |
| P0-06 | 画布视口裁剪、图层树虚拟化、拖拽合帧和批量 IPC | P0 | 已完成 | `src/components/VirtualLayerTree.vue`、`src/components/CanvasWidgetNode.vue`、`src/composables/useDesigner.ts`、`electron/database/`、`electron/main/` | 2026-08-22 |
| P1-01 | 自动布局、组件变体、变量/主题和设计令牌 | P1 | 已完成 | `src/types/lowcode.ts`、`src/composables/designSystem.ts`、`src/composables/widgetConfig.ts`、`src/composables/autoLayout.ts`、`src/composables/useDesigner.ts`、`src/components/WidgetRenderer.vue`、`src/components/CanvasWidgetNode.vue`、`src/components/RuntimeWidgetNode.vue`、`src/views/BuilderView.vue` | 2026-08-22 |
| P1-02 | 本地快照、评论锚点、结构化 Diff 和离线审阅包 | P1 | 已完成 | `src/types/lowcode.ts`、`src/composables/review.ts`、`src/composables/useReview.ts`、`src/components/ReviewPanel.vue`、`src/views/BuilderView.vue`、`electron/main/`、`electron/preload/`、`electron/database/` | 2026-08-22 |
| P1-03 | 本地 Inspect/codegen 和 SVG/资产管理 | P1 | 已完成 | `src/composables/inspect.ts`、`src/components/InspectPanel.vue`、`src/composables/browserData.ts`、`electron/main/`、`electron/preload/` | 2026-08-22 |
| P2-01 | 本地插件 manifest、权限和沙箱执行边界 | P2 | 已完成 | `src/types/plugin.ts`、`src/composables/usePlugins.ts`、`src/components/PluginSandboxFrame.vue`、`src/views/PluginsView.vue`、`electron/plugins/`、`electron/` | 2026-08-22 |
| P2-02 | Figma Plugin 本地桥接和开放格式导入导出 | P2 | 已完成 | `plugins/figma-bridge/`、`src/types/designExchange.ts`、`src/composables/designExchange.ts`、`electron/`、`src/views/BuilderView.vue` | 2026-08-22 |
| P2-03 | 同机多窗口协作；可选、默认关闭的局域网临时会话 | P2 | 待开始 | `electron/`、协作模块 | - |
| P3-01 | 大型项目专项渲染优化和可选 WebGL 局部加速 | P3 | 待开始 | 画布渲染层 | - |

## 3. 实施记录

### P0-01 Electron 安全边界

- **状态**：已完成
- **目标**：显式启用 Electron 安全配置，阻止不受信任页面导航，并拒绝非应用来源调用本地 IPC。
- **实现内容**：
  - 在 `BrowserWindow.webPreferences` 中显式启用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`。
  - 禁止不安全混合内容：`allowRunningInsecureContent: false`。
  - 仅允许应用入口文件或开发服务器源继续导航。
  - 外部 HTTPS 页面只通过系统默认浏览器打开，禁止在 Electron 内创建新窗口。
  - 所有 `lowcode:*` IPC handler 校验 `event.senderFrame.url`，拒绝不受信任 frame 调用。
- **变更文件**：`electron/main/index.ts`
- **验证结果**：
  - `npm run typecheck`：通过。
  - `npm run build:vite`：通过。
  - `npm run test:e2e`：14 项 Electron UI/E2E 用例全部通过。
- **已知限制**：当前 E2E 脚本为了兼容测试环境以 `--no-sandbox` 启动 Electron，因此不能替代生产包的 sandbox 验收；生产运行时配置已显式启用 sandbox。开发服务器源需要允许本地 Vite 地址；未来插件必须使用独立沙箱，不得复用主应用 IPC。

### P0-03 自动保存触发路径完善

- **状态**：已完成
- **目标**：统一所有设计器和页面管理修改的脏状态入口，确保本地自动保存 debounce 不会因编辑入口遗漏而失效。
- **实现内容**：
  - `src/composables/useDesigner.ts` 暴露统一的 `markDirty()`，设置脏状态并启动 1.2 秒 debounce 本地保存。
  - 页面创建、复制、重命名、删除、路径、入口页和页面守卫等管理操作统一调用 `designer.markDirty()`。
  - Builder Inspector 中的组件名称、事件、动作、页面属性、画布背景和守卫字段编辑统一调用 `state.markDirty()`。
  - 保留历史恢复路径的脏状态回滚逻辑，避免撤销/重做过程重复触发保存。
  - 未引入云同步、远程队列或付费存储服务；保存仍走本地 SQLite/浏览器本地回退。
- **变更文件**：`src/composables/useDesigner.ts`、`src/composables/useLowcode.ts`、`src/views/BuilderView.vue`
- **验证结果**：
  - `npm run typecheck`：通过。
  - `npm run build:vite`：通过，Electron main/preload 与 renderer 均成功产出。
  - `npm run test:e2e`：15 项 Electron UI/E2E 用例全部通过。
- **已知限制**：退出时的可靠保存队列仍待后续存储层改造；当前 debounce 保存失败不会引入远程重试，避免离线应用产生网络依赖。

### P0-02 `.codeless` 本地项目文件、版本迁移、原子保存和崩溃恢复

- **状态**：已完成
- **目标**：为本地项目提供可移植、可校验、可迁移且不依赖云端的 `.codeless` 文件，同时避免导入失败或保存中断破坏现有项目。
- **实现内容**：
  - 新增 v1 文件协议：`format: "codeless"`、`schemaVersion: 1`、`exportedAt` 和 `project`；文件只包含 JSON 数据，不包含数据库连接、绝对路径、网络地址或可执行代码。
  - 新增统一的文件校验与迁移模块 `src/types/projectFile.ts`：校验项目 ID、名称、布局、画布、组件节点；兼容早期直接导出项目对象和未声明版本的 `project` 包装对象；拒绝未知的未来版本，避免静默丢字段。
  - Electron 主进程增加本地保存/打开对话框和窄 IPC：导出默认使用 `.codeless` 扩展名，导入限制为 `.codeless/.json`，单文件超过 50 MB 时拒绝读取。
  - 导出使用同目录临时文件、`fsync`、`rename` 和 Windows 备份回滚策略；保存期间发生错误时保留原目标文件或备份文件，不覆盖现有 SQLite 项目。
  - 每次 Electron 项目保存后在 `userData/recovery/<project-id>.codeless.recovery` 生成原子恢复快照，恢复快照失败不会阻断 SQLite 主保存。
  - 导入默认作为新应用加载；若项目 ID 冲突则自动生成新 ID 并标记为“导入副本”，确保原项目不被静默覆盖；解析、校验或落库失败时原项目保持不变。
  - 浏览器降级模式提供完全本地的下载和文件选择器导入，不访问网络；Builder 工具栏新增“导入”和“导出”入口。
- **变更文件**：`electron/main/index.ts`、`electron/preload/index.ts`、`src/types/lowcode.ts`、`src/types/projectFile.ts`、`src/composables/browserData.ts`、`src/composables/useProjectManager.ts`、`src/views/BuilderView.vue`、`src/components/AppIcon.vue`
- **验证结果**：
  - `npm run typecheck`：通过。
  - `npm run build:vite`：通过，Electron main/preload 与 renderer 均成功产出。
  - `npm run test:e2e`：15 项 Electron UI/E2E 用例全部通过。
- **已知限制**：恢复快照已在本机生成，但当前界面尚未自动弹出“发现恢复快照”向导；用户可在后续恢复中心中选择恢复。浏览器 fallback 的保存位置由浏览器下载策略决定，Electron 模式可通过系统文件对话框明确选择位置。
### P0-04 SQLite UtilityProcess 隔离

- **状态**：已完成
- **目标**：将 SQLite `DatabaseSync` 从 Electron 主进程迁移到独立的 `utilityProcess`，避免同步数据库初始化、查询和写入阻塞主进程窗口生命周期、IPC 响应和 UI 稳定性。
- **实现内容**：
  - 新增 `electron/database/worker.ts`：在独立 UtilityProcess 中创建 `DatabaseSync`，保留 WAL、外键、项目表、活动记录、业务数据表、种子数据以及项目/数据 CRUD 能力。
  - 新增 `electron/database/client.ts`：封装 `utilityProcess.fork()`、ready 握手、请求 ID、响应路由、错误传播、退出时 pending Promise 拒绝和进程关闭。
  - 主进程仅保留本地数据库客户端与 IPC 编排；所有 `lowcode:*` 数据请求改为异步转发给 UtilityProcess，恢复快照仍由主进程执行并写入本机 `userData/recovery`。
  - `app.whenReady()` 中先等待数据库 worker 初始化，再注册 IPC 和创建窗口，避免窗口启动早于数据库 ready。
  - Vite 多环境构建新增 database environment，开发与生产均输出本地 worker；当前构建产物为 `dist-electron/database/worker.js`，不依赖网络或远程服务。
  - 未改变 Electron 桌面架构、离线保存协议和免费策略；数据库文件继续保存在本机 `userData/codeless.sqlite`。
- **变更文件**：`electron/main/index.ts`、`electron/database/client.ts`、`electron/database/worker.ts`、`vite.config.ts`
- **验证结果**：
  - `npm run typecheck`：通过。
  - `npm run build:vite`：通过，renderer、Electron main/preload 和 `dist-electron/database/worker.js` 均成功产出。
  - `npm run test:e2e`：15 项 Electron UI/E2E 用例全部通过，包含画布、预览、编辑、撤销/重做和本地数据初始化链路。
- **已知限制**：UtilityProcess 内部仍使用单 worker 的同步 SQLite API；worker 异常退出后当前会拒绝请求并交由上层处理，自动重启和请求重放留待后续可靠保存队列/存储层优化；E2E 为兼容测试环境使用 `electron --no-sandbox`，不替代生产 sandbox 验收。

### P0-05 增量 command/patch history

- **状态**：已完成
- **目标**：以稀疏布局 patch 替代每次编辑都保存完整 `PageLayout`，降低大型项目在撤销/重做历史中的内存占用，同时保持现有编辑语义和完全离线能力。
- **实现内容**：
  - 新增 `src/composables/layoutHistory.ts`，以 widget ID 为粒度生成 `LayoutPatch`；仅记录新增、删除或实际变化的组件，未变化的 widget 不复制。
  - 将页面名称、画布和版本等轻量元数据独立记录；只有图层顺序变化时才记录 `orderBefore/orderAfter`，避免无意义地复制完整节点数组。
  - `useDesigner.ts` 的 undo/redo 栈改为 `LayoutPatch[]`，通过 `applyLayoutPatch()` 按方向恢复布局；当前操作仅保留临时前置布局，提交时再生成 patch。
  - 拖拽、缩放和 inline edit 取消时清理临时历史；成功编辑仍统一通过 `markDirty()` 完成历史提交和本地自动保存触发。
  - 历史记录上限保持为 40 条；未引入云端历史、远程同步、付费存储或网络依赖。
- **变更文件**：`src/composables/layoutHistory.ts`、`src/composables/useDesigner.ts`
- **验证结果**：
  - `npm run typecheck`：通过。
  - `npm run build:vite`：通过，renderer、Electron main/preload 和 database worker 均成功产出。
  - `npm run test:e2e`：15 项 Electron UI/E2E 用例全部通过，包含层级调整与撤销/重做、键盘移动和尺寸调整。
- **已知限制**：首次提交事务仍会产生一次临时前置布局快照；复杂批量操作后续可继续细分为更小的 command；当前 widget 变化比较使用 `JSON.stringify()`，未来可替换为结构化浅比较以进一步减少比较开销；E2E 为兼容测试环境使用 `electron --no-sandbox`，不替代生产 sandbox 验收。
### P0-06 画布视口裁剪、图层树虚拟化、拖拽合帧和批量 IPC

- **状态**：已完成
- **目标**：降低大页面中画布 DOM、图层树节点和数据模型 IPC 的峰值开销，保持现有编辑交互、离线存储和 Electron 主进程安全边界不变。
- **实现内容**：
  - `useDesigner.ts` 新增画布视口状态和可见节点索引：按画布滚动区域、缩放比例和预取边距计算可见组件，只挂载可见根节点及其必要祖先；子节点通过 `canvasChildrenFor()` 复用索引，避免每个递归节点重复全量 `filter()`。
  - `VirtualLayerTree.vue` 将图层树扁平化为可展开行，并在超过 60 行时使用固定行高、overscan 和 translateY 窗口，仅渲染视口附近的图层；少量图层仍沿用同一组件路径，保证交互一致。
  - `LayerTreeItem.vue` 增加受控展开状态和虚拟行模式，保留选择、锁定、隐藏、拖放重排和容器内部投放能力。
  - 拖拽/缩放继续使用 `requestAnimationFrame` 合帧，并将同一帧内的多组件位置或尺寸更新集中提交；支持 `getCoalescedEvents()` 时使用浏览器合并指针事件，减少高频 pointermove 带来的重复计算。
  - 数据层新增 `DatabaseClient.requestBatch()` 和 SQLite UtilityProcess 批量事务；`lowcode:refresh-table` 将“读取表元数据 + 查询当前页数据”合并为一次受信任 IPC 请求，数据模型刷新路径不再连续发起两个数据库 IPC。
  - 所有优化均只使用本地内存索引、Vue/Electron 内置能力和本机 SQLite 事务；未引入云同步、远程存储、网络服务或付费能力。
- **变更文件**：`src/components/VirtualLayerTree.vue`、`src/components/LayerTreeItem.vue`、`src/components/CanvasWidgetNode.vue`、`src/views/BuilderView.vue`、`src/composables/useDesigner.ts`、`src/composables/useDataModel.ts`、`src/styles/layers.css`、`src/styles/builder.css`、`src/types/lowcode.ts`、`src/composables/browserData.ts`、`electron/preload/index.ts`、`electron/main/index.ts`、`electron/database/client.ts`、`electron/database/worker.ts`
- **验证结果**：
  - `npm run typecheck`：通过。
  - `npm run build:vite`：通过，renderer、Electron main/preload 和 database worker 均成功产出。
  - `npm run test:e2e`：15 项 Electron UI/E2E 用例全部通过，包含画布渲染、容器子节点、层级重排、撤销/重做、拖拽和尺寸调整。
- **已知限制**：视口裁剪使用保守的预取边距并按矩形包围盒判断旋转组件，极端旋转场景会多渲染少量节点；图层虚拟化在 60 行以内不启用窗口切片以避免小树的滚动复杂度；批量 IPC 当前聚焦于表元数据与当前页查询，复杂跨领域事务仍需后续按领域设计；E2E 为兼容测试环境使用 `electron --no-sandbox`，不替代生产 sandbox 验收。
### P1-01 自动布局、组件变体、变量/主题和设计令牌

- **状态**?已完成
- **目标**?在保持 Electron、完全本地和完全免费的前提下，为编辑器和运行时补齐可复用设计系统、组件变体和容器自动布局能力，减少重复样式配置并改善复杂页面的维护效率。
- **实现内容**?
  - `src/types/lowcode.ts` 扩展 `DesignSystem`、`DesignTheme`、`DesignTokenSet`、`WidgetStyleTokenRefs` 和 `WidgetVariantConfig`；保留旧版 `props`、`x/y/w/h` 字段以兼容既有 `.codeless` 项目。
  - `src/composables/designSystem.ts` 提供本地 Light/Dark 主题、颜色/字号/间距/圆角/阴影 Token、规范化和 Token 解析；主题和 Token 随项目 JSON/SQLite/`.codeless` 文件保存，不访问云端。
  - `src/composables/widgetConfig.ts` 增加组件变体合并和 `style.tokenRefs` 解析。内置按钮 `primary`、`secondary`、`outline` 变体；解析结果只用于渲染，不破坏原始持久化配置。
  - `src/composables/autoLayout.ts` 增加横向/纵向 Stack、Grid、gap、padding、justify/align、spacer.flex 和 columnsCount；自动布局计算渲染 frame，保留持久化坐标作为兼容回退。
  - `WidgetRenderer.vue`、`CanvasWidgetNode.vue`、`RuntimeWidgetNode.vue` 统一使用设计系统和解析后的配置，确保编辑器预览与运行时显示一致。
  - `BuilderView.vue` 增加本地主题切换、颜色编辑、组件变体和 Token 引用 Inspector；修改后通过 `markDirty()` 进入既有本地自动保存链路。
- **变更文件**?`src/types/lowcode.ts`、`src/composables/designSystem.ts`、`src/composables/widgetConfig.ts`、`src/composables/autoLayout.ts`、`src/composables/useDesigner.ts`、`src/components/WidgetRenderer.vue`、`src/components/CanvasWidgetNode.vue`、`src/components/RuntimeWidgetNode.vue`、`src/views/BuilderView.vue`。
- **验证结果**?
  - `npm run typecheck`?通过。
  - `npm run build:vite`?通过；renderer、Electron main/preload 和 database worker 均成功产出。
  - `npm run test:e2e`?15 项 Electron UI/E2E 用例全部通过。
- **已知限制**?Stack 的 `wrap` 目前保留配置字段但尚未实现多行换行；Grid 行高采用子组件高度估算；自动布局不会把计算后的位置反写到持久化 `x/y`，因此拖拽排序和复杂嵌套布局仍需后续专门交互；旋转、绝对定位与自动布局混合场景尚未专项优化。
- **约束确认**?本项没有引入云同步、远程项目存储、网络依赖、订阅、付费功能或付费插件；所有主题、Token、变体和布局数据继续通过 Electron 本地文件/SQLite 保存。

### P1-02 本地快照、评论锚点、结构化 Diff 和离线审阅包

- **状态**：已完成
- **目标**：在完全本地、无云同步、无远程项目存储的前提下，为编辑器提供可追溯的版本快照、带页面/组件/画布坐标的评论锚点、结构化变更比较，以及可导出的离线审阅包。
- **实现内容**：
  - `src/types/lowcode.ts` 扩展快照、评论、Diff 和审阅包类型；审阅数据纳入项目数据模型，并兼容既有 `.codeless` 文件。
  - `src/composables/review.ts` 实现快照创建/删除、评论锚点、评论状态、结构化 JSON Diff 和离线审阅包组装；忽略 `updatedAt` 与 `review` 等非业务字段，并对带 `id` 的数组对象进行稳定比较。
  - `src/composables/useReview.ts` 提供 Builder 侧的本地审阅状态、快照选择、评论操作、Diff 计算和导出调用。
  - `src/components/ReviewPanel.vue` 增加本地审阅面板，支持创建快照、查看 Diff、添加/解决评论、删除快照和导出审阅包，并明确提示数据只保存在本机。
  - `src/views/BuilderView.vue` 增加 Review 入口，并将审阅操作接入既有本地项目和自动保存链路。
  - `electron/preload/index.ts`、`electron/main/index.ts`、`electron/database/worker.ts` 新增本地审阅包导出 IPC；通过 Electron 保存对话框和已有原子写入逻辑写入本地文件，默认使用本地 Documents 目录，并限制导出文件为 50 MB。
  - `src/composables/browserData.ts` 增加浏览器回退下载：使用 `Blob` 和 `URL.createObjectURL`，不访问网络。
  - 快照最多保留 12 个，评论最多保留 500 条，Diff 最多保留 500 个条目；删除快照时同步清理关联评论，避免孤立数据和递归膨胀。
- **变更文件**：
  - `src/types/lowcode.ts`
  - `src/composables/review.ts`
  - `src/composables/useReview.ts`
  - `src/composables/browserData.ts`
  - `src/components/ReviewPanel.vue`
  - `src/views/BuilderView.vue`
  - `src/composables/useLowcode.ts`
  - `electron/preload/index.ts`
  - `electron/main/index.ts`
  - `electron/database/worker.ts`
- **验证结果**：
  - `npm run typecheck`：通过。
  - `npm run build:vite`：通过；renderer、Electron main、preload 和 database worker 均成功构建。
  - `npm run test:e2e`：15 项 Electron UI/E2E 全部通过。
- **本地化与免费约束确认**：快照、评论、Diff 和审阅包全部只使用本地项目数据、SQLite、`.codeless` 文件或用户选择的本地导出路径；不使用云同步、不使用远程存储、不引入网络依赖、不增加订阅、付费功能、按席位限制或付费插件。
- **已知限制**：
  - 当前 Diff 为结构化 JSON Diff，不是像素级图像 Diff。
  - 审阅包当前为 JSON 格式，暂不包含 PDF/HTML 渲染。
  - 评论为单机本地评论，不提供网络实时协作。
  - 快照、评论和 Diff 分别受 12、500、500 的数量上限约束。

### P1-03 本地 Inspect/codegen 和 SVG/资产管理

- **状态**：已完成
- **目标**：补齐对标 Pixso/Figma 的本地开发交付能力：读取选中组件的尺寸、样式、Token、数据绑定和交互信息，生成可复制/可保存的 HTML、CSS、Vue、JSON 代码，并提供本地 SVG 导出和图片/SVG 素材导入。
- **实现内容**：
  - `src/composables/inspect.ts` 提供纯本地 Inspect 模型、Token 解析、HTML/CSS/Vue/JSON 代码生成、单组件 SVG 生成和 Blob 本地下载；对响应式项目数据先做 JSON 快照，避免 `normalizeDesignSystem()` 等兼容性归一化函数在 Vue computed 中产生渲染循环。
  - `src/components/InspectPanel.vue` 增加 Inspect/Codegen 面板，展示组件 ID、类型、X/Y/W/H、样式、Token 引用与解析值、数据绑定、代码格式切换、复制代码、保存代码文件和 SVG 导出入口。
  - `src/views/BuilderView.vue` 增加 Inspect 工具栏入口，仅在存在选中组件时启用；面板数据通过当前 Builder 状态读取，不建立远程连接。
  - `src/types/lowcode.ts` 增加 `LocalAssetImportResult` 和本地素材 API 类型。
  - `electron/preload/index.ts` 暴露最小化 `lowcode:import-asset` IPC；`electron/main/index.ts` 通过本地文件选择框读取 PNG/JPG/WEBP/GIF/SVG，限制 10 MB，拒绝包含脚本、事件属性或 `javascript:` 的 SVG，并转为 Data URL 返回渲染进程。
  - `src/composables/browserData.ts` 提供浏览器回退素材导入，使用本地 `<input type="file">` 和 `FileReader`，不访问网络；图片组件可将素材以内嵌 Data URL 保存到当前 `.codeless`/SQLite 项目数据。
  - `src/composables/useLowcode.ts` 接入本地素材调用和 Inspect 面板开关，继续沿用 Electron contextBridge 与浏览器本地回退双路径。
  - `scripts/e2e-electron.mjs` 增加 Inspect 面板、四种代码格式和生成代码标记的 E2E 覆盖。
- **变更文件**：
  - `src/composables/inspect.ts`
  - `src/components/InspectPanel.vue`
  - `src/types/lowcode.ts`
  - `src/composables/browserData.ts`
  - `src/composables/useLowcode.ts`
  - `src/views/BuilderView.vue`
  - `electron/preload/index.ts`
  - `electron/main/index.ts`
  - `scripts/e2e-electron.mjs`
- **验证结果**：
  - `npm run typecheck`：通过。
  - `npm run build:vite`：通过；renderer、Electron main、preload 和 database worker 均成功构建。
  - `npm run test:e2e`：16 项 Electron UI/E2E 全部通过，新增“本地 Inspect、代码生成与 SVG 导出入口”覆盖。
- **本地化与免费约束确认**：Inspect、代码生成、SVG 导出和素材导入全部在渲染进程、本地 Electron 主进程或浏览器本地回退中完成；不引入云同步、远程存储、网络 API、订阅、付费功能、按席位限制或付费插件。
- **Electron 技术约束**：素材读取只通过受信任页面的 contextBridge IPC，主进程继续校验 IPC sender；渲染进程不启用 Node 集成，不直接访问文件系统；导出使用 Blob 下载，不增加新的后台服务或网络端口。
- **已知限制**：
  - 当前 SVG 导出是单个选中组件的可交付快照，不是完整的多层矢量编辑器或像素级设计稿导出。
  - 代码生成是无框架运行时依赖的模板化片段，暂不覆盖完整页面级路由、状态管理和所有 Element Plus 交互语义。
  - 本地素材以 Data URL 内嵌保存，单个素材限制 10 MB；大型素材库和哈希去重尚未实现。
  - E2E 不自动操作系统文件选择框，因此素材导入的文件读取边界由类型检查、构建和主进程安全校验覆盖。

### P2-01 本地插件 manifest、权限和沙箱执行边界

- **状态**：已完成
- **目标**：在保持 Electron、完全本地、永久免费和离线可用约束的前提下，提供可审计的本地插件安装、权限声明、启停管理和 UI 沙箱边界；不执行任意 Electron/Node 插件代码，不引入在线插件市场或远程下载。
- **实现内容**：
  - `src/types/plugin.ts` 新增 manifest v1、插件权限白名单、`network: none` 网络策略、相对入口路径校验、ID/版本/引擎字段校验和解析错误处理。
  - `electron/plugins/registry.ts` 新增本地插件注册表：插件安装到 `<userData>/plugins`，状态保存在 `.registry.json`，限制目录 25 MB，拒绝符号链接，校验 `main`/`ui` 入口存在，阻止入口路径穿越，并支持列出、启用、停用、卸载。
  - `electron/preload/index.ts` 仅通过 contextBridge 暴露 `listPlugins`、`installPlugin`、`removePlugin`、`setPluginEnabled`、`getPluginUiUrl`；`electron/main/index.ts` 的所有插件 IPC 均校验可信 sender。
  - 主进程离线 session 默认阻断 HTTP/HTTPS/WebSocket 网络请求；仅开发环境 Vite 本地源可用。插件 file URL 注入严格 CSP，禁止远程脚本、连接、frame、object 和网络访问。
  - `src/composables/usePlugins.ts` 接入 Electron 与浏览器双路径，提供插件列表、安装、启停、卸载和 UI 打开/关闭状态管理。
  - `src/components/PluginSandboxFrame.vue` 使用仅含 `allow-scripts` 的 iframe sandbox，不授予 `allow-same-origin`、表单、弹窗、顶层导航或网络能力；初始化消息只包含插件 ID、API 版本和已声明权限，并校验消息来源为当前 iframe 的 `contentWindow`。
  - `src/views/PluginsView.vue` 新增本地插件管理界面，展示名称、ID、版本、作者、权限、网络策略、入口状态和错误信息，并提供本地安装、启停、卸载及 UI 打开入口；新增导航项和插件图标。
  - `src/composables/browserData.ts` 提供浏览器降级安装和 localStorage 保存，仅保存经过 manifest 校验的元数据，不执行插件 `main`，也不加载插件 UI。
- **变更文件**：
  - `src/types/plugin.ts`
  - `src/types/lowcode.ts`
  - `src/composables/browserData.ts`
  - `src/composables/usePlugins.ts`
  - `src/composables/useLowcode.ts`
  - `src/composables/utils.ts`
  - `src/components/AppIcon.vue`
  - `src/components/PluginSandboxFrame.vue`
  - `src/views/PluginsView.vue`
  - `src/styles/plugins.css`
  - `src/styles/index.css`
  - `electron/plugins/registry.ts`
  - `electron/main/index.ts`
  - `electron/preload/index.ts`
- **验证结果**：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run build:vite`：通过；renderer、Electron main、preload 和 database worker 均成功构建。
  - `npm.cmd run test:e2e`：16 项 Electron UI/E2E 全部通过；离线 session 未影响既有画布、预览、Inspect、数据和交互验证。
- **本地化与免费约束确认**：插件目录、注册状态和 UI 资源全部保存在本机；安装仅使用系统文件选择框，不提供在线市场、自动下载、云同步、远程存储、订阅、付费插件或按席位限制。
- **Electron 技术约束**：渲染进程只能通过类型化 contextBridge 调用插件 IPC；插件主入口当前只登记和校验，不执行；插件 UI 运行于 sandbox iframe，不能获得 Node、IPC、项目对象、SQL、路径或网络能力。
- **已知限制**：
  - 当前版本只支持本地 manifest 安装，不支持远程插件市场、自动更新和网络依赖。
  - 当前版本不执行插件 `main`，因此插件只能提供受限 UI 元数据能力，尚未开放文档写入、数据读取等运行时 API。
  - 浏览器降级模式只保存 manifest 元数据，不加载插件 UI；Electron 模式的插件 UI 仍需由插件自行提供静态入口文件。
  - 插件权限目前用于声明和展示，后续若开放运行时 API，必须在主进程/渲染进程桥接层逐项实施权限校验。

### P2-02 Figma Plugin 本地桥接和开放格式导入导出

- **状态**：已完成
- **目标**：提供完全本地、离线可用且不依赖 Figma 私有文件格式的设计交换能力，让 Figma Plugin 可以将当前选区导出为开放 JSON，并让 Codeless 在 Electron 或浏览器回退模式中导入/导出该格式；不引入云同步、远程项目存储、在线插件市场或付费门槛。
- **实现内容**：
  - 新增 `codeless-design` v1 开放交换格式和校验/迁移/序列化模块 `src/types/designExchange.ts`。格式只包含 JSON 数据，限制文件大小 25 MB、节点数量 5000、递归深度 40，并校验节点类型、颜色、数字、字符串和层级引用，拒绝脚本、路径和网络地址等不安全内容。
  - 新增 `src/composables/designExchange.ts`，支持将当前 Codeless 页面或选中组件及其后代导出为设计交换文档，并将 `text`、`heading`、`line`、`image`、`ellipse`、`rectangle`、`component`、`instance`、`frame`、`group`、`section` 等节点转换为 Codeless `LowCodeWidget`，保留父子层级、`parentId`、几何尺寸、颜色、字号、字重、对齐、圆角、透明度、锁定和隐藏状态。
  - 在 `electron/main/index.ts`、`electron/preload/index.ts` 和 `src/composables/browserData.ts` 增加本地设计 JSON 导入/导出 API。Electron 使用受信任 IPC、本地打开/保存对话框和原子写入；浏览器使用 Blob 下载与本地 `<input type="file">` 回退；两条路径均限制 JSON 文件并复用 25 MB 边界。
  - 在 `useDesigner`、`useLowcode` 和 `BuilderView` 中接入批量导入：重映射组件 ID 与 `parentId`、对根节点增加 24px 画布偏移、更新层级、选中新导入根组件、写入撤销历史、标记脏状态并进入自动保存流程；工具栏区分“项目导入/项目导出”和设计 JSON 导入/导出。
  - 新增 `plugins/figma-bridge/` 本地 Figma Plugin 示例，包含 manifest、插件主逻辑、离线 UI 和 README。插件读取当前 Figma 选区并导出 `codeless-design` v1 JSON，支持常用文本、容器、形状、线条、图片、组件和实例节点；`networkAccess.allowedDomains` 设为 `none`，UI 只使用本地脚本、复制和下载 API，不上传数据、不调用远程 API、不解析 `.fig` 私有格式。
  - `scripts/e2e-electron.mjs` 新增设计交换导入/导出入口校验，覆盖按钮存在、可用、导入取消路径、导出点击和 renderer error 检查。
- **变更文件**：
  - `src/types/designExchange.ts`
  - `src/composables/designExchange.ts`
  - `src/types/lowcode.ts`
  - `src/composables/browserData.ts`
  - `src/composables/useDesigner.ts`
  - `src/composables/useLowcode.ts`
  - `src/views/BuilderView.vue`
  - `electron/main/index.ts`
  - `electron/preload/index.ts`
  - `plugins/figma-bridge/README.md`
  - `plugins/figma-bridge/figma-manifest.json`
  - `plugins/figma-bridge/code.js`
  - `plugins/figma-bridge/ui.html`
  - `scripts/e2e-electron.mjs`
- **验证结果**：
  - `npm.cmd run typecheck`：通过。
  - `npm.cmd run build:vite`：通过；renderer、Electron main、preload 和 database worker 均成功构建。
  - `npm.cmd run test:e2e`：17 项 Electron UI/E2E 全部通过，新增“设计交换导入导出入口”覆盖。
  - `git diff --check`：通过；仅保留 Git 对既有工作区文件换行格式的提示，无空白错误。
- **本地化与免费约束确认**：设计 JSON、Figma Plugin 文件、项目数据和导出文件均由用户在本机读写；不引入云同步、远程存储、在线插件市场、网络 API、订阅、付费功能或按席位限制。核心导入、导出、编辑、预览和保存仍可离线使用。
- **Electron 技术约束**：设计文件只能通过受信任页面调用类型化 contextBridge IPC；主进程继续校验 IPC sender、文件扩展名和大小，并使用原子写入；渲染进程不启用 Node 集成，不执行导入 JSON 中的脚本、SQL、路径或网络地址。
- **已知限制**：
  - 当前是单向开放格式交换，不提供 Figma 与 Codeless 的实时双向同步、自动回写或远程协作。
  - Figma Plugin 只映射常用节点和基础视觉属性；复杂渐变、原型交互、变量、字体文件、Figma 私有资源和高级矢量语义不会完整保留。
  - Figma IMAGE 节点只导出几何信息，不携带 Figma 私有图片资源或远程地址；导入后如需图片资源，应在 Codeless 中使用本地素材导入。
  - E2E 不自动操作系统文件选择框；当前新增用例验证了导入取消路径、导出入口和 renderer error，真实文件选择与跨应用 Figma 加载仍需人工验收。

## 4. 变更日志

| 时间 | 优化项 | 变更摘要 | 验证 |
|---|---|---|---|
| 2026-08-22 | 文档初始化 | 创建本实施清单，记录 P0-P3 优化项和逐项更新规则 | 已完成 |
| 2026-08-22 | P0-01 | 显式启用 Electron 安全配置、导航限制和 IPC 来源校验 | typecheck、Vite build、14 项 E2E 全部通过 |
| 2026-08-22 | P0-02 | 新增 `.codeless` v1 文件协议、迁移校验、原子导出、恢复快照、导入冲突保护和浏览器本地回退 | typecheck、Vite build、15 项 E2E 全部通过 |
| 2026-08-22 | P0-03 | 统一设计器、页面管理和 Inspector 的 `markDirty()` 自动保存触发路径 | typecheck、Vite build、15 项 E2E 全部通过 |
| 2026-08-22 | P0-04 | 将 SQLite DatabaseSync 隔离到 UtilityProcess，主进程通过本地 request/response IPC 客户端访问 | typecheck、Vite build、15 项 E2E 全部通过 |
| 2026-08-22 | P0-05 | 将完整布局历史改为按 widget ID 记录的稀疏 patch，并保留事务取消与 undo/redo 语义 | typecheck、Vite build、15 项 E2E 全部通过 |
| 2026-08-22 | P0-06 | 新增画布视口裁剪、图层树虚拟化、拖拽 requestAnimationFrame 合帧和 SQLite 批量 IPC | typecheck、Vite build、15 项 E2E 全部通过 |
| 2026-08-22 | P1-01 | 新增本地设计令牌、Light/Dark 主题、组件变体和 Stack/Grid 自动布局，并接入编辑器与运行时 | typecheck、Vite build、15 项 E2E 全部通过 |
| 2026-08-22 | P1-02 | 新增本地快照、评论锚点、结构化 Diff 和离线审阅包 | typecheck、Vite build、15 项 E2E 全部通过 |
| 2026-08-22 | P1-03 | 新增本地 Inspect、HTML/CSS/Vue/JSON codegen、SVG 导出和本地图片/SVG 素材导入 | typecheck、Vite build、16 项 E2E 全部通过 |
| 2026-08-22 | P2-01 | 新增本地插件 manifest v1、权限白名单、插件注册表、离线 session/CSP、sandbox iframe 和浏览器降级管理 UI | typecheck、Vite build、16 项 E2E 全部通过 |
| 2026-08-22 | P2-02 | 新增 Figma Plugin 本地桥接、codeless-design v1 开放格式、Electron/浏览器导入导出和设计器批量导入流程 | typecheck、Vite build、17 项 E2E、git diff --check 全部通过 |



