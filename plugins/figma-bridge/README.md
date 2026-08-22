# Codeless Figma Local Bridge

这是一个**本地 Figma Plugin bridge 示例**，用于把当前 Figma 选区导出为 Codeless 的 `codeless-design` v1 开放设计交换 JSON。

## 本地与免费约束

- 插件只读取用户主动选择的 Figma 节点，并在本机生成 JSON。
- `networkAccess.allowedDomains` 明确设置为 `none`，不访问远程 API、图片 CDN 或在线插件市场。
- UI 只使用 Figma Plugin API 与浏览器内置的复制/下载能力，不包含远程脚本。
- 不上传项目、不启用云同步，不需要订阅或付费账号。

## 在 Figma Desktop 中加载

1. 打开 Figma Desktop，进入 **Plugins → Development → Import plugin from manifest...**。
2. 选择本目录中的 `figma-manifest.json`。
3. 在画布中选择一个或多个节点。
4. 运行 **Codeless Local Design Bridge**。
5. 在插件窗口中点击“读取当前选区”，然后复制 JSON 或下载 `figma-selection.codeless-design.json`。

## 导入 Codeless

1. 打开 Codeless Builder。
2. 点击工具栏的 **设计 JSON 导入**。
3. 选择刚才下载的 `.codeless-design.json` 文件。
4. 节点会作为新组件追加到当前页面，并支持撤销、重做和本地自动保存。

Codeless 的开放格式导出使用 **设计 JSON 导出**；如果当前选中了组件，只导出选中组件及其后代，否则导出当前页面全部节点。

## 支持范围与限制

当前 bridge 将常用 Figma 节点映射为可解释子集：TEXT、FRAME、RECTANGLE、ELLIPSE、LINE、IMAGE、COMPONENT、INSTANCE、GROUP、SECTION。它保留基础几何、可见性、锁定状态、透明度、纯色填充/描边、圆角和文本样式。

- 复杂渐变、混合模式、矢量路径、约束、原型交互、变量、字体文件和组件实例绑定不会写入交换格式。
- IMAGE 节点只保留图像节点及其几何信息，不把 Figma 私有资源或远程图片地址带入 Codeless。
- 不承诺解析 `.fig` 私有格式；必须通过 Figma Plugin API 由用户主动导出。
- 所有导入数据在 Codeless 中会经过格式、节点数量、递归深度、字符串和颜色校验；JSON 仅作为数据读取，不执行其中任何脚本。
