# 页面设计器中央工作状态

> **状态单一事实来源：** 本文件  
> **文档版本：** v1.1.4  
> **更新日期：** 2026-08-23  
> **状态值：** `planned` / `in_progress` / `blocked` / `finished`  
> **规则：** 只有同时记录 implementation details、changed files、verification commands/results 和 known limitations，才允许使用 `finished`。

## 1. 总体状态

| 类别 | 数量 | 说明 |
|---|---|---|
| 历史实施项 `finished` | 23 | 13 个历史 P0-01 至 P3-01，加上本轮已完成的 10 个 `PD-*` 工作包；所有已完成项均有实现和验证记录。 |
| 新规划项 `planned` | 15 | 其余产品差距对应的后续工作包，详见 `ITERATION_PLAN.md`；尚未完成的后续项继续保持 planned。 |
| 当前 `in_progress` | 0 | 当前序列中的已认领工作包均已完成或回到 `planned`；下一工作包按 `ITERATION_PLAN.md` 的依赖顺序推进。 |
| 当前 `blocked` | 0 | 没有已确认的外部阻塞；未完成事项均记录在对应工作包的限制和 follow-ups 中。 |

## 2. 现有实现项：必须保留英文 `finished`

| ID | 工作项 | owner/sub-team | status | 变更范围 | 验证结果 |
|---|---|---|---|---|---|
| `P0-01` | Electron 安全边界：context isolation、sandbox、导航和 IPC 来源校验 | Platform | `finished` | `electron/main/index.ts` 等安全配置、导航限制、IPC 来源校验 | `npm.cmd run typecheck`、`npm.cmd run build:vite`、历史记录 14 项 Electron E2E 通过 |
| `P0-02` | `.codeless` 本地项目文件、迁移、原子保存、崩溃恢复 | Persistence | `finished` | `electron/main/`、`electron/preload/`、`src/types/projectFile.ts`、`browserData.ts`、`useProjectManager.ts` | typecheck、Vite build、历史记录 15 项 E2E 通过；导入冲突保护存在 |
| `P0-03` | 自动保存与退出前保存队列 | Persistence | `finished` | `src/composables/useDesigner.ts` 及页面/Inspector dirty 触发路径 | typecheck、Vite build、历史记录 15 项 E2E 通过 |
| `P0-04` | SQLite 从主进程隔离到 UtilityProcess/Worker | Platform/Data | `finished` | `electron/database/client.ts`、`worker.ts`、`electron/main/index.ts`、`vite.config.ts` | typecheck、Vite build、历史记录 15 项 E2E 通过 |
| `P0-05` | 增量 command/patch history | Core Editor | `finished` | `src/composables/layoutHistory.ts`、`useDesigner.ts` | typecheck、Vite build、历史记录 15 项 E2E 通过；保留 undo/redo 事务语义 |
| `P0-06` | 画布视口裁剪、图层树虚拟化、拖拽合帧、批量 IPC | Canvas/Platform | `finished` | `VirtualLayerTree.vue`、`CanvasWidgetNode.vue`、`useDesigner.ts`、`electron/database/` | typecheck、Vite build、历史记录 15 项 E2E 通过 |
| `P1-01` | 自动布局、组件变体、变量/主题、设计令牌 | Design System | `finished` | `lowcode.ts`、`designSystem.ts`、`widgetConfig.ts`、`autoLayout.ts`、渲染器、Builder Inspector | typecheck、Vite build、历史记录 15 项 E2E 通过 |
| `P1-02` | 本地快照、评论锚点、结构化 Diff、离线审阅包 | Review | `finished` | `review.ts`、`useReview.ts`、`ReviewPanel.vue`、Electron 本地持久化和导入导出 | typecheck、Vite build、历史记录 15 项 E2E 通过 |
| `P1-03` | 本地 Inspect/codegen、SVG 和资产管理基础 | Inspect/Assets | `finished` | `inspect.ts`、`InspectPanel.vue`、`browserData.ts`、Electron 文件接口 | typecheck、Vite build、历史记录 16 项 E2E 通过 |
| `P2-01` | 本地插件 manifest、权限、沙箱执行边界 | Plugins | `finished` | `src/types/plugin.ts`、`usePlugins.ts`、`PluginSandboxFrame.vue`、`electron/plugins/` | typecheck、Vite build、历史记录 16 项 E2E 通过；CSP/sandbox/权限白名单覆盖 |
| `P2-02` | Figma Plugin 本地桥接和开放格式导入导出 | Exchange | `finished` | `plugins/figma-bridge/`、`src/types/designExchange.ts`、`designExchange.ts`、Builder 批量导入 | typecheck、Vite build、历史记录 17 项 E2E 通过、`git diff --check` 通过 |
| `P2-03` | 同机多窗口协作和默认关闭的临时局域网会话 | Collaboration | `finished` | `electron/collaboration/`、`useCollaboration.ts`、`CollaborationPanel.vue` | 历史记录：typecheck、Vite build、18 项 Electron E2E、`git diff --check` 通过；默认不联网、不远端持久化 |
| `P3-01` | 大型项目渲染优化和可选 WebGL 局部加速 | Performance | `finished` | `CanvasWebGLLayer.vue`、`useDesigner.ts`、`CanvasWidgetNode.vue`、Builder/CSS | 历史记录：typecheck、Vite build、18 项 Electron E2E、`git diff --check` 通过；WebGL 仅处理简单背景几何并可回退 DOM |

