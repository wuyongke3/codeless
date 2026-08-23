# 首页与工作区模块化路由架构

## 1. 目标与设计结论

本次拆分将应用分成两个生命周期不同的一级模块：

| 模块 | 路由入口 | 主要职责 | 状态边界 |
| --- | --- | --- | --- |
| 首页（Home） | `/`、`/home` | 应用列表、创建应用、最近项目、概览指标 | 只读/管理型状态：项目列表、筛选、创建弹窗 |
| 工作区（Workspace） | `/workspace/:projectId/:area` | 页面设计、数据模型、流程、日志、插件 | 编辑型状态：当前项目、页面、选中组件、脏状态、运行时值 |

首页不再通过 `activeArea === 'workspace'` 与工作区共用一套渲染树；一级模块由 `appModule` 路由状态决定。`activeArea` 只负责描述工作区内部区域，避免“模块状态”和“区域状态”混用。左侧栏已移除，所有入口统一收敛到页面级横向路由导航。

## 2. 公开专业工具的可观察模式

对 Pixso、Figma 等专业设计工具的公开产品界面进行对照后，抽取出适合 Codeless 的实现原则：

1. **文件/项目入口与编辑器入口分离**：文件浏览和最近项目适合独立承载创建、查找、复制等管理动作；进入具体文件后，编辑器拥有自己的工具栏、画布和侧栏。
2. **编辑器内部采用稳定的多面板布局**：左侧承载资源/图层/页面，中间是画布，右侧是属性/检查器；面板切换不会改变文件身份，只改变当前工作区子区域。
3. **项目身份贯穿编辑会话**：路由中携带文件或项目 ID，刷新、回退、深链接都可以恢复上下文，不依赖“上一次点击了哪个按钮”。
4. **导航以低干扰为原则**：从首页进入项目使用明确的“打开/继续设计”动作；工作区返回首页始终可见；切换项目或离开编辑器时，对未保存内容进行统一拦截。
5. **状态分层**：项目持久化数据、工作区编辑会话状态、页面运行时路由状态分别管理，避免切换页面时相互污染。

这些原则只用于抽取交互和架构模式，不复制具体产品的视觉或私有实现。

## 3. 路由配置

路由定义位于 `src/router/appRouter.ts`，当前采用轻量 History API 路由，避免为 Electron 本地应用引入额外依赖。

| 名称 | 路径 | 模块 | 区域 | 说明 |
| --- | --- | --- | --- | --- |
| `home` | `/` | `home` | `workspace`（兼容旧值） | 默认首页 |
| `home-alias` | `/home` | `home` | `workspace`（兼容旧值） | 首页别名 |
| `workspace-builder` | `/workspace/:projectId/builder` | `workspace` | `builder` | 页面设计器 |
| `workspace-data` | `/workspace/:projectId/data` | `workspace` | `data` | 数据模型 |
| `workspace-flows` | `/workspace/:projectId/flows` | `workspace` | `flows` | 自动化流程 |
| `workspace-activity` | `/workspace/:projectId/activity` | `workspace` | `activity` | 运行日志 |
| `workspace-plugins` | `/workspace/:projectId/plugins` | `workspace` | `plugins` | 本地插件 |

同时保留旧式 `/builder`、`/data` 等路径解析：它们会使用当前项目 ID 解析到标准工作区路径，保证已有页面事件和低代码动作兼容。

### 导航 API

```ts
state.navigate('home')
state.navigate('builder')
state.openBuilder(projectId)
state.navigate('/workspace/project_123/data')
```

- `home`、`workspace`、`/` 都解析为首页。
- `builder/data/flows/activity/plugins` 解析为当前项目的工作区区域。
- `/workspace/:projectId/:area` 支持深链接和浏览器前进/后退。
- 工作区路由会在项目加载完成后校验项目 ID；深链接项目不存在时回落到首个可用项目。

## 4. 页面组件拆分

