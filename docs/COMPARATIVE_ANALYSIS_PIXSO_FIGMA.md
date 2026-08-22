# Codeless 与 Pixso / Figma 的本地化竞品比较与演进建议

> **评估对象**：当前工作区中的 Codeless（Electron + Vue 3 + TypeScript + SQLite）
>
> **评估日期**：2026-08-22
>
> **不变约束**：
> 1. 必须继续使用 Electron 桌面架构；
> 2. 核心数据必须完全保存在用户本机，不引入云同步、云端项目存储或强制登录；
> 3. 所有核心能力永久免费，不设置订阅、付费功能、按席位收费或付费插件门槛。
>
> 本文把“本地”定义为：默认不访问互联网、不向第三方服务器上传项目数据；可选的同机多窗口和后续“受用户明确开启的局域网协作”不等同于云同步。若产品将“本地”解释为数据绝不离开单台设备，则应关闭局域网协作，只保留同机协作与离线评审。

---

## 1. 结论摘要

### 1.1 产品定位结论

Codeless 当前并不是 Figma/Pixso 的直接替代品，而是一个**本地优先的低代码应用原型与运行平台**：它把页面组件、SQLite 数据模型、事件流和运行时预览放在同一个桌面应用中。Figma 与 Pixso 的核心优势则是高保真 UI/UX 设计、矢量编辑、设计系统、多人实时协作和跨团队交付。

因此，最合理的竞争策略不是复制 Figma/Pixso 的全部功能，而是形成差异化的“**本地设计—数据绑定—可运行原型—可移交文件**”闭环：

| 维度 | Codeless 应保持的优势 | 应借鉴的能力 | 不应直接复制的部分 |
|---|---|---|---|
| 价值主张 | 无账号、无云端、永久免费、SQLite 原生、本地可运行 | 组件/变体、自动布局、变量、原型交互、检查面板 | 云端文件浏览器、订阅/席位体系、云端链接分享 |
| 技术路线 | Electron 多进程 + 本地文件/SQLite | 增量文档模型、视口加载、操作历史、插件 API | 远程代码加载、云端实时数据库、强制在线依赖 |
| 目标用户 | 个人开发者、内网团队、隐私敏感组织、快速业务原型用户 | 产品经理、设计师、开发者评审工作流 | 以多人云协作为第一生产力的大型设计组织 |
| 成功指标 | 离线可用、数据可控、交互流畅、可导出、崩溃可恢复 | 设计效率和交付质量 | 在线 DAU、云存储容量、付费转化 |

### 1.2 最重要的判断

1. **优先补齐“设计系统和原型效率”，不要立刻做完整矢量绘图软件。** 当前已有 WidgetConfig、组件注册表、画布节点、图层树和事件系统，继续增强这些模块的投入产出比最高。
2. **把 `layout_json` 单体存储升级为可迁移、可增量保存的本地文档格式。** 这是后续历史版本、评论、导入导出、局域网协作和大型文件性能的共同基础。
3. **将 SQLite 和重型导入导出任务移出 Electron 主进程。** 当前使用 `DatabaseSync`，其 API 是同步执行的；如果文档或数据量增长，会阻塞 Electron 主进程和窗口生命周期管理。
4. **以“本地文件 + 本地评审”替代云端分享。** 应提供快照、差异对比、评论锚点、审阅包和可执行原型导出，而不是伪造一个需要服务端的在线链接。
5. **插件生态必须默认无网络、从本地安装、权限可审计。** 插件可以扩展组件、导入导出和代码生成，但不能获得 Node/Electron 原始能力。
6. **Figma/Pixso 文件兼容应采取“开放格式优先、官方插件桥接、拒绝逆向私有格式”策略。** 不应承诺直接解析 `.fig`、`.sketch` 或 `.xd` 的全部语义。

---

## 2. 评估基线：当前 Codeless 已有什么

### 2.1 工作区和技术栈基线

| 项目 | 当前实现 | 评价 |
|---|---|---|
| 桌面容器 | Electron，`package.json` 当前声明 `^42.1.0` | 满足桌面、本地文件、原生菜单和多窗口扩展基础 |
| 渲染层 | Vue 3 + TypeScript + Vite | 适合快速迭代 UI，但需要控制深层响应式和大文档重渲染 |
| 本地数据库 | Electron 主进程中的 `node:sqlite` `DatabaseSync` | 已启用 WAL 和外键；同步 API 不宜长期留在主进程 |
| IPC | `contextBridge` 暴露窄接口，`ipcMain.handle` 处理项目和表数据 | 方向正确，但应补充 sender 校验、参数 schema 和错误协议 |
| 项目存储 | `projects.layout_json` 保存页面布局；`activities` 保存活动记录 | 适合原型阶段；大项目、历史版本、增量同步会受到限制 |
| 设计器 | 组件拖放、画布、选择、图层树、上下文菜单、撤销/重做、预览 | 已具备低代码设计器骨架，下一步应做约束布局、组件系统和性能 |
| 组件协议 | `WidgetConfig v1`，区分 `layout/content/style/data/validation/interaction/meta` | 这是最有价值的长期扩展点，应继续作为稳定文档协议 |
| 数据能力 | SQLite 表浏览、描述、查询、增删改、表单提交、组件数据绑定 | 与 Figma/Pixso 的主要差异化，应提升为产品主线 |
| 运行时 | 本地运行预览、路由/事件/数据绑定基础 | 适合发展为“设计即应用”的本地闭环 |
| 浏览器降级 | `localStorage` 适配器 | 有利于开发和演示，但必须明确它不是正式持久化方案 |
| 打包 | electron-builder，Windows/macOS/Linux 目标 | 满足跨平台发行；需要补充数据迁移、签名和本地文件关联 |

### 2.2 已验证状态