### 2.1 历史项的验证口径

上述历史项的 E2E 数量来自既有变更记录。本轮已重新确认 `npm.cmd run typecheck` 和 `npm.cmd run build:vite` 可作为当前工作区验证入口；在本轮最终验证中若 E2E 数量不同，以命令实际输出为准，并在本文件追加变更日志，不覆盖历史结果。

### 2.2 `finished` 记录格式说明

上表中的“变更范围”字段就是每个项的 **implementation details / changed files**；“验证结果”字段就是 **verification results**。后续新增项必须沿用同一格式，并补充 `verification commands` 和 `known limitations`，不能只填状态。

### 2.3 本轮中央文档系统验证

| 命令 | 结果 |
|---|---|
| `npm.cmd run typecheck` | 通过（`vue-tsc --noEmit`，退出码 0） |
| `npm.cmd run build:vite` | 通过；Vite client、Electron main、preload、database worker 均成功产出 |
| `npm.cmd run test:e2e` | 通过；18 个 Electron E2E 场景全部通过 |
| `npm.cmd run validate:page-designer` | 通过；3 个验证组通过，9 个 fixture 全部通过，退出码 0 |
| `npm.cmd run test:page-designer-history` | 通过；历史合并、撤销/重做和项目级快照 fixture 全部通过 |
| `node --experimental-strip-types scripts/widget-config-migration-fixture.mjs` | 通过；WidgetConfig legacy/config 迁移、只读投影和 round-trip fixture 通过 |
| `git diff --check` | 通过；仅有 Git 的 LF/CRLF 提示，无 whitespace error |
| 文档一致性检查 | 通过；`WORK_STATUS.md` 包含 13 个历史 `finished` 项、本轮 9 个 `finished` 项和 15 个 `planned` 项，完成项均有实施与验证字段 |

## 2.4 本轮已完成工作项详情

### PD-ARC-01 — 共享对象/命令/revision/迁移契约
- status: finished
- owner/sub-team: QA/Architecture
- objective: 建立页面设计器跨线程共享的对象、命令、revision、迁移和并发控制契约，降低画布、数据、协作和 QA 工作包之间的隐式耦合。
- implementation details: 新增设计器协议名称和版本、revision envelope、`node.create`/`node.delete`/`node.update`/`node.reparent`、`page.update`、`style.update` 和 transaction 命令；统一 `baseRevision`、`revision`、`operationId`、`actorId` 语义；加入 JSON Pointer 属性路径、JSON 类型守卫和迁移诊断；明确乐观并发控制语义，并记录当前不实现 CRDT 和自动三方合并。
- changed files: `src/types/designerProtocol.ts`；`docs/architecture/page-designer-protocol.md`。
- verification commands: `npm.cmd run typecheck`；`npm.cmd run validate:page-designer`；`git diff --check`。
- verification results: TypeScript 类型检查通过；协议入口、文档门禁和 fixture 验证通过；工作区 diff whitespace 检查通过。
- known limitations: 当前交付的是共享契约和运行时守卫，不等于所有编辑器操作都已切换为协议命令；CRDT、自动三方合并和远端同步仍未实现。
- follow-ups: `PD-ARC-02`、`PD-COL-04`；在接入更多领域操作前继续维护协议版本和迁移测试。

