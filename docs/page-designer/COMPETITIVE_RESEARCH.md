# Pixso / Figma 页面设计器竞品研究

> **核验日期：** 2026-08-22  
> **研究边界：** Pixso 与 Figma 仅采用官方官网、官方帮助中心、官方发布页、官方博客或官方开发者文档；未用第三方评测推断性能或功能等价。  
> **结论性质：** “支持”表示官方资料可验证；“未确认”不等于“不支持”。

## 1. 执行摘要

Pixso 和 Figma 的共同核心不是单纯的绘图工具，而是以**结构化页面对象模型**为中心的设计生产线：画布/页面、容器和图层，组件与实例，样式/变量/库，响应式布局，原型与评审，版本和开发交付共同组成闭环。

Codeless 不应直接复制两个竞品的全量矢量编辑器，而应形成更明确的本地差异化：

> **本地页面设计 → SQLite 数据绑定 → 可运行原型 → 本地 Inspect/codegen → 快照/评论/Diff → 可移交 `.codeless` 文件**

| 结论 | 对 Codeless 的产品要求 |
|---|---|
| 画布效率决定编辑器上限 | 先补齐平移、缩放、适配画布、标尺、网格、参考线、吸附、对齐和快捷键。 |
| 组件库是治理系统而非素材栏 | 需要主组件、实例、覆盖、变体、搜索、收藏、发布、更新提示、替换和断开语义。 |
| 设计系统必须可追踪 | Token 要有语义名、主题模式、引用追踪、批量替换和交付映射。 |
| 响应式需要两类规则 | Auto Layout 处理内容流动；Constraints/断点/最小最大尺寸处理视口变化。 |
| 协作必须与本地约束兼容 | 采用快照、对象锚点评论、结构化 Diff、审阅包和同机/临时局域网会话，不引入云端项目存储。 |
| 工作流效率来自少切换上下文 | 命令面板、可搜索图层、批量 Inspector、画布内调整、自动保存和 Inspect/codegen 应内置。 |

## 2. 六大能力域对比

### 2.1 画布操作

| 维度 | Figma 官方资料可验证能力 | Pixso 官方资料可验证能力 | Codeless 启示 |
|---|---|---|---|
| 工作区模型 | 设计文件由页面、图层和对象组成，支持在画布中组织和编辑设计。 | 以页面/容器或画板/图层为核心，支持嵌套、平移、缩放、形状、钢笔、蒙版、布尔运算和图层操作。 | 从固定尺寸页面继续演进为页面—容器—节点—组件的结构化画布，而不是追求全量自由矢量能力。 |
| 导航 | 缩放、平移、页面/图层导航是基础编辑操作。 | 手形工具、空格临时平移、缩放、标尺、布局网格和画布测距均有官方说明。 | `PD-CAN-01/02` 先实现稳定 viewport、标尺、网格、参考线、吸附和适配画布。 |
| 对象操作 | 图层树、选择、对齐、分布、组件化和原型连接共同构成对象操作流。 | 支持组合、蒙版、布尔运算、路径拼合、层级调整和实例重置。 | 保持业务组件模型，补齐多选、层级、框选、对齐/分布以及明确的对象状态反馈。 |
| 工作流判断 | Figma 的强项是设计对象模型和围绕对象的命令密度。 | Pixso 强调中文环境、画布内调整和页面设计交付。 | 目标不是复制钢笔工具，而是让“页面结构 + 数据绑定”编辑效率接近专业设计器。 |

### 2.2 组件、实例与资源库

| 维度 | Figma | Pixso | Codeless 机会 |
|---|---|---|---|
| 主组件/实例 | 支持组件、实例、组件属性、变体和实例更新关系。 | 支持主组件、实例同步、分离、重置、替换和跨页面复用。 | 将现有 `variants` 升级为显式 `componentDefinition/componentInstance` 关系，保留数据绑定和运行时行为。 |
| 变体/属性 | 组件属性和 Variants 可表达状态、尺寸、布尔显隐、文本和实例交换等。 | 变体可按类型、尺寸、状态等建立属性和值。 | 设计器需要变体选择器、实例覆盖、覆盖重置、升级提示和覆盖冲突提示。 |
| 资源库 | Libraries 用于发布和消费团队组件、样式等资源。 | 团队资源库支持发布、搜索、缩略图预览、更新同步和组件库替换。 | 本地库应支持项目级/工作区级资源、分类、收藏、版本、缺失资源修复和批量替换。 |
| 插入体验 | 资源选择、实例插入、属性调整与画布编辑连续。 | 资源库支持列表/缩略图和关键词搜索。 | `PD-CMP-02` 将搜索、分类、预览、拖放插入和最近使用整合到左侧面板。 |

