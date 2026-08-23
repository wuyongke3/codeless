# 页面设计器迭代与优化计划

> **版本：** v1.1.4
> **更新日期：** 2026-08-23  
> **执行原则：** 按依赖顺序推进；没有写入冲突的工作包可以并行，不设固定工作日或开发周期。

## 1. 目标结果

### 1.1 产品目标

在不引入云端项目存储、不强制登录且核心能力永久免费的前提下，把当前低代码设计器升级为：

1. 画布操作接近专业页面设计工具的效率；
2. 组件、变体、Token 和响应式规则可规模化复用；
3. 本地快照、评论、Diff、审阅包形成可解释的评审闭环；
4. SQLite 数据绑定、运行时预览、Inspect/codegen 形成 Codeless 独有的设计到应用闭环；
5. 大型页面有明确性能预算、可观测性和回归门禁。

### 1.2 非目标

- 不实现 Figma/Pixso 全量矢量工具和私有文件格式兼容；
- 不把在线多人协作、云端链接分享或远程资源库作为核心依赖；
- 不在未建立 DOM/可访问性/命中测试基线前重写整个画布为 WebGL；
- 不增加订阅、付费席位、导出次数或隐藏遥测。

## 1.3 Phase 0 执行快照

截至 2026-08-23，Phase 0 已通过多线程协作完成 `PD-ARC-01`、`PD-HIS-01`、`PD-DAT-01`、`PD-QA-03`、`PD-QA-01`、`PD-ARC-02`、`PD-STY-01`、`PD-WKF-01`、`PD-CAN-01` 和 `PD-CAN-02` 十个工作包；其余工作包继续保持 `planned`。以下矩阵同步当前代码实现、交付物、验证结果、已知限制和后续动作。

