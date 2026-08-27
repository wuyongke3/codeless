import type { BootstrapData, LowCodePage, LowCodeProject, LowCodeWidget, PageLayout, WidgetEventActionType, WidgetEventType, WidgetProps, WidgetType } from '../types/lowcode'
import { widgetDefinitions, widgetDefinitionMap, type PaletteItem } from '../components/registry/widgetRegistry'
import { normalizeProject, normalizeWidget } from './widgetConfig'

export type Area = 'workspace' | 'builder' | 'data' | 'flows' | 'activity' | 'plugins'

export const navItems: Array<{ id: Area; label: string; icon: string }> = [
  { id: 'workspace', label: '应用工作台', icon: 'home' },
  { id: 'builder', label: '页面设计', icon: 'apps' },
  { id: 'data', label: '数据模型', icon: 'database' },
  { id: 'flows', label: '自动化流程', icon: 'flow' },
  { id: 'activity', label: '运行日志', icon: 'activity' },
  { id: 'plugins', label: '本地插件', icon: 'puzzle' },
]

export const widgetEventTypeLabels: Record<WidgetEventType, string> = {
  click: '点击时',
  change: '值变化时',
  submit: '提交时',
  rowClick: '行点击时',
  beforeOpen: '打开前',
  open: '打开后',
  beforeClose: '关闭前',
  close: '关闭后',
  confirm: '点击确定',
  cancel: '点击取消',
}

export const widgetEventActionLabels: Record<WidgetEventActionType, string> = {
  navigate: '页面导航',
  setValue: '设置组件值',
  submitData: '提交数据',
  tableQuery: '刷新表格数据',
  tableCreate: '新增表格记录',
  tableUpdate: '更新选中记录',
  tableDelete: '删除选中记录',
  showToast: '显示提示',
  navigateBack: '返回上一页',
  setRouteState: '设置路由状态',
  emitPageEvent: '发送页面事件',
  showModal: '打开弹窗',
  hideModal: '关闭弹窗',
  showLoading: '显示 Loading',
  hideLoading: '隐藏 Loading',
}

export function eventOptionsForWidget(type: WidgetType) {
  return widgetDefinitionMap[type].supportedEvents.map(value => ({ value, label: widgetEventTypeLabels[value] }))
}

export const paletteGroups: Array<{ name: string; items: PaletteItem[] }> = widgetDefinitions.reduce<Array<{ name: string; items: PaletteItem[] }>>((groups, item) => {
  const group = groups.find(value => value.name === item.group)
  const paletteItem = { type: item.type, name: item.name, description: item.description, icon: item.icon }
  if (group) group.items.push(paletteItem)
  else groups.push({ name: item.group, items: [paletteItem] })
  return groups
}, [])

export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
export function makeId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