截至本次分析，以下命令通过：

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm run build:vite` | 通过；渲染包约 285 kB gzip 前，主进程和 preload 均成功产出 |

这里的构建通过只说明类型和打包链路可用，不代表大型文档、异常退出、升级迁移、插件隔离或离线安全已经完成。

### 2.3 当前主要结构性缺口

| 缺口 | 当前表现 | 影响 |
|---|---|---|
| 文档粒度过粗 | 项目布局以 JSON 整体写入 `projects.layout_json` | 每次保存和撤销都可能复制大对象；难以做差异、合并、部分加载 |
| 历史实现偏内存 | 设计器历史栈以布局克隆为主，且有固定数量上限 | 大文档撤销成本高，应用崩溃后无法恢复最近操作 |
| 主进程承担同步数据库 | `DatabaseSync` 与 IPC handler 位于 `electron/main/index.ts` | 查询、迁移、批量导入可能阻塞窗口和系统事件 |
| 安全选项未显式声明 | `BrowserWindow` 当前主要传入 preload | 应显式声明 `contextIsolation`、`sandbox`、`nodeIntegration`、CSP 和导航策略 |
| 标准文件格式不足 | 主要依赖应用数据库；未形成独立可移植项目包 | 难以备份、版本控制、跨设备搬迁和长期归档 |
| 没有本地协作语义 | `activities` 是操作日志，不是评论、审阅或冲突解决 | 无法替代团队评审，也没有可解释的版本差异 |
| 没有插件宿主 | 当前没有 manifest、权限模型、插件 API 或本地插件目录 | 无法建立生态，且贸然加载插件会引入 Electron 代码执行风险 |
| 设计能力偏业务组件 | 组件多为 heading、table、form、stat 等低代码控件 | 与 Figma/Pixso 的矢量、约束、组件变体、设计令牌存在明显差距 |
| 资源与字体管理不足 | 图片、字体、图标和导出依赖尚未统一建模 | 跨机器打开时容易出现丢失资源、字体替换和视觉不一致 |
| 源文件存在编码可读性风险 | 当前工作区若以错误代码页读取，中文字符串呈现为乱码 | 会影响文档、错误信息、界面文案和跨平台构建，应作为 P0 工程治理项处理 |

---

## 3. Figma 与 Pixso 的能力基线

### 3.1 Figma

Figma 官方当前的能力组合包括：无限画布和图层/矢量编辑、自动布局、组件、变量、交互原型、评论、多人实时编辑、版本历史、Dev Mode/检查、插件和社区资源。其计划表还明确区分 Starter、Professional、Organization、Enterprise，在文件数量、版本历史、组件/变量库、分支合并、管理和协作能力上存在层级差异。Figma 的本地副本格式包括 `.fig` 等产品专有格式，但官方明确说明这些格式可能变化，不建议第三方工具依赖其内部结构。（参见第 11 节官方参考资料）

Figma 的离线模式是“云产品的有限降级”，而不是完全本地产品：断网时只能访问已加载页面和有限功能，不能使用多人协作、远程组件库、版本历史和新插件安装；离线修改随后需要联网同步。（参见第 11 节官方参考资料）

Figma 的文件兼容策略以导入 `.fig`/`.sketch`、导入图片和矢量、导出静态资源为主。官方文档列出的设计导出能力包含 PNG、SVG 等，并可保存 `.fig` 本地副本；导入 Sketch 后会发生语义转换，原文件后续修改不会自动回写。（参见第 11 节官方参考资料）

### 3.2 Pixso

Pixso 官方产品页强调：精细化 UI/UX 设计、钢笔和矢量编辑、自动布局、组件变体、变量/设计令牌、团队资源库、高保真原型、评论和多人实时协作；同时支持 Figma、Axure、Sketch、XD、SVG 等文件导入，并提供 PNG、JPG、SVG、PDF 等导出路径。（参见第 11 节官方参考资料）

Pixso 帮助中心明确说明其是实时保存、实时协同的在线设计工具，无法离线运行。因此，Pixso 的桌面客户端不能被理解为“完全本地版”；其核心协作和数据保存仍依赖在线服务。（参见第 11 节官方参考资料）

Pixso 还具备插件、资源库、版本历史、标注和代码检查等能力。与 Codeless 的差距主要不在“是否有画布”，而在成熟的设计对象模型、组件/变量复用、文件兼容和协作交付链路。（参见第 11 节官方参考资料）

### 3.3 不应混淆的比较维度

| 维度 | Figma/Pixso | Codeless |
|---|---|---|
| 首要对象 | 设计文件、图层、矢量节点、组件实例 | 应用、页面、业务组件、数据模型、运行流程 |
| 数据保存 | 云端为主，带有限离线缓存/本地副本 | 本地 SQLite/文件，目标是离线完整可用 |
| 协作 | 远程多人实时协作、链接分享、评论 | 同机多窗口、离线审阅包、可选局域网会话 |
| 交付物 | 设计链接、标注、切图、代码检查 | 可运行原型、项目包、HTML/CSS/JSON/SQLite 数据 |
| 生态 | 社区插件、模板、资源库、第三方 API | 本地插件、导入导出适配器、开源组件模板 |
| 商业模式 | 免费层 + 付费计划/席位/附加能力 | 永久免费，不设置付费开关 |

---

## 4. 综合比较矩阵

评分含义：`强` = 已成熟或具备明显优势；`中` = 可用但范围有限；`弱` = 当前缺口；`可形成差异化` = 不必追求竞品完全等价，也能形成独特价值。

| 能力域 | Codeless 当前 | Figma | Pixso | 结论与机会 |
|---|---|---|---|---|
| 无限/自由画布 | 中；有固定尺寸页面画布 | 强；无限画布与完整图层体系 | 强；无限画布、矢量与原型 | P1 加入画布缩放、平移、标尺、网格、辅助线；不必第一时间支持全部矢量 |
| UI 设计 | 中；业务组件和布局属性较强 | 强；像素级 UI/UX 与矢量 | 强；像素级 UI/UX、矢量与高保真原型 | Codeless 应专注“可运行业务界面”，用组件变体和自动布局补齐设计效率 |
| 组件/实例/变体 | 中；已有组件注册和 WidgetConfig | 强；组件、变体、库 | 强；组件、变体、团队库 | P0/P1 设计本地组件库、实例、变体属性、断开实例和升级提示 |
| 自动布局/约束 | 弱到中；已有容器方向等基础字段 | 强；自动布局、约束、响应式设计 | 强；自动布局、网格布局、自适应 | P0 先实现 row/column、gap、padding、min/max、grow/shrink；随后做约束引擎 |
| 设计令牌/变量 | 弱；style 字段分散在组件配置 | 强；颜色、数字、模式和库 | 强；变量、样式、设计系统 | P1 建立本地 token 表和主题模式，映射到现有 `style` 与运行时主题 |
| 原型交互 | 中；事件、路由、弹窗、运行时基础 | 强；交互、动画、覆盖层、条件逻辑 | 强；连线、动画、真机演示 | P0/P1 做可视化事件图、页面状态、过渡和可复现运行记录 |
| 数据绑定 | **强/差异化**；SQLite 查询、表单、CRUD | 弱；主要是设计与原型数据 | 中；代码/交付能力，但非本地 SQLite 平台 | 继续投入：查询变量、空态、错误态、分页、聚合和模拟数据快照 |
| 检查/开发交付 | 弱；当前未形成统一 inspect/codegen | 强；Dev Mode、标注、代码属性 | 强；代码检查、标注、设计到代码 | P1 增加本地 Inspect：尺寸、颜色、token、组件来源、数据绑定、HTML/CSS |
| 评审与评论 | 弱；活动日志不能替代评论 | 强；评论、实时观察、链接分享 | 强；评论、批注、团队协作 | P1 用本地评论锚点、快照、差异和审阅包替代云链接 |
| 多人协作 | 弱；暂无实时协同 | 强；多人实时编辑 | 强；多人实时编辑 | 不做云协作；P2 可做同机多窗口，P3 试验局域网临时会话 |
| 文件兼容 | 弱；内部 JSON/SQLite | 中；`.fig`、`.sketch` 导入，静态导出 | 强；Figma/Sketch/XD/Axure/SVG 导入及静态导出 | 先稳定开放格式；用本地插件桥接 Figma，不逆向私有文件 |
| 插件 | 弱；无宿主 | 强；社区插件、Plugin API、权限与网络声明 | 中到强；插件与资源生态 | P2 实现本地 manifest + 沙箱 + `network: none`，不做在线市场 |
| 离线能力 | **强/核心优势** | 中；有限离线缓存，恢复后同步 | 弱；官方帮助中心说明无法离线运行 | 把离线能力产品化：无网启动、自动恢复、离线字体/资源、离线导出 |
| 数据主权 | **强**；数据库在本机 | 弱到中；云端存储，企业可选数据驻留 | 弱到中；云端实时保存/协同 | 将“数据只在本机”做成可验证的设置、审计和文档 |
| 资源占用 | 中；Electron 基线，当前单渲染器 | 官方产品优化成熟，但依然是浏览器/桌面运行时 | 官方宣称持续优化文件打开和内存 | 采用视口裁剪、增量文档、Worker/UtilityProcess；以实测而不是宣传数值做决策 |
| 商业约束 | **强**；可永久免费 | 免费层有数量/历史/协作边界，存在付费计划 | 个人免费，但核心是在线产品并有团队/企业能力 | Codeless 的免费承诺应覆盖所有本地核心能力和插件 API |

---

## 5. 按用户请求的专题分析与建议

### 5.1 UI/UX 设计能力

### 当前差距

Codeless 的设计器更像“低代码页面编排器”：组件有明确的业务语义、数据绑定和运行时行为，但设计师常用的以下能力仍不足：

- 无限画布、平移、缩放、标尺、网格和辅助线；
- 帧/容器/页面/分组的清晰层级；
- 自动布局、约束、最小/最大尺寸、填充/包裹内容；
- 组件主实例、实例覆盖、变体属性和本地资源库；
- 颜色、文字、间距、圆角、阴影等设计令牌；
- 复杂文本、字体回退、图片裁剪、SVG 图标和导出切片；
- 原型连线、覆盖层、状态、过渡、条件和设备预览；
- 开发检查：尺寸、间距、颜色、token、资源、数据绑定和可复制代码。

### 推荐的产品分层

| 优先级 | 能力 | 技术实现 | 验收标准 |
|---|---|---|---|
| P0 | 画布导航 | viewport store；滚轮缩放、空格拖拽、鼠标中键、`requestAnimationFrame` 合并指针事件 | 1000 个节点时平移和缩放不触发全树重渲染 |
| P0 | 对齐与吸附 | 几何索引；左/中/右、上/中/下、等间距、网格和智能参考线 | 多选拖动可预览对齐线，松开后记录一条命令 |
| P0 | 可访问快捷键 | 命令注册表；`Ctrl/Cmd+S/Z/Shift+Z/D/G`、方向键、复制粘贴、分组/解组 | 所有命令可在命令面板搜索，并可自定义冲突提示 |
| P1 | 自动布局 | `LayoutEngine` 独立模块；row/column、gap、padding、align、justify、grow/shrink、min/max | 文本变化、数据变化和窗口变化能稳定重排 |
| P1 | 本地组件库 | `ComponentDefinition`、`ComponentInstance`、variant props、override map | 修改主组件后实例可升级；实例覆盖有可见标记 |
| P1 | 变量/主题 | `design_tokens` 表 + token 引用；light/dark/custom mode | 切换主题只改变量环境，不直接改写所有节点 |
| P1 | 原型播放器 | 页面状态机 + transition；与现有 `interaction.events` 兼容 | 设计器和运行时使用同一事件定义，不维护两份逻辑 |
| P2 | SVG/矢量 | 使用 SVG 节点模型和本地解析器；优先支持导入、填充、描边、路径和组合 | 常见图标导入后可编辑并可导出，不要求完整 Illustrator 兼容 |
| P2 | 本地 inspect/codegen | 模板化生成 HTML/CSS/Vue/React/JSON，全部在本机执行 | 无网络仍能复制可运行的代码片段和 token |

### 关键设计决策

- 不要把每一个像素对象都强行建模成业务 Widget。建议分成 `DesignNode` 和 `RuntimeWidget` 两层：设计节点负责布局、样式和交互，运行时节点负责数据绑定和业务行为。
- 保留现有 `WidgetConfig v1` 兼容层，但新增 `documentVersion`、`nodeKind`、`componentRef`、`variantProps`、`tokenRefs` 和 `assetRefs`。
- 设计器和运行时必须共享同一套组件定义与事件协议；否则预览会越来越像“另一个产品”。

---

### 5.2 面向本地场景的协作能力

### 不复制云协作的错误方式

Figma/Pixso 的多人协作依赖在线服务、身份、权限、远端版本和实时同步。Codeless 不应为了“看起来像协作软件”而加入账号、云端文件或默认 WebSocket 服务，这会直接破坏本地和免费承诺。

### 建议的本地协作层级

| 层级 | 默认状态 | 能力 | 是否违反本地约束 |
|---|---|---|---|
| 同一窗口 | 必须 | 操作历史、评论、审阅、快照、差异 | 否 |
| 同一设备多窗口 | P1 | 设计器窗口、运行时预览窗口、数据模型窗口共享本地命令总线 | 否 |
| 文件级评审包 | P1 | 导出只读 HTML/PDF/PNG/JSON 包，评论与节点锚点一并保存 | 否 |
| 局域网临时会话 | P2/P3，可关闭 | 用户主动开启；点对点或本地会话主机；不访问互联网、不持久化到远端 | 不属于云同步，但需在隐私设置中显式说明 |
| 云端链接协作 | 永不做 | 需要服务器和远程存储 | 是，明确排除 |

### 本地评论和差异模型

建议新增：

```ts
interface LocalComment {
  id: string
  documentId: string
  revisionId: string
  nodeId?: string
  anchor: { x: number; y: number; width?: number; height?: number }
  body: string
  author: { id: string; label: string }
  status: 'open' | 'resolved'
  createdAt: string
  resolvedAt?: string
}