| 工作包 | 状态 | 实现/交付物 | 验证 | 已知限制/后续 |
|---|---|---|---|---|
| `PD-ARC-01` | `finished` | `src/types/designerProtocol.ts`、`docs/architecture/page-designer-protocol.md`；revision envelope、节点/页面/样式/事务命令、JSON Pointer、类型守卫、迁移诊断和乐观并发语义。 | `npm.cmd run typecheck`、`npm.cmd run validate:page-designer`、`git diff --check` 通过。 | 共享契约和运行时守卫已交付，但并非所有编辑器操作都已切换为协议命令；CRDT、自动三方合并和远端同步未实现。后续：`PD-ARC-02`、`PD-COL-04`。 |
| `PD-HIS-01` | `finished` | 统一 layout/project history sequence；Inspector、Token、事件、数据源、提交目标、页面属性和页面生命周期进入历史；连续属性约 450ms debounce 合并；项目级 snapshot patch、prune/reset 和每类 40 条上限；补充 history fixture。 | `npm.cmd run typecheck`、`npm.cmd run build:vite`、`npm.cmd run test:e2e`、`npm.cmd run test:page-designer-history`、`npm.cmd run validate:page-designer`、WidgetConfig migration fixture、`git diff --check` 通过；18 个 Electron E2E 场景通过。 | `useDesigner.ts` 仍承担较多职责；协作 revision 的节点级冲突恢复和未来组件库/完整响应式历史语义尚未接入。后续：`PD-ARC-02`、`PD-COL-04`、`PD-WKF-02`。 |
| `PD-DAT-01` | `finished` | `normalizeWidget()` 作为导入迁移入口；编辑器只写 `config.layout` 及 `config.content/style/data/validation/interaction`；legacy `x/y/w/h/props` 只读投影；加入配置校验、存储诊断、双写漂移检测和非法字段保护；保留 options/columns 兼容导出。 | `npm.cmd run typecheck`、WidgetConfig migration fixture、相关 `git diff --check` 通过；legacy/project/config 迁移、只读投影、非法写入拒绝和 round-trip fixture 通过。 | 为兼容旧插件和文件仍保留 legacy 投影；TypeScript `readonly` 不能阻止外部 JavaScript 直接篡改旧字段，旧插件直接写 legacy 字段不会成为新的持久化写入路径。后续：`PD-ARC-02`、`PD-CMP-03`、`PD-COL-04`。 |
| `PD-QA-03` | `finished` | `scripts/validate-page-designer.mjs`、manifest 和 9 个项目/迁移/恢复 fixture；覆盖文档完整性、状态枚举、协议入口、项目迁移、非法 JSON、缺失项目 ID、非法组件字段、未来 schema 和损坏恢复；注册 `validate:page-designer`。 | `node --check scripts/validate-page-designer.mjs`、`npm.cmd run validate:page-designer` 通过；3 个验证组、9 个 fixture 全部通过。 | 当前以静态协议、文件形状和文档一致性为主，不替代 Electron UI E2E、性能基准、A11y 或真实大项目恢复测试。后续：`PD-QA-01`、`PD-QA-02`。 |
| `PD-QA-01` | `finished` | 新增 250/500/1000 节点纯 Node benchmark，测量序列化、解析、结构校验、layout patch 构建/应用 p95 和 payload；超预算返回非零；报告在 `finally` 清理；新增带仓库边界校验的测试产物清理脚本。 | `node --check` 两个脚本、`npm.cmd run bench:page-designer`、`node scripts/clean-test-artifacts.mjs --check` 通过；三档 benchmark 全部 PASS，临时报告和空 `.tmp` 父目录清理验证通过。 | 仅覆盖纯 Node 数据/CPU 路径，不替代浏览器 FPS、DOM、GPU/WebGL、冷启动、真实拖拽和内存剖析。后续：`PD-QA-02`。 |
| `PD-ARC-02` | `finished` | 新增 `src/composables/designer/` 下的 `collaboration.ts`、`history.ts`、`layout.ts`、`performance.ts`、`persistence.ts`、`selection.ts` 领域模块；`src/composables/useDesigner.ts` 保留兼容门面，并补充 `getRenderedWidgetFrame`、`zoomBy`、`fitCanvas`、历史定时器清理和旧 Builder API 适配。 | `npm.cmd run typecheck`、`npm.cmd run build:vite`、`npm.cmd run validate:page-designer`、`npm.cmd run test:page-designer-history`、`npm.cmd run bench:page-designer`、`npm.cmd run test:e2e`、`npm.cmd run clean:test-artifacts`、`git diff --check` 通过；现有 18 项 Electron E2E 通过。 | 兼容门面按设计保留；无限画布完整 viewport 接入和协作冲突恢复不属于本包完成范围。后续：继续维护领域接口，并推进 `PD-CAN-01`、`PD-COL-04`。 |
| `PD-STY-01` | `finished` | 新增 `src/types/designTokens.ts`、`src/composables/designTokens.ts`、`TokenManagerPanel.vue` 和 Token 样式；接入 `lowcode.ts`、`designSystem.ts`、`tokens.css` 与 Builder；支持 Token CRUD、别名、引用计数、被引用删除保护、Light/Dark 主题、JSON 导出和设计系统入口。 | `npm.cmd run typecheck`、`npm.cmd run build:vite`、`npm.cmd run validate:page-designer`、`npm.cmd run test:e2e`、`git diff --check` 通过。 | JSON 导入能力已存在于 composable API，但尚未提供完整的可视化导入按钮；后续：`PD-STY-02`、`PD-STY-03`。 |
| `PD-WKF-01` | `finished` | 新增 `src/composables/commandRegistry.ts`、`CommandPalette.vue`、命令面板样式并接入 Builder；支持 Ctrl/Cmd+K、搜索、上下键、Enter、撤销/重做、选择/复制/粘贴/删除、层级、适配、缩放、保存/预览/Review/Inspect；新增 `zoomBy`、`fitCanvas` 和 Shift+1/Shift+2。 | `npm.cmd run typecheck`、`npm.cmd run build:vite`、`npm.cmd run test:e2e`、`git diff --check` 通过。 | 当前命令注册表为 Builder 本地实现，不支持插件动态注册或命令遥测；后续：`PD-WKF-02`。 |
| `PD-CAN-01` | `finished` | 新增 `useDesignerCanvasViewport`、`src/types/designerCanvasViewport.ts` 和 `src/styles/designer-canvas-viewport.css`；通过 `useDesigner.ts` 配置页面尺寸、0.25–2 zoom、fit padding 与滚轮/平移策略，并在 `BuilderView.vue` 接入 `canvas-stage`、`canvas-frame`、逻辑尺寸 canvas、`contentStyle`、pointer/key handlers 和 `is-panning`。viewport API 覆盖缩放中心、pan/zoom 坐标转换、Fit Page/Selection、min/max zoom 和 Space/中键平移。 | `npm.cmd run typecheck`、`npm.cmd run build:vite`、`npm.cmd run test:e2e`、`npm.cmd run validate:page-designer`、`npm.cmd run test:page-designer-history`、`npm.cmd run bench:page-designer`、`npm.cmd run clean:test-artifacts`、`git diff --check` 通过；18 项 Electron E2E 全部通过，其中包含 `viewport navigation and transform integration`。 | 当前是有限页面/transform viewport，不等同完整无限画布；标尺仍是基础静态展示，网格/参考线/智能吸附属于 `PD-CAN-02`；selection bounds 由 Builder/选择模型提供；1000 节点浏览器导航专项留待 `PD-QA-02` 或后续 QA。 |
| `PD-CAN-02` | `finished` | 新增 `src/types/designerCanvasGuides.ts`、`src/composables/designer/canvasGuides.ts`；在 `useDesigner.ts` 和 `BuilderView.vue` 接入默认 8px 网格、6px 阈值智能吸附、拖拽参考线、多选对齐和水平/垂直等间距；支持网格/吸附开关与 `Alt` 绕过吸附，批量操作进入统一历史记录。 | `npm.cmd run typecheck -- --pretty false`、`npm.cmd run build:vite`、`npm.cmd run test:e2e`、`npm.cmd run validate:page-designer`、`npm.cmd run test:page-designer-history`、`npm.cmd run test:page-designer-guides`、`npm.cmd run bench:page-designer`、`npm.cmd run clean:test-artifacts`、`node scripts/clean-test-artifacts.mjs --check`、`git diff --check` 通过；20 项 Electron E2E、3 组 9 个静态 fixture 和三档性能 benchmark 全部通过。 | 当前仍是有限页面 viewport；标尺尚未完整联动 pan/zoom；网格/吸附状态未持久化；参考线仅拖拽期间显示；浏览器 FPS/DOM/GPU 和真实大项目拖拽体验留待 `PD-QA-02`。 |
## 2. 并行工作流和团队分工

