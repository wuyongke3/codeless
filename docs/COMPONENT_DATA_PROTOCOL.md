# 组件统一数据协议与使用说明

> 版本：`WidgetConfig v1`  
> 适用范围：Codeless 设计器、实时预览、Electron SQLite 运行时、浏览器 `localStorage` 降级模式。

## 1. 设计原则

Codeless 的组件数据不再依赖一组不可预测的扁平 `props`。每个组件都使用同一套配置结构，设计器修改、保存、复制、预览和运行时读取同一份 `config`：

```text
widget
├── id / type / name       组件身份
├── x / y / w / h          旧版兼容字段
├── props                  旧版兼容字段
└── config                 v1 统一协议（新代码优先使用）
    ├── layout             位置、尺寸、层级、锁定、隐藏
    ├── content            组件内容
    ├── style              视觉样式
    ├── data               数据绑定
    ├── validation          表单校验
    ├── interaction         事件与动作
    ├── submitTo            旧版按钮提交兼容配置
    └── meta                协议版本和更新时间
```

## 2. 通用协议

```ts
interface WidgetConfig {
  version: 1
  layout: {
    x: number
    y: number
    width: number
    height: number
    rotation: number
    zIndex: number
    locked: boolean
    hidden: boolean
  }
  content: {
    text?: string
    description?: string
    label?: string
    placeholder?: string
    defaultValue?: string | number | boolean
    value?: string | number | boolean
    valueType?: 'text' | 'number' | 'email' | 'phone' | 'date' | 'datetime' | 'boolean'
    variant?: 'primary' | 'secondary' | 'outline'
    options?: Array<{ label: string; value: string; disabled?: boolean }>
    columns?: Array<{
      key: string
      label: string
      width?: number
      align?: 'left' | 'center' | 'right'
      format?: string
      visible?: boolean
    }>
    trend?: string
    src?: string
    alt?: string
    imageFit?: 'cover' | 'contain' | 'fill' | 'none'
  }
  style: {
    color?: string
    background?: string
    accent?: string
    borderColor?: string
    borderWidth?: number
    borderRadius?: number
    fontSize?: number
    fontWeight?: number
    textAlign?: 'left' | 'center' | 'right'
    opacity?: number
    objectFit?: 'cover' | 'contain' | 'fill' | 'none'
  }
  data: {
    source: 'static' | 'table' | 'runtime'
    table?: string
    mode?: 'list' | 'single' | 'count' | 'aggregate'
    field?: string
    fields?: Record<string, string>
    labelField?: string
    valueField?: string
    where?: string
    orderBy?: string
    limit?: number
    offset?: number
    aggregate?: {
      function: 'count' | 'sum' | 'avg' | 'min' | 'max'
      field?: string
    }
  }
  validation: {
    required?: boolean
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
    pattern?: string
    message?: string
  }
  interaction: {
    events: Array<{
      id: string
      event: 'click' | 'change' | 'submit' | 'rowClick'
      enabled?: boolean
      actions: Array<{
        id: string
        type: 'navigate' | 'setValue' | 'submitData' | 'showToast'
        target?: string
        value?: string
      }>
    }>
    rowEvents?: Array<unknown>
  }
  submitTo?: {
    table: string
    fieldMapping?: Record<string, string>
  }
  meta: {
    version: 1
    createdAt: string
    updatedAt: string
  }
}
```

### 2.1 字段使用边界

| 区域 | 应该放什么 | 不应该放什么 |
| --- | --- | --- |
| `layout` | 位置、尺寸、旋转、层级、锁定、隐藏 | 业务字段、颜色、文案 |
| `content` | 文案、默认值、选项、列、图片地址 | 查询条件、动作脚本 |
| `style` | 颜色、字号、圆角、透明度、对齐 | 表单字段名、数据库字段名 |
| `data` | 数据表、字段映射、过滤、排序、聚合 | 组件展示标题、按钮提示文案 |
| `validation` | 必填、长度、数字范围、正则 | 数据库写入逻辑 |
| `interaction` | 事件触发和动作链 | 组件位置和展示内容 |

新增代码应通过 `getWidgetConfig(widget)` 读取，通过 `setWidgetFrame` 修改位置尺寸，通过 `syncLegacyProps` 保持旧版字段兼容。加载旧项目时会自动执行 `normalizeProject` / `normalizeWidget`。