interface LocalRevision {
  id: string
  documentId: string
  parentId?: string
  label?: string
  createdAt: string
  commandCount: number
  checksum: string
}
```

实现要点：

1. 评论锚定 `nodeId + 相对坐标`，节点删除后显示“目标已删除”，不要静默丢失。
2. 每个审阅包包含项目快照、评论、资源和渲染缩略图；导入后视为新分支。
3. 差异视图至少支持节点新增、删除、移动、尺寸、文本、颜色、数据绑定和事件变化。
4. 同机多窗口通过 `MessageChannelMain` 或明确的 IPC 事件总线广播操作，不要让窗口之间直接互相调用 Vue 状态。
5. 局域网会话应采用临时会话密钥和明确的本地 IP 显示；默认只监听回环地址，用户手动选择局域网接口后才开放。
6. 局域网会话不得提供“自动云备份”“匿名遥测”或第三方登录；会话结束后远端只保留内存中的副本。

### 是否需要 CRDT

短期不需要。Codeless 的实际场景更接近“一个设计者 + 多个审阅者”或“同机多窗口”，优先采用**命令日志 + 基于 revision 的乐观并发检查**：

- 客户端提交 `{ baseRevision, commands[] }`；
- baseRevision 不匹配时返回冲突；
- 用户可以逐命令查看并选择保留；
- 只有在确认确实需要多人同时编辑后，才引入 Yjs/Automerge 等本地 CRDT 库。

这样能避免为尚未验证的协作场景承担 CRDT 的内存、调试和序列化成本。

---

### 5.3 性能优化

### 主要风险

Electron 官方建议避免阻塞主进程和渲染进程，并强调应通过 profiling、Chrome Tracing 和多进程指标找到真实瓶颈。Electron 的 Utility Process 可承载 CPU 密集、易崩溃或不适合主进程的任务。（参见第 11 节官方参考资料）

当前最值得优先处理的风险是：

- `DatabaseSync` 同步 API 在主进程内执行；
- `layout_json` 整体读写；
- 设计器历史通过深克隆布局；
- Vue 深层响应式可能让一次属性修改触发大量组件计算；
- 图层树、画布和运行时可能同时渲染全部节点；
- 图片、SVG、字体和导出在渲染进程执行时会产生长任务；
- 频繁拖动时每个 pointermove 都可能触发状态、DOM 和持久化链路。

### 推荐的性能架构

```text
Renderer 主 UI
  ├─ CanvasViewport：只维护视口、选择和输入事件
  ├─ DocumentStore：规范化节点、浅响应式引用
  ├─ LayoutWorker：自动布局、吸附、几何索引、diff
  ├─ ExportWorker：PNG/SVG/PDF/HTML/JSON 导出
  └─ Plugin iframe：受限插件 UI