```tex
src/
├─ modules/
│  ├─ home/
│  │  ├─ HomeModule.vue       # 首页壳：首页路由导航 + 首页顶栏 + HomeView
│  │  └─ HomeView.vue         # 应用卡片、概览、创建入口
│  ├─ workspace/
│  │  └─ WorkspaceModule.vue  # 工作区壳：工作区路由导航 + 工作区顶栏 + 区域视图
│  └─ shared/
     ├─ AppRouteNavigation.vue # 页面级路由、项目切换、创建入口和本地状态
│     └─ AppTopbar.vue         # 根据 module 渲染不同标题和返回行为
├─ router/
│  └─ appRouter.ts             # 一级模块路由、历史记录、深链接、离开守卫
├─ views/
│  ├─ BuilderView.vue
│  ├─ DataModelView.vue
│  ├─ FlowsView.vue
│  ├─ ActivityView.vue
│  └─ PluginsView.vue          # 工作区内部功能页面
└─ composables/
   ├─ useLowcode.ts            # 应用门面，组合各领域状态
   ├─ useProjectManager.ts     # 项目加载、创建、复制、删除、保存
   └─ useAppRouter.ts          # 项目内页面路由（与一级模块路由分层）
```

`App.vue` 只负责启动态、一级模块选择和全局弹窗，不再承载侧栏、顶栏以及所有页面的条件分支。后续新增工作区区域时，只需要：

1. 在 `Area`、`appRoutes` 中注册区域；
2. 在 `WorkspaceModule.vue` 增加视图映射；
3. 在 `AppRouteNavigation.vue` 增加导航项或项目级操作；
4. 按需补充对应样式和领域 composable。

## 5. 状态管理与隔离

| 层级 | 代表状态 | 生命周期 | 来源 |
| --- | --- | --- | --- |
| 应用壳状态 | `appModule`、`appRoute`、导航历史 | 整个渲染进程 | `createAppShellRouter` |
| 项目域状态 | `projects`、`currentProjectId`、项目保存状态 | 跨首页/工作区 | `useProjectManager`、SQLite/localStorage |
| 工作区编辑状态 | `activeArea`、`selectedWidgetId`、`dirty`、画布缩放 | 当前项目工作区 | `useDesigner` |
| 页面运行时状态 | `routeState`、表单值、加载值、事件总线 | 当前页面会话 | `useAppRouter`、`useRuntime` |
| 弹层状态 | 创建、预览、确认、协作面板 | 当前应用壳 | 各领域 composable |

隔离规则：

- 首页切换只改变 `appRoute/module`，不销毁项目数据，也不把首页筛选状态写入页面运行时状态。
- 工作区切换区域只改变 `activeArea` 和标准工作区 URL，不重置 `currentProjectId`。
- 切换项目时调用 `resetDesigner()`、`resetRuntimeValues()`，避免选中组件、表单值和运行时数据串项目。
- 项目内页面路由继续由 `useAppRouter` 管理，和一级模块路由互不抢占路径解析。
- 离开工作区时统一读取 `designer.dirty`，由一级路由执行一次未保存确认。

## 6. 导航交互

| 场景 | 交互 | 结果 |
| --- | --- | --- |
| 首页打开应用 | 点击应用卡片、继续设计、最近应用 | 设置项目 ID，进入 `/workspace/:id/builder` |
| 工作区返回首页 | 点击顶栏返回按钮或品牌 | 返回 `/`，工作区编辑状态保留在内存中 |
| 工作区切换区域 | 点击页面级路由导航 | 保持项目 ID，只切换区域路径 |
| 浏览器后退/前进 | `popstate` | 恢复对应模块、项目和区域 |
| 离开脏编辑器 | 任意跨模块/跨区域导航 | 弹出未保存确认，取消则保持当前路由 |
| 旧页面事件导航 | 传入 `/index` 等项目内路径 | 交给 `useAppRouter`，不误判为壳路由 |

## 7. 扩展建议

- 当需要权限、登录或多人协作时，在 `appRouter.ts` 增加 `beforeEach` 守卫链，不把权限判断散落在按钮事件里。
- 当需要独立加载性能时，将 `WorkspaceModule` 下的区域改为异步组件，并保持路由记录的 `meta` 描述。
- 当需要恢复多窗口编辑会话时，可把 `appRoute` 序列化到 Electron 窗口状态，而不必把编辑器临时状态写入项目文件。
- 当需要测试时，优先对 `resolveTarget`、`navigate`、`handlePopState` 和脏状态守卫做纯路由测试，再做模块级 UI 测试。