### PD-HIS-01 — 统一画布/Inspector/Token/事件/页面属性 Undo/Redo 事务
- status: finished
- owner/sub-team: Core Editor + Workflow
- objective: 让画布结构、Inspector 属性、Token、事件、数据源、提交目标和页面属性编辑共享可解释、可合并、可持久化的 Undo/Redo 语义。
- implementation details: 引入 layout/project 共享 sequence；将 Inspector、Token、事件、数据源、提交目标、columns/options 等属性编辑纳入历史；对连续属性输入采用约 450ms debounce 合并；新增项目级 snapshot patch 的创建与应用；页面创建、复制、重命名、删除、路径、入口页面和页面守卫进入 project history；页面级结构操作只清空 layout history 并保留 project history；增加 history prune/reset 回调和每类 40 条的 project history 上限；补充可复现 history fixture。
- changed files: `src/composables/useDesigner.ts`；`src/composables/useLowcode.ts`；`src/composables/layoutHistory.ts`；`src/composables/projectHistory.ts`；`scripts/page-designer-history-fixture.mjs`；`package.json`。
- verification commands: `npm.cmd run typecheck`；`npm.cmd run build:vite`；`npm.cmd run test:e2e`；`npm.cmd run test:page-designer-history`；`npm.cmd run validate:page-designer`；`node --experimental-strip-types scripts/widget-config-migration-fixture.mjs`；`git diff --check`。
- verification results: typecheck、Vite 构建、18 个 Electron E2E 场景、history fixture、页面设计器文档/协议 fixture、WidgetConfig 迁移 fixture 和 diff 检查全部通过。
- known limitations: `useDesigner.ts` 仍承担较多领域职责；协作 revision 的节点级冲突恢复尚未接入历史协调器；未覆盖未来组件库和完整响应式规则的历史语义。
- follow-ups: `PD-ARC-02`、`PD-COL-04`、`PD-WKF-02`；继续拆分领域模块并补充批量编辑和冲突恢复回归。

### PD-DAT-01 — WidgetConfig 唯一写入模型、legacy 只读兼容和迁移
- status: finished
- owner/sub-team: Data/Exchange
- objective: 将 `WidgetConfig v1` 固定为编辑器唯一写入模型，在不破坏旧项目和插件读取能力的前提下消除 `x/y/w/h/props` 与 config 双写漂移。
- implementation details: `normalizeWidget()` 成为导入边界迁移入口；编辑器 frame 和属性 setter 只写 `config.layout` 及 `config.content/style/data/validation/interaction`；legacy `x/y/w/h/props` 改为只读兼容投影；加入配置形状校验、存储诊断、legacy 投影、双写漂移检测和非法字段保护；保留 `parseOptions`、`serializeOptions`、`parseColumns`、`serializeColumns` 兼容导出。
- changed files: `src/composables/widgetConfig.ts`；`src/composables/widgetConfigMigration.ts`；`src/types/lowcode.ts`；`scripts/widget-config-migration-fixture.mjs`。
- verification commands: `npm.cmd run typecheck`；`node --experimental-strip-types scripts/widget-config-migration-fixture.mjs`；`git diff --check -- src/composables/widgetConfig.ts src/types/lowcode.ts`。
- verification results: 类型检查通过；legacy/project/config 的迁移、只读投影、非法写入拒绝和 round-trip fixture 通过；相关文件 diff 检查通过。
- known limitations: 为兼容旧插件和文件仍保留 legacy 投影；TypeScript 的 readonly 不能阻止外部 JavaScript 在运行时直接篡改旧字段；旧插件若直接写 legacy 字段不会成为新的持久化写入路径。
- follow-ups: `PD-ARC-02`、`PD-CMP-03`、`PD-COL-04`；继续收敛插件和开放格式的写入边界。