Preload
  └─ Typed API：文件、数据库、窗口、导出、插件的最小接口

Electron Main
  ├─ BrowserWindow / 菜单 / 文件对话框 / 生命周期
  ├─ IPC sender 校验和权限编排
  └─ UtilityProcess 管理

UtilityProcess
  ├─ SQLite repository（所有同步 DatabaseSync 调用在此）
  ├─ 文档打包/解包
  ├─ 图片与字体元数据扫描
  └─ 可选局域网会话服务（默认不启动）
```

### 具体优化项

| 优先级 | 优化 | 方案 | 预期收益 |
|---|---|---|---|
| P0 | 输入事件合帧 | pointermove 只更新临时 viewport state；`requestAnimationFrame` 提交一帧一次 | 拖拽更稳定，减少 Vue 更新 |
| P0 | 禁止拖动时持久化 | 拖动开始记录命令，拖动结束一次提交；崩溃保护使用节流 autosave | 避免每像素写 SQLite |
| P0 | 选择状态与文档状态分离 | `selectedIds`、hover、guides、viewport 使用独立 store | 减少画布全量重渲染 |
| P1 | 规范化节点 | `nodesById` + `rootIds` + `childrenByParent`；渲染时按视口读取 | 复制、移动、查找、diff 为 O(1)/O(log n) 级别 |
| P1 | 视口裁剪 | 计算节点 bounds，仅挂载可视区域和少量 overscan 节点 | 大页面 DOM 和内存显著下降 |
| P1 | 图层树虚拟滚动 | 只渲染可见行；展开状态独立于节点对象 | 处理数千层级仍可滚动 |
| P1 | 数据查询缓存 | 以 `{table, queryHash}` 缓存结果；组件销毁时取消请求 | 减少重复 IPC/SQLite 查询 |
| P1 | 数据库 UtilityProcess | 通过 MessagePort 批量传输命令和结果；禁止主进程同步查询 | 避免窗口冻结 |
| P2 | 文档分片加载 | 页面、资源、历史按需加载；首页先加载 metadata 和当前 page | 大项目启动更快 |
| P2 | 导出后台化 | PNG/SVG/PDF/HTML 在 worker/utility 中执行；前端显示进度 | 导出不阻塞交互 |
| P2 | 图片缩略图缓存 | 本地 hash 内容寻址，原图/缩略图分层，按需解码 | 降低内存和启动时间 |
| P3 | 大画布渲染后端 | 仍优先 DOM/SVG；只有大量矢量节点时评估 Canvas/WebGL | 避免过早引入复杂渲染器 |

### 性能预算建议

这些是产品验收目标，不是当前测量结果：

| 场景 | 目标 |
|---|---|
| 空项目冷启动 | 中档设备上从进程启动到可编辑尽量控制在 2 秒级 |
| 1000 个业务节点 | 拖动、缩放和选择保持可交互；不产生超过 100 ms 的连续长任务 |
| 5000 层图层树 | 展开、搜索和滚动使用虚拟列表，不一次性创建全部 DOM |
| 100 MB 资源项目 | 启动只加载缩略图和当前页；原图按需读取 |
| 保存 | 普通改动不阻塞 UI；异常退出后可恢复最近一次 autosave |
| 内存 | 记录空闲、1000 节点、5000 节点、10 分钟操作后的 renderer/main/utility 峰值，禁止只看总进程数 |

### 测量方法

- 使用 `app.getAppMetrics()`、`process.getProcessMemoryInfo()`、Chrome DevTools Performance 和 tracing；
- 在 command dispatch、layout、render、IPC、SQLite、导出开始/结束处插入 `performance.mark`；
- 将 100/1000/5000 节点、100 KB/10 MB/100 MB 资源和 1/10/50 页作为固定基准数据集；
- CI 中执行冷启动、打开、拖动、保存、关闭恢复和批量导出烟测；
- 性能回归必须关联到具体 commit，不能以“感觉更快”作为结论。

---

### 5.4 文件格式与兼容性

### 对竞品格式的事实判断

Figma 官方将 `.fig` 等格式定义为专有格式，并提示格式未来可能变化；Figma 同时支持导入 `.fig`/`.sketch` 和静态资源导出。Pixso 官方则宣传 Figma、Axure、Sketch、XD、SVG 导入以及 PNG/JPG/SVG/PDF 等导出。对 Codeless 而言，直接逆向这些私有格式会带来兼容性、许可证、字体、组件语义和维护成本风险。（参见第 11 节官方参考资料）

### 建议的格式策略

| 层级 | 格式 | 用途 | 计划 |
|---|---|---|---|
| 原生项目 | `.codeless` | ZIP 容器，包含 manifest、文档、资源、缩略图、迁移信息 | P0/P1 |
| 可读交换 | `.codeless.json` | 不含大资源的规范化 JSON，适合 Git、审阅和脚本处理 | P0 |
| 数据交换 | CSV/JSON/SQLite backup | 业务表、模拟数据和本地数据迁移 | P0 |
| 设计交换 | SVG/PNG/JPG/PDF | 视觉资产和评审交付 | P0/P1 |
| 运行时交付 | HTML/CSS/JS 或静态 HTML | 离线演示和审阅包 | P1 |
| 结构交换 | JSON Schema + TypeScript types | 插件、代码生成和跨版本迁移 | P0 |
| Figma 桥接 | 本地 Figma Plugin 导出 Codeless JSON | 将当前选区/页面转换为 Codeless 子集 | P2 |
| Sketch/XD/Axure | 通过 SVG/JSON/官方导出或人工中间格式 | 只承诺可解释的子集导入 | P2 |
| 私有格式逆向 | `.fig`、`.sketch`、`.xd` 全量解析 | 不建议 | 永不作为核心承诺 |

### `.codeless` 容器建议

```text
project.codeless/
├─ manifest.json          # appId、schemaVersion、createdAt、updatedAt、checksum
├─ document.json          # 项目元数据、页面、节点、组件引用、路由
├─ pages/
│  ├─ page_<id>.json      # 页面级节点和布局
│  └─ page_<id>.thumb.webp
├─ assets/
│  ├─ sha256/<hash>       # 图片、SVG、字体、视频等本地资源
│  └─ index.json           # 原始文件名、mime、尺寸、引用计数
├─ tokens.json            # 颜色、字体、间距、主题模式
├─ data/
│  └─ seed.sqlite         # 可选的演示数据，不包含应用全局数据库
├─ history/
│  └─ revisions.jsonl     # 可选的本地操作/快照索引
└─ migrations.json
```

实际发布时可把该目录 ZIP 为单文件 `.codeless`；读写采用临时目录 + fsync + 原子 rename，避免覆盖损坏。SQLite 继续作为应用索引、活动日志和运行数据存储，但项目文件必须可独立搬迁。

### 向后兼容

1. `schemaVersion` 与 `WidgetConfig.version` 分开：前者是项目文件版本，后者是组件协议版本。
2. 所有迁移必须是纯本地、可重复、可回滚或至少生成备份副本。
3. 旧项目读取路径：`layout_json -> normalizeProject -> document model`；保存时默认写新格式，不立即删除旧表字段。
4. 任何无法转换的字段写入 `migrationWarnings[]`，在 UI 中可查看，不静默丢失。
5. 导入导出需要 golden fixtures：文本、字体、图片、容器、组件实例、数据绑定、事件和异常字段至少各有一个样例。

---

### 5.5 插件与扩展生态

### 竞品启示

Figma Plugin API 以 JavaScript/HTML 为基础，通过 manifest 描述插件、编辑器类型、动态页面访问和网络域名；官方文档允许用 `allowedDomains: ["none"]` 完全禁止插件网络访问。插件可以读取、创建和修改文件中的节点，但仍受 API 和权限边界约束。（参见第 11 节官方参考资料）

Codeless 应借鉴“manifest + 明确权限 + 宿主 API”的设计，不应借鉴“下载远程代码后直接在 Electron 主进程执行”的做法。

### 本地插件目标

| 插件类型 | 例子 | 是否 P0 核心 |
|---|---|---|
| Command | 批量重命名、生成 CRUD 页面、格式化 token | 否，P2 |
| Widget | 自定义图表、业务卡片、图标库组件 | 否，P2 |
| Importer | SVG、JSON、CSV、Figma Plugin 导出包 | 部分，P1/P2 |
| Exporter | HTML、Vue、React、JSON、文档报告 | P1 |
| Inspector | 设计规范检查、无障碍检查、字段绑定检查 | P1/P2 |
| Data adapter | 本地 SQLite、CSV、JSON、Mock 数据 | P1；只允许本地文件和本地 DB |
| Theme | 本地主题、字体、色板 | P1 |

### 推荐 manifest

```json
{
  "manifestVersion": 1,
  "id": "com.example.table-widget",
  "name": "Table Widget",
  "version": "0.1.0",
  "main": "dist/index.js",
  "ui": "dist/ui.html",
  "engines": { "codeless": ">=0.2.0" },
  "permissions": [
    "document.read",
    "document.write",
    "selection.read",
    "storage.plugin"
  ],
  "network": "none"
}
```

### 沙箱和执行边界

- 插件 UI 放入 `iframe` 或独立、沙箱化的 `WebContentsView`；
- 插件逻辑只通过 `PluginHost` 获得受限对象，不能获得 `ipcRenderer`、`process`、`fs`、`shell` 或 `BrowserWindow`；
- 主进程只提供 schema 校验后的命令，不接受插件传入任意 SQL、任意路径或任意 IPC channel；
- `network: none` 为默认且推荐值；若未来支持局域网数据源，必须增加单独权限并限制 CIDR/端口；
- 只允许从本地目录、用户选择的压缩包或源码工程安装插件；不做在线市场，不做后台自动下载；
- 插件存储位于项目或用户数据目录的隔离命名空间；卸载插件不能删除项目文件；
- 插件 API 采用版本化接口，并提供能力探测，避免插件依赖内部 Vue 组件或私有类型。

### 免费原则

- 插件宿主和核心 API 对所有用户开放；
- 官方插件以 MIT/Apache-2.0 或兼容许可证发布，第三方插件许可证由用户自行确认；
- 不设置插件数量、调用次数、导出次数或本地存储空间的付费墙；
- 不提供“免费核心 + 付费云市场”作为隐含商业模式。

---

### 5.6 离线功能

离线不是一个“没有网络时仍能打开窗口”的开关，而是完整的数据生命周期：创建、编辑、保存、恢复、预览、导出、迁移、插件运行和错误诊断都要在没有网络时成立。

### 离线验收清单

| 场景 | 必须行为 |
|---|---|
| 首次启动无网络 | 可创建项目并打开空白模板，不等待远程资源 |
| 打开已有项目 | 仅依赖本地 `.codeless`/SQLite/字体/资源 |
| 编辑与保存 | 不发出 HTTP、HTTPS、WebSocket 或第三方 DNS 请求 |
| 图片/字体 | 从项目 assets 或系统字体读取；缺失时显示可解释替代提示 |
| 运行预览 | 数据、流程和路由全部在本地运行 |
| 导出 | PNG/SVG/PDF/HTML/JSON 全部本地完成 |
| 崩溃恢复 | 重启后提示恢复 autosave，而不是丢失最近修改 |
| 插件 | 默认只运行已安装的本地、无网络插件 |
| 升级 | 迁移在本地完成；失败时保留原文件和备份 |
| 诊断 | 日志只写本机；用户主动导出后才离开设备 |

### 强化方案

- 生产模式使用本地自定义协议（如 `codeless://app/...`）或严格限制的 `file` 加载，避免把渲染器指向远程页面；
- `session.webRequest` 默认阻断外部网络请求，局域网协作使用独立开关和独立 session；
- 禁止启动时请求在线字体、图标、遥测、更新检查或远程模板；更新包采用用户手动下载并校验签名的离线安装；
- 所有模板、图标、示例数据和组件资源随安装包或本地资源包提供；
- 在设置页提供“本地数据审计”：数据库路径、项目路径、资产目录、最近文件、网络策略和日志路径。