### 2.3 样式、变量与设计系统

| 维度 | Figma | Pixso | Codeless 机会 |
|---|---|---|---|
| 样式 | 官方能力覆盖颜色/文本/效果/布局类样式，并可在资源库共享。 | 官方资料明确颜色、文本、效果和布局网格样式。 | 将现有 `DesignSystem` 做成可管理面板，而非只在 Inspector 中编辑少量字段。 |
| 变量/Token | Variables 可用于颜色、数值、字符串/文本、布尔值，并支持模式等设计系统场景。 | 官方发布页列出颜色、数值、文本、布尔变量，可用于主题、布局、语言和组件间距等。 | 补齐语义别名、模式继承、引用追踪、未使用 Token、批量替换和导入导出。 |
| 治理/交付 | 变量、组件库、Dev Mode/Inspect 连接设计与开发。 | DSM、语义别名、资源发布和代码面板形成设计系统治理链路。 | 让 Token 名称、组件状态、CSS/JSON/codegen 和 SQLite schema 绑定互相可追踪。 |
| 风险边界 | 竞品的完整版本/权限能力随产品计划变化。 | Pixso DSM、离线和企业能力有版本差异；不能从营销页推断全部细节。 | 文档只记录官方已验证事实，未确认项进入验证 backlog。 |

### 2.4 协作、评论与版本

| 维度 | Figma | Pixso | Codeless 本地化策略 |
|---|---|---|---|
| 实时协作 | 多人同时编辑、分享权限、评论和版本历史组成在线协作流。 | 官方资料支持实时协作、分享权限、评论、@成员、图片评论和历史版本。 | 保留同机多窗口和可选临时局域网会话；核心默认是离线快照/评论/Diff/审阅包。 |
| 评论 | 评论可放置在设计内容上下文中，并支持提及和管理。 | 可关联图层/画布位置，支持文本、@成员和图片评论。 | 评论锚点必须持久化对象 ID、坐标、版本和状态，支持截图附件及离线导出。 |
| 版本 | 支持查看历史版本并恢复。 | 支持自动/手动版本、筛选、查看、还原、拷贝、分享和版本标注。 | 结构化 patch history + 本地 snapshot + human-readable Diff，避免只保存整份 JSON。 |
| 权限与冲突 | 远程权限、多人状态和服务端合并依赖在线基础设施。 | 分享/权限与在线协作绑定，离线口径存在官方资料差异。 | 冲突优先可解释：revision、只读审阅窗口、导入冲突保护、合并前 Diff。 |

### 2.5 响应式设计工具

| 维度 | Figma | Pixso | Codeless 机会 |
|---|---|---|---|
| Auto Layout | 官方文档将 Auto Layout 用于内容变化时的流式排列、尺寸和间距。 | 支持水平/垂直自动布局、间距、内边距、对齐、换行、绝对定位和负间距堆叠。 | 现有 Stack/Grid 需要增加 fill/hug/fixed、grow/shrink、min/max、gap/padding 可视化。 |
| Constraints | 支持对象相对父容器的水平/垂直约束和缩放规则。 | 官方帮助列出左/右/左右/居中/缩放，以及上/下/上下/居中/比例和滚动固定。 | 抽象约束模型，明确 Auto Layout 与绝对定位/约束的优先级和互斥规则。 |
| 多视口 | Figma 具备响应式设计工作流，但官方文档不等于完整运行时 CSS 断点实现。 | Pixso 官方能确认自动布局/约束/网格，但不能据此确认完整 Web 断点运行时。 | 提供设备预设、多视口预览、断点快照和布局回归；最终映射到运行时 layout。 |
| 可视化反馈 | 画布和属性面板共同修改布局。 | 自动布局 2.0 强调画布内调节间距/内边距。 | `PD-RES-01/02` 需要减少画布与 Inspector 间来回切换。 |

### 2.6 工作流效率与交付

