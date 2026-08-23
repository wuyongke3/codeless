import type {
  LowCodeWidget,
  WidgetColumn,
  WidgetConfig,
  WidgetOption,
  WidgetProps,
} from '../types/lowcode'

export type WidgetConfigDiagnosticSeverity = 'info' | 'warning' | 'error'

export type WidgetConfigDiagnosticCode =
  | 'legacy-migration-required'
  | 'unsupported-config-version'
  | 'missing-config-section'
  | 'invalid-config-section'
  | 'invalid-layout-value'
  | 'invalid-content-value'
  | 'invalid-data-binding'
  | 'invalid-interaction'
  | 'invalid-meta'
  | 'legacy-config-drift'

export interface WidgetConfigDiagnostic {
  code: WidgetConfigDiagnosticCode
  severity: WidgetConfigDiagnosticSeverity
  path?: string
  message: string
}

export interface WidgetConfigValidationResult {
  valid: boolean
  diagnostics: WidgetConfigDiagnostic[]
}

export type WidgetLegacyField = 'x' | 'y' | 'w' | 'h' | 'props'

export interface WidgetLegacyProjection {
  x: number
  y: number
  w: number
  h: number
  props: WidgetProps
}

export interface WidgetLegacyDriftResult {
  status: 'absent' | 'aligned' | 'drifted'
  drifted: boolean
  fields: string[]
  expected: WidgetLegacyProjection
  actual: Partial<WidgetLegacyProjection>
}

export type WidgetStorageSource = 'config' | 'legacy' | 'config+legacy' | 'empty'

export interface WidgetStorageDiagnostics {
  source: WidgetStorageSource
  configValid: boolean
  migrationRequired: boolean
  legacyPresent: boolean
  legacyDrift: WidgetLegacyDriftResult
  diagnostics: WidgetConfigDiagnostic[]
}

const LEGACY_PROP_KEYS = [
  'text',
  'description',
  'placeholder',
  'value',
  'variant',
  'options',
  'columns',
  'trend',
  'src',
  'alt',
  'accent',
  'align',
  'fontSize',
  'radius',
  'required',
  'events',
  'submitTo',
  'dataSource',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasOwn(value: unknown, key: string): boolean {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, key)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function pushDiagnostic(
  diagnostics: WidgetConfigDiagnostic[],
  code: WidgetConfigDiagnosticCode,
  severity: WidgetConfigDiagnosticSeverity,
  message: string,
  path?: string,
) {
  diagnostics.push({ code, severity, message, ...(path ? { path } : {}) })
}

export function parseOptions(value?: string): WidgetOption[] {
  return String(value || '')
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const [label, optionValue] = item.split('|').map(part => part.trim())
      return { label, value: optionValue || label }
    })
}

export function serializeOptions(options?: WidgetOption[]) {
  return (options || [])
    .map(option => option.value && option.value !== option.label ? `${option.label}|${option.value}` : option.label)
    .join('\n')
}

export function parseColumns(value?: string[] | string): WidgetColumn[] {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,]/)
  return source
    .map(item => String(item).trim())
    .filter(Boolean)
    .map(item => {
      const [key, label, width] = item.split('|').map(part => part.trim())
      return { key, label: label || key, ...(width ? { width: Number(width) || undefined } : {}) }
    })
}

export function serializeColumns(columns?: WidgetColumn[]) {
  return (columns || [])
    .map(column => `${column.key}|${column.label}${column.width ? `|${column.width}` : ''}`)
    .join('\n')
}

/**
 * 仅接受完整的 WidgetConfig v1。部分 config 会在 widgetConfig.ts 的导入边界
 * 通过 legacy + 默认值合并后再归一化，不能在编辑器运行时被当作 canonical config 直接写入。
 */
/**
 * Fast runtime guard for hot render/read paths. Deep validation is exposed separately
 * through validateWidgetConfig() so getWidgetConfig() does not allocate diagnostics
 * for every widget read.
 */
export function hasWidgetConfigShape(value: unknown): value is WidgetConfig {
  if (!isRecord(value) || value.version !== 1) return false
  return ['layout', 'content', 'style', 'data', 'validation', 'interaction', 'meta']
    .every(section => isRecord(value[section]))
}