export function widgetDefaults(type: WidgetType): Omit<LowCodeWidget, 'id' | 'type' | 'x' | 'y'> {
  const common = { name: widgetDefinitionMap[type].name, w: 240, h: 60, props: {} as WidgetProps }
  const map: Partial<Record<WidgetType, Omit<LowCodeWidget, 'id' | 'type' | 'x' | 'y'>>> = {
    heading: { ...common, name: '页面标题', w: 420, h: 72, props: { text: '页面标题', description: '添加一句清晰的页面说明', fontSize: 28, align: 'left' } },
    text: { ...common, name: '文本', w: 360, h: 64, props: { text: '在这里输入一段说明文字。', fontSize: 14, align: 'left' } },
    button: { ...common, name: '按钮', w: 144, h: 44, props: { text: '确认操作', variant: 'primary', accent: '#665cf6', radius: 10 } },
    input: { ...common, name: '输入框', w: 320, h: 72, props: { text: '字段名称', placeholder: '请输入内容', radius: 9 } },
    select: { ...common, name: '下拉选择', w: 240, h: 72, props: { text: '选择类型', options: '选项一|option-1\n选项二|option-2\n选项三|option-3', radius: 9 } },
    table: { ...common, name: '数据表格', w: 720, h: 290, props: { columns: ['客户名称', '联系人', '状态', '更新时间'], accent: '#665cf6', radius: 12 } },
    stat: { ...common, name: '数据指标', w: 260, h: 122, props: { text: '数据指标', value: '12,860', trend: '+12.8%', accent: '#665cf6', radius: 12 } },
    image: { ...common, name: '图片', w: 360, h: 190, props: { text: '图片素材', description: '配置图片地址后将在预览中显示', radius: 12, accent: '#665cf6' } },
    divider: { ...common, name: '分割线', w: 460, h: 24, props: { accent: '#e7e8ef' } },
    modal: { ...common, name: '弹窗', w: 360, h: 210, props: { text: '确认操作', description: '请确认是否继续执行当前操作', accent: '#665cf6', radius: 14 } },
    loading: { ...common, name: 'Loading', w: 240, h: 88, props: { text: '正在加载…', accent: '#665cf6', radius: 12 } },
    badge: { ...common, name: 'badge', w: 72, h: 32, props: { text: '8', accent: '#f56c6c', radius: 999 } },
    tag: { ...common, name: 'tag', w: 112, h: 32, props: { text: 'tag', accent: '#665cf6', radius: 6 } },
    alert: { ...common, name: 'alert', w: 360, h: 76, props: { text: 'alert', description: 'attention', accent: '#409eff', radius: 8 } },
    progress: { ...common, name: 'progress', w: 280, h: 48, props: { text: 'progress', accent: '#665cf6', radius: 999 } },
    switch: { ...common, name: 'switch', w: 180, h: 40, props: { text: 'switch', accent: '#665cf6', radius: 999 } },
    checkbox: { ...common, name: 'checkbox', w: 180, h: 40, props: { text: 'checkbox', accent: '#665cf6', radius: 5 } },
    radio: { ...common, name: 'radio', w: 210, h: 62, props: { text: 'radio', accent: '#665cf6' } },
    datePicker: { ...common, name: 'datePicker', w: 240, h: 72, props: { text: 'datePicker', placeholder: 'Select date', accent: '#665cf6', radius: 8 } },
    pagination: { ...common, name: 'pagination', w: 300, h: 44, props: { accent: '#665cf6', radius: 6 } },
    breadcrumb: { ...common, name: 'breadcrumb', w: 300, h: 36, props: { accent: '#665cf6' } },
    tabs: { ...common, name: 'tabs', w: 360, h: 180, props: { accent: '#665cf6', radius: 8 } },
    collapse: { ...common, name: 'collapse', w: 320, h: 150, props: { accent: '#665cf6', radius: 8 } },
    avatar: { ...common, name: 'avatar', w: 56, h: 56, props: { text: 'U', accent: '#665cf6', radius: 999 } },
    icon: { ...common, name: 'icon', w: 56, h: 56, props: { accent: '#665cf6' } },
    link: { ...common, name: 'link', w: 150, h: 32, props: { text: 'View details', accent: '#665cf6' } },
    tooltip: { ...common, name: 'tooltip', w: 160, h: 40, props: { text: 'Hover me', accent: '#665cf6' } },
    spacer: { ...common, name: 'spacer', w: 120, h: 32, props: {} },
  }
  return clone(map[type] || common)
}

export function createWidget(type: WidgetType, x: number, y: number, overrides: Partial<LowCodeWidget> = {}): LowCodeWidget {
  const defaults = widgetDefaults(type)
  const widget: LowCodeWidget = {
    id: makeId('widget'),
    type,
    x,
    y,
    ...defaults,
    ...overrides,
    props: { ...defaults.props, ...(overrides.props || {}) },
  }
  return normalizeWidget(widget)
}