| 维度 | Figma | Pixso | Codeless 机会 |
|---|---|---|---|
| 命令/快捷键 | 快捷键、图层/对象命令、原型和 Inspect 串联设计生产线。 | 官方资料明确快捷键、深度搜索、图层搜索、画布内测距和开发标注。 | `PD-WKF-01` 建立命令注册表、命令面板、快捷键帮助、上下文命令和可发现性。 |
| 搜索与定位 | 页面/图层/组件/资源需要可检索。 | 图层搜索支持关键词、页面范围、类型筛选和定位。 | 图层树、资源库、页面、Token 和命令统一搜索入口。 |
| 开发交付 | Inspect/Dev Mode 提供尺寸、样式、资源和交付信息。 | 开发标注/代码面板可查看属性和 CSS，并支持切图导出。 | 继续扩大本地 Inspect/codegen：CSS、Vue、JSON、数据绑定和资源依赖一次交付。 |
| 导入导出 | 支持本地副本、设计导入和静态导出，私有格式不应被第三方逆向依赖。 | 支持 Figma/Sketch/XD/Axure 等导入及 PNG/JPG/SVG/PDF 等导出。 | 继续使用开放 `codeless-design` 格式和 Figma Plugin bridge，而不是私有格式兼容承诺。 |

## 3. 工作流效率比较

### 3.1 从意图到结果的路径

| 用户任务 | Figma/Pixso 的成熟路径 | 当前 Codeless 路径 | 优化目标 |
|---|---|---|---|
| 创建页面结构 | 画板/容器 → 自动布局/约束 → 图层和组件 | 页面 → 业务组件 → 绝对/基础自动布局 | `PD-CAN-01` + `PD-RES-01`：结构、布局、视口连续可见。 |
| 重复使用设计 | 资源/组件库 → 实例 → 变体/覆盖 | 组件面板 → 拖放 → 现有配置复制 | `PD-CMP-01/02`：主件、实例、库、更新和替换可解释。 |
| 全局换肤 | 样式/变量模式 → 批量应用 | Token/主题已有基础，面板和追踪不足 | `PD-STY-01/02`：语义 Token、模式、引用和批量替换。 |
| 适配设备 | Auto Layout + Constraints + 多画板/预览 | 固定尺寸 + 基础 Stack/Grid | `PD-RES-01/02`：断点预览、回归快照和运行时映射。 |
| 评审与交付 | 评论/提及/版本/Inspect/分享 | 本地评论/快照/Diff/Inspect 已有，体验待收敛 | `PD-COL-01` + `PD-WKF-02`：离线审阅包和批量交付。 |

### 3.2 关键效率指标（建议作为验收 KPI）

| 指标 | 目标基线 | 测量方式 |
|---|---:|---|
| 新用户完成“添加组件并修改属性” | ≤ 60 秒 | E2E + 5 人可用性走查 |
| 画布适配选中对象/页面 | ≤ 2 次命令 | 快捷键/命令面板测试 |
| 将 10 个按钮改为新 Token | ≤ 30 秒 | 批量编辑操作录制与 E2E |
| 建立主组件并插入 5 个实例 | ≤ 90 秒 | 组件库任务脚本 |
| 设计变更生成审阅包 | ≤ 10 秒（中型页） | 性能计时与文件产物检查 |
| 切换 3 个设备视口 | ≤ 3 秒 | 多视口预览测试 |

## 4. 产品边界与未确认事项

| 事项 | 处理原则 |
|---|---|
| Pixso 离线口径 | 官方帮助中心与更新内容存在范围/版本差异；本研究只记录为“口径不一致”，不宣称 Pixso 完全离线或完全在线。 |
| Figma/Pixso 逐项等价 | 不以竞品营销对比代替独立技术测试；复杂覆盖、插件生态、性能上限、导入还原率进入后续验证 backlog。 |
| 完整 Web 响应式 | Auto Layout/Constraints 不等于 CSS 断点/容器查询；Codeless 需在运行时明确规则。 |
| 大文件性能 | 官方资料通常不提供可复现上限；用本地 `PD-QA-01` 基准测试决定预算。 |
| 企业治理 | 资源审批、废弃、审计、权限继承等能力若无官方明确资料，不纳入已验证事实。 |

## 5. 官方资料索引

### Figma

