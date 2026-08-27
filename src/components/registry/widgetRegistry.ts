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
  capabilities: { dataBinding: boolean; formField: boolean; clickable: boolean; resizable: boolean; container: boolean }
  fields: WidgetFieldSchema[]
}

type DefinitionOptions = Pick<WidgetDefinition, 'type' | 'name' | 'description' | 'icon' | 'group' | 'usage'> & {
  supportedEvents?: WidgetEventType[]
  fields?: WidgetFieldSchema[]
  capabilities?: Partial<WidgetDefinition['capabilities']>
}
type FieldOptions = Omit<WidgetFieldSchema, 'key' | 'label' | 'kind'>

const baseCapabilities: WidgetDefinition['capabilities'] = { dataBinding: false, formField: false, clickable: true, resizable: true, container: false }
const define = (options: DefinitionOptions): WidgetDefinition => ({ ...options, supportedEvents: options.supportedEvents || ['click'], fields: options.fields || [], capabilities: { ...baseCapabilities, ...(options.capabilities || {}) } })
const field = (key: string, label: string, kind: WidgetFieldKind, options: FieldOptions = {}): WidgetFieldSchema => ({ key, label, kind, ...options })
const option = (label: string, value: string) => ({ label, value })

const textStyle = [
  field('style.fontSize', '字号', 'number', { min: 10, max: 72, step: 1 }),
  field('style.color', '文字颜色', 'color'),
  field('style.textAlign', '文字对齐', 'select', { options: [option('左对齐', 'left'), option('居中', 'center'), option('右对齐', 'right')] }),
  field('style.opacity', '不透明度', 'number', { min: 0, max: 1, step: .05 }),
]
const surfaceStyle = [
  field('style.background', '背景颜色', 'color'),
  field('style.borderColor', '边框颜色', 'color'),
  field('style.borderRadius', '圆角', 'number', { min: 0, max: 80, step: 1 }),
  field('style.opacity', '不透明度', 'number', { min: 0, max: 1, step: .05 }),
]
const containerStyle = [
  field('style.padding', '内边距', 'number', { min: 0, max: 120, step: 1 }),
  field('style.gap', '组件间距', 'number', { min: 0, max: 80, step: 1 }),
  ...surfaceStyle,
  field('style.shadow', '显示阴影', 'checkbox'),
]
const disabledField = field('content.disabled', '禁用', 'checkbox')
const requiredField = field('validation.required', '必填', 'checkbox')
const optionField = field('content.options', '静态选项', 'options', { placeholder: '标签|值，每行一个选项' })
const dataFields = [field('data.source', '数据源', 'data'), field('data.table', '数据表', 'data'), field('data.mode', '查询模式', 'data')]

