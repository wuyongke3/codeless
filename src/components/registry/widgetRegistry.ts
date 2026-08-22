import type { WidgetEventType, WidgetType } from '../../types/lowcode'

export interface PaletteItem { type: WidgetType; name: string; description: string; icon: string }

export type WidgetFieldKind = 'text' | 'textarea' | 'number' | 'color' | 'select' | 'checkbox' | 'options' | 'columns' | 'data'

export interface WidgetFieldSchema {
  key: string
  label: string
  kind: WidgetFieldKind
  description?: string
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  step?: number
}

export interface WidgetDefinition {
  type: WidgetType
  name: string
  description: string
  icon: string
  group: string
  usage: string
  supportedEvents: WidgetEventType[]
  capabilities: {
    dataBinding: boolean
    formField: boolean
    clickable: boolean
    resizable: boolean
    container: boolean
  }
  fields: WidgetFieldSchema[]
}

type DefinitionOptions = Pick<WidgetDefinition, 'type' | 'name' | 'description' | 'icon' | 'group' | 'usage'> & {
  supportedEvents?: WidgetEventType[]
  fields?: WidgetFieldSchema[]
  capabilities?: Partial<WidgetDefinition['capabilities']>
}

const baseCapabilities: WidgetDefinition['capabilities'] = {
  dataBinding: false,
  formField: false,
  clickable: true,
  resizable: true,
  container: false,
}

function define(options: DefinitionOptions): WidgetDefinition {
  return {
    ...options,
    supportedEvents: options.supportedEvents || ['click'],
    fields: options.fields || [],
    capabilities: { ...baseCapabilities, ...(options.capabilities || {}) },
  }
}

const textAlignFields: WidgetFieldSchema[] = [
  { key: 'style.fontSize', label: '字号', kind: 'number', min: 10, max: 72, step: 1 },
  { key: 'style.textAlign', label: '对齐方式', kind: 'select', options: [{ label: '左对齐', value: 'left' }, { label: '居中', value: 'center' }, { label: '右对齐', value: 'right' }] },
]

