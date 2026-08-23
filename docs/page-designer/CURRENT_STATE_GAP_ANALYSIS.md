# 当前页面设计器状态与差距分析

> **审计日期：** 2026-08-22  
> **审计方式：** 源码静态审阅 + 已存在的 E2E/构建记录；不把未运行的测试写成已通过。  
> **证据原则：** 每个判断尽量绑定文件路径、类型或 composable；需要真实用户验证的部分标记为 `验证缺口`。

## 1. 当前基线

### 1.1 技术与数据边界

| 项目 | 当前实现/证据 | 判断 |
|---|---|---|
| 桌面壳 | Electron 42，主进程、preload、renderer 分层；`electron/main/`、`electron/preload/` | 满足桌面架构约束。 |
| 前端 | Vue 3 + TypeScript + Vite；`src/views/BuilderView.vue` | 适合继续拆分编辑器领域状态。 |
| 数据存储 | SQLite，数据库访问已隔离到 `electron/database/client.ts`、`worker.ts` | 已降低主进程阻塞风险，但大型增量模型仍需基准。 |
| 文件格式 | `.codeless` v1、迁移/原子保存/恢复快照；`src/types/projectFile.ts`、`useProjectManager.ts` | 具备本地可移植基础。 |
| 设计协议 | `WidgetConfig v1`；`src/types/lowcode.ts` | 现有 `layout/content/style/data/validation/interaction/meta` 分层是后续能力复用点。 |
| 路由/工作区 | `src/router/`、`src/modules/`、`docs/architecture/app-shell-routing.md` | 首页、工作区、设计器入口已逐步分离。 |

### 1.2 已实现能力矩阵

| 能力域 | 已实现事实 | 代码证据 | 状态 |
|---|---|---|---|
| 画布基础 | 固定尺寸画布、缩放、滚动视口、拖放、选择、框选、移动、缩放、锁定、隐藏、上下文菜单 | `BuilderView.vue`、`useDesigner.ts`、`CanvasWidgetNode.vue`、`CanvasContextMenu.vue` | 基础可用，非完整无限画布 |
| 图层性能 | 视口裁剪、图层树虚拟化、拖拽 requestAnimationFrame 合帧、DOM containment | `VirtualLayerTree.vue`、`useDesigner.ts`、`src/styles/builder.css` | 已实现 |
| 历史与持久化 | 自动保存、退出前保存、增量 patch history、`.codeless` 恢复 | `layoutHistory.ts`、`useProjectManager.ts`、`browserData.ts`、Electron IPC | 已实现 |
| 布局 | Stack/Grid 自动布局、换行/间距等基础字段 | `autoLayout.ts`、`lowcode.ts`、`useDesigner.ts` | 基础可用，缺 Constraints/断点语义 |
| 组件 | 组件面板、业务组件节点、基础变体字段 | `BuilderView.vue`、`lowcode.ts`、`useDesigner.ts` | 有基础，缺主件/实例/资源库治理 |
| 设计系统 | Light/Dark 主题、颜色/字体/间距/圆角等 Token 引用 | `designSystem.ts`、`lowcode.ts`、`BuilderView.vue` | 有基础，缺管理台/引用追踪/批量治理 |
| 审阅协作 | 本地快照、评论锚点、结构化 Diff、审阅包、同机多窗口、可选临时 LAN | `review.ts`、`useReview.ts`、`useCollaboration.ts`、`electron/collaboration/` | 已实现本地闭环，不等同云端实时协作 |
| 交付 | 本地 Inspect、HTML/CSS/Vue/JSON codegen、SVG/素材导入导出 | `inspect.ts`、`InspectPanel.vue`、`browserData.ts`、设计交换模块 | 已实现基础交付闭环 |
| 扩展 | 本地插件 manifest/权限/sandbox、Figma Plugin 本地桥接、开放格式 | `electron/plugins/`、`src/types/plugin.ts`、`plugins/figma-bridge/` | 已实现基础扩展边界 |
| 大型项目 | 240 widget 阈值、viewport culling、DOM containment、可选 WebGL 背景几何 | `CanvasWebGLLayer.vue`、`useDesigner.ts`、相关 CSS | 已有策略，仍需基准数据 |

