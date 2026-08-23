import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { LowCodeProject, LowCodeWidget, WidgetType } from '../../types/lowcode'
import { getWidgetConfig, getWidgetEvents } from '../widgetConfig'
import { getRenderedWidgetFrame } from '../autoLayout'
import { readDesignerBooleanSetting, saveDesignerBooleanSetting } from './persistence'

export interface DesignerPerformanceModel {
  largeProjectMode: ComputedRef<boolean>
  webglAcceleration: Ref<boolean>
  webglSupported: Ref<boolean>
  webglWidgetIds: ComputedRef<Set<string>>
  webglWidgets: ComputedRef<LowCodeWidget[]>
  performanceSummary: ComputedRef<{ total: number; visible: number; accelerated: number; large: boolean }>
  isWebGLWidget: (widget: LowCodeWidget, selectedIds: Readonly<Ref<string[]>> | Readonly<string[]>, isInlineEditing: (id: string) => boolean) => boolean
  setWebGLSupported: (value: boolean) => void
  toggleWebGLAcceleration: () => boolean
  webglWidgetFrame: (widget: LowCodeWidget) => ReturnType<typeof getRenderedWidgetFrame>
}

export function createDesignerPerformanceModel(options: {
  currentProject: ComputedRef<LowCodeProject | undefined>
  visibleWidgetIds: ComputedRef<Set<string>>
  notify?: (message: string, tone?: 'success' | 'info' | 'danger') => void
}): DesignerPerformanceModel {
  const webglAcceleration = ref(readDesignerBooleanSetting('codeless-webgl-acceleration'))
  const webglSupported = ref(false)
  const largeProjectMode = computed(() => (options.currentProject.value?.layout.widgets.length || 0) >= 240)
  const webglPrimitiveTypes = new Set<WidgetType>(['card', 'frame', 'avatar', 'divider'])
  const isWebGLPrimitiveWidget = (widget: LowCodeWidget) => webglPrimitiveTypes.has(widget.type)
  const webglWidgetIds = computed(() => {
    const widgets = options.currentProject.value?.layout.widgets || []
    if (!webglAcceleration.value || !webglSupported.value || !largeProjectMode.value) return new Set<string>()
    const parentIds = new Set(widgets.map(widget => widget.parentId).filter((id): id is string => Boolean(id)))
    const nonPrimitiveZ = widgets
      .filter(widget => !widget.parentId)
      .filter(widget => !isWebGLPrimitiveWidget(widget) || getWidgetEvents(widget).length > 0 || parentIds.has(widget.id))
      .map(widget => getWidgetConfig(widget).layout.zIndex)
    const maxBackgroundZ = nonPrimitiveZ.length ? Math.min(...nonPrimitiveZ) : Number.POSITIVE_INFINITY
    return new Set(widgets
      .filter(widget => !widget.parentId && options.visibleWidgetIds.value.has(widget.id))
      .filter(widget => isWebGLPrimitiveWidget(widget) && getWidgetEvents(widget).length === 0 && !parentIds.has(widget.id))
      .filter(widget => getWidgetConfig(widget).layout.zIndex <= maxBackgroundZ)
      .map(widget => widget.id))
  })
  const webglWidgets = computed(() => {
    const ids = webglWidgetIds.value
    return (options.currentProject.value?.layout.widgets || []).filter(widget => ids.has(widget.id))
  })
  const performanceSummary = computed(() => ({
    total: options.currentProject.value?.layout.widgets.length || 0,
    visible: options.visibleWidgetIds.value.size,
    accelerated: webglWidgetIds.value.size,
    large: largeProjectMode.value,
  }))

  function setWebGLSupported(value: boolean) {
    webglSupported.value = value
    if (!value) webglAcceleration.value = false
  }

  function toggleWebGLAcceleration() {
    if (!largeProjectMode.value) return false
    webglAcceleration.value = !webglAcceleration.value
    saveDesignerBooleanSetting('codeless-webgl-acceleration', webglAcceleration.value)
    return webglAcceleration.value
  }

  return {
    largeProjectMode,
    webglAcceleration,
    webglSupported,
    webglWidgetIds,
    webglWidgets,
    performanceSummary,
    isWebGLWidget: (widget, selectedIds, isInlineEditing) => {
      const ids: readonly string[] = 'value' in selectedIds ? selectedIds.value : selectedIds
      return webglWidgetIds.value.has(widget.id) && !ids.includes(widget.id) && !isInlineEditing(widget.id)
    },
    setWebGLSupported,
    toggleWebGLAcceleration,
    webglWidgetFrame: widget => getRenderedWidgetFrame(widget, options.currentProject.value?.layout.widgets || [widget]),
  }
}