| 子团队 | 工作流 | 可独立写入范围 | 主要依赖 | 目标输出 |
|---|---|---|---|---|
| Canvas Team | A：画布与导航 | `src/composables/designerCanvas*`、画布组件、画布样式、Canvas E2E | `PD-ARC-01` 的 viewport/command 接口 | 页面/大画布 viewport 导航、标尺、网格、吸附 |
| Components Team | B：组件与资源库 | `src/composables/componentLibrary*`、组件面板、组件协议迁移、组件 E2E | `PD-ARC-01` 的 definition/instance 接口 | 主组件、实例、变体、覆盖、库治理 |
| Styles Team | C：样式与 Token | `src/composables/token*`、Token 面板、Inspector 样式、Token 测试 | `PD-ARC-01` 的 token schema | Token 管理、主题模式、引用追踪、批量替换 |
| Responsive Team | D：响应式与原型 | `src/composables/responsive*`、预览器、布局 Inspector | `PD-CAN-01`、`PD-ARC-01` | Constraints、断点、多视口、布局回归 |
| Collaboration Team | E：本地协作与审阅 | `src/composables/review*`、协作面板、`electron/collaboration/` | 现有 snapshot/revision 协议 | 评论、Diff、只读审阅、冲突提示 |
| Workflow Team | F：效率与交付 | command registry、命令面板、快捷键、批量 Inspector、Inspect | `PD-ARC-01`、选择模型 | 少切换上下文的高频工作流 |
| QA/Architecture Team | 横向质量门禁 | `scripts/benchmarks/`、E2E、性能报告、协议文档 | 所有工作流的验收入口 | 基准、可访问性、迁移和回归门禁 |

### 并行执行规则

1. `PD-ARC-01` 只定义接口和迁移，不承载各领域 UI 实现；完成 schema review 后 A/B/C/F 可并行。
2. 每个子团队必须在自己的 work item 中记录：变更文件、协议影响、测试、风险和回滚方案。
3. 任何跨团队字段变更必须先更新 `src/types/lowcode.ts` 或对应契约文档，再由 owner 认领。
4. 每个完成项必须在 [`WORK_STATUS.md`](./WORK_STATUS.md) 写入 `finished`、implementation details 和 verification results。
5. QA 线程可以全程并行建立基线；最终在所有相关工作包合并后执行完整回归。