## 2. 与竞品的主要差距

### 2.1 优先级评分方法

```text
PriorityScore = UserValue(1-5) × WorkflowFrequency(1-5) × Differentiation(1-5)
                 ÷ EngineeringCost(1-5) × ElectronRisk(1-5)
```

评分只用于确定优先级；具体实现以工作包验收标准和验证结果为准。

### 2.2 差距和机会清单

| 优先级 | 差距/风险 | 具体表现 | 影响 | 机会/工作项 |
|---|---|---|---|---|
| P0 | 画布导航模型不完整 | 目前仍以固定页面和滚动视口为主，系统化平移、标尺、网格、参考线、吸附、适配画布不足 | 高频操作成本高；复杂页面难定位 | `PD-CAN-01`、`PD-CAN-02` |
| P0 | 选择/命令模型集中 | `useDesigner.ts` 约 1979 行，选择、布局、持久化、命令和 UI 状态耦合 | 新功能容易回归，子团队难并行 | `PD-ARC-01`、`PD-WKF-01` |
| P1 | 组件语义不完整 | 已有 variant 字段，但主组件、实例、覆盖、升级、断开、资源来源未形成完整协议 | 复用能力无法规模化 | `PD-CMP-01`、`PD-CMP-02` |
| P1 | Token 管理面板不足 | Token 已接入 Inspector，但缺 CRUD、别名、引用追踪、批量替换、模式继承和冲突提示 | 全局换肤/一致性维护成本高 | `PD-STY-01`、`PD-STY-02` |
| P1 | 响应式规则不够 | Stack/Grid 基础布局存在，但缺 Constraints、fill/hug/fixed、grow/shrink、min/max、断点和多视口回归 | 运行时适配不稳定，难覆盖真实页面 | `PD-RES-01`、`PD-RES-02` |
| P1 | 本地协作 UX 待收敛 | 快照、评论、Diff、审阅包已有，但冲突提示、权限/只读、评论状态和审阅流程需统一 | 评审可解释性和效率不足 | `PD-COL-01`、`PD-COL-02` |
| P1 | 工作流发现性不足 | 缺统一命令面板、快捷键帮助、批量 Inspector、统一搜索入口 | 能力存在但用户找不到/操作慢 | `PD-WKF-01`、`PD-WKF-02` |
| P2 | 资产治理不足 | 图片/SVG 基础导入已有，缺字体、图标、页面级资产依赖和缺失资源检查 | 跨设备和交付一致性风险 | `PD-AST-01` |
| P2 | 运行时/设计时模型边界需强化 | 设计节点、数据绑定、响应式规则和 codegen 映射需明确版本化 | 复杂组件升级和迁移成本增加 | `PD-ARC-01`、`PD-RES-01` |
| P2 | 可观测性不足 | 大项目已有优化策略，但缺 250/500/1000 节点的 FPS、内存、保存耗时预算 | 无法证明性能收益和回归 | `PD-QA-01` |
| P2 | 可访问性/回归覆盖不完整 | 键盘导航、焦点、ARIA、离线恢复、不同视口 E2E 仍需系统矩阵 | 质量不可持续 | `PD-QA-02` |

## 3. 根因分析

### 3.1 对象模型

当前 `WidgetConfig v1` 更接近“低代码业务节点配置”，而 Figma/Pixso 的核心则是“可嵌套、可复用、可布局、可审阅的设计对象”。下一阶段不应删除既有协议，而应增加可选字段和迁移：

```text
Page
 └─ Container / Frame
     ├─ layout rules (auto-layout / constraints / breakpoints)
     ├─ design tokens / local styles
     ├─ ComponentDefinition
     │   └─ ComponentInstance + overrides
     └─ data binding / interaction / runtime mapping
```

### 3.2 状态边界

`useDesigner.ts` 同时承载选择、拖拽、布局计算、历史、持久化和 Inspector 交互，是当前并行开发的主要技术阻塞点。建议按下列边界拆分，但以兼容门面渐进迁移：