export function validateWidgetConfig(value: unknown): WidgetConfigValidationResult {
  const diagnostics: WidgetConfigDiagnostic[] = []
  if (!isRecord(value)) {
    pushDiagnostic(diagnostics, 'invalid-config-section', 'error', 'WidgetConfig 必须是对象。', 'config')
    return { valid: false, diagnostics }
  }

  if (value.version !== 1) {
    pushDiagnostic(diagnostics, 'unsupported-config-version', 'error', '仅支持 WidgetConfig v1。', 'config.version')
  }

  const requiredSections = ['layout', 'content', 'style', 'data', 'validation', 'interaction', 'meta'] as const
  for (const section of requiredSections) {
    if (!hasOwn(value, section)) {
      pushDiagnostic(diagnostics, 'missing-config-section', 'error', `缺少 WidgetConfig.${section}。`, `config.${section}`)
    } else if (!isRecord(value[section])) {
      pushDiagnostic(diagnostics, 'invalid-config-section', 'error', `WidgetConfig.${section} 必须是对象。`, `config.${section}`)
    }
  }

  const layout = value.layout
  if (isRecord(layout)) {
    for (const key of ['x', 'y', 'width', 'height', 'rotation', 'zIndex'] as const) {
      if (!isFiniteNumber(layout[key])) {
        pushDiagnostic(diagnostics, 'invalid-layout-value', 'error', `WidgetConfig.layout.${key} 必须是有限数字。`, `config.layout.${key}`)
      }
    }
    for (const key of ['locked', 'hidden'] as const) {
      if (typeof layout[key] !== 'boolean') {
        pushDiagnostic(diagnostics, 'invalid-layout-value', 'error', `WidgetConfig.layout.${key} 必须是布尔值。`, `config.layout.${key}`)
      }
    }
  }

  const content = value.content
  if (isRecord(content)) {
    if (content.options !== undefined && !Array.isArray(content.options)) {
      pushDiagnostic(diagnostics, 'invalid-content-value', 'error', 'WidgetConfig.content.options 必须是数组。', 'config.content.options')
    }
    if (content.columns !== undefined && !Array.isArray(content.columns)) {
      pushDiagnostic(diagnostics, 'invalid-content-value', 'error', 'WidgetConfig.content.columns 必须是数组。', 'config.content.columns')
    }
  }

  const data = value.data
  if (isRecord(data)) {
    if (!['static', 'table', 'runtime'].includes(String(data.source))) {
      pushDiagnostic(diagnostics, 'invalid-data-binding', 'error', 'WidgetConfig.data.source 不是受支持的来源。', 'config.data.source')
    }
    if (data.fields !== undefined && !isRecord(data.fields)) {
      pushDiagnostic(diagnostics, 'invalid-data-binding', 'error', 'WidgetConfig.data.fields 必须是对象。', 'config.data.fields')
    }
    if (data.aggregate !== undefined && !isRecord(data.aggregate)) {
      pushDiagnostic(diagnostics, 'invalid-data-binding', 'error', 'WidgetConfig.data.aggregate 必须是对象。', 'config.data.aggregate')
    }
  }

  const interaction = value.interaction
  if (isRecord(interaction)) {
    if (!Array.isArray(interaction.events)) {
      pushDiagnostic(diagnostics, 'invalid-interaction', 'error', 'WidgetConfig.interaction.events 必须是数组。', 'config.interaction.events')
    }
    if (interaction.rowEvents !== undefined && !Array.isArray(interaction.rowEvents)) {
      pushDiagnostic(diagnostics, 'invalid-interaction', 'error', 'WidgetConfig.interaction.rowEvents 必须是数组。', 'config.interaction.rowEvents')
    }
  }

  const meta = value.meta
  if (isRecord(meta)) {
    if (meta.version !== 1) {
      pushDiagnostic(diagnostics, 'invalid-meta', 'error', 'WidgetConfig.meta.version 必须为 1。', 'config.meta.version')
    }
    for (const key of ['createdAt', 'updatedAt'] as const) {
      if (typeof meta[key] !== 'string' || !meta[key]) {
        pushDiagnostic(diagnostics, 'invalid-meta', 'error', `WidgetConfig.meta.${key} 必须是非空字符串。`, `config.meta.${key}`)
      }
    }
  }

  return { valid: diagnostics.every(item => item.severity !== 'error'), diagnostics }
}

export function projectWidgetConfigToLegacy(config: WidgetConfig): WidgetLegacyProjection {
  const content = config.content || {}
  const style = config.style || {}
  const data = config.data || { source: 'static' as const }
  const dataColumns = Object.values(data.fields || {}).filter(Boolean)

  return {
    x: config.layout.x,
    y: config.layout.y,
    w: config.layout.width,
    h: config.layout.height,
    props: {
      text: content.text ?? content.label,
      description: content.description,
      placeholder: content.placeholder,
      value: String(content.value ?? content.defaultValue ?? ''),
      variant: content.variant,
      options: serializeOptions(content.options),
      columns: (content.columns || []).map(column => column.label),
      trend: content.trend,
      src: content.src,
      alt: content.alt,
      accent: style.accent,
      align: style.textAlign,
      fontSize: style.fontSize,
      radius: style.borderRadius,
      required: config.validation.required,
      events: config.interaction.events,
      submitTo: config.submitTo ? { ...config.submitTo } : undefined,
      dataSource: data.source === 'table' && data.table
        ? {
            table: data.table,
            mode: data.mode || 'list',
            columns: dataColumns.length ? dataColumns : undefined,
            where: data.where,
            orderBy: data.orderBy,
            limit: data.limit,
          }
        : undefined,
    },
  }
}