### PD-QA-03 — 协议 fixture、迁移、坏文件恢复、文档门禁
- status: finished
- owner/sub-team: QA/Architecture
- objective: 建立页面设计器协议、迁移、损坏文件恢复和中央文档状态的可重复发布门禁。
- implementation details: 新增 `validate-page-designer` 静态验证脚本，覆盖中央文档完整性、状态枚举和 finished 字段、协议入口、项目文件迁移、非法 JSON、缺失项目 ID、非法组件字段、未来 schema 版本和损坏恢复快照；新增 9 个项目/迁移/恢复 fixture 及 manifest；在 `package.json` 注册独立验证命令。
- changed files: `scripts/validate-page-designer.mjs`；`scripts/page-designer-fixtures/manifest.json`；`scripts/page-designer-fixtures/*`（9 个 fixture 文件）；`package.json`。
- verification commands: `node --check scripts/validate-page-designer.mjs`；`npm.cmd run validate:page-designer`。
- verification results: Node 语法检查通过；3 个验证组通过，9 个 fixture 全部通过，退出码 0。
- known limitations: 当前门禁以静态协议、文件形状和文档一致性为主，不替代 Electron UI E2E、性能基准、A11y 或真实大项目恢复测试。
- follow-ups: `PD-QA-01`、`PD-QA-02`；将性能预算、A11y 和完整核心路径回归纳入发布门禁。
### PD-QA-01 — 页面设计器性能预算和基准
- status: finished
- owner/sub-team: QA/Architecture
- objective: 为 250、500、1000 节点页面建立可复跑的纯 Node 数据路径性能门禁，并自动清理测试报告与临时目录。
- implementation details: 新增 `page-designer-performance.mjs`，使用当前 `LowCodeProject/PageLayout` 形状生成三档节点 fixture，测量序列化、解析、结构校验、layout patch 构建与应用的 p95，以及 payload 大小；每项指标按节点规模检查预算，超预算返回非零退出码。报告只写入系统临时目录，并在 `finally` 中删除。新增 `clean-test-artifacts.mjs`，对明确的测试目录和测试日志提供带仓库边界校验的 `--check`/删除模式；清理完成后仅在 `.tmp` 为空时移除该父目录；不触碰 `build`、`dist` 和 `dist-electron`。
- changed files: `scripts/benchmarks/page-designer-performance.mjs`; `scripts/clean-test-artifacts.mjs`; `package.json`。
- verification commands: `node --check scripts/benchmarks/page-designer-performance.mjs`; `node --check scripts/clean-test-artifacts.mjs`; `npm.cmd run bench:page-designer -- --warmups=1 --iterations=3`; `node scripts/clean-test-artifacts.mjs --check`。
- verification results: 三档节点全部 PASS；序列化、解析、校验、patch 构建和应用均低于预算；benchmark 临时报告由 `finally` 清理；清理脚本语法、检查模式、空 `.tmp` 父目录清理和幂等行为通过。
- known limitations: 该基准覆盖纯 Node 数据/CPU 路径，不替代浏览器 FPS、DOM、GPU/WebGL、冷启动、真实拖拽和内存剖析；这些指标由后续 QA 回归补充。
- follow-ups: `PD-QA-02`；将 A11y、离线、导入导出和核心 Electron E2E 纳入同一清理与发布门禁。
### PD-ARC-02 — 拆分 `useDesigner.ts` 的领域职责
- status: finished
- owner/sub-team: QA/Architecture
- objective: 在保留旧 Builder API 兼容门面的前提下，将选择、历史、布局、持久化、性能和协作职责拆分为可独立验证的领域模块。
- implementation details: 新增 selection/history/layout/persistence/performance/collaboration 六个领域 composable；`useDesigner.ts` 作为兼容门面组合这些模块，并继续提供旧调用方所需的选择、撤销重做、布局、保存、性能和协作接口；补充 `getRenderedWidgetFrame`、画布缩放/适配能力和外部历史定时器清理。
- changed files: `src/composables/designer/selection.ts`; `history.ts`; `layout.ts`; `persistence.ts`; `performance.ts`; `collaboration.ts`; `src/composables/useDesigner.ts`。
- verification commands: `npm.cmd run typecheck -- --pretty false`; `npm.cmd run build:vite`; `npm.cmd run test:e2e`; `npm.cmd run test:page-designer-history`; `npm.cmd run validate:page-designer`; `npm.cmd run bench:page-designer`; `git diff --check`。
- verification results: 类型检查、Vite/Electron 主进程与 preload/database 构建、18 项 Electron E2E、历史 fixture、3 组 9 个 page-designer fixture、250/500/1000 节点性能基准和 diff check 均通过。
- known limitations: `useDesigner.ts` 仍是兼容门面；部分领域 API 的独立单元测试尚未拆成单独测试包；协作冲突恢复仍属于后续工作包。
- follow-ups: `PD-COL-04`、`PD-WKF-02` 和领域模块独立测试继续推进。

### PD-STY-01 — Token 管理和主题模式
- status: finished
- owner/sub-team: Styles Team
- objective: 提供可本地持久化的 Token CRUD、别名解析、引用追踪、主题切换和 JSON 交换能力。
- implementation details: 新增 Design Token 类型和同步 store；支持颜色、文本、布尔、数值和自定义 Token，别名链解析、引用索引、被引用删除保护、replace/force 删除策略、Light/Dark 模式和 schemaVersion 1 JSON 导入导出；Builder 接入 TokenManagerPanel 和设计系统入口。
- changed files: `src/types/designTokens.ts`; `src/composables/designTokens.ts`; `src/composables/designSystem.ts`; `src/types/lowcode.ts`; `src/components/TokenManagerPanel.vue`; `src/styles/token-manager.css`; `src/styles/tokens.css`; `src/views/BuilderView.vue`; `scripts/design-tokens-fixture.mjs`。
- verification commands: `npm.cmd run typecheck -- --pretty false`; `npm.cmd run build:vite`; `npm.cmd run validate:page-designer`; `npm.cmd run test:e2e`; `git diff --check`。
- verification results: 类型检查、客户端和 Electron 构建、page-designer 静态门禁、Token fixture、18 项 Electron E2E 和 diff check 均通过。
- known limitations: 当前 UI 提供 JSON 导出入口，但没有完整的可视化 JSON 导入按钮；主题新增/删除/重命名和跨主题别名不在本工作包范围；Token store 的同步变更需要调用方负责 dirty 标记、持久化和历史接入。
- follow-ups: `PD-STY-02`、`PD-STY-03`，以及 Token 操作接入统一 Undo/Redo。

