import type {
  LowCodePage,
  LowCodeProject,
  LowCodeWidget,
  PageLayout,
  SubmitTargetConfig,
  DesignSystem,
  WidgetConfig,
  WidgetDataBinding,
  WidgetEvent,
  WidgetProps,
  WidgetType,
} from '../types/lowcode'
import { normalizeDesignSystem, resolveDesignToken } from './designSystem'
import {
  hasWidgetConfigShape,
  parseColumns,
  parseOptions,
} from './widgetConfigMigration'

export {
  detectLegacyWidgetDrift,
  diagnoseWidgetStorage,
  hasWidgetConfigShape,
  parseColumns,
  parseOptions,
  projectWidgetConfigToLegacy,
  serializeColumns,
  serializeOptions,
  validateWidgetConfig,
} from './widgetConfigMigration'

const now = () => new Date().toISOString()

const buttonVariants: NonNullable<WidgetConfig['variants']> = {
  primary: { content: { variant: 'primary' }, style: { accent: '#665cf6' } },
  secondary: { content: { variant: 'secondary' }, style: { accent: '#687084', background: '#f1f2f6' } },
  outline: { content: { variant: 'outline' }, style: { accent: '#665cf6', background: '#ffffff', borderColor: '#665cf6' } },
}

const componentDefaults: Partial<Record<WidgetType, { content?: WidgetConfig['content']; style?: WidgetConfig['style'] }>> = {
  button: { content: { text: '提交', variant: 'primary', disabled: false, loading: false }, style: { accent: '#665cf6', borderRadius: 10 } },
  input: { content: { label: '输入内容', placeholder: '请输入内容', valueType: 'text', defaultValue: '', disabled: false, readOnly: false }, style: { borderRadius: 9 } },
  select: { content: { label: '选择项目', placeholder: '请选择', defaultValue: '', disabled: false, options: [{ label: '选项一', value: 'option-1' }, { label: '选项二', value: 'option-2' }] }, style: { borderRadius: 9 } },
  table: { content: { columns: [{ key: 'name', label: '名称', width: 180 }, { key: 'owner', label: '负责人' }, { key: 'status', label: '状态' }, { key: 'updatedAt', label: '更新时间' }], emptyText: '暂无数据', showIndex: false }, style: { accent: '#665cf6', borderRadius: 12 } },
  badge: { content: { text: '8', value: '8', max: 99, showZero: true }, style: { accent: '#f56c6c', borderRadius: 999 } },
  tag: { content: { text: '标签', tone: 'primary', closable: false }, style: { accent: '#665cf6', borderRadius: 6 } },
  alert: { content: { title: '提示信息', description: '这里是一段需要关注的说明文字。', tone: 'info', closable: false }, style: { accent: '#409eff', borderRadius: 8 } },
  progress: { content: { percentage: 68, status: 'normal', showText: true }, style: { accent: '#665cf6', borderRadius: 999 } },
  switch: { content: { label: '启用状态', defaultValue: true, value: true, activeText: '开启', inactiveText: '关闭' }, style: { accent: '#665cf6', borderRadius: 999 } },
  checkbox: { content: { label: '选项', defaultValue: false, value: false, options: [] }, style: { accent: '#665cf6', borderRadius: 5 } },
  radio: { content: { label: '选择一项', defaultValue: '', value: '', options: [{ label: '选项一', value: 'option-1' }, { label: '选项二', value: 'option-2' }] }, style: { accent: '#665cf6' } },
  datePicker: { content: { label: '日期', valueType: 'date', placeholder: '请选择日期' }, style: { accent: '#665cf6', borderRadius: 8 } },
  pagination: { content: { total: 68, pageSize: 10, currentPage: 1 }, style: { accent: '#665cf6', borderRadius: 6 } },
  breadcrumb: { content: { options: [{ label: '首页', value: '/' }, { label: '工作台', value: '/dashboard' }, { label: '当前页面', value: '/current' }], separator: '/' }, style: { accent: '#665cf6' } },
  tabs: { content: { options: [{ label: '概览', value: 'overview' }, { label: '详情', value: 'detail' }, { label: '设置', value: 'settings' }], activeKey: 'overview' }, style: { accent: '#665cf6', borderRadius: 8 } },
  collapse: { content: { options: [{ label: '基础信息', value: 'base' }, { label: '更多设置', value: 'more' }], expanded: true }, style: { accent: '#665cf6', borderRadius: 8 } },
  avatar: { content: { text: '用户', shape: 'circle' }, style: { accent: '#665cf6', borderRadius: 999 } },
  icon: { content: { iconName: 'sparkle', text: '' }, style: { accent: '#665cf6' } },
  link: { content: { text: '查看详情', href: '#', target: '_self' }, style: { accent: '#665cf6' } },
  tooltip: { content: { text: '悬停查看说明', title: '这是一个文字提示', placement: 'top' }, style: { accent: '#665cf6' } },
  card: { content: { title: '卡片标题', description: '卡片内容可以通过拖拽组件继续搭建。' }, style: { background: '#ffffff', padding: 16, borderRadius: 12, shadow: true } },
  frame: { content: { title: 'Frame' }, style: { background: '#ffffff', padding: 16, borderRadius: 8 } },
  stack: { content: { title: '自动布局', direction: 'column' }, style: { background: '#ffffff', padding: 16, gap: 12, borderRadius: 10 } },
  grid: { content: { title: '网格容器', columnsCount: 2 }, style: { background: '#ffffff', padding: 16, gap: 12, borderRadius: 10 } },
  spacer: { content: { flex: false }, style: { background: 'transparent' } },
  drawer: { content: { title: '抽屉标题', description: '抽屉内容可以继续拖入组件。', placement: 'right', visible: false, closeOnOverlay: true }, style: { background: '#ffffff', padding: 16, borderRadius: 12, shadow: true } },
}

