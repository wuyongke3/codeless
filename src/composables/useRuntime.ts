import { reactive, type ComputedRef } from 'vue'
import type { LowCodeProject, LowCodeWidget, WidgetEventAction, WidgetEventType } from '../types/lowcode'
import { getWidgetConfig, getWidgetEvents } from './widgetConfig'

export interface RuntimeEventPayload {
  value?: string
  row?: Record<string, unknown>
  index?: number
}

interface RuntimeOptions {
  currentProject: ComputedRef<LowCodeProject | undefined>
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  submitData: (table: string, values: Record<string, unknown>) => Promise<boolean>
  executeTableMutation: (
    operation: 'create' | 'update' | 'delete',
    table: string,
    values: Record<string, unknown>,
    selectedRow?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ) => Promise<boolean>
  navigate: (target: string) => boolean | void | Promise<boolean | void>
  navigateBack?: () => void | Promise<boolean | void>
  setRouteState?: (target: string | Record<string, unknown>, value?: unknown) => void
  emitPageEvent?: (event: string, payload?: unknown) => void
}

function resolveValue(value: string | undefined, payload: RuntimeEventPayload, values: Record<string, unknown>) {
  if (!value) return ''
  return value.replace(/{{\s*([^}]+)\s*}}/g, (_match, rawKey: string) => {
    const key = rawKey.trim()
    if (key === 'value') return String(payload.value ?? '')
    if (key === 'row') return JSON.stringify(payload.row || {})
    if (key.startsWith('row.')) return String(payload.row?.[key.slice(4)] ?? '')
    if (key.startsWith('form.')) return String(values[key.slice(5)] ?? '')
    return String(values[key] ?? '')
  })
}

function parseActionPayload(value: string | undefined, payload: RuntimeEventPayload, values: Record<string, unknown>) {
  const resolved = resolveValue(value, payload, values)
  if (!resolved) return undefined
  try { return JSON.parse(resolved) as unknown } catch { return resolved }
}

function appendNavigationParams(target: string, params: Record<string, unknown>) {
  const hashIndex = target.indexOf('#')
  const hash = hashIndex >= 0 ? target.slice(hashIndex) : ''
  const targetWithoutHash = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  const queryIndex = targetWithoutHash.indexOf('?')
  const pathname = queryIndex >= 0 ? targetWithoutHash.slice(0, queryIndex) : targetWithoutHash
  const searchParams = new URLSearchParams(queryIndex >= 0 ? targetWithoutHash.slice(queryIndex + 1) : '')

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  })

  const query = searchParams.toString()
  return `${pathname}${query ? `?${query}` : ''}${hash}`
}