export const widgetDefinitions: WidgetDefinition[] = [
  define({ type: 'heading', name: '标题', description: '页面标题与说明', icon: 'heading', group: '基础组件', usage: '用于展示页面层级标题和说明文字。', fields: [field('content.text', '标题文字', 'text'), field('content.description', '说明文字', 'textarea'), ...textStyle] }),
  define({ type: 'text', name: '文本', description: '段落与提示信息', icon: 'text', group: '基础组件', usage: '用于展示静态说明、帮助文案和状态描述。', fields: [field('content.text', '文本内容', 'textarea'), ...textStyle] }),
  define({ type: 'button', name: '按钮', description: '触发操作或流程', icon: 'button', group: '基础组件', usage: '可提交表单、打开服务组件或触发事件。', supportedEvents: ['click', 'submit'], fields: [field('content.text', '按钮文字', 'text'), field('content.variant', '按钮样式', 'select', { options: [option('主要', 'primary'), option('次要', 'secondary'), option('描边', 'outline')] }), disabledField, field('content.loading', '加载中', 'checkbox'), field('style.accent', '强调色', 'color'), ...surfaceStyle] }),
  define({ type: 'divider', name: '分割线', description: '划分内容区域', icon: 'divider', group: '基础组件', usage: '用于分隔不同的信息区块。', fields: [field('style.accent', '线条颜色', 'color'), field('style.borderWidth', '线条宽度', 'number', { min: 1, max: 8, step: 1 }), field('style.opacity', '不透明度', 'number', { min: 0, max: 1, step: .05 })] }),
  define({ type: 'image', name: '图片', description: '图片与素材占位', icon: 'image', group: '基础组件', usage: '配置图片地址后可选择裁剪、完整显示或拉伸。', fields: [field('content.src', '图片地址', 'text', { placeholder: 'https://...' }), field('content.alt', '替代文本', 'text'), field('content.imageFit', '填充方式', 'select', { options: [option('裁剪填充', 'cover'), option('完整显示', 'contain'), option('拉伸', 'fill')] }), field('style.borderRadius', '圆角', 'number', { min: 0, max: 80, step: 1 }), field('style.opacity', '不透明度', 'number', { min: 0, max: 1, step: .05 })] }),

  define({ type: 'input', name: '输入框', description: '单行文本录入', icon: 'input', group: '表单组件', usage: '支持文本、数字、邮箱、电话、日期等字段校验。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [field('content.label', '字段标签', 'text'), field('content.placeholder', '占位提示', 'text'), field('content.defaultValue', '默认值', 'text'), field('content.valueType', '值类型', 'select', { options: [option('文本', 'text'), option('数字', 'number'), option('邮箱', 'email'), option('电话', 'phone'), option('日期', 'date'), option('日期时间', 'datetime')] }), disabledField, field('content.readOnly', '只读', 'checkbox'), requiredField, field('validation.minLength', '最小长度', 'number', { min: 0, max: 999, step: 1 }), field('validation.maxLength', '最大长度', 'number', { min: 1, max: 999, step: 1 })] }),
  define({ type: 'select', name: '选择器', description: '下拉选择数据', icon: 'select', group: '表单组件', usage: '可使用静态选项或绑定数据表字段。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false, dataBinding: true }, fields: [field('content.label', '字段标签', 'text'), field('content.placeholder', '占位提示', 'text'), field('content.defaultValue', '默认值', 'text'), optionField, disabledField, requiredField, ...dataFields] }),
  define({ type: 'table', name: '数据表格', description: '展示列表和记录', icon: 'table', group: '数据组件', usage: '可配置列、空状态、序号与数据表查询。', capabilities: { dataBinding: true, clickable: false }, fields: [field('content.columns', '列定义', 'columns', { placeholder: '字段|标题|宽度，每行一列' }), field('content.emptyText', '空状态文案', 'text'), field('content.showIndex', '显示序号', 'checkbox'), field('data.limit', '行数上限', 'number', { min: 1, max: 1000, step: 1 }), field('style.borderRadius', '圆角', 'number', { min: 0, max: 80, step: 1 }), ...dataFields] }),
  define({ type: 'stat', name: '指标卡', description: '突出展示关键数值', icon: 'stat', group: '数据组件', usage: '可绑定聚合数据并配置趋势说明。', capabilities: { dataBinding: true }, fields: [field('content.label', '指标标题', 'text'), field('content.value', '指标数值', 'text'), field('content.trend', '趋势说明', 'text'), field('style.accent', '强调色', 'color'), ...textStyle, ...dataFields] }),

  define({ type: 'badge', name: '徽标', description: '角标与数字提示', icon: 'badge', group: '通用组件', usage: '用于未读数、状态或数字提醒。', fields: [field('content.text', '展示文字', 'text'), field('content.value', '角标数值', 'text'), field('content.max', '最大显示值', 'number', { min: 1, max: 9999, step: 1 }), field('content.showZero', '显示零值', 'checkbox'), field('style.accent', '强调色', 'color'), field('style.borderRadius', '圆角', 'number', { min: 0, max: 999, step: 1 })] }),
  define({ type: 'tag', name: '标签', description: '分类与状态标记', icon: 'tag', group: '通用组件', usage: '支持色调、可关闭状态和关闭事件。', supportedEvents: ['click', 'close'], fields: [field('content.text', '标签文字', 'text'), field('content.tone', '色调', 'select', { options: [option('主要', 'primary'), option('成功', 'success'), option('警告', 'warning'), option('危险', 'danger'), option('信息', 'info')] }), field('content.closable', '可关闭', 'checkbox'), field('style.borderRadius', '圆角', 'number', { min: 0, max: 80, step: 1 })] }),
  define({ type: 'alert', name: '提示框', description: '展示上下文提示', icon: 'alert', group: '通用组件', usage: '支持提示类型、详细说明与关闭事件。', supportedEvents: ['close'], fields: [field('content.title', '标题', 'text'), field('content.description', '说明', 'textarea'), field('content.tone', '提示类型', 'select', { options: [option('信息', 'info'), option('成功', 'success'), option('警告', 'warning'), option('危险', 'danger')] }), field('content.closable', '可关闭', 'checkbox'), field('style.borderRadius', '圆角', 'number', { min: 0, max: 80, step: 1 })] }),
  define({ type: 'progress', name: '进度条', description: '展示任务完成进度', icon: 'progress', group: '通用组件', usage: '可配置百分比、状态与文字显示。', fields: [field('content.percentage', '百分比', 'number', { min: 0, max: 100, step: 1 }), field('content.status', '状态', 'select', { options: [option('正常', 'normal'), option('成功', 'success'), option('警告', 'warning'), option('异常', 'exception')] }), field('content.showText', '显示文字', 'checkbox'), field('style.accent', '强调色', 'color')] }),
  define({ type: 'switch', name: '开关', description: '布尔状态切换', icon: 'switch', group: '通用组件', usage: '支持默认状态、文字和禁用控制。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [field('content.label', '字段标签', 'text'), field('content.activeText', '开启文字', 'text'), field('content.inactiveText', '关闭文字', 'text'), field('content.defaultValue', '默认开启', 'checkbox'), disabledField, field('style.accent', '强调色', 'color')] }),
  define({ type: 'checkbox', name: '多选框', description: '多项选择输入', icon: 'checkbox', group: '通用组件', usage: '可配置选项、默认状态和必填校验。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [field('content.label', '字段标签', 'text'), optionField, field('content.defaultValue', '默认选中', 'checkbox'), disabledField, requiredField] }),
  define({ type: 'radio', name: '单选框', description: '单项选择输入', icon: 'radio', group: '通用组件', usage: '可配置选项、默认值和必填校验。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [field('content.label', '字段标签', 'text'), optionField, field('content.defaultValue', '默认值', 'text'), disabledField, requiredField] }),
  define({ type: 'datePicker', name: '日期选择', description: '日期或日期时间输入', icon: 'calendar', group: '通用组件', usage: '支持日期类型、占位提示和必填校验。', supportedEvents: ['change'], capabilities: { formField: true, clickable: false }, fields: [field('content.label', '字段标签', 'text'), field('content.placeholder', '占位提示', 'text'), field('content.valueType', '选择类型', 'select', { options: [option('日期', 'date'), option('日期时间', 'datetime')] }), disabledField, requiredField] }),
  define({ type: 'pagination', name: '分页', description: '分页导航', icon: 'pagination', group: '通用组件', usage: '可配置总数、每页条数和当前页。', supportedEvents: ['change'], fields: [field('content.total', '总条数', 'number', { min: 0, max: 999999, step: 1 }), field('content.pageSize', '每页条数', 'number', { min: 1, max: 100, step: 1 }), field('content.currentPage', '当前页', 'number', { min: 1, max: 99999, step: 1 }), field('style.accent', '强调色', 'color')] }),
  define({ type: 'breadcrumb', name: '面包屑', description: '层级导航', icon: 'breadcrumb', group: '通用组件', usage: '使用选项配置导航层级与链接。', supportedEvents: ['click'], fields: [optionField, field('content.separator', '分隔符', 'text'), field('style.accent', '强调色', 'color')] }),
  define({ type: 'tabs', name: '标签页', description: '分组内容导航', icon: 'tabs', group: '通用组件', usage: '以纵向列表方式展示标签项并切换内容。', supportedEvents: ['change'], fields: [optionField, field('content.activeKey', '当前选项', 'text'), field('style.accent', '强调色', 'color'), field('style.borderRadius', '圆角', 'number', { min: 0, max: 80, step: 1 })] }),
  define({ type: 'collapse', name: '折叠面板', description: '可展开的信息分组', icon: 'collapse', group: '通用组件', usage: '使用选项配置分组并控制默认展开。', supportedEvents: ['change'], fields: [optionField, field('content.expanded', '默认展开', 'checkbox'), field('style.accent', '强调色', 'color')] }),
  define({ type: 'avatar', name: '头像', description: '用户或对象标识', icon: 'avatar', group: '通用组件', usage: '支持文字、圆形或方形外观。', fields: [field('content.text', '展示文字', 'text'), field('content.shape', '形状', 'select', { options: [option('圆形', 'circle'), option('方形', 'square')] }), field('style.accent', '强调色', 'color'), field('style.borderRadius', '圆角', 'number', { min: 0, max: 999, step: 1 })] }),
  define({ type: 'icon', name: '图标', description: '图标与辅助文字', icon: 'icon', group: '通用组件', usage: '可配置图标名称、辅助文字、颜色和尺寸。', fields: [field('content.iconName', '图标名称', 'text'), field('content.text', '辅助文字', 'text'), field('style.accent', '强调色', 'color'), field('style.fontSize', '字号', 'number', { min: 12, max: 96, step: 1 })] }),
  define({ type: 'link', name: '链接', description: '可跳转的文字链接', icon: 'link', group: '通用组件', usage: '支持地址与当前窗口或新窗口打开方式。', fields: [field('content.text', '链接文字', 'text'), field('content.href', '链接地址', 'text'), field('content.target', '打开方式', 'select', { options: [option('当前窗口', '_self'), option('新窗口', '_blank')] }), ...textStyle] }),
  define({ type: 'tooltip', name: '文字提示', description: '悬停说明', icon: 'tooltip', group: '通用组件', usage: '配置触发文字、提示内容和展示位置。', fields: [field('content.text', '触发文字', 'text'), field('content.title', '提示内容', 'textarea'), field('content.placement', '位置', 'select', { options: [option('上方', 'top'), option('下方', 'bottom'), option('左侧', 'left'), option('右侧', 'right')] })] }),

  define({ type: 'card', name: '卡片容器', description: '承载一组内容', icon: 'card', group: 'Figma 布局', usage: '可容纳子组件并配置标题、说明和外观。', capabilities: { container: true }, fields: [field('content.title', '容器标题', 'text'), field('content.description', '说明', 'textarea'), ...containerStyle] }),
  define({ type: 'frame', name: '画框 Frame', description: '自由布局容器', icon: 'frame', group: 'Figma 布局', usage: '用于组织具有独立背景和边界的内容区域。', capabilities: { container: true }, fields: [field('content.title', 'Frame 标题', 'text'), field('content.description', '说明', 'textarea'), ...containerStyle] }),
  define({ type: 'stack', name: '自动布局', description: '类似 Figma Stack', icon: 'stack', group: 'Figma 布局', usage: '使用横向或纵向方向、间距和内边距排列子组件。', capabilities: { container: true }, fields: [field('content.title', '容器标题', 'text'), field('content.direction', '排列方向', 'select', { options: [option('横向', 'row'), option('纵向', 'column')] }), ...containerStyle] }),
  define({ type: 'grid', name: '网格布局', description: '多列规则布局', icon: 'grid', group: 'Figma 布局', usage: '配置列数、间距和容器外观来排列子组件。', capabilities: { container: true }, fields: [field('content.title', '容器标题', 'text'), field('content.columnsCount', '列数', 'number', { min: 1, max: 12, step: 1 }), ...containerStyle] }),
  define({ type: 'spacer', name: '间隔器', description: '弹性留白区域', icon: 'spacer', group: 'Figma 布局', usage: '在自动布局中创建固定或弹性的空白空间。', fields: [field('content.flex', '弹性填充', 'checkbox'), field('style.background', '背景颜色', 'color'), field('style.opacity', '不透明度', 'number', { min: 0, max: 1, step: .05 })] }),
  define({ type: 'drawer', name: '抽屉', description: '从边缘滑出的容器', icon: 'drawer', group: '服务组件', usage: '可配置位置、默认可见、遮罩关闭与内容容器。', supportedEvents: ['open', 'close', 'confirm', 'cancel'], capabilities: { container: true }, fields: [field('content.title', '标题', 'text'), field('content.description', '说明', 'textarea'), field('content.placement', '出现位置', 'select', { options: [option('右侧', 'right'), option('左侧', 'left'), option('上方', 'top'), option('下方', 'bottom')] }), field('content.visible', '默认可见', 'checkbox'), field('content.closeOnOverlay', '点击遮罩关闭', 'checkbox'), ...containerStyle] }),
  define({ type: 'modal', name: '弹窗', description: '居中显示的服务组件', icon: 'modal', group: '服务组件', usage: '可由其他组件打开或关闭，并可配置完整的弹窗生命周期。', supportedEvents: ['beforeOpen', 'open', 'beforeClose', 'close', 'confirm', 'cancel'], capabilities: { container: true }, fields: [field('content.title', '标题', 'text'), field('content.description', '说明', 'textarea'), field('content.showConfirmButton', '显示确定按钮', 'checkbox'), field('content.confirmText', '确认文字', 'text'), field('content.showCancelButton', '显示取消按钮', 'checkbox'), field('content.cancelText', '取消文字', 'text'), field('content.visible', '默认可见', 'checkbox'), field('content.closeOnOverlay', '点击遮罩关闭', 'checkbox'), field('style.accent', '确定按钮色', 'color'), field('style.borderRadius', '圆角', 'number', { min: 0, max: 80, step: 1 })] }),
  define({ type: 'loading', name: '加载', description: '加载中的服务组件', icon: 'loading', group: '服务组件', usage: '支持旋转图标或进度条样式，可作为内容容器。', capabilities: { clickable: false, container: true }, fields: [field('content.text', '提示文字', 'text'), field('content.loadingVariant', '样式', 'select', { options: [option('旋转图标', 'spinner'), option('进度条', 'bar')] }), field('content.visible', '默认可见', 'checkbox'), field('style.accent', '强调色', 'color'), field('style.borderRadius', '圆角', 'number', { min: 0, max: 80, step: 1 })] }),
]

export const widgetDefinitionMap = Object.fromEntries(widgetDefinitions.map(item => [item.type, item])) as Record<WidgetType, WidgetDefinition>