function legacyData(props: WidgetProps): WidgetDataBinding {
  const dataSource = props.dataSource
  if (!dataSource?.table) return { source: 'static' }
  return {
    source: 'table',
    table: dataSource.table,
    mode: dataSource.mode || 'list',
    where: dataSource.where,
    orderBy: dataSource.orderBy,
    limit: dataSource.limit,
    fields: dataSource.columns?.reduce<Record<string, string>>((result, value, index) => {
      result[String(index)] = value
      return result
    }, {}),
  }
}

function finiteOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positiveDimension(value: unknown, fallback: number) {
  return Math.max(24, finiteOr(value, fallback))
}

export function createWidgetConfig(type: WidgetType, x: number, y: number, w: number, h: number, props: WidgetProps = {}): WidgetConfig {
  const createdAt = now()
  const content: WidgetConfig['content'] = {
    text: props.text,
    description: props.description,
    label: props.text,
    placeholder: props.placeholder,
    defaultValue: props.value,
    value: props.value,
    variant: props.variant,
    options: parseOptions(props.options),
    columns: parseColumns(props.columns),
    trend: props.trend,
    src: props.src,
    alt: props.alt || props.text,
    title: type === 'modal' ? (props.text || '确认操作') : undefined,
    visible: type === 'modal' || type === 'loading' ? false : undefined,
    confirmText: type === 'modal' ? '确定' : undefined,
    cancelText: type === 'modal' ? '取消' : undefined,
    closeOnOverlay: type === 'modal' || type === 'drawer' ? true : undefined,
    loadingVariant: type === 'loading' ? 'spinner' : undefined,
  }
  const defaults = componentDefaults[type]
  if (defaults?.content) Object.entries(defaults.content).forEach(([key, value]) => {
    const contentRecord = content as Record<string, unknown>
    if (contentRecord[key] === undefined || (Array.isArray(contentRecord[key]) && !contentRecord[key]?.length)) contentRecord[key] = value
  })
  const styleDefaults = defaults?.style || {}
  const style: WidgetConfig['style'] = {
    accent: props.accent,
    color: undefined,
    borderRadius: props.radius,
    fontSize: props.fontSize,
    textAlign: props.align,
    ...styleDefaults,
  }
  if (props.accent) style.accent = props.accent
  if (props.radius !== undefined) style.borderRadius = props.radius
  if (props.fontSize !== undefined) style.fontSize = props.fontSize
  if (props.align) style.textAlign = props.align
  return {
    version: 1,
    layout: { x: finiteOr(x, 0), y: finiteOr(y, 0), width: positiveDimension(w, 24), height: positiveDimension(h, 24), rotation: 0, zIndex: 1, locked: false, hidden: false },
    content,
    style,
    variant: type === 'button' ? (props.variant || 'primary') : undefined,
    variants: type === 'button' ? buttonVariants : undefined,
    data: legacyData(props),
    validation: { required: props.required },
    interaction: { events: props.events ? [...props.events] : [] },
    submitTo: props.submitTo ? { ...props.submitTo } : undefined,
    meta: { version: 1, createdAt, updatedAt: createdAt },
  }
}