## 3. 依赖图

```text
PD-ARC-01 共享对象/命令/迁移契约
   ├── PD-HIS-01 统一历史事务
   │      └── PD-ARC-02 useDesigner 领域拆分
   ├── PD-DAT-01 WidgetConfig 唯一写入模型
   ├── PD-COL-04 revision/节点级 patch/冲突恢复
   └── PD-CAN-01 画布导航
   │      └── PD-CAN-02 网格/参考线/智能吸附
   ├── PD-CMP-01 主组件/实例模型
   │      └── PD-CMP-02 资源发现/发布/替换
   ├── PD-STY-01 Token 管理台
   │      └── PD-STY-02 样式应用/批量替换
   ├── PD-WKF-01 命令系统
   │      └── PD-WKF-02 批量编辑/可发现性
   └── PD-WKF-03 资产/字体/缺失资源治理

PD-CAN-01 + PD-ARC-01
   └── PD-RES-01 Constraints/断点运行时规则
          └── PD-RES-02 多视口预览/布局回归

现有 review + PD-ARC-01
   └── PD-COL-01 本地评审 UX
          └── PD-COL-02 多窗口 revision/冲突处理

所有工作包 ──> PD-QA-01 性能预算 ──> PD-QA-02 可访问性/全量回归
```

## 4. 工作项明细

### 4.1 基础契约与画布线程

| ID | 状态 | 目标 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| `PD-ARC-01` | `finished` | 建立共享的对象、命令、revision 和迁移契约，使多线程不直接修改同一份状态 | `docs/architecture/page-designer-protocol.md`；`src/types/designerProtocol.ts`；revision envelope、atomic/transaction command、JSON Pointer、类型守卫和迁移诊断 | 无 | v1 协议入口可定位；非法 revision/command 可拒绝并返回诊断；typecheck、协议 fixture 和文档门禁通过 |
| `PD-CAN-01` | `finished` | 让画布具备稳定的页面 viewport 导航体验，并为后续大画布能力提供独立变换 API | `useDesignerCanvasViewport`；`src/types/designerCanvasViewport.ts`；`src/styles/designer-canvas-viewport.css`；`useDesigner.ts` 和 `BuilderView.vue` 接入；viewport E2E case | `PD-ARC-01` | 页面 viewport 支持鼠标/空格/中键平移、滚轮或快捷键缩放、缩放中心、min/max zoom 和 Fit Page/Selection；18 项 Electron E2E 通过并覆盖初始 960×720、1.5 zoom、Space+pointer drag 和 Fit Page；完整无限画布与 1000 节点浏览器专项不在本包验收范围 |
| `PD-CAN-02` | `finished` | 降低对齐和测量成本 | 网格开关/间距；参考线；对象边缘/中心/间距吸附；多选对齐、分布、等间距；吸附开关和快捷键；实现 8px 网格、6px 吸附阈值、Alt 绕过吸附、整体 bounds 吸附和历史事务 | `PD-CAN-01` | guides fixture、20 项 Electron E2E、吸附误差可视化、多选撤销和主要命令回归通过；有限 viewport、标尺联动、状态持久化和浏览器性能专项留待后续 |

### 4.2 组件与资源库线程

| ID | 状态 | 目标 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| `PD-CMP-01` | `planned` | 将基础 variant 升级为可维护的主组件/实例模型 | 组件定义表/协议；实例引用；覆盖记录（文本、Token、可见性、子节点属性）；变体属性；重置/分离/升级提示 | `PD-ARC-01` | 主组件修改能更新实例；合法覆盖保留；覆盖冲突有提示；断开后成为独立节点；旧 variant 可迁移 |
| `PD-CMP-02` | `planned` | 提升资源发现和插入效率 | 本地组件库面板；搜索/分类/收藏/最近使用；缩略图预览；拖放插入；库版本和缺失链接修复 | `PD-CMP-01` | 组件库规模 500 项仍可搜索；搜索结果可定位来源；替换库后实例关系可验证；无网络可用 |
| `PD-CMP-03` | `planned` | 让组件交付与运行时数据绑定一致 | 组件状态/属性到 runtime props 的映射；组件文档片段；实例 Inspect 展示来源、变体和覆盖 | `PD-CMP-01`、现有 Inspect | Inspect 可解释组件来源；codegen 不丢失数据绑定；运行时预览与设计态状态一致 |