| 新模块 | 职责 |
|---|---|
| `designerSelection` | 单选、多选、框选、锁定/隐藏过滤、键盘移动 |
| `designerCommands` | 命令注册、执行、撤销/重做、快捷键 |
| `designerLayout` | Auto Layout、Constraints、断点、吸附和测量 |
| `designerPersistence` | dirty、autosave、patch、snapshot、恢复 |
| `designerAssets` | 图片/SVG/字体/图标资源引用、缺失检查 |
| `designerCollaboration` | revision、评论、快照、Diff、审阅包 |

## 4. 代码审计追加的 P0 发现

独立 Audit-Codeless 子线程对当前源码进行了只读复核后，确认以下问题必须在下一轮 P1 视觉能力之前处理：

| P0 项 | 代码证据 | 风险 | 处理工作包 |
|---|---|---|---|
| 属性编辑未统一进入历史栈 | `src/composables/useDesigner.ts` 中 `syncWidget()` 主要执行 normalize + markDirty；`BuilderView.vue` 的 Inspector/Token/事件/页面设置路径未统一调用 `pushHistory()` | 用户无法可靠撤销属性、Token、事件和页面设置，Undo 语义不一致 | `PD-HIS-01` |
| `useDesigner.ts` 职责过度集中 | 文件约 1979 行，同时包含选择、拖放、布局、历史、持久化、性能和协作入口 | 多线程改动冲突、回归定位困难、领域边界不清 | `PD-ARC-02` |
| 新旧数据模型双写 | `LowCodeWidget` 同时保留旧版 `x/y/w/h/props` 与 `config`；`widgetConfig.ts` 负责同步 | 协议漂移、迁移遗漏、插件/导出行为不一致 | `PD-DAT-01` |
| 协作采用完整项目覆盖 | `useCollaboration.ts` 发布/接收完整 `LowCodeProject`，Hub 直接替换项目状态；主要以 `updatedAt` 粗粒度过滤 | 并发编辑可能静默覆盖，无法进行节点级合并或解释冲突 | `PD-COL-04` |
| WebGL 分支缺少真实覆盖 | `scripts/e2e-electron.mjs` 使用禁用硬件加速的兼容模式；现有 E2E 无法证明 WebGL 路径 | 性能优化分支可能在真实 GPU/驱动上回归 | `PD-QA-01`、`PD-QA-02` |

上述结论比“画布导航、组件库、Token 面板”等 P1 体验差距更基础；如果不先处理，后续并行团队会重复实现历史/迁移/冲突逻辑。
## 5. 已完成能力的复核结论

历史 tracker 将 P0-P3 实施项记录为中文“已完成”。中央状态文档会把它们迁移为英文 `finished`，但沿用原有验证记录；本轮不重新宣称尚未运行的测试已经通过。当前记录中 typecheck、Vite build、E2E 和 `git diff --check` 的具体结果见 [`WORK_STATUS.md`](./WORK_STATUS.md)。

## 6. 不应做的事情

| 方案 | 原因 |
|---|---|
| 把 Figma/Pixso 云端页面嵌入 Electron | 破坏完全本地和离线约束，并引入登录、远程代码和数据治理风险。 |
| 直接逆向 `.fig/.sketch/.xd` 私有格式 | 格式不稳定、语义/资源/字体还原困难，维护和许可证风险高。 |
| 每次 pointermove 写 SQLite | 造成 UI 卡顿、磁盘写放大和历史膨胀。 |
| 过早把整个画布改成 WebGL | 文本、输入法、可访问性、命中测试、插件和导出复杂度会同时上升。 |
| 把“有 variant 字段”当作完整组件库 | 没有主件/实例/覆盖/更新/替换，仍不足以支撑设计系统。 |

## 7. 退出条件

本差距分析在以下条件满足前保持有效：

- `PD-HIS-01`、`PD-ARC-02`、`PD-DAT-01`、`PD-COL-04` 先完成并经过回归；`PD-CAN-01` 完成真实画布导航和基准 E2E；
- `PD-CMP-01` 完成组件主件/实例协议迁移；
- `PD-STY-01` 完成 Token 面板和引用追踪；
- `PD-RES-01` 完成多视口布局规则并经过运行时验证；
- `PD-QA-01/02` 建立性能和可访问性回归门禁。