function mergeConfig(widget: LowCodeWidget, config?: WidgetConfig): WidgetConfig {
  const fallback = createWidgetConfig(
    widget.type,
    finiteOr(widget.x, 0),
    finiteOr(widget.y, 0),
    positiveDimension(widget.w, 24),
    positiveDimension(widget.h, 24),
    widget.props || {},
  )
  if (!config) return fallback
  return {
    ...fallback,
    ...config,
    layout: { ...fallback.layout, ...(config.layout || {}) },
    content: { ...fallback.content, ...(config.content || {}) },
    style: { ...fallback.style, ...(config.style || {}) },
    data: { ...fallback.data, ...(config.data || {}) },
    validation: { ...fallback.validation, ...(config.validation || {}) },
    interaction: {
      ...fallback.interaction,
      ...(config.interaction || {}),
      events: config.interaction?.events || fallback.interaction.events,
    },
    meta: { ...fallback.meta, ...(config.meta || {}) },
    variants: config.variants || fallback.variants,
    variant: config.variant || fallback.variant,
  }
}

/** 将历史扁平 props 迁移成统一协议，并保持旧字段可读。该函数是幂等的，可在加载、复制和保存前重复调用。 */
function ensureWidgetConfigShape(config: WidgetConfig, type?: WidgetType): WidgetConfig {
  config.layout.x = finiteOr(config.layout.x, 0)
  config.layout.y = finiteOr(config.layout.y, 0)
  config.layout.width = positiveDimension(config.layout.width, 24)
  config.layout.height = positiveDimension(config.layout.height, 24)
  config.layout.rotation = finiteOr(config.layout.rotation, 0)
  config.layout.zIndex = finiteOr(config.layout.zIndex, 1)
  config.layout.locked = typeof config.layout.locked === 'boolean' ? config.layout.locked : false
  config.layout.hidden = typeof config.layout.hidden === 'boolean' ? config.layout.hidden : false
  config.content.options = Array.isArray(config.content.options) ? config.content.options : []
  if (!config.variant && config.content.variant) config.variant = config.content.variant
  if (config.variant && !config.content.variant) config.content.variant = config.variant
  if (type === 'button' && config.variant === 'primary' && !config.variants && config.content.text !== undefined) config.variants = buttonVariants
  config.content.columns = Array.isArray(config.content.columns) ? config.content.columns : []
  config.interaction.events = Array.isArray(config.interaction.events) ? config.interaction.events : []
  // HTML color inputs reject empty/invalid values. Legacy widgets may not have
  // an accent at all, so normalize it once while preserving valid design values.
  if (!/^#[0-9a-f]{6}$/i.test(String(config.style.accent || ''))) config.style.accent = '#665cf6'
  if (config.data.mode === 'aggregate' && !['count', 'sum', 'avg', 'min', 'max'].includes(config.data.aggregate?.function || '')) {
    config.data.aggregate = { function: 'count', field: config.data.aggregate?.field }
  }
  return config
}
export function normalizeWidget(widget: LowCodeWidget): LowCodeWidget {
  // Once a widget has been normalized, keep its config object identity stable.
  // Rendering code calls getWidgetConfig() frequently; replacing config on each
  // read would invalidate Vue's reactive tree forever.
  const config = hasWidgetConfigShape(widget.config)
    ? ensureWidgetConfigShape(widget.config, widget.type)
    : ensureWidgetConfigShape(mergeConfig(widget, widget.config), widget.type)
  if (widget.config !== config) widget.config = config
  // WidgetConfig v1 is canonical. Legacy x/y/w/h/props remain readable for compatibility,
  // but normalization never projects config changes back into those fields.
  return widget
}

export function isContainerType(type: LowCodeWidget['type']) {
  return ['modal', 'loading', 'card', 'frame', 'stack', 'grid', 'drawer'].includes(type)
}

function normalizeParentRelations(layout: PageLayout) {
  const byId = new Map(layout.widgets.map(widget => [widget.id, widget]))
  layout.widgets.forEach(widget => {
    if (!widget.parentId) return
    const parent = byId.get(widget.parentId)
    if (!parent || parent.id === widget.id || !isContainerType(parent.type)) {
      delete widget.parentId
      return
    }
    const seen = new Set<string>([widget.id])
    let cursor: LowCodeWidget | undefined = parent
    while (cursor?.parentId) {
      if (seen.has(cursor.parentId)) {
        delete widget.parentId
        break
      }
      seen.add(cursor.parentId)
      cursor = byId.get(cursor.parentId)
    }
  })
}

export function normalizeProject(project: LowCodeProject): LowCodeProject {
  project.designSystem = normalizeDesignSystem(project.designSystem)
  const normalizePageLayout = (layout: PageLayout) => {
    layout.widgets = (layout.widgets || []).map(widget => normalizeWidget(widget))
    normalizeParentRelations(layout)
    layout.version = Math.max(2, layout.version || 1)
    layout.pageName = layout.pageName || '首页'
    layout.canvas = {
      width: Number(layout.canvas?.width) || 960,
      height: Number(layout.canvas?.height) || 720,
      background: layout.canvas?.background || '#f7f8fb',
    }
    return layout
  }

  normalizePageLayout(project.layout)

  if (!project.pages?.length) {
    const id = project.id + '_page_index'
    project.pages = [{
      id,
      name: project.layout.pageName || '首页',
      path: '/index',
      layout: project.layout,
      guards: [],
    } satisfies LowCodePage]
    project.entryPageId = id
    project.currentPageId = id
  }

  project.pages = project.pages.map(page => {
    page.layout = normalizePageLayout(page.layout)
    page.name = page.name || page.layout.pageName || '未命名页面'
    page.path = page.path || '/index'
    page.guards = Array.isArray(page.guards) ? page.guards : []
    return page
  })

  const currentId = project.currentPageId || project.entryPageId || project.pages[0].id
  const currentPage = project.pages.find(page => page.id === currentId) || project.pages[0]
  project.currentPageId = currentPage.id
  project.entryPageId = project.entryPageId || project.pages[0].id
  project.layout = currentPage.layout
  project.routes = project.routes?.length
    ? project.routes.map(route => ({ ...route, path: route.path || '/index', guards: Array.isArray(route.guards) ? route.guards : [] }))
    : project.pages.map(page => ({ id: 'route_' + page.id, path: page.path, pageId: page.id, title: page.name, guards: [] }))
  return project
}

/**
 * @deprecated WidgetConfig v1 是唯一的组件配置来源；请使用它代替旧版 props。
 * 旧版 config 会映射到 legacy 的 x/y/w/h/props，供历史数据兼容使用。
 */
export function syncLegacyProps(widget: LowCodeWidget) {
  if (!hasWidgetConfigShape(widget.config)) normalizeWidget(widget)
}


export function getWidgetConfig(widget: LowCodeWidget): WidgetConfig {
  // Do not normalize an already-shaped widget during render. normalizeWidget()
  // mutates the widget for legacy compatibility, and doing that from a render
  // computed/watchEffect causes an endless Vue update loop.
  return hasWidgetConfigShape(widget.config) ? widget.config : normalizeWidget(widget).config!
}

export function resolveWidgetConfig(widget: LowCodeWidget, designSystem?: DesignSystem): WidgetConfig {
  const base = getWidgetConfig(widget)
  const variantName = base.variant || base.content.variant
  const variant = variantName ? base.variants?.[variantName] : undefined
  const content = { ...base.content, ...(variant?.content || {}) }
  const style = {
    ...base.style,
    ...(variant?.style || {}),
    tokenRefs: { ...(base.style.tokenRefs || {}), ...(variant?.style?.tokenRefs || {}) },
  } as WidgetConfig['style']
  const tokenRefs = style.tokenRefs || {}
  for (const [key, reference] of Object.entries(tokenRefs)) {
    const token = resolveDesignToken(designSystem, reference)
    if (token === undefined) continue
    if (['borderRadius', 'fontSize', 'padding', 'gap'].includes(key)) {
      const numeric = Number(token)
      if (Number.isFinite(numeric)) (style as Record<string, unknown>)[key] = numeric
    } else if (key === 'shadow') {
      style.shadow = String(token)
    } else {
      (style as Record<string, unknown>)[key] = String(token)
    }
  }
  return { ...base, variant: variantName, content, style }
}

export function setWidgetFrame(widget: LowCodeWidget, patch: Partial<Pick<WidgetConfig['layout'], 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex' | 'locked' | 'hidden'>>) {
  const config = getWidgetConfig(widget)
  Object.assign(config.layout, patch)
  config.meta.updatedAt = now()
}

export function setWidgetConfigValue(widget: LowCodeWidget, path: string, value: unknown) {
  const parts = path.split('.').map(part => part.trim()).filter(Boolean)
  if (!parts.length || ['x', 'y', 'w', 'h', 'props'].includes(parts[0])) return
  const config = getWidgetConfig(widget) as unknown as Record<string, unknown>
  let target: Record<string, unknown> = config
  parts.slice(0, -1).forEach(part => {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {}
    target = target[part] as Record<string, unknown>
  })
  target[parts[parts.length - 1]] = value
  config.meta && typeof config.meta === 'object' && ((config.meta as { updatedAt?: string }).updatedAt = now())
}

export function getWidgetFieldValue(widget: LowCodeWidget, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = getWidgetConfig(widget)
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function getWidgetEvents(widget: LowCodeWidget): WidgetEvent[] {
  return getWidgetConfig(widget).interaction.events
}

export function normalizeLayout(layout: PageLayout) {
  layout.widgets.forEach(normalizeWidget)
  return layout
}