### PD-WKF-01 — 命令注册表和命令面板
- status: finished
- owner/sub-team: Workflow Team
- objective: 为 Builder 提供统一的命令发现、快捷键执行和高频编辑入口，减少面板切换。
- implementation details: 新增本地 command registry 和 CommandPalette；支持 Ctrl/Cmd+K、关键词过滤、上下键选择、Enter 执行、Undo/Redo、全选、复制/粘贴、删除、复制并粘贴、置顶/置底、Fit Page/Selection、缩放、保存、预览、Review 和 Inspect；补充 Shift+1/Shift+2 适配快捷键。
- changed files: `src/composables/commandRegistry.ts`; `src/components/CommandPalette.vue`; `src/styles/command-palette.css`; `src/views/BuilderView.vue`; `src/styles/builder.css`; `src/styles/index.css`; `src/composables/useDesigner.ts`。
- verification commands: `npm.cmd run typecheck -- --pretty false`; `npm.cmd run build:vite`; `npm.cmd run test:e2e`; `git diff --check`。
- verification results: 类型检查、Vite/Electron 构建、18 项 Electron E2E 和 diff check 均通过；命令面板快捷键和画布操作入口可用。
- known limitations: 当前命令注册表是 Builder 本地注册，不支持插件动态注册、最近使用统计、完整页面/组件/Token 全文搜索或快捷键冲突检测。
- follow-ups: `PD-WKF-02`、`PD-WKF-03`。

### PD-CAN-01 — 画布 viewport 和导航基础能力
- status: finished
- owner/sub-team: Canvas Team
- objective: 建立可复用的画布 viewport 状态、坐标转换、缩放中心、Fit Page/Selection 和基础平移交互，并接入 Builder 主渲染路径。
- implementation details: 新增 `useDesignerCanvasViewport` 与类型协议，统一管理 page size、viewport size、pan、zoom、screen/canvas 坐标转换、min/max zoom、Fit Page/Selection、滚轮缩放/平移和 Space+左键/中键平移；`useDesigner` 通过兼容门面暴露 viewport，Builder 使用 `.canvas-frame` 的 `translate3d + scale` 渲染真实逻辑尺寸画布，并显式转发 pointer/keyboard 事件，避免 Builder 与 composable 产生两套 viewport 状态。
- changed files: `src/composables/designerCanvasViewport.ts`; `src/types/designerCanvasViewport.ts`; `src/styles/designer-canvas-viewport.css`; `src/views/BuilderView.vue`; `src/styles/builder.css`; `src/styles/responsive.css`; `src/styles/index.css`; `src/composables/useDesigner.ts`; `scripts/e2e-electron.mjs`。
- verification commands: `npm.cmd run typecheck -- --pretty false`; `npm.cmd run build:vite`; `npm.cmd run test:e2e`; `npm.cmd run validate:page-designer`; `npm.cmd run clean:test-artifacts`; `node scripts/clean-test-artifacts.mjs --check`; `git diff --check`。
- verification results: 类型检查、Vite/Electron 构建、静态门禁、测试产物清理和 diff check 通过；18 项 Electron E2E 全部通过，新增 `viewport navigation and transform integration` 覆盖逻辑画布尺寸、缩放同步、Space+左键平移和 Shift+1 Fit Page。平移断言在 Vue DOM flush 后读取几何位置，避免合成事件同步读取旧布局。
- known limitations: `useDesignerCanvasViewport` 当前由 Builder 以 `autoAttach: false` 显式转发事件，独立宿主必须复用同一事件适配方式；当前仍是有限页面画布，不包含网格/参考线/智能吸附和真正无限画布；标尺暂未按 pan/zoom 完整联动；1000 节点浏览器 FPS/内存预算仍由后续专项验证。
- follow-ups: 推进 `PD-RES-01` 的 Constraints/多视口规则，并在 `PD-QA-02` 纳入完整 A11y/大项目导航回归。