---

### 5.7 系统资源利用

### 相对比较

Figma 采用浏览器/桌面运行模式并动态加载页面，官方文档说明大文件通常只先加载当前页面，某些搜索、组件检查和插件会触发更多页面加载。Pixso 官方也公开强调文件打开和内存优化。它们的成熟性能来自长期的增量文档、渲染和缓存工程，而不是单纯因为是 Web 或桌面应用。（参见第 11 节官方参考资料）

Codeless 的优势是数据域更窄、组件类型可控、默认项目较小；风险是 Vue 响应式、JSON 深克隆、同步 SQLite 和全部节点渲染会在项目增长后迅速放大。

### 资源使用原则

1. **CPU**：拖拽、布局和导出采用合帧、worker/utility 和增量计算；空闲时不轮询。
2. **内存**：原图、缩略图、页面节点、历史快照和运行时数据分层缓存；关闭页面时释放引用。
3. **磁盘**：项目包使用内容寻址资源和增量快照；SQLite WAL 定期 checkpoint，但不要在每次输入时强制 checkpoint。
4. **GPU**：优先使用 CSS/SVG 和 Chromium 合成；只有 profile 证明 DOM/SVG 不足时再引入 Canvas/WebGL。
5. **IPC**：批量传输 patch 和结果，不为每个字段更新发一个 IPC；避免把大型响应式对象在 bridge 两侧反复复制。
6. **电池**：窗口隐藏、最小化或应用无焦点时降低预览刷新和动画；本地协作会话无参与者时停止广播。
7. **安装体积**：插件、额外模板和大字体作为可选本地资源包，不全部塞进主安装包；但核心功能不能依赖在线下载。

