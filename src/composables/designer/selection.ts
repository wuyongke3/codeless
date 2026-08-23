import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { LowCodeProject, LowCodeWidget } from '../../types/lowcode'

export interface DesignerSelectionController {
  selectedWidgetId: Ref<string>
  selectedWidgetIds: Ref<string[]>
  selectedWidgets: ComputedRef<LowCodeWidget[]>
  selectedWidget: ComputedRef<LowCodeWidget | undefined>
  selectWidget: (id: string, additive?: boolean) => void
  clear: () => void
  reconcile: () => void
}

export function toggleSelectedWidgetIds(current: readonly string[], id: string) {
  const alreadySelected = current.includes(id)
  const next = alreadySelected
    ? current.filter(widgetId => widgetId !== id)
    : [...current, id]
  return { alreadySelected, ids: next }
}

export function selectWidgetsInRect(
  widgets: readonly LowCodeWidget[],
  rect: { x: number; y: number; width: number; height: number },
  absolutePosition: (widget: LowCodeWidget) => { x: number; y: number },
  frameOf: (widget: LowCodeWidget) => { width: number; height: number },
) {
  return widgets.filter(widget => {
    const frame = frameOf(widget)
    const absolute = absolutePosition(widget)
    return absolute.x < rect.x + rect.width
      && absolute.x + frame.width > rect.x
      && absolute.y < rect.y + rect.height
      && absolute.y + frame.height > rect.y
  }).map(widget => widget.id)
}

export function createDesignerSelectionController(
  currentProject: ComputedRef<LowCodeProject | undefined>,
  options: { onBeforeSelect?: (id: string) => void } = {},
): DesignerSelectionController {
  const selectedWidgetId = ref('')
  const selectedWidgetIds = ref<string[]>([])
  const selectedWidgets = computed(() => currentProject.value?.layout.widgets
    .filter(widget => selectedWidgetIds.value.includes(widget.id)) || [])
  const selectedWidget = computed(() => currentProject.value?.layout.widgets
    .find(widget => widget.id === selectedWidgetId.value))

  function selectWidget(id: string, additive = false) {
    if (!currentProject.value) return
    options.onBeforeSelect?.(id)
    if (additive) {
      const result = toggleSelectedWidgetIds(selectedWidgetIds.value, id)
      selectedWidgetIds.value = result.ids
      selectedWidgetId.value = result.alreadySelected
        ? (result.ids[result.ids.length - 1] || '')
        : id
      return
    }
    selectedWidgetIds.value = [id]
    selectedWidgetId.value = id
  }

  function clear() {
    selectedWidgetId.value = ''
    selectedWidgetIds.value = []
  }

  function reconcile() {
    const validIds = new Set(currentProject.value?.layout.widgets.map(widget => widget.id) || [])
    selectedWidgetIds.value = selectedWidgetIds.value.filter(id => validIds.has(id))
    if (selectedWidgetId.value && !validIds.has(selectedWidgetId.value)) selectedWidgetId.value = ''
    if (!selectedWidgetId.value && selectedWidgetIds.value.length) {
      selectedWidgetId.value = selectedWidgetIds.value[selectedWidgetIds.value.length - 1] || ''
    }
  }

  return { selectedWidgetId, selectedWidgetIds, selectedWidgets, selectedWidget, selectWidget, clear, reconcile }
}
