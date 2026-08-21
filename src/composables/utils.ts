import type { BootstrapData, LowCodeProject, LowCodeWidget, PageLayout, WidgetProps, WidgetType } from '../types/lowcode'

export type Area = 'workspace' | 'builder' | 'data' | 'flows' | 'activity'
export interface PaletteItem { type: WidgetType; name: string; description: string; icon: string }

export const navItems: Array<{ id: Area; label: string; icon: string }> = [
  { id: 'workspace', label: '应用工作台', icon: 'home' },
  { id: 'builder', label: '页面设计', icon: 'apps' },
  { id: 'data', label: '数据模型', icon: 'database' },
  { id: 'flows', label: '自动化流程', icon: 'flow' },
  { id: 'activity', label: '运行日志', icon: 'activity' },
]

export const paletteGroups: Array<{ name: string; items: PaletteItem[] }> = [
  { name: '基础组件', items: [
    { type: 'heading', name: '标题', description: '页面标题与说明', icon: 'heading' },
    { type: 'text', name: '文本', description: '段落与提示信息', icon: 'text' },
    { type: 'button', name: '按钮', description: '触发操作或流程', icon: 'button' },
    { type: 'divider', name: '分割线', description: '划分内容区域', icon: 'divider' },
  ] },
  { name: '表单组件', items: [
    { type: 'input', name: '输入框', description: '单行文本录入', icon: 'input' },
    { type: 'select', name: '下拉选择', description: '选项列表选择', icon: 'select' },
  ] },
  { name: '数据展示', items: [
    { type: 'stat', name: '指标卡', description: '突出显示关键指标', icon: 'chart' },
    { type: 'table', name: '数据表格', description: '展示结构化数据', icon: 'table' },
    { type: 'image', name: '图片', description: '图片与素材占位', icon: 'image' },
  ] },
]

export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
export function makeId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

export function widgetDefaults(type: WidgetType): Omit<LowCodeWidget, 'id' | 'type' | 'x' | 'y'> {
  const common = { name: '组件', w: 240, h: 60, props: {} as WidgetProps }
  const map: Record<WidgetType, Omit<LowCodeWidget, 'id' | 'type' | 'x' | 'y'>> = {
    heading: { ...common, name: '页面标题', w: 420, h: 72, props: { text: '页面标题', description: '添加一句清晰的页面说明', fontSize: 28, align: 'left' } },
    text: { ...common, name: '文本', w: 360, h: 64, props: { text: '在这里输入一段说明文字。', fontSize: 14, align: 'left' } },
    button: { ...common, name: '按钮', w: 144, h: 44, props: { text: '确认操作', variant: 'primary', accent: '#665cf6', radius: 10 } },
    input: { ...common, name: '输入框', w: 320, h: 72, props: { text: '字段名称', placeholder: '请输入内容', radius: 9 } },
    select: { ...common, name: '下拉选择', w: 240, h: 72, props: { text: '选择类型', options: '选项一,选项二,选项三', radius: 9 } },
    table: { ...common, name: '数据表格', w: 720, h: 290, props: { columns: ['客户名称', '联系人', '状态', '更新时间'], accent: '#665cf6', radius: 12 } },
    stat: { ...common, name: '数据指标', w: 260, h: 122, props: { text: '数据指标', value: '12,860', trend: '+12.8%', accent: '#665cf6', radius: 12 } },
    image: { ...common, name: '图片', w: 360, h: 190, props: { text: '图片素材', description: '点击属性面板配置素材', radius: 12, accent: '#665cf6' } },
    divider: { ...common, name: '分割线', w: 460, h: 24, props: { accent: '#e7e8ef' } },
  }
  return clone(map[type])
}

export function createWidget(type: WidgetType, x: number, y: number, overrides: Partial<LowCodeWidget> = {}): LowCodeWidget {
  const defaults = widgetDefaults(type)
  return { id: makeId('widget'), type, x, y, ...defaults, ...overrides, props: { ...defaults.props, ...(overrides.props || {}) } }
}

export function createTemplateLayout(template: 'dashboard' | 'form' | 'blank'): PageLayout {
  const layout: PageLayout = { version: 1, pageName: '首页', canvas: { width: 960, height: 720, background: '#f7f8fb' }, widgets: [] }
  if (template === 'blank') return layout
  layout.widgets.push(createWidget('heading', 48, 42, { props: { text: template === 'form' ? '信息登记' : '业务数据概览', description: template === 'form' ? '请填写并提交以下信息' : '实时掌握关键业务指标', fontSize: 28 } }))
  if (template === 'form') {
    layout.widgets.push(
      createWidget('input', 48, 140, { props: { text: '姓名', placeholder: '请输入姓名', required: true } }),
      createWidget('input', 388, 140, { props: { text: '联系电话', placeholder: '请输入手机号码' } }),
      createWidget('select', 48, 238, { w: 320, props: { text: '业务类型', options: '咨询,建议,投诉,其他' } }),
      createWidget('button', 48, 350, { w: 160, props: { text: '提交信息', accent: '#665cf6' } }),
    )
  } else {
    layout.widgets.push(
      createWidget('stat', 48, 132, { props: { text: '本月新增', value: '2,408', trend: '+12.8%', accent: '#665cf6' } }),
      createWidget('stat', 326, 132, { props: { text: '待处理', value: '126', trend: '-3.2%', accent: '#20b486' } }),
      createWidget('stat', 604, 132, { w: 308, props: { text: '成交金额', value: '¥486,920', trend: '+8.6%', accent: '#f59e0b' } }),
      createWidget('table', 48, 286, { w: 864, props: { columns: ['业务编号', '客户名称', '金额', '状态', '更新时间'], accent: '#665cf6' } }),
    )
  }
  return layout
}

export function fallbackBootstrap(): BootstrapData {
  const stored = localStorage.getItem('codeless-projects')
  const saved = stored ? JSON.parse(stored) as LowCodeProject[] : []
  if (saved.length) return { projects: saved, activities: [], databasePath: '浏览器演示模式 · localStorage' }
  const createdAt = new Date().toISOString()
  return { projects: [{ id: 'demo_crm', name: '客户管理系统', description: '统一管理客户资料、跟进记录与销售机会', status: 'published', category: '客户运营', layout: createTemplateLayout('dashboard'), createdAt, updatedAt: createdAt }], activities: [], databasePath: '浏览器演示模式 · localStorage' }
}