### 4.3 样式与设计系统线程

| ID | 状态 | 目标 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| `PD-STY-01` | `finished` | 将 Token 从字段能力升级为可治理的本地设计系统 | Token 管理台；颜色/数值/文本/布尔类型；语义别名；主题模式；导入导出；引用索引 | `PD-ARC-01` | 创建/编辑/删除 Token 可持久化；删除被引用 Token 有阻止或替换流程；模式切换实时预览；离线可用 |
| `PD-STY-02` | `planned` | 减少样式重复编辑和全局换肤成本 | 样式面板；局部/全局样式；批量应用/替换；未使用 Token、硬编码值和冲突检测；Inspector 快速绑定 | `PD-STY-01` | 10 个节点批量换 Token 一次完成；冲突说明可定位节点；撤销/重做和 Diff 可读 |
| `PD-STY-03` | `planned` | 形成设计到开发的语义交付 | Token → CSS variables/JSON/Vue codegen 映射；组件库资源的 token 依赖清单 | `PD-STY-01`、现有 codegen | 输出包含语义名和来源；运行时主题与导出变量一致；导出文件可独立验证 |

### 4.4 响应式与原型线程

| ID | 状态 | 目标 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| `PD-RES-01` | `planned` | 建立设计时到运行时一致的响应式布局规则 | Constraints；fixed/fill/hug；grow/shrink；min/max；gap/padding；断点 schema；Auto Layout 与绝对定位优先级 | `PD-ARC-01`、`PD-CAN-01` | 至少覆盖桌面/平板/手机三预设；内容增删不破坏布局；运行时与设计预览一致；旧布局不变 |
| `PD-RES-02` | `planned` | 提供多视口检查和布局回归 | 设备预设管理；并排/切换预览；断点标记；布局快照；差异高亮；导出回归报告 | `PD-RES-01` | 三个视口可在 3 秒内切换；异常节点可定位；快照可加入审阅包；离线运行 |
| `PD-RES-03` | `planned` | 让原型交互与响应式状态可审阅 | 视口对应的原型入口；状态/变体/数据绑定在不同视口的预览；交互回归脚本 | `PD-RES-01`、现有 runtime | 同一页面不同视口可运行；交互和数据绑定不因布局切换丢失；E2E 覆盖关键路径 |

### 4.5 协作与审阅线程

| ID | 状态 | 目标 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| `PD-COL-01` | `planned` | 把现有本地快照/评论/Diff 收敛成可交付审阅 UX | 评论状态（open/resolved）；对象/坐标锚点；截图附件；版本上下文；Diff 筛选；审阅包导出/导入 | 现有 review 模块 | 评论在节点移动后仍可解析；审阅包断网可导入；Diff 可按页面/节点/属性筛选；所有动作可追溯 |
| `PD-COL-02` | `planned` | 让同机多窗口和临时局域网会话更安全可解释 | revision/会话 ID；只读审阅窗口；冲突提示；导入前 Diff；权限角色；默认关闭的 LAN 开关和审计 | `PD-COL-01`、现有 collaboration | 并发修改不静默覆盖；只读窗口不能写入；会话关闭清理临时数据；网络默认不监听 |
| `PD-COL-03` | `planned` | 建立本地审阅模板和项目交付规则 | 审阅清单；版本命名；评论负责人/截止日期（本地元数据）；审阅包 manifest；归档策略 | `PD-COL-01` | 新成员按 README 可完成审阅；审阅包含版本、资源和验证信息；无云端依赖 |

### 4.6 工作流与资产线程

| ID | 状态 | 目标 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| `PD-WKF-01` | `finished` | 提升命令发现和快捷键效率 | 命令注册表；命令面板；快捷键帮助；上下文命令；最近使用；可搜索图层/页面/组件/Token | `PD-ARC-01` | 所有高频操作可搜索；键盘可完成添加/删除/对齐/适配画布；快捷键冲突有提示；命令有可读反馈 |
| `PD-WKF-02` | `planned` | 降低多选和重复编辑成本 | 多选 Inspector；批量尺寸/间距/Token/可见性/锁定；批量组件替换；批量对齐 | `PD-WKF-01`、选择模型 | 混合类型多选不丢失共同属性；部分值显示为 mixed；批量修改可撤销且 Diff 可读 |
| `PD-WKF-03` | `planned` | 完善本地交付和资产依赖治理 | 字体/图标/图片/SVG 资产索引；缺失资源检测；页面级导出；复制资源路径；交付前检查报告 | 现有资产/Inspect | 无网络打开项目能提示缺失项；导出报告列出字体、图片、Token、组件依赖；不泄露绝对路径以外的信息 |