### PD-CAN-02 — 网格、参考线、智能吸附和多选布局操作
- status: finished
- owner/sub-team: Canvas Team
- objective: 降低画布中的对齐、测量和批量布局成本，让常用设计操作在有限页面 viewport 内可快速复现并支持撤销。
- implementation details: 新增网格、参考线和智能吸附算法；默认 8px 网格，支持网格开关与吸附开关，组件边缘/中心线、画布边缘和网格使用 6px 阈值吸附；拖拽时以多选整体 bounds 计算偏移，避免节点分别吸附造成错位；按住 `Alt` 可绕过吸附；新增左/中/右、上/中/下对齐及水平/垂直等间距操作，均接入历史记录和 dirty 状态；拖拽期间显示参考线，结束后清理。
- changed files: `src/types/designerCanvasGuides.ts`; `src/composables/designer/canvasGuides.ts`; `src/composables/useDesigner.ts`; `src/views/BuilderView.vue`; `src/styles/builder.css`; `scripts/page-designer-guides-fixture.mjs`; `scripts/e2e-electron.mjs`; `package.json`。
- verification commands: `npm.cmd run typecheck -- --pretty false`; `npm.cmd run build:vite`; `npm.cmd run test:e2e`; `npm.cmd run validate:page-designer`; `npm.cmd run test:page-designer-history`; `npm.cmd run test:page-designer-guides`; `npm.cmd run bench:page-designer`; `npm.cmd run clean:test-artifacts`; `node scripts/clean-test-artifacts.mjs --check`; `git diff --check`。
- verification results: 正式 `npm.cmd run test:e2e` 通过，20 个 Electron E2E 场景全部通过；guides fixture、历史 fixture、3 组 9 个静态 fixture、250/500/1000 节点 benchmark、类型检查、Vite/Electron 构建、测试产物清理检查和 diff check 均通过。
- known limitations: 当前仍是有限页面 viewport，不是真正无限画布；标尺尚未完整联动 pan/zoom；网格和吸附开关暂未持久化到项目文件；参考线仅在拖拽过程中显示；1000 节点浏览器 FPS/DOM/GPU 指标仍待 `PD-QA-02`。
- follow-ups: 推进 `PD-RES-01` 的 Constraints/多视口规则，并将 A11y、真实大项目拖拽和浏览器性能指标纳入 `PD-QA-02`。
## 3. 工作包状态与剩余规划