function equivalent(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left === 'number' && typeof right === 'number') return Number.isNaN(left) && Number.isNaN(right)
  if (left === undefined || right === undefined) return left === right
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equivalent(value, right[index]))
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
      if (!equivalent(left[key], right[key])) return false
    }
    return true
  }
  return false
}

function legacyPropsDrift(actual: WidgetProps | undefined, expected: WidgetProps): string[] {
  const fields: string[] = []
  for (const key of LEGACY_PROP_KEYS) {
    // A missing legacy property is normal for older payloads. Drift means both
    // sides carry a value but the compatibility projection no longer agrees.
    if (hasOwn(actual, key) && !equivalent(actual?.[key], expected[key])) fields.push(`props.${key}`)
  }
  return fields
}

export function detectLegacyWidgetDrift(widget: LowCodeWidget): WidgetLegacyDriftResult {
  const config = widget.config
  if (!hasWidgetConfigShape(config)) {
    return {
      status: 'absent',
      drifted: false,
      fields: [],
      expected: { x: 0, y: 0, w: 0, h: 0, props: {} },
      actual: {},
    }
  }

  const expected = projectWidgetConfigToLegacy(config)
  const legacyPresent = (['x', 'y', 'w', 'h', 'props'] as WidgetLegacyField[]).some(field => hasOwn(widget, field))
  if (!legacyPresent) {
    return { status: 'absent', drifted: false, fields: [], expected, actual: {} }
  }

  const actual: Partial<WidgetLegacyProjection> = {
    ...(hasOwn(widget, 'x') ? { x: widget.x } : {}),
    ...(hasOwn(widget, 'y') ? { y: widget.y } : {}),
    ...(hasOwn(widget, 'w') ? { w: widget.w } : {}),
    ...(hasOwn(widget, 'h') ? { h: widget.h } : {}),
    ...(hasOwn(widget, 'props') ? { props: widget.props } : {}),
  }
  const fields: string[] = []
  for (const field of ['x', 'y', 'w', 'h'] as const) {
    if (hasOwn(widget, field) && !equivalent(widget[field], expected[field])) fields.push(field)
  }
  if (hasOwn(widget, 'props')) fields.push(...legacyPropsDrift(widget.props, expected.props))

  return {
    status: fields.length ? 'drifted' : 'aligned',
    drifted: fields.length > 0,
    fields,
    expected,
    actual,
  }
}

export function diagnoseWidgetStorage(widget: LowCodeWidget): WidgetStorageDiagnostics {
  const configPresent = hasOwn(widget, 'config') && widget.config !== undefined
  const configValidation = configPresent ? validateWidgetConfig(widget.config) : { valid: false, diagnostics: [] }
  const legacyPresent = (['x', 'y', 'w', 'h', 'props'] as WidgetLegacyField[]).some(field => hasOwn(widget, field))
  const legacyDrift = detectLegacyWidgetDrift(widget)
  const diagnostics = [...configValidation.diagnostics]

  if (!configValidation.valid) {
    if (legacyPresent) {
      pushDiagnostic(diagnostics, 'legacy-migration-required', 'warning', '该组件需要在导入/归一化边界迁移为 WidgetConfig v1。', 'config')
    } else if (!configPresent) {
      pushDiagnostic(diagnostics, 'legacy-migration-required', 'error', '组件既没有完整 WidgetConfig，也没有可迁移的 legacy 字段。', 'widget')
    }
  }
  if (legacyDrift.drifted) {
    pushDiagnostic(diagnostics, 'legacy-config-drift', 'warning', `legacy 字段与 WidgetConfig 不一致：${legacyDrift.fields.join(', ')}。`, 'widget')
  }

  const source: WidgetStorageSource = configValidation.valid
    ? legacyPresent ? 'config+legacy' : 'config'
    : legacyPresent ? 'legacy' : 'empty'
  return {
    source,
    configValid: configValidation.valid,
    migrationRequired: !configValidation.valid && legacyPresent,
    legacyPresent,
    legacyDrift,
    diagnostics,
  }
}