### 4.7 架构和质量横向线程

| ID | 状态 | 目标 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| `PD-QA-01` | `finished` | 建立页面设计器数据路径性能预算 | 250/500/1000 节点 fixture；序列化、解析、结构校验、layout patch 构建与应用指标；payload 与 p95 门禁；测试产物清理脚本 | `PD-ARC-01` | 三档节点基准可复跑；各项 p95 低于预算；超预算失败；测试报告和临时目录自动清理 |
| `PD-QA-02` | `planned` | 建立可访问性和核心回归矩阵 | 键盘导航/焦点/ARIA 检查；离线恢复；导入导出；组件/Token/响应式/协作 E2E；`git diff --check` | 可立即开始，最终收敛 | 关键路径无阻塞级 A11y 问题；E2E 在干净构建运行；失败日志可定位 |
| `PD-QA-03` | `finished` | 将设计协议和迁移纳入发布门禁 | schema fixture、版本迁移测试、坏文件恢复测试、审阅包兼容测试、文档一致性脚本 | `PD-ARC-01` | 新旧文件均可迁移；坏输入不覆盖原文件；WORK_STATUS 每个 finished 项有验证字段 |

### 4.8 审计追加的 P0 硬化工作包

当前代码审计补充确认了三个不能延后到普通 P1 的问题：Inspector/Token/页面设置修改没有统一进入历史栈；useDesigner.ts 约 1979 行导致并行开发和回归困难；旧版 x/y/w/h + props 与 WidgetConfig 并存会造成协议漂移。以下工作包插入 Phase 0，优先于响应式、组件库和批量编辑线程。

| ID | 状态 | 目标 | 交付物 | 依赖 | owner/sub-team | 验收标准 |
|---|---|---|---|---|---|---|
| PD-HIS-01 | `finished` | 让画布、Inspector、Token、事件、页面属性都具备一致 Undo/Redo | Command/Transaction API；字段级或 debounce 合并策略；批量编辑事务；历史面板来源标识；属性修改、主题修改、页面设置和事件链的回归测试 | PD-ARC-01 | Core Editor + Workflow | 任意受支持编辑后立即 Undo 可恢复；Redo 可重放；自动保存不会制造重复历史；Diff 能显示命令来源 |
| PD-ARC-02 | `finished` | 拆分 useDesigner.ts 的领域职责，同时保留兼容门面 | Selection、Commands、Layout、Persistence、Performance、Collaboration 子模块；旧调用方迁移适配；领域接口文档 | PD-ARC-01、PD-HIS-01 | QA/Architecture | 新模块可独立单测；Builder 不直接依赖内部可变状态；旧页面交互和 E2E 不回归；模块循环依赖检查通过 |
| PD-DAT-01 | `finished` | 将 WidgetConfig v1 设为唯一写入主模型，旧字段只读兼容 | legacy normalize/migrate；读写边界；schema fixture；旧插件/开放格式兼容适配；双写漂移检测 | PD-ARC-01 | Data/Exchange | 新编辑只写 config；旧项目可打开并迁移；非法字段不会静默覆盖；导入导出 round-trip 保持布局、Token、数据绑定和事件 |
| PD-COL-04 | `planned` | 在现有本地协作上补齐 revision、节点级 patch 和显式冲突恢复 | revision envelope；节点级 patch；冲突对象列表；保留本地版本；合并/放弃/另存快照流程；并发测试 | PD-ARC-01、现有 Collaboration | Collaboration Team | 两个窗口同时编辑不同节点不会互相覆盖；同节点冲突可解释；旧完整快照会安全降级；无网络核心路径仍可用 |

这些 P0 包必须在中央状态中单独认领，不能以“协作已有”“历史已有”或“模型已有”替代验收。
## 5. 执行顺序与并行边界