export function useRuntime(options: RuntimeOptions) {
  const runtimeValues = reactive<Record<string, string>>({})
  // 变量绑定使用独立的运行时值池，多个输入框使用同一变量名时会自动同步。
  const runtimeVariables = reactive<Record<string, string>>({})
  const serviceVisibility = reactive<Record<string, boolean>>({})
  // 防止生命周期动作再次打开/关闭同一个服务组件时产生递归调用。
  const serviceTransitioningIds = new Set<string>()
  const tableSelections = reactive<Record<string, Record<string, unknown>>>({})
  const tableRefreshKeys = reactive<Record<string, number>>({})

  function runtimeVariableName(widget: LowCodeWidget) {
    const config = getWidgetConfig(widget)
    return config.data.source === 'runtime' ? String(config.data.field || '').trim() : ''
  }

  function getWidgetValue(widget: LowCodeWidget) {
    const config = getWidgetConfig(widget)
    const variableName = runtimeVariableName(widget)
    if (variableName && runtimeVariables[variableName] !== undefined) return runtimeVariables[variableName]
    return runtimeValues[widget.id] ?? String(config.content.value ?? config.content.defaultValue ?? '')
  }

  function updateWidgetValue(widget: LowCodeWidget, value: string) {
    runtimeValues[widget.id] = value
    const variableName = runtimeVariableName(widget)
    if (variableName) runtimeVariables[variableName] = value
  }

  function isServiceVisible(widget: LowCodeWidget) {
    const config = getWidgetConfig(widget)
    return serviceVisibility[widget.id] ?? config.content.visible === true
  }

  function setServiceVisible(widgetId: string, visible: boolean) {
    serviceVisibility[widgetId] = visible
  }

  function selectTableRow(widgetId: string, row: Record<string, unknown>) {
    tableSelections[widgetId] = row
  }

  function getSelectedTableRow(widgetId: string) {
    return tableSelections[widgetId]
  }

  function clearTableSelection(widgetId: string) {
    delete tableSelections[widgetId]
  }

  function refreshTableWidget(widgetId: string) {
    tableRefreshKeys[widgetId] = (tableRefreshKeys[widgetId] || 0) + 1
  }

  function getTableRefreshKey(widgetId: string) {
    return tableRefreshKeys[widgetId] || 0
  }

  function tableActionTarget(widgetId: string | undefined) {
    if (!widgetId) return undefined
    const widget = options.currentProject.value?.layout.widgets.find(item => item.id === widgetId)
    if (!widget || widget.type !== 'table') return undefined
    const config = getWidgetConfig(widget)
    if (config.data.source !== 'table' || !config.data.table) return undefined
    return { widget, table: config.data.table }
  }

  function collectFormValues() {
    const values: Record<string, unknown> = {}
    for (const widget of options.currentProject.value?.layout.widgets || []) {
      if (widget.type !== 'input' && widget.type !== 'select') continue
      const config = getWidgetConfig(widget)
      const value = getWidgetValue(widget)
      values[widget.id] = value
      if (config.data.field) values[config.data.field] = value
    }
    return values
  }

  function resetRuntimeValues() {
    for (const key of Object.keys(runtimeValues)) delete runtimeValues[key]
    for (const key of Object.keys(runtimeVariables)) delete runtimeVariables[key]
    for (const key of Object.keys(serviceVisibility)) delete serviceVisibility[key]
    for (const key of Object.keys(tableSelections)) delete tableSelections[key]
    for (const key of Object.keys(tableRefreshKeys)) delete tableRefreshKeys[key]
  }

  function validateForm() {
    for (const widget of options.currentProject.value?.layout.widgets || []) {
      if (widget.type !== 'input' && widget.type !== 'select') continue
      const config = getWidgetConfig(widget)
      const value = getWidgetValue(widget)
      const validation = config.validation
      if (validation.required && !String(value).trim()) {
        options.notify(`${config.content.label || config.content.text || widget.name}为必填项`, 'danger')
        return false
      }
      if (validation.minLength && value.length < validation.minLength) {
        options.notify(validation.message || `${config.content.label || widget.name}长度不能少于${validation.minLength}个字符`, 'danger')
        return false
      }
      if (validation.maxLength && value.length > validation.maxLength) {
        options.notify(validation.message || `${config.content.label || widget.name}长度不能超过${validation.maxLength}个字符`, 'danger')
        return false
      }
      if (validation.pattern) {
        try {
          if (value && !new RegExp(validation.pattern).test(value)) {
            options.notify(validation.message || `${config.content.label || widget.name}格式不正确`, 'danger')
            return false
          }
        } catch {
          // 配置了非法正则时不阻塞用户操作，避免运行时页面完全不可用。
        }
      }
    }
    return true
  }

  function serviceWidgets(type: 'modal' | 'loading' | 'drawer', target?: string) {
    const widgets = options.currentProject.value?.layout.widgets.filter(widget => widget.type === type) || []
    if (!target || target === 'all') return widgets
    return widgets.filter(widget => widget.id === target || widget.name === target)
  }

  async function executeAction(action: WidgetEventAction, payload: RuntimeEventPayload) {
    const values = collectFormValues()
    if (action.type === 'navigate') {
      const target = resolveValue(action.target || action.value, payload, values)
      const params = parseActionPayload(action.payload, payload, values)
      if (!target) return
      if (params !== undefined && (params === null || Array.isArray(params) || typeof params !== 'object')) {
        options.notify('页面导航参数必须是 JSON 对象', 'danger')
        await options.navigate(target)
        return
      }
      await options.navigate(params ? appendNavigationParams(target, params as Record<string, unknown>) : target)
      return
    }
    if (action.type === 'navigateBack') {
      await options.navigateBack?.()
      return
    }
    if (action.type === 'setRouteState') {
      const target = resolveValue(action.target, payload, values)
      if (target) options.setRouteState?.(target, parseActionPayload(action.payload || action.value, payload, values))
      return
    }
    if (action.type === 'emitPageEvent') {
      const event = resolveValue(action.target || action.value, payload, values)
      if (event) options.emitPageEvent?.(event, parseActionPayload(action.payload, payload, values))
      return
    }
    if (action.type === 'setValue') {
      if (!action.target) return
      const value = resolveValue(action.value, payload, values)
      const targetWidget = options.currentProject.value?.layout.widgets.find(widget => widget.id === action.target)
      if (targetWidget) updateWidgetValue(targetWidget, value)
      else runtimeValues[action.target] = value
      return
    }
    if (action.type === 'submitData') {
      if (action.target) await options.submitData(action.target, values)
      return
    }
    if (action.type === 'tableQuery' || action.type === 'tableCreate' || action.type === 'tableUpdate' || action.type === 'tableDelete') {
      const target = tableActionTarget(action.target)
      if (!target) {
        options.notify('请在动作中选择已绑定数据源的目标表格', 'danger')
        return
      }
      if (action.type === 'tableQuery') {
        refreshTableWidget(target.widget.id)
        options.notify('表格数据已刷新')
        return
      }
      const selectedRow = getSelectedTableRow(target.widget.id)
      // 按钮事件本身没有行参数时，使用目标表格的当前选中行解析 {{ row.xxx }} 模板。
      const templatePayload = selectedRow ? { ...payload, row: selectedRow } : payload
      const actionPayload = parseActionPayload(action.payload, templatePayload, values)
      if (actionPayload !== undefined && (actionPayload === null || Array.isArray(actionPayload) || typeof actionPayload !== 'object')) {
        options.notify('表格动作的数据必须是 JSON 对象', 'danger')
        return
      }
      const operation = action.type === 'tableCreate' ? 'create' : action.type === 'tableUpdate' ? 'update' : 'delete'
      const succeeded = await options.executeTableMutation(operation, target.table, values, selectedRow, actionPayload as Record<string, unknown> | undefined)
      if (!succeeded) return
      if (operation === 'delete') clearTableSelection(target.widget.id)
      refreshTableWidget(target.widget.id)
      return
    }
    if (action.type === 'showToast') {
      options.notify(resolveValue(action.value, payload, values) || '操作已完成', 'info')
      return
    }
    if (action.type === 'showModal' || action.type === 'hideModal') {
      const target = resolveValue(action.target, payload, values)
      const services = [...serviceWidgets('modal', target), ...serviceWidgets('drawer', target)]
      for (const widget of services) {
        if (action.type === 'showModal') await openServiceWidget(widget, payload)
        else await closeServiceWidget(widget, payload)
      }
      return
    }
    if (action.type === 'showLoading' || action.type === 'hideLoading') {
      serviceWidgets('loading', resolveValue(action.target, payload, values)).forEach(widget => setServiceVisible(widget.id, action.type === 'showLoading'))
    }
  }

  async function executeConfiguredEvents(widget: LowCodeWidget, eventType: WidgetEventType, payload: RuntimeEventPayload = {}) {
    const configuredEvents = getWidgetEvents(widget).filter(event => event.event === eventType && event.enabled !== false)
    for (const event of configuredEvents) {
      for (const action of event.actions) await executeAction(action, payload)
    }
    return configuredEvents.length
  }

  async function openServiceWidget(widget: LowCodeWidget, payload: RuntimeEventPayload = {}) {
    if (isServiceVisible(widget) || serviceTransitioningIds.has(widget.id)) return
    serviceTransitioningIds.add(widget.id)
    try {
      await executeConfiguredEvents(widget, 'beforeOpen', payload)
      setServiceVisible(widget.id, true)
      await executeConfiguredEvents(widget, 'open', payload)
    } finally {
      serviceTransitioningIds.delete(widget.id)
    }
  }

  async function closeServiceWidget(widget: LowCodeWidget, payload: RuntimeEventPayload = {}) {
    if (!isServiceVisible(widget) || serviceTransitioningIds.has(widget.id)) return
    serviceTransitioningIds.add(widget.id)
    try {
      await executeConfiguredEvents(widget, 'beforeClose', payload)
      setServiceVisible(widget.id, false)
      await executeConfiguredEvents(widget, 'close', payload)
    } finally {
      serviceTransitioningIds.delete(widget.id)
    }
  }

  async function executeWidgetEvent(widget: LowCodeWidget, eventType: WidgetEventType, payload: RuntimeEventPayload = {}) {
    if (eventType === 'rowClick' && widget.type === 'table' && payload.row) selectTableRow(widget.id, payload.row)
    if (eventType === 'submit' && !validateForm()) return
    const isServiceWidget = widget.type === 'modal' || widget.type === 'drawer'

    // 确认/取消是用户意图事件：先执行其绑定动作，再走完整关闭生命周期。
    if (isServiceWidget && (eventType === 'confirm' || eventType === 'cancel')) {
      await executeConfiguredEvents(widget, eventType, payload)
      await closeServiceWidget(widget, payload)
      return
    }

    // 点击关闭按钮或遮罩时，只触发完整的关闭生命周期，避免 close 事件递归。
    if (isServiceWidget && eventType === 'close') {
      await closeServiceWidget(widget, payload)
      return
    }

    const configuredEventCount = await executeConfiguredEvents(widget, eventType, payload)
    const config = getWidgetConfig(widget)

    // 兼容旧版按钮的 submitTo 配置：只有没有配置任何自定义事件时才走默认提交。
    if (!configuredEventCount && !getWidgetEvents(widget).length && eventType === 'submit' && config.submitTo?.table) {
      await options.submitData(config.submitTo.table, collectFormValues())
    }
  }

  return {
    runtimeValues, runtimeVariables, serviceVisibility, tableSelections, tableRefreshKeys,
    getWidgetValue, updateWidgetValue, isServiceVisible, setServiceVisible,
    selectTableRow, getSelectedTableRow, clearTableSelection, refreshTableWidget, getTableRefreshKey,
    collectFormValues, validateForm, resetRuntimeValues, executeWidgetEvent,
  }
}