---

## 6. 推荐目标架构

### 6.1 逻辑分层

```text
┌──────────────────────────────────────────────┐
│ Vue Renderer                                 │
│  Workspace / Builder / Data / Flows / Review │
│  DocumentStore + ViewportStore + CommandBus  │
└───────────────┬──────────────────────────────┘
                │ typed contextBridge / MessagePort
┌───────────────▼──────────────────────────────┐
│ Preload API                                  │
│  project, database, file, export, plugin,    │
│  window, diagnostics                         │
└───────────────┬──────────────────────────────┘
                │ validated IPC
┌───────────────▼──────────────────────────────┐
│ Electron Main                                │
│  lifecycle, BrowserWindow, menus, dialogs,  │
│  file permissions, utility process manager   │
└───────┬─────────────────┬────────────────────┘
        │                 │
┌───────▼────────┐ ┌──────▼─────────────────────┐
│ UtilityProcess │ │ Local File / Project Store │
│ SQLite repo    │ │ .codeless + assets         │
│ import/export  │ │ atomic save + recovery     │
└────────────────┘ └────────────────────────────┘
```

### 6.2 进程职责

| 进程 | 允许做什么 | 禁止做什么 |
|---|---|---|
| Renderer | UI、选择、输入、轻量展示计算、插件 iframe | 直接访问文件系统、SQLite、shell、任意网络 |
| Preload | 暴露少量 typed API，做参数初步校验 | 暴露整个 `ipcRenderer` 或 Node 原始对象 |
| Main | 生命周期、窗口、菜单、文件对话框、权限、进程编排 | 长时间同步 SQL、全量 JSON 变换、重型导出 |
| UtilityProcess | SQLite、文件打包、导出、导入、扫描、可选局域网会话 | 直接操纵主窗口 DOM、绕过权限执行插件 |
| Plugin iframe | 受限插件 UI 和声明能力 | 访问 Electron/Node、加载远程代码、执行任意 SQL |