## 3. 各组件用法

### 3.1 标题 `heading`

**适合场景**：页面标题、区块标题和页面说明。标题内容放 `content.text`，辅助说明放 `content.description`。

```json
{
  "type": "heading",
  "config": {
    "content": {
      "text": "客户管理",
      "description": "维护客户资料与跟进状态"
    },
    "style": { "fontSize": 28, "textAlign": "left" },
    "data": { "source": "static" },
    "interaction": { "events": [] }
  }
}
```

支持事件：`click`。通常不需要绑定数据。

### 3.2 文本 `text`

**适合场景**：帮助说明、空状态提示、业务规则和静态文案。支持文本中的换行。

```json
{
  "type": "text",
  "config": {
    "content": { "text": "提交后，系统会在 5 分钟内完成审核。" },
    "style": { "fontSize": 14, "color": "#62677a" },
    "data": { "source": "static" }
  }
}
```

支持事件：`click`。如果只是展示提示，不建议给文本增加事件。

### 3.3 按钮 `button`

**适合场景**：保存、提交、导航、打开流程和触发动作。按钮本身不保存表单字段，表单值由输入框 / 下拉框收集。

```json
{
  "type": "button",
  "config": {
    "content": { "text": "保存", "variant": "primary" },
    "style": { "accent": "#665cf6", "borderRadius": 10 },
    "interaction": {
      "events": [
        {
          "id": "event_save",
          "event": "submit",
          "actions": [
            { "id": "action_save", "type": "submitData", "target": "customers" },
            { "id": "action_tip", "type": "showToast", "value": "客户已保存" }
          ]
        }
      ]
    }
  }
}
```

按钮在运行时依次触发 `click` 和 `submit`。提交前会统一执行当前页面的表单校验。旧项目可以继续使用 `submitTo.table`，但新页面推荐使用 `interaction.events[].actions[]`。

### 3.4 输入框 `input`

**适合场景**：录入文本、数字、邮箱、电话、日期和日期时间。

关键规则：`data.field` 是提交时的稳定字段名，不能依赖组件 ID。

```json
{
  "type": "input",
  "config": {
    "content": {
      "label": "客户姓名",
      "placeholder": "请输入客户姓名",
      "defaultValue": "",
      "valueType": "text"
    },
    "data": { "source": "runtime", "field": "customer_name" },
    "validation": {
      "required": true,
      "minLength": 2,
      "maxLength": 40
    }
  }
}
```

支持事件：`change`。支持 `required`、长度、数字范围、正则表达式校验。`valueType` 会映射到浏览器原生输入类型。

### 3.5 下拉选择 `select`

#### 静态选项

选项可以直接配置为结构化数组；设计器文本输入支持每行一项，格式为 `显示名|实际值`。

```json
{
  "type": "select",
  "config": {
    "content": {
      "label": "业务类型",
      "options": [
        { "label": "咨询", "value": "consult" },
        { "label": "建议", "value": "suggest" },
        { "label": "投诉", "value": "complaint" }
      ]
    },
    "data": { "source": "runtime", "field": "business_type" },
    "validation": { "required": true }
  }
}
```

#### 数据表选项

绑定数据表后，运行时使用 `labelField` 作为显示文本，使用 `valueField` 作为提交值：

```json
{
  "data": {
    "source": "table",
    "table": "customers",
    "mode": "list",
    "labelField": "name",
    "valueField": "id",
    "limit": 50
  }
}
```

绑定数据表时，表为空会显示“暂无可选项”，不会错误地回退到静态选项。支持事件：`change`。

### 3.6 数据表格 `table`

**适合场景**：列表、查询结果和可点击数据行。列格式为 `字段名|显示名|宽度`，例如：

```text
name|客户名称|180
contact|联系人|120
status|状态|100
created_at|创建时间|160
```

对应协议：

```json
{
  "type": "table",
  "config": {
    "content": {
      "columns": [
        { "key": "name", "label": "客户名称", "width": 180 },
        { "key": "status", "label": "状态", "width": 100, "align": "center" }
      ]
    },
    "data": {
      "source": "table",
      "table": "customers",
      "mode": "list",
      "where": "status = '跟进中'",
      "orderBy": "created_at DESC",
      "limit": 20
    }
  }
}
```