export const widgetDefinitions: WidgetDefinition[] = [
  define({ type: 'heading', name: '标题', description: '页面标题与说明', icon: 'heading', group: '基础组件', usage: '用于页面层级标题。双击标题或说明文字可以直接编辑。', fields: [{ key: 'content.text', label: '标题文字', kind: 'text' }, { key: 'content.description', label: '说明文字', kind: 'textarea' }, ...textAlignFields] }),
  define({ type: 'text', name: '文本', description: '段落与提示信息', icon: 'text', group: '基础组件', usage: '用于展示静态说明、帮助文案和状态描述。支持换行。', fields: [{ key: 'content.text', label: '文本内容', kind: 'textarea' }, ...textAlignFields] }),
  define({ type: 'button', name: '按钮', description: '触发操作或流程', icon: 'button', group: '基础组件', usage: '用于提交表单、打开弹窗、跳转页面或触发事件。', supportedEvents: ['click', 'submit'], fields: [{ key: 'content.text', label: '按钮文字', kind: 'text' }, { key: 'content.variant', label: '按钮样式', kind: 'select', options: [{ label: '主要', value: 'primary' }, { label: '次要', value: 'secondary' }, { label: '描边', value: 'outline' }] }, { key: 'style.accent', label: '强调色', kind: 'color' }] }),
  define({ type: 'divider', name: '分割线', description: '划分内容区域', icon: 'divider', group: '基础组件', usage: '用于分隔不同信息区块。', fields: [{ key: 'style.accent', label: '线条颜色', kind: 'color' }, { key: 'style.borderWidth', label: '线条宽度', kind: 'number', min: 1, max: 8, step: 1 }] }),
  define({ type: 'image', name: '图片', description: '图片与素材占位', icon: 'image', group: '基础组件', usage: '配置图片地址后在预览中展示，支持 cover / contain / fill。', fields: [{ key: 'content.src', label: '图片地址', kind: 'text' }, { key: 'content.alt', label: '替代文本', kind: 'text' }, { key: 'content.imageFit', label: '填充方式', kind: 'select', options: [{ label: '裁剪填充', value: 'cover' }, { label: '完整显示', value: 'contain' }, { label: '拉伸', value: 'fill' }] }] }),
  define({ type: 'input', name: '输入框', description: '单行文本录入', icon: 'input', group: '表单组件', usage: '用于收集文本、数字、邮箱、电话、日期等字段。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [{ key: 'content.label', label: '字段标签', kind: 'text' }, { key: 'content.placeholder', label: '占位提示', kind: 'text' }, { key: 'content.valueType', label: '值类型', kind: 'select', options: [{ label: '文本', value: 'text' }, { label: '数字', value: 'number' }, { label: '邮箱', value: 'email' }, { label: '电话', value: 'phone' }, { label: '日期', value: 'date' }, { label: '日期时间', value: 'datetime' }] }, { key: 'validation.required', label: '必填', kind: 'checkbox' }] }),
  define({ type: 'select', name: '选择器', description: '下拉选择数据', icon: 'select', group: '表单组件', usage: '选项可以使用 label|value 格式，也可以绑定数据表。', supportedEvents: ['change'], capabilities: { dataBinding: true, formField: true, clickable: false }, fields: [{ key: 'content.label', label: '字段标签', kind: 'text' }, { key: 'content.options', label: '静态选项', kind: 'options' }, { key: 'data.table', label: '数据表', kind: 'data' }] }),
  define({ type: 'table', name: '数据表格', description: '列表、分页与行操作', icon: 'table', group: '数据展示', usage: '用于展示数据表格，配置 columns 和数据源后可在运行时读取真实记录。', supportedEvents: ['click', 'rowClick'], capabilities: { dataBinding: true }, fields: [{ key: 'content.columns', label: '表格列', kind: 'columns' }, { key: 'data.table', label: '绑定数据表', kind: 'data' }, { key: 'data.limit', label: '行数上限', kind: 'number', min: 1, max: 100, step: 1 }] }),
  define({ type: 'stat', name: '数据指标', description: '关键指标与趋势', icon: 'chart', group: '数据展示', usage: '展示数量、金额或聚合结果，支持 count / sum / avg / min / max。', capabilities: { dataBinding: true }, fields: [{ key: 'content.text', label: '指标名称', kind: 'text' }, { key: 'content.value', label: '静态数值', kind: 'text' }, { key: 'content.trend', label: '趋势文案', kind: 'text' }, { key: 'data.table', label: '绑定数据表', kind: 'data' }, { key: 'data.mode', label: '统计模式', kind: 'select', options: [{ label: '记录计数', value: 'count' }, { label: '聚合', value: 'aggregate' }] }] }),

  define({ type: 'badge', name: '徽标', description: '数字或状态徽标', icon: 'badge', group: 'Element Plus', usage: '用于显示数量、未读数或状态。设置 showZero=false 时零值会隐藏。', fields: [{ key: 'content.text', label: '徽标内容', kind: 'text' }, { key: 'content.showZero', label: '显示零值', kind: 'checkbox' }, { key: 'content.max', label: '最大值', kind: 'number', min: 1, max: 9999, step: 1 }, { key: 'style.accent', label: '徽标颜色', kind: 'color' }] }),
  define({ type: 'tag', name: '标签', description: '分类、状态标签', icon: 'tag', group: 'Element Plus', usage: '用于给内容打上分类或状态标签，可配置关闭交互。', supportedEvents: ['click', 'close'], fields: [{ key: 'content.text', label: '标签文字', kind: 'text' }, { key: 'content.tone', label: '语义类型', kind: 'select', options: [{ label: '主要', value: 'primary' }, { label: '成功', value: 'success' }, { label: '警告', value: 'warning' }, { label: '危险', value: 'danger' }, { label: '信息', value: 'info' }] }, { key: 'content.closable', label: '可关闭', kind: 'checkbox' }] }),
  define({ type: 'alert', name: '警告提示', description: '带语义的提示块', icon: 'alert', group: 'Element Plus', usage: '用于反馈成功、警告、错误或普通提示。', supportedEvents: ['click', 'close'], fields: [{ key: 'content.title', label: '提示标题', kind: 'text' }, { key: 'content.description', label: '提示内容', kind: 'textarea' }, { key: 'content.tone', label: '语义类型', kind: 'select', options: [{ label: '信息', value: 'info' }, { label: '成功', value: 'success' }, { label: '警告', value: 'warning' }, { label: '危险', value: 'danger' }] }, { key: 'content.closable', label: '可关闭', kind: 'checkbox' }] }),
  define({ type: 'progress', name: '进度条', description: '任务进度展示', icon: 'progress', group: 'Element Plus', usage: '使用 percentage 配置进度，status 可设置 success / warning / exception。', fields: [{ key: 'content.percentage', label: '进度百分比', kind: 'number', min: 0, max: 100, step: 1 }, { key: 'content.status', label: '状态', kind: 'select', options: [{ label: '默认', value: 'normal' }, { label: '成功', value: 'success' }, { label: '警告', value: 'warning' }, { label: '异常', value: 'exception' }] }, { key: 'content.showText', label: '显示数值', kind: 'checkbox' }] }),
  define({ type: 'switch', name: '开关', description: '布尔值切换', icon: 'toggle', group: 'Element Plus', usage: '用于启用 / 禁用配置，change 事件会输出 true 或 false。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [{ key: 'content.label', label: '字段标签', kind: 'text' }, { key: 'content.defaultValue', label: '默认值', kind: 'checkbox' }, { key: 'content.activeText', label: '开启文案', kind: 'text' }, { key: 'content.inactiveText', label: '关闭文案', kind: 'text' }] }),
  define({ type: 'checkbox', name: '多选框', description: '多项勾选', icon: 'checkbox', group: 'Element Plus', usage: '静态 options 会渲染为多项复选框；单项使用 checked / defaultValue。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [{ key: 'content.label', label: '字段标签', kind: 'text' }, { key: 'content.options', label: '多选项', kind: 'options' }, { key: 'content.defaultValue', label: '默认选中', kind: 'checkbox' }] }),
  define({ type: 'radio', name: '单选框', description: '单项选择', icon: 'radio', group: 'Element Plus', usage: '配置 options 后渲染单选组，值变更会触发 change。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [{ key: 'content.label', label: '字段标签', kind: 'text' }, { key: 'content.options', label: '单选项', kind: 'options' }, { key: 'content.defaultValue', label: '默认值', kind: 'text' }] }),
  define({ type: 'datePicker', name: '日期选择', description: '日期与日期时间', icon: 'calendar', group: 'Element Plus', usage: '选择日期或日期时间，值使用标准 HTML 日期格式保存。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [{ key: 'content.label', label: '字段标签', kind: 'text' }, { key: 'content.valueType', label: '选择模式', kind: 'select', options: [{ label: '日期', value: 'date' }, { label: '日期时间', value: 'datetime' }] }, { key: 'content.placeholder', label: '占位提示', kind: 'text' }] }),
  define({ type: 'pagination', name: '分页器', description: '列表分页控制', icon: 'pagination', group: 'Element Plus', usage: 'total 表示总条数，pageSize 表示每页数量，change 事件输出页码。', supportedEvents: ['change', 'click'], fields: [{ key: 'content.total', label: '总条数', kind: 'number', min: 0, max: 100000, step: 1 }, { key: 'content.pageSize', label: '每页数量', kind: 'number', min: 1, max: 100, step: 1 }, { key: 'content.currentPage', label: '当前页', kind: 'number', min: 1, max: 999, step: 1 }] }),
  define({ type: 'breadcrumb', name: '面包屑', description: '页面层级导航', icon: 'breadcrumb', group: 'Element Plus', usage: '使用 options 配置层级，separator 配置分隔符。', fields: [{ key: 'content.options', label: '层级项', kind: 'options' }, { key: 'content.separator', label: '分隔符', kind: 'text' }] }),
  define({ type: 'tabs', name: '标签页', description: '多面板切换', icon: 'tabs', group: 'Element Plus', usage: '使用 options 配置标签页，activeKey 为当前项；切换时触发 change。', supportedEvents: ['change', 'click'], fields: [{ key: 'content.options', label: '标签项', kind: 'options' }, { key: 'content.activeKey', label: '默认项', kind: 'text' }] }),
  define({ type: 'collapse', name: '折叠面板', description: '可展开内容面板', icon: 'collapse', group: 'Element Plus', usage: 'options 配置面板标题，children 内容可通过容器拖拽放入。', supportedEvents: ['click', 'change'], fields: [{ key: 'content.options', label: '面板项', kind: 'options' }, { key: 'content.expanded', label: '默认展开', kind: 'checkbox' }] }),

  define({ type: 'avatar', name: '头像', description: '用户头像与首字母', icon: 'avatar', group: '基础组件', usage: '配置 src 显示图片，没有图片时使用 text 的首字母。', fields: [{ key: 'content.text', label: '名称或首字母', kind: 'text' }, { key: 'content.src', label: '图片地址', kind: 'text' }, { key: 'content.shape', label: '形状', kind: 'select', options: [{ label: '圆形', value: 'circle' }, { label: '方形', value: 'square' }] }] }),
  define({ type: 'icon', name: '图标', description: '图标与操作提示', icon: 'sparkle', group: '基础组件', usage: 'iconName 使用内置图标名；点击可绑定 interaction。', fields: [{ key: 'content.iconName', label: '图标名称', kind: 'text', placeholder: 'sparkle / check / info' }, { key: 'content.text', label: '辅助文字', kind: 'text' }, { key: 'style.accent', label: '图标颜色', kind: 'color' }] }),
  define({ type: 'link', name: '链接', description: '页面或外部链接', icon: 'link', group: '基础组件', usage: 'href 可填写站内路径或外部 URL，也可以只使用 click 事件。', fields: [{ key: 'content.text', label: '链接文字', kind: 'text' }, { key: 'content.href', label: '链接地址', kind: 'text' }, { key: 'content.target', label: '打开方式', kind: 'select', options: [{ label: '当前窗口', value: '_self' }, { label: '新窗口', value: '_blank' }] }] }),
  define({ type: 'tooltip', name: '文字提示', description: '悬停说明', icon: 'tooltip', group: '基础组件', usage: '运行时悬停显示 title；设计态直接显示提示内容。', fields: [{ key: 'content.text', label: '触发文字', kind: 'text' }, { key: 'content.title', label: '提示内容', kind: 'textarea' }, { key: 'content.placement', label: '位置', kind: 'select', options: [{ label: '上方', value: 'top' }, { label: '下方', value: 'bottom' }, { label: '左侧', value: 'left' }, { label: '右侧', value: 'right' }] }] }),

  define({ type: 'card', name: '卡片容器', description: '带标题的内容容器', icon: 'card', group: 'Figma 布局', usage: '作为内容容器使用，组件可以拖入卡片内部，支持内边距和阴影。', capabilities: { container: true }, fields: [{ key: 'content.title', label: '卡片标题', kind: 'text' }, { key: 'content.description', label: '卡片说明', kind: 'textarea' }, { key: 'style.padding', label: '内边距', kind: 'number', min: 0, max: 80, step: 1 }, { key: 'style.shadow', label: '显示阴影', kind: 'checkbox' }] }),
  define({ type: 'frame', name: 'Frame 容器', description: '自由布局画框', icon: 'frame', group: 'Figma 布局', usage: '类似 Figma Frame，内部子组件使用相对坐标，可继续嵌套容器。', capabilities: { container: true }, fields: [{ key: 'content.title', label: 'Frame 名称', kind: 'text' }, { key: 'style.padding', label: '内边距', kind: 'number', min: 0, max: 80, step: 1 }, { key: 'style.background', label: '背景色', kind: 'color' }] }),
  define({ type: 'stack', name: '自动布局', description: '横向或纵向 Stack', icon: 'stack', group: 'Figma 布局', usage: '内部子组件会按方向排列，gap 和 padding 统一控制间距。', capabilities: { container: true }, fields: [{ key: 'content.direction', label: '排列方向', kind: 'select', options: [{ label: '横向', value: 'row' }, { label: '纵向', value: 'column' }] }, { key: 'style.gap', label: '间距', kind: 'number', min: 0, max: 80, step: 1 }, { key: 'style.padding', label: '内边距', kind: 'number', min: 0, max: 80, step: 1 }] }),
  define({ type: 'grid', name: '网格容器', description: '规则网格布局', icon: 'grid', group: 'Figma 布局', usage: '内部子组件按 gridColumns / gap 排列，适合搭建卡片和表单布局。', capabilities: { container: true }, fields: [{ key: 'content.columnsCount', label: '列数', kind: 'number', min: 1, max: 12, step: 1 }, { key: 'style.gap', label: '网格间距', kind: 'number', min: 0, max: 80, step: 1 }, { key: 'style.padding', label: '内边距', kind: 'number', min: 0, max: 80, step: 1 }] }),
  define({ type: 'spacer', name: '间距', description: '空白与弹性空间', icon: 'spacer', group: 'Figma 布局', usage: '用于拉开布局间距；在 Stack 中可作为弹性占位。', fields: [{ key: 'content.flex', label: '弹性占位', kind: 'checkbox' }, { key: 'style.background', label: '调试背景', kind: 'color' }] }),
  define({ type: 'drawer', name: '抽屉容器', description: '侧边抽屉内容层', icon: 'drawer', group: '服务组件', usage: '作为侧边内容容器，运行时可通过 showModal / hideModal 事件控制可见性。', supportedEvents: ['open', 'close', 'confirm', 'cancel'], capabilities: { container: true }, fields: [{ key: 'content.title', label: '抽屉标题', kind: 'text' }, { key: 'content.description', label: '说明文字', kind: 'textarea' }, { key: 'content.placement', label: '出现方向', kind: 'select', options: [{ label: '右侧', value: 'right' }, { label: '左侧', value: 'left' }, { label: '上方', value: 'top' }, { label: '下方', value: 'bottom' }] }, { key: 'content.visible', label: '默认显示', kind: 'checkbox' }] }),
  define({ type: 'modal', name: '弹窗', description: '确认、表单和流程提示', icon: 'modal', group: '服务组件', usage: '运行时通过 showModal / hideModal 控制，内容区可以继续拖入任意组件。', supportedEvents: ['open', 'close', 'confirm', 'cancel'], capabilities: { container: true }, fields: [{ key: 'content.title', label: '标题', kind: 'text' }, { key: 'content.description', label: '内容', kind: 'textarea' }, { key: 'content.confirmText', label: '确认按钮', kind: 'text' }, { key: 'content.cancelText', label: '取消按钮', kind: 'text' }, { key: 'content.visible', label: '默认显示', kind: 'checkbox' }, { key: 'content.closeOnOverlay', label: '点击遮罩关闭', kind: 'checkbox' }] }),
  define({ type: 'loading', name: 'Loading', description: '阻塞式或局部加载反馈', icon: 'loading', group: '服务组件', usage: '可作为局部内容容器，显示 spinner / bar 加载状态。', capabilities: { clickable: false, container: true }, fields: [{ key: 'content.text', label: '提示文字', kind: 'text' }, { key: 'content.loadingVariant', label: '样式', kind: 'select', options: [{ label: '旋转指示器', value: 'spinner' }, { label: '进度条', value: 'bar' }] }, { key: 'content.visible', label: '默认显示', kind: 'checkbox' }] }),
]

export const widgetDefinitionMap = Object.fromEntries(widgetDefinitions.map(item => [item.type, item])) as Record<WidgetType, WidgetDefinition>