- [Explore design files](https://help.figma.com/hc/en-us/articles/15297425105303-Explore-design-files)
- [Add layouts to your designs](https://help.figma.com/hc/en-us/articles/360040451373-Add-layouts-to-your-designs)
- [Explore constraints](https://help.figma.com/hc/en-us/articles/360039957734-Explore-constraints)
- [Create and insert component instances](https://help.figma.com/hc/en-us/articles/360038662654-Create-and-insert-component-instances)
- [Explore component properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties)
- [Create and use variants](https://help.figma.com/hc/en-us/articles/360056440594-Create-and-use-variants)
- [Guide to variables in Figma](https://help.figma.com/hc/en-us/articles/14506821864087-Guide-to-variables-in-Figma)
- [Create a library](https://help.figma.com/hc/en-us/articles/360041051154-Create-a-library)
- [Add comments to files](https://help.figma.com/hc/en-us/articles/360039825894-Add-comments-to-files)
- [View a file's version history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history)
- [Share files and prototypes](https://help.figma.com/hc/en-us/articles/360040531773-Share-files-and-prototypes)
- [Work on files offline](https://help.figma.com/hc/en-us/articles/360040532773-Work-on-files-offline)

### Pixso

- [Pixso 官网](https://pixso.net/)
- [Pixso 帮助中心](https://pixso.net/help/guide/)
- [Pixso 变量系统发布页](https://pixso.cn/releases/variables/)
- [Pixso 自动布局 2.0](https://pixso.cn/releases/auto-layout-2.0/)
- [Pixso 可视化评论](https://pixso.cn/releases/picture-support/)
- [Pixso 历史版本管理](https://pixso.cn/releases/historical-version-management/)
- [Pixso 图层搜索](https://pixso.cn/releases/layer-searching/)
- [Pixso DSM 设计系统管理](https://pixso.cn/designskills/pixso-dsm-guide/)
- [Pixso Figma 对比页](https://pixso.cn/compare-with-figma/)

> 以上链接按 2026-08-22 可访问状态整理。产品会更新；发布版本评审时需要重新核验，不能把本文当成永久规格承诺。

## 6. Figma 细节补充：应避免的过度简化

Figma 官方资料进一步确认了几个对实现优先级很重要的细节：

| 细节 | 官方边界 | 对 Codeless 的实现影响 |
|---|---|---|
| 组件属性不是只有 Variant | 官方列出 Boolean、Instance swap、Text、Variant、Slot 五类组件属性；Slot 截至核验日仍为 Open beta。 | `PD-CMP-01` 应把“属性类型”和“视觉变体”分开建模，Slot 作为可选扩展而不是 v1 强依赖。 |
| Styles 与 Variables 分工不同 | Styles 更适合一组组合视觉属性；Variables 更适合原子值、Alias 和 Mode。 | `PD-STY-01` 不要把所有内容塞进单一 Token 表；要区分 style preset、token value、semantic alias 和 theme mode。 |
| Auto Layout 规则有边界 | 支持 Vertical、Horizontal、Grid、Wrap、Hug/Fill/Fixed、min/max；普通 Auto Layout 子对象不能直接使用 Constraints，需使用 Ignore auto layout 等方式。 | `PD-RES-01` 必须定义规则优先级、冲突提示和可解释降级，不能简单叠加两套规则。 |
| 设计系统存在发布和接受流程 | Components、Styles、Variables 可以进入 Library；库更新需要审核和接受，部分跨文件能力受套餐限制。 | 本地库应免费提供影响范围、预览、接受、拒绝、回滚和缺失资源修复。 |
| 工作流效率来自批量命令 | Actions 菜单可搜索命令、批量重命名、按属性匹配选择、Frame selection 和导出。 | `PD-WKF-01/02` 优先建设命令 registry 和批处理，而不是只增加零散快捷键。 |
| 在线协作并不等于无冲突 | Figma 官方说明离线变更可能与其他协作者的最新修改产生差异，需要通过版本历史检查或恢复。 | `PD-COL-02` 必须显示 revision、冲突对象和合并前 Diff，禁止静默覆盖。 |
| Beta 和套餐能力不能作为稳定底座 | Grid Auto Layout、Slots、Figma AI 等仍可能处于 Beta；Library、Branching、部分 Variables 能力受计划/席位影响。 | Codeless 核心功能应将稳定基础规则内置并永久免费，Beta 类能力以 feature flag 隔离。 |

Figma 补充资料：

- [Guide to components in Figma](https://help.figma.com/hc/en-us/articles/360038662654-Guide-to-components-in-Figma)
- [Explore component properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties)
- [Guide to libraries in Figma](https://help.figma.com/hc/en-us/articles/360041051154-Guide-to-libraries-in-Figma)
- [Overview of variables, collections, and modes](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes)
- [Use the actions menu in Figma Design](https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design)
- [What can I do offline in Figma?](https://help.figma.com/hc/en-us/articles/360040328553-What-can-I-do-offline-in-Figma)

> Figma 的套餐、席位、Beta 和文件管理术语会变化；本文件只将其作为产品研究输入，不作为 Codeless 对外兼容承诺。
