# Codeless

Codeless 是一个 **完全本地运行** 的低代码平台原型，基于 Electron、Vue 3 与 SQLite 构建。无需部署服务器，应用设计、页面组件和操作记录都保存在当前用户的本机数据库中。

## 已实现功能

| 模块 | 功能 |
| --- | --- |
| 应用工作台 | 应用卡片、运行状态、快捷复制、新建模板、最近活动 |
| 页面设计器 | 组件拖放、画布定位、属性编辑、撤销/重做、预览、保存、发布 |
| 组件库 | 标题、文本、按钮、输入框、下拉框、指标卡、表格、图片、分割线 |
| 数据模型 | SQLite 状态与路径展示、数据表与字段结构原型 |
| 自动化流程 | 触发器、条件判断、执行动作的可视化流程原型 |
| 运行日志 | 本地设计与发布记录 |
| 本地存储 | Electron 主进程使用 Node 内置 `node:sqlite`，通过安全 IPC 提供数据接口 |

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面容器 | Electron 42 |
| 前端 | Vue 3 + TypeScript + Vite |
| 数据库 | SQLite（`node:sqlite` / `DatabaseSync`） |
| 通信 | Electron contextBridge + ipcMain |
| 打包 | electron-builder |

## 本地运行

```powershell
npm install
npm run dev
```

如果 Electron 二进制尚未下载，可先执行：

```powershell
npx install-electron
```

## 构建前端与主进程

```powershell
npm run build:vite
```

## 打包 Windows 应用

```powershell
npm run build:win
```

## SQLite 文件位置

应用首次启动后会自动创建数据库：

```text
Electron userData/Codeless/codeless.sqlite
```

实际绝对路径会显示在“数据模型”页面。数据库启用了 WAL 模式，当前包含：

| 数据表 | 用途 |
| --- | --- |
| `projects` | 保存应用元数据、状态与页面布局 JSON |
| `activities` | 保存创建、设计、复制、发布和删除记录 |

## 项目结构

```text
electron/main/index.ts              Electron 主进程、SQLite 与 IPC
electron/preload/index.ts           安全预加载 API
src/App.vue                         平台主界面
src/composables/useLowcode.ts       设计器状态与业务逻辑
src/components/WidgetRenderer.vue   低代码组件渲染器
src/components/AppIcon.vue          本地 SVG 图标组件
src/types/lowcode.ts                领域类型
src/style.css                       完整视觉样式
```

## 验证结果

- `npm run typecheck` ✅
- `npm run build:vite` ✅
- Electron 隐藏烟雾测试 ✅，已实际创建并初始化 `codeless.sqlite`

## 原型说明

这是一个可以真实保存页面设计的桌面原型。数据模型编辑器、流程执行器与最终应用运行时目前展示了完整产品形态和交互入口，后续可以继续接入动态建表、表单 CRUD、流程引擎和应用导出功能。