Electron 官方安全指南建议启用 context isolation、进程 sandbox、CSP，限制导航/新窗口，验证 IPC sender，并避免把不可信内容与 Node 权限混合。当前 `BrowserWindow` 应将这些配置显式写出，而不是依赖默认值。（参见第 11 节官方参考资料）

建议的窗口配置方向：

```ts
webPreferences: {
  preload,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
}
```

并配套：

- 主窗口只加载本地打包资源或受控自定义协议；
- `setWindowOpenHandler` 默认拒绝，外部链接必须是用户主动触发且经过白名单；
- 所有 IPC handler 校验 `event.senderFrame`/窗口来源和 payload schema；
- renderer 不接受任意路径写入，文件保存必须先由用户选择或使用已授权项目目录；
- 设置严格 CSP，至少限制 `script-src 'self'`，插件 session 单独配置 CSP；
- 生产包启用 Electron fuses 中可用的安全开关，并建立 Electron/Chromium/Node 升级策略。

### 6.3 SQLite 的演进

Node 的 `node:sqlite` `DatabaseSync` 连接是同步 API；当前方案可以继续使用它，但应放到 UtilityProcess 或专用 Worker，而不是 Electron 主进程。Node 官方文档还提供 prepared statements、备份和 changeset/session 相关能力，但由于 Electron 自带 Node 版本与运行时能力可能不同，使用前必须做 feature detection 和版本矩阵验证。（参见第 11 节官方参考资料）

建议的 repository API：

```ts
interface ProjectRepository {
  open(projectPath: string): Promise<ProjectMetadata>
  savePatch(projectId: string, patch: DocumentPatch[]): Promise<SaveResult>
  loadPage(projectId: string, pageId: string): Promise<PageDocument>
  createSnapshot(projectId: string, label?: string): Promise<Revision>
  restoreSnapshot(projectId: string, revisionId: string): Promise<void>
  exportProject(projectId: string, destination: string): Promise<ExportResult>
  recover(projectId: string): Promise<RecoveryCandidate[]>
}
```

所有 SQL 只存在于 repository 内部；renderer 只能调用领域方法，不传任意 SQL。表结构可以从当前：

```text
projects / activities / customers / orders / tickets
```

逐步迁移为：

```text
projects
pages
nodes
assets
components
component_instances
design_tokens
revisions
commands
comments
plugin_records
activity_log
```

不建议一开始把每个 CSS 属性拆成一列。节点内容仍可用 JSON，但要按页面/节点分片、有 schema version，并通过索引表提供查询和列表性能。

---

## 7. 优先级路线图

### P0：守住核心属性并消除高风险（0–4 周）

| 项目 | 具体任务 | 产出 |
|---|---|---|
| 本地边界 | 加入网络访问审计和无网启动测试；停止启动时的远程依赖 | `offline-smoke`、网络策略文档 |
| Electron 安全 | 显式设置 context isolation、sandbox、nodeIntegration、CSP；校验 IPC sender | 安全基线代码和测试 |
| 数据可靠性 | autosave、临时文件、原子保存、启动恢复提示、手动备份 | 不丢最近编辑的恢复流程 |
| 文档协议 | 定义 `DocumentSchema v2`、JSON Schema、迁移接口 | 可版本化的文档模型 |
| 原生格式 | 实现 `.codeless.json` 和 `.codeless` 基础包 | 可复制、备份、搬迁的项目文件 |
| 历史 | 用 command/patch 替换“无限深克隆”方向，至少先封装 CommandBus | 可解释 undo/redo 和 revision |
| 设计效率 | 画布缩放、平移、吸附、对齐、命令面板和快捷键 | 基础设计器体验接近成熟工具 |
| 编码治理 | 统一源码、文档、构建产物为 UTF-8；检查中文错误信息和 UI 文案 | 跨平台可读、可测试的文本资源 |
| 性能基准 | 加入节点、资源、启动、保存和导出基准数据集 | CI 性能回归报告 |

### P1：形成差异化的本地设计闭环（1–3 个月）

| 项目 | 具体任务 | 产出 |
|---|---|---|
| 自动布局 | row/column、padding、gap、align、justify、min/max、grow/shrink | 响应式页面布局 |
| 本地设计系统 | tokens、主题模式、组件主实例、变体和本地库 | 可复用设计系统 |
| 运行时原型 | 页面状态、覆盖层、过渡、条件、事件图和运行记录 | 高保真可运行原型 |
| 评审 | 评论锚点、resolve、快照、diff、只读 HTML/PDF 审阅包 | 无云评审流程 |
| Inspect | 节点属性、token、组件来源、数据绑定、资源和本地代码生成 | 设计到开发交付 |
| 数据体验 | 查询变量、过滤、排序、分页、加载/空态/错误态、数据快照 | 设计与真实本地数据闭环 |
| 大文档性能 | normalized store、视口裁剪、图层树虚拟列表、缓存 | 大项目可用 |
| 数据库隔离 | SQLite repository 移入 UtilityProcess；批量 IPC 和取消请求 | 主窗口不被数据库阻塞 |
| 导出 | SVG/PNG/JPG/PDF/HTML/JSON/CSV，全部本地 | 可交付的开放文件链路 |

### P2：建立本地生态和受控协作（3–6 个月）

| 项目 | 具体任务 | 产出 |
|---|---|---|
| 插件宿主 | manifest、权限、插件 iframe、版本化 API、本地安装 | 无云插件生态 |
| Figma 桥接 | 编写本地 Figma Plugin，将选区/页面导出为 Codeless JSON/SVG | 合规的迁移入口 |
| SVG/矢量 | 路径、填充、描边、组合、mask、图标资源 | 设计表达能力提升 |
| 同机协作 | 多窗口命令总线、跨窗口 selection/revision 状态 | 同设备协作 |
| 本地网络会话 | 可选、默认关闭、无互联网、临时会话、加密和审计 | 小团队内网评审/共同编辑 |
| 可访问性 | 键盘导航、焦点、对比度、ARIA、导出检查 | 质量和可用性提升 |

