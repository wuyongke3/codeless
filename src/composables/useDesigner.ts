import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import type { LowCodeProject, LowCodeWidget, PageLayout, WidgetType } from '../types/lowcode'
import { clone, createWidget, paletteGroups, makeId, widgetDefaults, type Area } from './utils'

export function useDesigner(
  currentProject: ComputedRef<LowCodeProject | undefined>,
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void,
  saveProject: (message?: string) => Promise<void>,
  activeArea?: Ref<Area>,
) {
  const selectedWidgetId = ref('')
  const paletteSearch = ref('')
  const paletteTab = ref<'components' | 'pages'>('components')
  const inspectorTab = ref<'properties' | 'events'>('properties')
  const zoom = ref(0.78)
  const dirty = ref(false)
  const canvasRef = ref<HTMLElement | null>(null)
  const historyStack = ref<PageLayout[]>([])
  const futureStack = ref<PageLayout[]>([])

  const selectedWidget = computed(() => currentProject.value?.layout.widgets.find(widget => widget.id === selectedWidgetId.value))
  const filteredGroups = computed(() => {
    const keyword = paletteSearch.value.trim().toLowerCase()
    if (!keyword) return paletteGroups
    return paletteGroups
      .map(group => ({ ...group, items: group.items.filter(item => `${item.name}${item.description}`.toLowerCase().includes(keyword)) }))
      .filter(group => group.items.length)
  })

  function pushHistory() {
    if (!currentProject.value) return
    historyStack.value.push(clone(currentProject.value.layout))
    if (historyStack.value.length > 30) historyStack.value.shift()
    futureStack.value = []
  }

  function undo() {
    if (!currentProject.value || !historyStack.value.length) return
    futureStack.value.push(clone(currentProject.value.layout))
    currentProject.value.layout = historyStack.value.pop()!
    selectedWidgetId.value = ''
    dirty.value = true
  }

  function redo() {
    if (!currentProject.value || !futureStack.value.length) return
    historyStack.value.push(clone(currentProject.value.layout))
    currentProject.value.layout = futureStack.value.pop()!
    selectedWidgetId.value = ''
    dirty.value = true
  }

  function startPaletteDrag(event: DragEvent, type: WidgetType) {
    event.dataTransfer?.setData('application/codeless-widget', type)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  function addWidget(type: WidgetType, x?: number, y?: number) {
    if (!currentProject.value) return
    pushHistory()
    const index = currentProject.value.layout.widgets.length
    const widget = createWidget(type, x ?? 52 + (index % 4) * 22, y ?? 46 + (index % 6) * 34)
    currentProject.value.layout.widgets.push(widget)
    selectedWidgetId.value = widget.id
    dirty.value = true
  }

  function onCanvasDrop(event: DragEvent) {
    const type = event.dataTransfer?.getData('application/codeless-widget') as WidgetType
    if (!type || !canvasRef.value) return
    const rect = canvasRef.value.getBoundingClientRect()
    const widget = widgetDefaults(type)
    const x = Math.max(0, Math.min(960 - widget.w, (event.clientX - rect.left) / zoom.value - widget.w / 2))
    const y = Math.max(0, Math.min(720 - widget.h, (event.clientY - rect.top) / zoom.value - 20))
    addWidget(type, Math.round(x / 8) * 8, Math.round(y / 8) * 8)
  }

  let moveState: { widget: LowCodeWidget; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null

  function startWidgetMove(event: PointerEvent, widget: LowCodeWidget) {
    event.preventDefault()
    event.stopPropagation()
    selectedWidgetId.value = widget.id
    pushHistory()
    moveState = { widget, startX: event.clientX, startY: event.clientY, originX: widget.x, originY: widget.y, moved: false }
    window.addEventListener('pointermove', moveWidget)
    window.addEventListener('pointerup', stopWidgetMove, { once: true })
  }

  function moveWidget(event: PointerEvent) {
    if (!moveState) return
    const dx = (event.clientX - moveState.startX) / zoom.value
    const dy = (event.clientY - moveState.startY) / zoom.value
    if (Math.abs(dx) + Math.abs(dy) > 2) moveState.moved = true
    moveState.widget.x = Math.max(0, Math.min(960 - moveState.widget.w, Math.round((moveState.originX + dx) / 8) * 8))
    moveState.widget.y = Math.max(0, Math.min(720 - moveState.widget.h, Math.round((moveState.originY + dy) / 8) * 8))
  }

  function stopWidgetMove() {
    window.removeEventListener('pointermove', moveWidget)
    if (moveState?.moved) dirty.value = true
    else historyStack.value.pop()
    moveState = null
  }

  function removeSelectedWidget() {
    if (!currentProject.value || !selectedWidget.value) return
    pushHistory()
    currentProject.value.layout.widgets = currentProject.value.layout.widgets.filter(widget => widget.id !== selectedWidgetId.value)
    selectedWidgetId.value = ''
    dirty.value = true
  }

  function duplicateSelectedWidget() {
    if (!currentProject.value || !selectedWidget.value) return
    pushHistory()
    const copy = clone(selectedWidget.value)
    copy.id = makeId('widget')
    copy.x += 24
    copy.y += 24
    currentProject.value.layout.widgets.push(copy)
    selectedWidgetId.value = copy.id
    dirty.value = true
  }

  function updateColumns(event: Event) {
    if (!selectedWidget.value) return
    selectedWidget.value.props.columns = (event.target as HTMLInputElement).value.split(',').map(item => item.trim()).filter(Boolean)
    dirty.value = true
  }

  function widgetStyle(widget: LowCodeWidget) {
    return { left: `${widget.x}px`, top: `${widget.y}px`, width: `${widget.w}px`, height: `${widget.h}px` }
  }

  function resetDesigner() {
    selectedWidgetId.value = ''
    historyStack.value = []
    futureStack.value = []
    dirty.value = false
  }

  function onKeydown(event: KeyboardEvent) {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)
    if (activeArea?.value !== 'builder') return
    if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) removeSelectedWidget()
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveProject()
    }
    if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? redo() : undo()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('pointermove', moveWidget)
  })

  return {
    selectedWidgetId, paletteSearch, paletteTab, inspectorTab, zoom, dirty, canvasRef, historyStack, futureStack,
    selectedWidget, filteredGroups, pushHistory, undo, redo, startPaletteDrag, addWidget, onCanvasDrop,
    startWidgetMove, removeSelectedWidget, duplicateSelectedWidget, updateColumns, widgetStyle, resetDesigner,
  }
}