支持事件：`click`、`rowClick`。行事件 payload 中包含 `row` 和 `index`，例如 `{{ row.id }}`、`{{ row.name }}`。数据加载中、空结果和查询错误均有明确状态，不再显示伪造的演示行。

### 3.7 指标卡 `stat`

**适合场景**：数量、金额和关键业务指标。

记录数统计：

```json
{
  "type": "stat",
  "config": {
    "content": { "text": "客户总数", "trend": "+12.8%" },
    "data": { "source": "table", "table": "customers", "mode": "count" }
  }
}
```

聚合统计：

```json
{
  "data": {
    "source": "table",
    "table": "orders",
    "mode": "aggregate",
    "aggregate": { "function": "sum", "field": "amount" }
  }
}
```

支持聚合函数：`count`、`sum`、`avg`、`min`、`max`。过滤和聚合在 SQLite 主进程执行，字段名会经过白名单校验。

### 3.8 图片 `image`

**适合场景**：图片 URL、本地 `file://` 资源、素材占位区域。

```json
{
  "type": "image",
  "config": {
    "content": {
      "src": "https://example.com/banner.png",
      "alt": "活动横幅",
      "imageFit": "cover"
    }
  }
}
```

图片加载失败时会显示可读的错误状态。`alt` 必须填写有意义的替代文本；没有图片地址时可使用 `text` / `description` 作为占位内容。

### 3.9 分割线 `divider`

**适合场景**：区分表单区块、指标区块和说明区块。只需要配置 `style.accent`、`style.borderWidth`，不需要绑定数据。

支持事件：`click`，一般不建议配置。

## 4. 数据绑定协议

### 4.1 查询参数

SQLite 运行时支持：

| 参数 | 说明 |
| --- | --- |
| `table` | 业务表名，目前由内置表白名单保护 |
| `mode` | `list` 多行、`single` 单行、`count` 计数、`aggregate` 聚合 |
| `fields` / `columns` | 查询字段；表格通常由列 key 映射 |
| `where` | 单字段比较，例如 `status = '处理中'` |
| `orderBy` | 单字段排序，例如 `created_at DESC` |
| `limit` | 列表最多 200 行 |
| `offset` | 分页偏移量 |
| `aggregate` | 聚合函数和字段 |

为了避免把用户输入拼接成任意 SQL，当前 `where` 仅支持一个字段和比较符：`=`、`!=`、`<>`、`>`、`>=`、`<`、`<=`，并支持字符串、数字和 `NULL`。

### 4.2 提交数据

表单提交时会收集所有 `input` / `select`：

```ts
{
  // 组件 id，始终可追溯
  widget_1: '星河科技',
  // 配置了 data.field 后，同时提供稳定字段名
  customer_name: '星河科技',
  business_type: 'consult'
}
```

写入数据库时优先匹配：

1. `submitTo.fieldMapping[widget.id]`
2. `config.data.field`
3. 数据表字段名
4. 字段描述和内置中文别名

推荐始终配置 `data.field`，不要依赖自动猜测。

## 5. 事件和动作

### 5.1 事件类型

| 事件 | 适用组件 | Payload |
| --- | --- | --- |
| `click` | 标题、文本、按钮、指标卡、表格、图片、分割线 | 无或 `value` |
| `change` | 输入框、下拉选择 | `value` |
| `submit` | 按钮 | `value`，同时携带当前表单值 |
| `rowClick` | 数据表格 | `row`、`index` |

### 5.2 动作类型

| 动作 | 用法 | 例子 |
| --- | --- | --- |
| `showToast` | 显示提示 | `客户 {{ row.name }} 已选中` |
| `setValue` | 设置输入框 / 下拉框运行时值 | 目标选择组件，值为 `{{ row.name }}` |
| `submitData` | 提交当前页面表单 | 目标选择 `customers` |
| `navigate` | 切换工作区或导航目标 | `data`、`workspace` |

动作按数组顺序执行。模板变量支持：

```text
{{ value }}          当前输入值
{{ row }}            当前行 JSON
{{ row.id }}         当前行字段
{{ form.customer_name }}  当前表单字段
```

## 6. 设计器操作约定