### P3：谨慎探索（6 个月以后）

- 大规模矢量/WebGL 渲染后端；
- 基于本地命令日志的 CRDT；
- 更完整的 Sketch/XD/Axure 中间格式转换；
- 用户自带本地模型的设计辅助（必须默认关闭、模型文件本地、无外部 API、许可证清晰）；
- 多平台原生文件关联、系统级拖放、打印和批量资源管理。

P3 之前不建议投入云端账户、在线分享、远程模板、云端 AI 或收费市场，这些方向不仅偏离产品约束，也会增加隐私、安全、运维和成本负担。

---

## 8. 推荐排序模型

使用以下简单公式排优先级：

```text
Priority = (UserValue × LocalDifferentiation × ReuseAcrossFeatures × Confidence)
           ÷ (EngineeringCost × ElectronRisk)
```

| 推荐 | 用户价值 | 本地差异化 | 复用范围 | Electron 风险 | 综合优先级 |
|---|---:|---:|---:|---:|---:|
| `.codeless` 文件包 + 迁移 | 5 | 5 | 5 | 2 | 最高 |
| autosave/恢复/本地审阅 | 5 | 5 | 5 | 2 | 最高 |
| 自动布局 + 组件变体 + token | 5 | 4 | 5 | 3 | 最高 |
| UtilityProcess 数据层 | 4 | 4 | 5 | 3 | 最高 |
| 视口裁剪/虚拟列表 | 4 | 4 | 5 | 3 | 最高 |
| 本地 inspect/codegen | 4 | 5 | 4 | 2 | 高 |
| 本地插件宿主 | 4 | 5 | 4 | 4 | 高 |
| Figma 本地插件桥接 | 4 | 4 | 3 | 3 | 中高 |
| 同机多窗口协作 | 3 | 5 | 3 | 3 | 中高 |
| 局域网实时 CRDT | 3 | 4 | 2 | 5 | 中 |
| 完整矢量/WebGL | 3 | 2 | 2 | 5 | 中低 |
| 直接逆向 `.fig/.sketch/.xd` | 2 | 1 | 1 | 5 | 不建议 |
| 云端账户/链接分享 | 2 | 0 | 1 | 5 | 排除 |

---

## 9. 需要明确排除的方案

| 方案 | 排除理由 |
|---|---|
| 把云端 Figma/Pixso 页面嵌入 Electron | 不是完全本地；网络、登录、远程代码和数据治理都不可控 |
| 通过 `nodeIntegration: true` 执行插件 | XSS/插件供应链风险直接升级为本机代码执行 |
| renderer 直接传 SQL 给主进程 | 破坏领域边界，增加注入、越权和插件滥用风险 |
| 每次 pointermove 都保存 SQLite | 产生 UI 卡顿、WAL 膨胀和设备写放大 |
| 用深克隆整个项目实现所有历史 | 大项目内存和 CPU 线性恶化，无法做可解释 diff |
| 逆向 `.fig/.sketch/.xd` 并承诺全量兼容 | 私有格式不稳定，语义、字体、资源、许可证和维护成本不可控 |
| 为保持“免费”而引入隐藏遥测/广告 | 违反隐私信任和完全本地承诺 |
| 依赖在线字体、图标、模板、AI API | 无网时功能不完整，并造成远程数据流出风险 |
| 过早采用 WebGL 重写整个画布 | 会同时引入文本、可访问性、输入法、插件和导出复杂度 |

---

## 10. 最终建议

### 必做

1. 将本地文件格式和迁移体系列为最高优先级；
2. 将 SQLite 从 Electron 主进程迁移到 UtilityProcess；
3. 明确 Electron 安全配置并建立离线/网络访问测试；
4. 以自动布局、组件变体、变量/主题、快照/评论/diff 补齐设计工作流；
5. 用开放格式和本地插件桥接解决兼容问题，不逆向竞品私有格式；
6. 用视口裁剪、规范化节点、patch history 和批量 IPC 保证大项目可用；
7. 保证所有核心功能、插件 API 和本地导出永久免费。

### 建议做

1. 同机多窗口协作和离线审阅包；
2. 本地 Inspect/codegen；
3. SVG/图标/字体/图片资产管理；
4. 可选的局域网临时会话，但默认关闭、无互联网、无远端持久化；
5. 本地 Figma Plugin 导出桥接。

### 不建议做

- 云端文件系统、账号依赖、公共链接协作；
- 订阅、席位、付费插件或导出次数限制；
- 完整复制 Figma/Pixso 的无限矢量编辑器；
- 直接解析并承诺兼容所有 `.fig/.sketch/.xd` 私有语义；
- 任何默认向远程服务器上传项目、日志、字体或 AI 输入的功能。

**战略定位建议**：把 Codeless 做成“**完全本地、完全免费、可运行的设计与业务原型工作台**”，而不是廉价版 Figma。只要本地数据主权、离线可靠性、SQLite 数据绑定和可执行原型形成稳定闭环，Codeless 就能在隐私敏感、内网、教育、个人开发和快速业务验证场景中形成 Pixso/Figma 不容易替代的价值。

---

## 11. 参考资料（官方）

- Figma Plans and Features / Pricing / Design：Figma 官方产品与帮助中心
- Figma offline、local copy、import/export、file loading：Figma Learn 官方帮助中心
- Figma Plugin API、Manifest、networkAccess：Figma Developers 官方文档
- Pixso 产品能力、设计系统、文件兼容、插件、版本历史、离线说明：Pixso 官网与帮助中心
- Electron Process Model、Performance、Security、Context Isolation、Sandbox、Utility Process、IPC：Electron 官方文档
- Node.js `node:sqlite`、`DatabaseSync`、prepared statements 和 changeset：Node.js 官方文档

> 以上资料按 2026-08-22 可访问的官方页面整理。竞品功能和计划会变化；本文件中的竞品事实应在发布版本评审时重新核对，Codeless 自身的实现判断以工作区源码和构建结果为准。