| 顺序 | 工作包 | 并行边界 | 退出条件 |
|---|---|---|---|
| 1 | `PD-ARC-01`（finished）、`PD-HIS-01`（finished）、`PD-DAT-01`（finished）、`PD-QA-03`（finished） | 契约完成后，质量门禁可独立运行 | 共享协议、历史、数据模型和 fixture 门禁均有验证记录；已完成 |
| 2 | `PD-QA-01`（finished） | 已完成；可与不依赖其结果的审计工作只读并行 | 基准可复跑，超预算返回非零状态，测试产物完成清理；已完成 |
| 3 | `PD-ARC-02`（finished）、`PD-CAN-01`（finished）、`PD-CAN-02`（finished）、`PD-CMP-01`（planned）、`PD-STY-01`（finished）、`PD-COL-01`（planned）、`PD-WKF-01`（finished） | 共享协议稳定后，各工作包使用 disjoint write scope 并行；画布 viewport、网格、参考线和吸附已完成；后续画布增强继续由更大范围 viewport/QA 工作承接 | 已完成包已有独立验证；`PD-CAN-01` 的页面 viewport 导航和 `PD-CAN-02` 的网格/吸附/多选布局回归完成；完整无限画布、标尺联动、状态持久化和浏览器性能专项继续由后续工作包覆盖 |
| 4 | `PD-CMP-02/03`、`PD-STY-02/03`、`PD-RES-01`、`PD-COL-02`、`PD-WKF-02` | 仅在对应前置工作包完成后并行；`PD-CAN-02` 已完成并可作为后续响应式/批量编辑的画布基础 | 组件、Token、响应式、评审和批量编辑可串联；画布后续以 `PD-QA-02` 汇总大项目/A11y/浏览器性能回归 |
| 5 | `PD-RES-02/03`、`PD-COL-03`、`PD-WKF-03`、`PD-QA-02` | 依赖的领域能力完成后并行；QA 最终汇总 | 多视口、审阅包、资产检查和全量回归通过 |

继续执行时只推进当前序列中最早的未完成工作包；任何工作包完成后，必须先补齐 `WORK_STATUS.md`，再进入其后置依赖。

## 6. 每个工作项的通用交付模板

```markdown
### <ID> — <title>
- status: in_progress | finished | blocked
- owner/sub-team:
- objective:
- scope / non-goals:
- implementation details:
- changed files:
- verification commands:
- verification results:
- known limitations:
- follow-ups:
```

## 7. 发布验收清单

- [ ] 新旧 `.codeless` 文件可迁移、可恢复、可回滚；
- [ ] 画布导航和高频命令可全键盘操作；
- [ ] 主组件/实例/变体/Token/响应式规则能在 Inspect 和运行时解释；
- [ ] 设计、运行、数据绑定和 codegen 的关键路径 E2E 通过；
- [ ] 本地评论、Diff、审阅包和同机协作不依赖互联网；
- [ ] 250/500/1000 节点性能报告达到预算；
- [ ] A11y、离线、导入导出、坏文件恢复有自动化回归；
- [ ] `WORK_STATUS.md` 所有已交付项均有英文 `finished` 和验证记录；
- [ ] README、迁移说明、已知限制和发布说明同步更新。

## 8. 变更日志

| 日期 | 版本 | 变更内容 |
|---|---|---|
| 2026-08-23 | v1.1.2 | 更新 Phase 0 快照：`PD-ARC-01`、`PD-HIS-01`、`PD-DAT-01`、`PD-QA-03`、`PD-QA-01`、`PD-ARC-02`、`PD-STY-01`、`PD-WKF-01`、`PD-CAN-01` 标记为 `finished`；补充 viewport 真实接入、交付物、验证结果、已知限制和后续动作；同步工作项表与执行顺序，其余工作包继续保持 `planned`。 |
| 2026-08-23 | v1.1.3 | 完成 `PD-CAN-01`：将 viewport composable 接入 Builder 主渲染路径，补齐缩放、Fit Page/Selection、Space/中键平移和独立 viewport E2E；同步 `WORK_STATUS.md` 为 `finished`，其余画布增强继续保持 `planned`。 |
| 2026-08-23 | v1.1.4 | 完成 `PD-CAN-02`：接入 8px 网格、6px 智能吸附、拖拽参考线、多选对齐/等间距、Alt 绕过吸附和历史事务；补充 guides fixture、20 项 Electron E2E 与完整门禁结果；同步 `WORK_STATUS.md`、README 和本计划。 |