export function createTemplateLayout(template: 'dashboard' | 'form' | 'blank'): PageLayout {
  const layout: PageLayout = { version: 2, pageName: '首页', canvas: { width: 960, height: 720, background: '#f7f8fb' }, widgets: [] }
  if (template === 'blank') return layout
  layout.widgets.push(createWidget('heading', 48, 42, { props: { text: template === 'form' ? '信息登记' : '业务数据概览', description: template === 'form' ? '请填写并提交以下信息' : '实时掌握关键业务指标', fontSize: 28 } }))
  if (template === 'form') {
    layout.widgets.push(
      createWidget('input', 48, 140, { props: { text: '姓名', placeholder: '请输入姓名', required: true } }),
      createWidget('input', 388, 140, { props: { text: '联系电话', placeholder: '请输入手机号码' } }),
      createWidget('select', 48, 238, { w: 320, props: { text: '业务类型', options: '咨询|咨询\n建议|建议\n投诉|投诉\n其他|其他' } }),
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

export function pageId(projectId: string, suffix = 'index') {
  return `${projectId}_page_${suffix.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

export function normalizePage(page: LowCodePage): LowCodePage {
  page.layout = normalizeProjectLayout(page.layout)
  page.name = page.name || page.layout.pageName || '未命名页面'
  page.path = page.path || '/index'
  return page
}

function normalizeProjectLayout(layout: PageLayout) {
  layout.widgets = (layout.widgets || []).map(widget => normalizeWidget(widget))
  layout.version = Math.max(2, layout.version || 1)
  return layout
}

export function syncProjectPages(project: LowCodeProject) {
  if (!project.pages?.length) {
    const id = pageId(project.id)
    project.pages = [{ id, name: project.layout.pageName || '首页', path: '/index', layout: project.layout, guards: [] }]
    project.entryPageId = project.entryPageId || id
    project.currentPageId = project.currentPageId || id
  }
  project.pages = project.pages.map(normalizePage)
  const currentId = project.currentPageId || project.entryPageId || project.pages[0].id
  const currentPage = project.pages.find(page => page.id === currentId) || project.pages[0]
  project.currentPageId = currentPage.id
  project.entryPageId = project.entryPageId || project.pages[0].id
  project.layout = currentPage.layout
  project.routes = project.routes?.length
    ? project.routes.map(route => ({ ...route, path: route.path || '/index' }))
    : project.pages.map(page => ({ id: `route_${page.id}`, path: page.path, pageId: page.id, title: page.name, guards: [] }))
  return project
}

export function activateProjectPage(project: LowCodeProject, pageIdValue: string) {
  syncProjectPages(project)
  const page = project.pages?.find(item => item.id === pageIdValue)
  if (!page) return false
  const currentPage = project.pages?.find(item => item.id === project.currentPageId)
  if (currentPage) currentPage.layout = project.layout
  project.currentPageId = page.id
  project.layout = page.layout
  return true
}

export function addProjectPage(project: LowCodeProject, page: LowCodePage) {
  syncProjectPages(project)
  const currentPage = project.pages?.find(item => item.id === project.currentPageId)
  if (currentPage) currentPage.layout = project.layout
  project.pages!.push(normalizePage(page))
  project.currentPageId = page.id
  project.layout = page.layout
  project.routes = project.routes || []
  project.routes.push({ id: `route_${page.id}`, path: page.path, pageId: page.id, title: page.name, guards: [] })
  return project
}

export function fallbackBootstrap(): BootstrapData {
  let saved: LowCodeProject[] = []
  try {
    const stored = localStorage.getItem('codeless-projects')
    saved = stored ? (JSON.parse(stored) as LowCodeProject[]).map(normalizeProject) : []
  } catch {
    saved = []
  }
  if (saved.length) return { projects: saved, activities: [], databasePath: '浏览器演示模式 · localStorage' }
  const createdAt = new Date().toISOString()
  return {
    projects: [{ id: 'demo_crm', name: '客户管理系统', description: '统一管理客户资料、跟进记录与销售机会', status: 'published' as const, category: '客户运营', layout: createTemplateLayout('dashboard'), createdAt, updatedAt: createdAt }].map(normalizeProject),
    activities: [],
    databasePath: '浏览器演示模式 · localStorage',
  }
}