| ID | 工作项 | owner/sub-team | status | changed files | verification results | 依赖 |
|---|---|---|---|---|---|---|
| `PD-ARC-01` | 共享对象/命令/revision/迁移契约 | QA/Architecture | `finished` | `src/types/designerProtocol.ts`; `docs/architecture/page-designer-protocol.md` | typecheck、validate:page-designer、git diff --check 通过 | — |
| `PD-HIS-01` | 统一画布/Inspector/Token/事件/页面属性 Undo/Redo 事务 | Core Editor + Workflow | `finished` | `src/composables/useDesigner.ts`; `useLowcode.ts`; `layoutHistory.ts`; `projectHistory.ts`; history fixture；`package.json` | typecheck、build、Electron E2E、history fixture、validate、migration fixture、diff check 通过 | `PD-ARC-01` |
| `PD-ARC-02` | 拆分 `useDesigner.ts` 的 Selection/Commands/Layout/Persistence/Performance/Collaboration 领域职责 | QA/Architecture | `finished` | `src/composables/designer/*.ts`; `src/composables/useDesigner.ts` | typecheck、build:vite、test:e2e、page-designer fixtures、history fixture、bench、diff check 通过 | `PD-ARC-01`、`PD-HIS-01` |
| `PD-DAT-01` | WidgetConfig 唯一写入模型、legacy 只读兼容和迁移 | Data/Exchange | `finished` | `src/composables/widgetConfig.ts`; `widgetConfigMigration.ts`; `src/types/lowcode.ts`; migration fixture | typecheck、WidgetConfig migration fixture、相关 diff check 通过 | `PD-ARC-01` |
| `PD-CAN-01` | 画布/大画布 viewport、平移、缩放、适配画布 | Canvas Team | `finished` | `src/composables/designerCanvasViewport.ts`; `src/types/designerCanvasViewport.ts`; `src/styles/designer-canvas-viewport.css`; `src/views/BuilderView.vue`; `src/styles/builder.css`; `src/styles/responsive.css`; `src/composables/useDesigner.ts`; `scripts/e2e-electron.mjs` | typecheck、build:vite、validate:page-designer、clean/check、18 项 Electron E2E、diff check 通过；新增 viewport 导航回归通过 | `PD-ARC-01` |
| `PD-CAN-02` | 网格、参考线、智能吸附、多选对齐/等间距 | Canvas Team | `finished` | `src/types/designerCanvasGuides.ts`; `src/composables/designer/canvasGuides.ts`; `src/composables/useDesigner.ts`; `src/views/BuilderView.vue`; `src/styles/builder.css`; `scripts/page-designer-guides-fixture.mjs`; `scripts/e2e-electron.mjs`; `package.json` | typecheck、build:vite、validate:page-designer、history fixture、guides fixture、20 项 Electron E2E、250/500/1000 节点 benchmark、clean/check、diff check 通过 | `PD-CAN-01` |
| `PD-CMP-01` | 主组件、实例、覆盖、变体、升级/断开 | Components Team | `planned` | — | — | `PD-ARC-01` |
| `PD-CMP-02` | 组件搜索、分类、收藏、预览、拖放、库替换 | Components Team | `planned` | — | — | `PD-CMP-01` |
| `PD-CMP-03` | 组件状态/数据绑定到 Inspect/codegen | Components Team | `planned` | — | — | `PD-CMP-01` |
| `PD-STY-01` | Token CRUD、别名、引用追踪、主题模式、JSON 导入导出 | Styles Team | `finished` | `src/types/designTokens.ts`; `src/composables/designTokens.ts`; `src/composables/designSystem.ts`; `src/components/TokenManagerPanel.vue`; `src/styles/token-manager.css`; `src/types/lowcode.ts`; `scripts/design-tokens-fixture.mjs` | typecheck、build:vite、validate:page-designer、Token fixture、test:e2e、diff check 通过 | `PD-ARC-01` |
| `PD-STY-02` | 样式面板、批量应用/替换、冲突检测 | Styles Team | `planned` | — | — | `PD-STY-01` |
| `PD-STY-03` | Token 到 CSS/JSON/Vue codegen 语义交付 | Styles Team | `planned` | — | — | `PD-STY-01` |
| `PD-RES-01` | Constraints、min/max、fill/hug/fixed、grow/shrink、断点 | Responsive Team | `planned` | — | — | `PD-ARC-01`、`PD-CAN-01` |
| `PD-RES-02` | 设备预设、多视口预览、布局快照/回归 | Responsive Team | `planned` | — | — | `PD-RES-01` |
| `PD-RES-03` | 多视口原型、状态、数据绑定回归 | Responsive Team | `planned` | — | — | `PD-RES-01` |
| `PD-COL-01` | 本地评论锚点、快照、Diff、审阅包 UX | Collaboration Team | `planned` | — | — | 现有 Review |
| `PD-COL-02` | 多窗口 revision、只读审阅、冲突处理、临时 LAN 安全 | Collaboration Team | `planned` | — | — | `PD-COL-01` |
| `PD-COL-03` | 审阅模板、版本命名、交付规则 | Collaboration Team | `planned` | — | — | `PD-COL-01` |
| `PD-COL-04` | revision、节点级 patch 和显式冲突恢复 | Collaboration Team | `planned` | — | — | `PD-ARC-01`、现有 Collaboration |
| `PD-WKF-01` | 命令注册表、命令面板、快捷键和统一搜索入口 | Workflow Team | `finished` | `src/composables/commandRegistry.ts`; `src/components/CommandPalette.vue`; `src/styles/command-palette.css`; `src/views/BuilderView.vue`; `src/composables/useDesigner.ts` | typecheck、build:vite、test:e2e、diff check 通过；Ctrl/Cmd+K、键盘导航、Undo/Redo、画布适配和保存/预览入口可用 | `PD-ARC-01` |
| `PD-WKF-02` | 多选 Inspector、批量属性/Token/对齐/替换 | Workflow Team | `planned` | — | — | `PD-WKF-01` |
| `PD-WKF-03` | 字体/图标/图片/SVG 资产索引、缺失检查、页面导出 | Workflow Team | `planned` | — | — | `P1-03` |
| `PD-QA-01` | 250/500/1000 节点性能预算和基准 | QA/Architecture | `finished` | `scripts/benchmarks/page-designer-performance.mjs`; `scripts/clean-test-artifacts.mjs`; `package.json` | 三档节点 benchmark 全部通过；临时报告自动清理；清理脚本自检通过 | — |
| `PD-QA-02` | A11y、离线、导入导出、核心路径 E2E 回归 | QA/Architecture | `planned` | — | — | 全部工作包 |
| `PD-QA-03` | 协议 fixture、迁移、坏文件恢复、文档门禁 | QA/Architecture | `finished` | `scripts/validate-page-designer.mjs`; `scripts/page-designer-fixtures/*`; `package.json` | node --check、3 个验证组和 9 个 fixture 全部通过 | `PD-ARC-01` |
## 4. 新工作项记录模板

```markdown
### <ID> — <title>
- status: in_progress | finished | blocked
- owner/sub-team:
- objective:
- implementation details:
- changed files:
- verification commands:
- verification results:
- known limitations:
- follow-ups:
```

## 5. 变更日志