| 操作 | 行为 |
| --- | --- |
| 单击组件 | 选中并打开属性面板 |
| Shift + 单击 | 多选 / 取消选择 |
| 拖动 | 以 8px 网格吸附移动，多选组件同步移动 |
| 方向键 | 1px 移动 |
| Shift + 方向键 | 10px 移动 |
| 四边 / 四角手柄 | 调整尺寸 |
| Shift + 拖动手柄 | 等比例缩放 |
| Ctrl/Cmd + C/V | 复制 / 粘贴 |
| Ctrl/Cmd + D | 原位偏移复制 |
| Ctrl/Cmd + Z / Shift + Z | 撤销 / 重做 |
| Delete / Backspace | 删除所选组件 |
| 锁定 | 禁止移动和缩放，但仍可查看属性 |
| 隐藏 | 设计器显示虚线占位，预览完全不占用交互 |

## 7. 迁移和兼容

旧项目可能只有：

```ts
{ x, y, w, h, props: { text, options, dataSource } }
```

加载、复制和保存时会自动迁移为 `config v1`。旧字段仍会同步保留，以便已有项目和旧插件继续读取。新组件不要继续向 `props` 添加字段。

在代码中修改配置后，请使用：

```ts
const config = getWidgetConfig(widget)
config.content.text = '新的标题'
syncLegacyProps(widget)
```

修改布局优先使用：

```ts
setWidgetFrame(widget, { x: 80, y: 120, width: 360, height: 72 })
```

## 8. 推荐搭建流程

1. 先拖入展示组件和表单组件，完成页面结构。
2. 为输入框 / 下拉框设置 `data.field`，为表格列设置真实字段 `key`。
3. 在数据绑定面板选择数据表，再配置过滤、排序和返回行数。
4. 为按钮添加 `submit` 事件，选择 `submitData` 和 `showToast` 动作。
5. 对表格添加 `rowClick`，用 `{{ row.id }}` 等变量驱动后续动作。
6. 使用预览验证必填、长度、空数据、查询错误、提交和导航。
7. 保存后再发布；发布只改变应用状态，不会绕过保存流程。

## 9. 容器组件与层级协议

### 9.1 parentId 语义

LowCodeWidget.parentId 表示组件所在的容器。它是组件树关系的唯一来源，不能仅通过数组顺序推断。

- undefined 或 null：组件位于当前页面根层。
- 目前可作为容器的服务组件为 modal 和 loading。
- parentId 必须指向同一页面中真实存在的容器组件，禁止指向自身或自己的后代。
- config.layout.x / y 始终是相对父容器内容区的坐标；根层组件则相对画布坐标。
- 同一父级下通过 config.layout.zIndex 决定绘制和图层顺序，保存时建议从 1 开始连续编号。

{
  "id": "widget_modal_1",
  "type": "modal",
  "parentId": null,
  "config": {
    "layout": { "x": 120, "y": 90, "width": 360, "height": 210, "zIndex": 2 }
  }
}

### 9.2 Modal 与 Loading 内容区

容器本身负责绘制服务组件的外观，子组件渲染在容器的内容层中。内容层坐标是容器内部协议的一部分，设计态和运行态必须使用同一套规则。

| 容器 | 内容层起点 | 内容层尺寸 | 说明 |
| --- | --- | --- | --- |
| modal | x = 12, y = 58 | width - 24, height - 112 | 为标题、说明文字和底部操作区预留空间 |
| loading | x = 0, y = 0 | 与 Loading 容器相同 | Loading 的遮罩和提示层覆盖整个容器 |

例如，Modal 的子组件配置为 x: 16, y: 12 时，它在 Modal 内的内容坐标为 12 + 16, 58 + 12。Loading 子组件则直接从 Loading 内容层左上角计算。

当容器尺寸不足以容纳最小内容区时，内容区宽高至少按 24px 处理，子组件不会被放置到容器外部；拖拽、缩放和粘贴时均要重新执行边界约束。

### 9.3 拖拽、重挂载和嵌套规则

| 场景 | 行为 |
| --- | --- |
| 从组件面板拖入 Modal / Loading | 命中最内层容器后，以该容器内容区为坐标系创建组件 |
| 已有组件拖入容器 | 保留组件画布绝对位置，转换为目标容器的相对坐标并更新 parentId |
| 在画布中移动容器 | 容器和后代组件整体移动，后代的相对坐标不变 |
| 从容器拖回页面根层 | 删除 parentId，将相对坐标换算为画布坐标 |
| 图层面板拖到容器节点 | 执行同样的重挂载逻辑，并禁止循环引用 |
| 容器缩放 | 采用容器最小尺寸和内容区尺寸约束，子组件被限制在内容区内 |
| 容器复制 | 递归复制所有后代，并用新 ID 重建复制子树的 parentId |
| 容器删除 | 删除容器本身，直接子组件提升到原父级并保留其绝对位置；不会静默删除子组件 |

