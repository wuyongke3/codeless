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

export function useRuntime(options: RuntimeOptions) {
  const runtimeValues = reactive<Record<string, string>>({})
  const serviceVisibility = reactive<Record<string, boolean>>({})

  function getWidgetValue(widget: LowCodeWidget) {
    const config = getWidgetConfig(widget)
    return runtimeValues[widget.id] ?? String(config.content.value ?? config.content.defaultValue ?? '')
  }

  function updateWidgetValue(widget: LowCodeWidget, value: string) {
    runtimeValues[widget.id] = value
  }

  function isServiceVisible(widget: LowCodeWidget) {
    const config = getWidgetConfig(widget)
    return serviceVisibility[widget.id] ?? config.content.visible === true
  }

  function setServiceVisible(widgetId: string, visible: boolean) {
    serviceVisibility[widgetId] = visible
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
    for (const key of Object.keys(serviceVisibility)) delete serviceVisibility[key]
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
      if (target) await options.navigate(target)
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
      runtimeValues[action.target] = resolveValue(action.value, payload, values)
      return
    }
    if (action.type === 'submitData') {
      if (action.target) await options.submitData(action.target, values)
      return
    }
    if (action.type === 'showToast') {
      options.notify(resolveValue(action.value, payload, values) || '操作已完成', 'info')
      return
    }
    if (action.type === 'showModal' || action.type === 'hideModal') {
      const target = resolveValue(action.target, payload, values)
      const services = [...serviceWidgets('modal', target), ...serviceWidgets('drawer', target)]
      services.forEach(widget => setServiceVisible(widget.id, action.type === 'showModal'))
      return
    }
    if (action.type === 'showLoading' || action.type === 'hideLoading') {
      serviceWidgets('loading', resolveValue(action.target, payload, values)).forEach(widget => setServiceVisible(widget.id, action.type === 'showLoading'))
    }
  }

  async function executeWidgetEvent(widget: LowCodeWidget, eventType: WidgetEventType, payload: RuntimeEventPayload = {}) {
    if (eventType === 'submit' && !validateForm()) return
    const configuredEvents = getWidgetEvents(widget).filter(event => event.event === eventType && event.enabled !== false)
    const config = getWidgetConfig(widget)

    // 兼容旧版按钮的 submitTo 配置：只有没有配置任何自定义事件时才走默认提交。
    if (!configuredEvents.length && !getWidgetEvents(widget).length && eventType === 'submit' && config.submitTo?.table) {
      await options.submitData(config.submitTo.table, collectFormValues())
      return
    }

    for (const event of configuredEvents) {
      for (const action of event.actions) await executeAction(action, payload)
    }
    if ((widget.type === 'modal' || widget.type === 'drawer') && (eventType === 'close' || eventType === 'cancel' || eventType === 'confirm')) setServiceVisible(widget.id, false)
  }

  return {
    runtimeValues, serviceVisibility,
    getWidgetValue, updateWidgetValue, isServiceVisible, setServiceVisible,
    collectFormValues, validateForm, resetRuntimeValues, executeWidgetEvent,
  }
}