| 日期 | 操作 | 结果 |
|---|---|---|
| 2026-08-22 | 创建中央页面设计器研究与实施体系 | 新增 README、竞品研究、差距分析、迭代计划和本状态文件。 |
| 2026-08-22 | 迁移历史实施状态 | P0-01 至 P3-01 统一标记为英文 `finished`，保留实现文件和历史验证结果。 |
| 2026-08-22 | 本轮最终验证 | `npm.cmd run typecheck`、`npm.cmd run build:vite`、`npm.cmd run test:e2e`（18 项）、`npm.cmd run validate:page-designer`、`npm.cmd run test:page-designer-history`、WidgetConfig migration fixture 和 `git diff --check` 全部通过。 |
| 2026-08-22 | 追加代码审计 P0 硬化项 | 将属性历史一致性、useDesigner 拆分、WidgetConfig 单一写入模型和协作冲突恢复纳入 `PD-HIS-01`、`PD-ARC-02`、`PD-DAT-01`、`PD-COL-04`，新规划项共 25 个。 |
| 2026-08-22 | 收敛官方竞品事实 | 增补 Pixso/Figma 的组件属性、Variables/Modes、Auto Layout/Constraints、Actions、离线冲突和套餐/Beta 边界。 |
| 2026-08-22 | Phase 0 多线程交付 | `PD-ARC-01`、`PD-HIS-01`、`PD-DAT-01`、`PD-QA-03` 完成，并补齐实现细节、变更文件、验证结果和已知限制；剩余 21 个 `PD-*` 工作包保持 `planned`。 |
| 2026-08-23 | 完成 `PD-QA-01` 性能门禁与测试清理 | 新增 250/500/1000 节点纯 Node 基准、性能预算检查、临时报告 finally 清理和带边界校验的测试产物清理脚本；清理完成后仅移除空的 `.tmp` 父目录；`PD-QA-01` 更新为 `finished`，剩余 20 个 `PD-*` 工作包保持 `planned`。 |
| 2026-08-23 | 文档与清理门禁复核 | README v1.1.2 移除失效 tracker；ITERATION_PLAN v1.1.1 同步 `PD-QA-01` 为 `finished`；清理脚本 v1.1.0 仅在 `.tmp` 为空时移除父目录。 |

| 2026-08-23 | 完成 Phase 0 领域拆分、Token 管理、命令面板和画布导航基础能力 | `PD-ARC-02`、`PD-STY-01`、`PD-WKF-01` 标记为 `finished`，`PD-CAN-01` 的 viewport 已完成 Builder 接入并标记为 `finished`；补齐实现文件、验证命令/结果、已知限制和后续动作；本轮类型检查、构建、静态门禁、历史 fixture、性能基准、清理、18 项 E2E 和 diff check 均通过。 |
| 2026-08-23 | 完成 `PD-CAN-01` viewport 接入和导航回归 | `useDesignerCanvasViewport` 已接入 `useDesigner.ts` 与 `BuilderView.vue`；补充 viewport transform、Space/中键平移、缩放锚点、Fit Page/Selection 和专用 E2E；`PD-CAN-01` 更新为 `finished`，总体状态为 22 finished、16 planned、0 in_progress、0 blocked。 |
| 2026-08-23 | 完成 `PD-CAN-02` 网格、参考线、智能吸附和多选布局操作 | Builder 接入 8px 网格、6px 智能吸附、拖拽参考线、多选对齐/等间距和 Alt 绕过吸附；新增 guides fixture 与两条 Electron E2E；`PD-CAN-02` 更新为 `finished`，总体状态为 23 finished、15 planned、0 in_progress、0 blocked。 |
## 6. 当前已知限制
- `PD-CAN-01` 已完成有限页面 viewport 的 Builder 接入和导航回归；当前模型仍不等同完整无限画布，标尺仍是基础静态展示，动态联动留待后续。
- `PD-CAN-02` 已提供网格、参考线、智能吸附和多选布局操作；当前仍由 Builder/选择模型提供 selection bounds，网格/吸附状态暂未持久化，1000 节点浏览器 FPS/DOM/GPU 专项需 `PD-QA-02` 覆盖。
- `PD-STY-01` 的 Token API 已支持 JSON 导入导出，但 TokenManagerPanel 当前仅提供导出入口，尚未提供完整的可视化导入按钮。
- 本轮验证中的性能基准为纯 Node/CPU 和 payload 指标，不等同于浏览器 FPS、DOM、GPU/WebGL 或长时间拖拽体验指标。

- 本轮已完成 Phase 0 硬化实现，并新增性能基准与测试产物清理门禁；后续状态以工作包表和变更日志为准。
- 历史 E2E 数量来自既有 tracker；本轮只在最终命令实际运行后更新最新数量，不把历史数量冒充本轮结果。
- Pixso 官方资料对离线模式存在帮助页与更新页的口径差异；该事项保留为 research caveat。
- Figma 的套餐、席位、Beta 和文件管理术语会变化；研究结论按 2026-08-22 记录并需发布前复核。