拖拽命中多个嵌套容器时，优先使用最内层容器。拖拽结束后应清除临时命中状态，避免后续普通拖拽继续显示容器高亮。

### 9.4 数据校验

- 加载、复制、粘贴和保存前必须调用配置迁移与规范化逻辑。
- 如果 parentId 指向不存在的组件或非容器组件，应回退到根层。
- 如果发现父子关系形成环，应断开当前组件的 parentId，避免递归渲染死循环。
- 组件树渲染应按 parentId 递归，并在每层按 zIndex 排序。

## 10. 服务组件交互协议

### 10.1 Modal

Modal 的可见状态保存在 config.content.visible，标题、说明、按钮文字和遮罩行为也统一保存在 config.content 中。Modal 的子组件仍通过普通组件数据协议配置，不应把内容序列化进标题或说明字段。

{
  "type": "modal",
  "config": {
    "content": {
      "title": "编辑客户",
      "description": "请确认提交信息",
      "confirmText": "保存",
      "cancelText": "取消",
      "visible": false,
      "closeOnOverlay": true
    },
    "interaction": {
      "events": [
        { "id": "open", "event": "open", "actions": [] },
        { "id": "confirm", "event": "confirm", "actions": [{ "id": "save", "type": "submitData", "target": "customers" }] },
        { "id": "cancel", "event": "cancel", "actions": [{ "id": "close", "type": "hideModal", "target": "modal_1" }] }
      ]
    }
  }
}

按钮动作执行成功后可继续调用导航、提示或关闭动作。Modal 的确认、取消和遮罩关闭事件必须经过统一事件执行器，不能直接修改另一个组件的旧版 props。

### 10.2 Loading

Loading 是可嵌套内容的服务容器，支持 spinner 和 bar 两种视觉变体。它的可见状态保存在 config.content.visible，提示文字保存在 config.content.text。

{
  "type": "loading",
  "config": {
    "content": {
      "text": "正在加载客户数据…",
      "loadingVariant": "spinner",
      "visible": false
    },
    "style": { "accent": "#665cf6" }
  }
}

Loading 可用 showLoading / hideLoading 控制。动作的 target 指向 Loading 组件 ID；如果未指定目标，运行时应使用当前事件关联的 Loading 容器或全局 Loading。

### 10.3 服务动作

| 动作 | target | 语义 |
| --- | --- | --- |
| showModal | Modal ID，可选 | 显示指定 Modal；未指定时使用当前上下文中的 Modal |
| hideModal | Modal ID，可选 | 隐藏指定 Modal，并清理其临时交互状态 |
| showLoading | Loading ID，可选 | 显示指定 Loading；可覆盖提示文字 |
| hideLoading | Loading ID，可选 | 隐藏指定 Loading |
| navigate | 页面 ID 或路径 | 执行导航守卫后跳转页面 |
| navigateBack | 无 | 返回运行时历史中的上一页 |
| setRouteState | 状态对象 | 更新当前路由状态，并触发页面响应式刷新 |
| emitPageEvent | 事件名 | 向目标页面或共享事件总线发送 payload |

服务动作应按事件列表顺序执行；异步数据请求期间可先显示 Loading，成功或失败分支都应配置隐藏 Loading 的收尾动作。页面通信优先使用 setRouteState / emitPageEvent，不要通过修改目标页面组件的 content 字段实现隐式通信。

## 11. 实现约束

1. 新组件只写入 config.content、config.style、config.data、config.validation 和 config.interaction；props 仅作为兼容层。
2. 组件运行时通过统一的事件执行器读取 config.interaction.events，并用 payload、表单值和路由状态解析变量。
3. 读取或修改组件配置时使用 getWidgetConfig()、setWidgetFrame() 和 syncLegacyProps()，不要直接分散写入 x / y / w / h。
4. 容器的设计态渲染和运行态渲染必须共享 parentId、内容区偏移和 zIndex 规则。
5. 任何会改变组件树的操作（拖拽、重挂载、复制、删除、图层排序）都必须可撤销，并在保存前完成规范化。