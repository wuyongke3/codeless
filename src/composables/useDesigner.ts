import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { LowCodeProject, LowCodeWidget, WidgetDataBinding, PageLayout, WidgetEvent, WidgetEventAction, WidgetEventActionType, WidgetEventType, WidgetStyleTokenRefs, WidgetType } from '../types/lowcode'
import { clone, createWidget, eventOptionsForWidget, makeId, paletteGroups, widgetDefaults, type Area } from './utils'
import { getWidgetConfig, getWidgetEvents, isContainerType, normalizeWidget, parseColumns, parseOptions, serializeColumns, serializeOptions, setWidgetFrame, syncLegacyProps } from './widgetConfig'
import type { LayoutPatch } from './layoutHistory'
import { createDesignerSelectionController, selectWidgetsInRect } from './designer/selection'
import { createDesignerHistoryController } from './designer/history'
import { createDesignerLayoutModel } from './designer/layout'
import { createDesignerPerformanceModel } from './designer/performance'
import { createDesignerPersistence, designerPanelWidthLimits, readDesignerPanelWidth, saveDesignerPanelWidth } from './designer/persistence'
import type { DesignerHistoryOptions } from './designer/collaboration'
import { useDesignerCanvasViewport } from './designerCanvasViewport'
import { alignFrames, distributeFrames, getCanvasGuideBounds, smartSnapFrame } from './designer/canvasGuides'
import type { CanvasGuideFrame, CanvasGuideLine } from '../types/designerCanvasGuides'
import {
  componentInstanceCount,
  createComponentDefinition,
  createComponentInstance,
  detachComponentInstance,
  getComponentDefinition,
  getComponentLink,
  migrateLegacyVariantsToComponent,
  publishComponentDefinition,
  recordComponentInstanceOverrides,
  refreshComponentInstance,
} from './designer/components'

export type { DesignerHistoryOptions } from './designer/collaboration'

type InlineEditingField = 'text' | 'title' | 'label' | 'placeholder' | 'description' | 'trend'

interface MoveState {
  widgets: Array<{ widget: LowCodeWidget; originX: number; originY: number; originAbsoluteX: number; originAbsoluteY: number }>
  startX: number
  startY: number
  pointerId: number
  target: HTMLElement
  moved: boolean
  axis: 'x' | 'y' | ''
  primaryWidgetId: string
  clickedWasSelected: boolean
  selectionAdditive: boolean
  deltaX: number
  deltaY: number
  historyLengthBefore: number
  futureBefore: LayoutPatch[]
  dirtyBefore: boolean
  layoutBefore: PageLayout
}

interface ResizeState {
  widget: LowCodeWidget
  handle: string
  startX: number
  startY: number
  pointerId: number
  target: HTMLElement
  origin: { x: number; y: number; width: number; height: number }
  moved: boolean
  historyLengthBefore: number
  futureBefore: LayoutPatch[]
  dirtyBefore: boolean
  layoutBefore: PageLayout
}

interface SelectionState {
  startX: number
  startY: number
  pointerId: number
  target: HTMLElement
  moved: boolean
  additive: boolean
}

export interface DesignerContextMenuState {
  visible: boolean
  x: number
  y: number
  targetId: string
}

export interface DesignerResetOptions {
  /**
   * Page-level mutations can replace the active layout while still needing
   * their project snapshot to remain undoable. In that case clear only the
   * designer-local layout history and keep the project history coordinator.
   */
  preserveProjectHistory?: boolean
}

export function useDesigner(
  currentProject: ComputedRef<LowCodeProject | undefined>,
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void,
  saveProject: (message?: string) => Promise<void>,
  activeArea?: Ref<Area>,
  historyOptions: DesignerHistoryOptions = {},
) {
  const selection = createDesignerSelectionController(currentProject)
  const selectedWidgetId = selection.selectedWidgetId
  const selectedWidgetIds = selection.selectedWidgetIds
  const selectedWidgets = selection.selectedWidgets
  const selectedWidget = selection.selectedWidget
  const paletteSearch = ref('')
  const paletteTab = ref<'components' | 'pages' | 'layers'>('components')
  const inspectorTab = ref<'properties' | 'events'>('properties')
  const zoom = ref(0.78)
  const dirty = ref(false)
  // Monotonic edit version used to reject late persistence responses.
  const dirtyRevision = ref(0)
  const canvasRef = ref<HTMLElement | null>(null)
  const canvasViewportRef = ref<HTMLElement | null>(null)
  const canvasViewportVersion = ref(0)
  const canvasPageSize = computed(() => {
    const canvas = currentProject.value?.layout.canvas
    return canvas ? { width: canvas.width || 960, height: canvas.height || 720 } : null
  })
  const canvasViewport = useDesignerCanvasViewport({
    viewportRef: canvasViewportRef,
    contentRef: canvasRef,
    pageSize: canvasPageSize,
    initialZoom: zoom,
    minZoom: 0.25,
    maxZoom: 2,
    fitPadding: 48,
    wheelZoom: true,
    wheelPan: true,
    panWithSpace: true,
    panWithMiddleButton: true,
    autoAttach: false,
  })
  const gridEnabled = ref(true)
  const snapEnabled = ref(true)
  const showCanvasGuides = ref(true)
  const gridSize = ref(8)
  const canvasGuideLines = ref<CanvasGuideLine[]>([])
  const canvasGridStyle = computed<Record<string, string>>(() => ({
    '--canvas-grid-size': `${gridSize.value}px`,
    opacity: gridEnabled.value ? '1' : '0',
  }))
  const clipboardWidgets = ref<LowCodeWidget[]>([])
  const componentPanelWidth = ref(readDesignerPanelWidth('codeless-component-panel-width', 218, 170, 360))
  const inspectorPanelWidth = ref(readDesignerPanelWidth('codeless-inspector-panel-width', 260, 220, 420))
  const panelResizeSide = ref<'component' | 'inspector' | ''>('')
  const draggingWidgetId = ref('')
  const draggingWidgetIds = ref<string[]>([])
  const dropTargetContainerId = ref('')
  const selectionBox = ref<{ x: number; y: number; width: number; height: number } | null>(null)
  const inlineEditingWidgetId = ref('')
  const inlineEditingField = ref<InlineEditingField | ''>('')
  const inlineEditingValue = ref('')
  const inlineEditingOriginalValue = ref('')
  const contextMenu = ref<DesignerContextMenuState>({ visible: false, x: 0, y: 0, targetId: '' })
  let inlineEditingHistoryIndex = -1
  let inlineEditingFutureStack: LayoutPatch[] | null = null
  let suppressNextWidgetClick = false
  let suppressNextCanvasClick = false
  let contextMenuAnchor = { x: 0, y: 0 }
  const dragThreshold = 3
  const persistence = createDesignerPersistence({ saveProject })
  const layoutModel = createDesignerLayoutModel({
    getWidgets: () => currentProject.value?.layout.widgets || [],
    getCanvas: () => currentProject.value?.layout.canvas,
    getWidgetById: id => currentProject.value?.layout.widgets.find(widget => widget.id === id),
  })
  const history = createDesignerHistoryController(currentProject, historyOptions, {
    onSelectionClear: () => clearSelection(),
  })
  const historyStack = history.historyStack
  const futureStack = history.futureStack
  const {
    containerHeaderHeight,
    styleDescriptionHeight,
    containerContentBox,
    containerBounds,
    widgetMinimumSize,
    clampWidgetFrame,
    clampChildrenToParent,
  } = layoutModel

  const canPaste = computed(() => clipboardWidgets.value.length > 0)
  const filteredGroups = computed(() => {
    const keyword = paletteSearch.value.trim().toLowerCase()
    if (!keyword) return paletteGroups
    return paletteGroups
      .map(group => ({ ...group, items: group.items.filter(item => `${item.name}${item.description}`.toLowerCase().includes(keyword)) }))
      .filter(group => group.items.length)
  })
  const layerWidgets = computed(() => {
    const widgets = currentProject.value?.layout.widgets || []
    return widgets
      .map((widget, index) => ({ widget, index }))
      .sort((a, b) => getWidgetConfig(b.widget).layout.zIndex - getWidgetConfig(a.widget).layout.zIndex || b.index - a.index)
      .map(item => item.widget)
  })

  const canvasVisibleWidgetIds = computed(() => {
    canvasViewportVersion.value
    const project = currentProject.value
    const widgets = project?.layout.widgets || []
    if (!project || !widgets.length) return new Set<string>()

    const stage = canvasViewportRef.value
    const canvas = canvasRef.value
    if (!stage || !canvas) return new Set(widgets.map(widget => widget.id))

    const stageRect = stage.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    const scale = Math.max(0.01, zoom.value)
    const margin = 220 / scale
    const canvasWidth = project.layout.canvas.width || 960
    const canvasHeight = project.layout.canvas.height || 720
    const left = Math.max(0, (stageRect.left - canvasRect.left) / scale - margin)
    const top = Math.max(0, (stageRect.top - canvasRect.top) / scale - margin)
    const right = Math.min(canvasWidth, (stageRect.right - canvasRect.left) / scale + margin)
    const bottom = Math.min(canvasHeight, (stageRect.bottom - canvasRect.top) / scale + margin)
    if (right <= left || bottom <= top) return new Set(widgets.map(widget => widget.id))

    const byId = new Map(widgets.map(widget => [widget.id, widget]))
    const positionCache = new Map<string, { x: number; y: number }>()
    const positionOf = (widget: LowCodeWidget): { x: number; y: number } => {
      const cached = positionCache.get(widget.id)
      if (cached) return cached
      const frame = getWidgetConfig(widget).layout
      let x = frame.x
      let y = frame.y
      const seen = new Set<string>()
      let parent = widget.parentId ? byId.get(widget.parentId) : undefined
      while (parent && !seen.has(parent.id)) {
        const parentFrame = getWidgetConfig(parent).layout
        const style = getWidgetConfig(parent).style
        let contentX = 0
        let contentY = 0
        if (parent.type === 'modal') {
          contentX = 12
          contentY = 12 + 28 + (styleDescriptionHeight(parent) || 0)
        } else if (parent.type !== 'loading') {
          const padding = Math.max(parent.type === 'drawer' ? 8 : 0, Number(style.padding) || (parent.type === 'drawer' ? 16 : 0))
          contentX = padding
          contentY = padding + containerHeaderHeight(parent)
        }
        x += parentFrame.x + contentX
        y += parentFrame.y + contentY
        seen.add(parent.id)
        parent = parent.parentId ? byId.get(parent.parentId) : undefined
      }
      const position = { x, y }
      positionCache.set(widget.id, position)
      return position
    }

    const visible = new Set<string>(selectedWidgetIds.value)
    for (const widget of widgets) {
      const frame = getWidgetConfig(widget).layout
      const position = positionOf(widget)
      if (position.x < right && position.x + frame.width > left && position.y < bottom && position.y + frame.height > top) visible.add(widget.id)
    }
    visible.forEach(id => {
      let parent = byId.get(id)?.parentId ? byId.get(byId.get(id)!.parentId!) : undefined
      const seen = new Set<string>()
      while (parent && !seen.has(parent.id)) {
        visible.add(parent.id)
        seen.add(parent.id)
        parent = parent.parentId ? byId.get(parent.parentId) : undefined
      }
    })
    return visible
  })

  const performance = createDesignerPerformanceModel({
    currentProject,
    visibleWidgetIds: canvasVisibleWidgetIds,
    notify,
  })
  const largeProjectMode = performance.largeProjectMode
  const webglAcceleration = performance.webglAcceleration
  const webglSupported = performance.webglSupported
  const webglWidgetIds = performance.webglWidgetIds
  const webglWidgets = performance.webglWidgets
  const performanceSummary = performance.performanceSummary

  const canvasRootWidgets = computed(() => (currentProject.value?.layout.widgets || [])
    .filter(widget => !widget.parentId && canvasVisibleWidgetIds.value.has(widget.id)))
  const canvasChildrenByParent = computed(() => {
    const map = new Map<string, LowCodeWidget[]>()
    const visible = canvasVisibleWidgetIds.value
    for (const widget of currentProject.value?.layout.widgets || []) {
      if (!widget.parentId || !visible.has(widget.id)) continue
      const children = map.get(widget.parentId) || []
      children.push(widget)
      map.set(widget.parentId, children)
    }
    map.forEach(children => children.sort((a, b) => getWidgetConfig(a).layout.zIndex - getWidgetConfig(b).layout.zIndex))
    return map
  })

  function canvasChildrenFor(parentId: string) {
    return canvasChildrenByParent.value.get(parentId) || []
  }

  function updateCanvasViewport() {
    canvasViewportVersion.value += 1
  }

  watch(canvasViewportRef, value => {
    if (value) void nextTick(updateCanvasViewport)
  }, { flush: 'post' })

  watch(zoom, value => {
    if (Math.abs(canvasViewport.zoom.value - value) > 0.001) canvasViewport.setZoom(value)
    updateCanvasViewport()
  })
  watch(canvasViewport.zoom, value => {
    if (Math.abs(zoom.value - value) > 0.001) zoom.value = value
    updateCanvasViewport()
  })
  watch([canvasViewportRef, currentProject], ([viewport, project]) => {
    if (!viewport || !project) return
    void nextTick(() => {
      canvasViewport.updateViewportSize()
      if (canvasViewport.viewportSize.value.width > 0 && canvasViewport.viewportSize.value.height > 0) {
        canvasViewport.fitPage()
        updateCanvasViewport()
      }
    })
  }, { flush: 'post' })

  watch(selectedWidgetId, id => {
    if (!id) selectedWidgetIds.value = []
    else if (!selectedWidgetIds.value.includes(id)) selectedWidgetIds.value = [id]
  })
  watch(currentProject, project => {
    project?.layout.widgets.forEach(normalizeWidget)
    history.syncHistoryBaseline()
    selection.reconcile()
  }, { immediate: true })

  function selectWidget(id: string, additive = false) {
    if (!currentProject.value) return
    if (inlineEditingWidgetId.value && inlineEditingWidgetId.value !== id) commitInlineEdit()
    selection.selectWidget(id, additive)
  }

  function handleWidgetClick(id: string, event?: MouseEvent) {
    if (suppressNextWidgetClick) {
      suppressNextWidgetClick = false
      return
    }
    selectWidget(id, Boolean(event?.shiftKey))
  }

  function closeContextMenu() {
    contextMenu.value.visible = false
    contextMenu.value.targetId = ''
  }

  function contextMenuPosition(clientX: number, clientY: number, menuWidth = 232, menuHeight = 398) {
    // Keep the menu inside the viewport and flip it around the pointer when it
    // would overflow, matching the behavior of mainstream design tools.
    const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight
    const padding = 8
    let x = clientX
    let y = clientY
    if (x + menuWidth + padding > viewportWidth) x = clientX - menuWidth
    if (y + menuHeight + padding > viewportHeight) y = clientY - menuHeight
    return {
      x: Math.max(padding, Math.min(x, viewportWidth - menuWidth - padding)),
      y: Math.max(padding, Math.min(y, viewportHeight - menuHeight - padding)),
    }
  }

  function repositionContextMenu() {
    if (!contextMenu.value.visible || typeof document === 'undefined') return
    const menu = document.querySelector<HTMLElement>('.canvas-context-menu')
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const point = contextMenuPosition(contextMenuAnchor.x, contextMenuAnchor.y, rect.width, rect.height)
    if (point.x !== contextMenu.value.x || point.y !== contextMenu.value.y) {
      contextMenu.value.x = point.x
      contextMenu.value.y = point.y
    }
  }

  function openContextMenu(event: MouseEvent, targetId = '') {
    if (!currentProject.value) return
    event.preventDefault()
    event.stopPropagation()
    if (inlineEditingWidgetId.value) commitInlineEdit()

    if (targetId) {
      const target = widgetById(targetId)
      if (!target) return
      // Right-clicking an already selected item keeps a multi-selection intact;
      // right-clicking another item makes that item the sole selection.
      if (selectedWidgetIds.value.includes(targetId)) selectedWidgetId.value = targetId
      else selectWidget(targetId)
    }

    contextMenuAnchor = { x: event.clientX, y: event.clientY }
    const point = contextMenuPosition(contextMenuAnchor.x, contextMenuAnchor.y)
    contextMenu.value = { visible: true, x: point.x, y: point.y, targetId }
    void nextTick(repositionContextMenu)
  }

  function handleWidgetContextMenu(event: MouseEvent, widgetId: string) {
    openContextMenu(event, widgetId)
  }

  function handleCanvasContextMenu(event: MouseEvent) {
    openContextMenu(event)
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    if (!contextMenu.value.visible) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('.canvas-context-menu')) return
    closeContextMenu()
  }

  function clearSelection() {
    closeContextMenu()
    suppressNextWidgetClick = false
    suppressNextCanvasClick = false
    selectionBox.value = null
    if (inlineEditingWidgetId.value) commitInlineEdit()
    selection.clear()
  }

  function discardPendingHistory() {
    history.discardPendingHistory()
  }

  function beginExternalHistory() {
    history.beginExternalHistory()
  }

  function markDirty(options: { preserveHistory?: boolean } = {}) {
    history.recordDirty(options)
    dirtyRevision.value += 1
    dirty.value = true
    persistence.schedule(history.flushHistory, () => dirty.value)
  }

  function flushAutoSave() {
    return persistence.flush(history.flushHistory, () => dirty.value)
  }

  function clearAutoSaveTimer() {
    persistence.clear()
  }

  function flushHistory() {
    history.flushHistory()
  }

  function clearFutureHistory() {
    history.clearFutureHistory()
  }

  function syncHistoryBaseline() {
    history.syncHistoryBaseline()
  }

  function pushHistory() {
    history.pushHistory()
  }

  function undo() {
    if (history.undo()) markDirty()
  }

  function redo() {
    if (history.redo()) markDirty()
  }
  function canDropIntoContainer(id: string, movingIds: string[] = []) {
    const container = widgetById(id)
    if (!container || !isContainerWidget(container) || isWidgetLocked(container)) return false
    if (movingIds.some(widgetId => isWidgetLocked(widgetId)) || movingIds.includes(id) || movingIds.some(widgetId => isDescendantOf(id, widgetId))) return false
    return true
  }

  function setDropTargetContainer(id = '', movingIds: string[] = []) {
    dropTargetContainerId.value = id && canDropIntoContainer(id, movingIds) ? id : ''
  }

  function startPaletteDrag(event: DragEvent, type: WidgetType) {
    event.dataTransfer?.setData('application/codeless-widget', type)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
    dropTargetContainerId.value = ''
  }

  function isContainerWidget(widget: LowCodeWidget | undefined) {
    return Boolean(widget && isContainerType(widget.type))
  }

  function widgetById(id: string) {
    return currentProject.value?.layout.widgets.find(widget => widget.id === id)
  }

  /**
   * A locked ancestor also locks movement, resize, delete, reparenting and inline editing.
   * Locked descendants remain selectable so they can be unlocked from the inspector.
   */
  function isWidgetSelfLocked(widgetOrId: LowCodeWidget | string | undefined) {
    const widget = typeof widgetOrId === 'string' ? widgetById(widgetOrId) : widgetOrId
    return Boolean(widget && getWidgetConfig(widget).layout.locked)
  }

  function isWidgetLocked(widgetOrId: LowCodeWidget | string | undefined) {
    let cursor = typeof widgetOrId === 'string' ? widgetById(widgetOrId) : widgetOrId
    const seen = new Set<string>()
    while (cursor && !seen.has(cursor.id)) {
      if (isWidgetSelfLocked(cursor)) return true
      seen.add(cursor.id)
      cursor = cursor.parentId ? widgetById(cursor.parentId) : undefined
    }
    return false
  }

  function isDescendantOf(widgetId: string, ancestorId: string) {
    const widgets = currentProject.value?.layout.widgets || []
    const byId = new Map(widgets.map(widget => [widget.id, widget]))
    const seen = new Set<string>()
    let cursor = byId.get(widgetId)
    while (cursor?.parentId && !seen.has(cursor.parentId)) {
      if (cursor.parentId === ancestorId) return true
      seen.add(cursor.parentId)
      cursor = byId.get(cursor.parentId)
    }
    return false
  }

  function addWidget(type: WidgetType, x?: number, y?: number, parentId?: string) {
    if (!currentProject.value) return
    const parent = parentId ? widgetById(parentId) : undefined
    if (parentId && (!isContainerWidget(parent) || isWidgetLocked(parent))) return
    pushHistory()
    const siblings = currentProject.value.layout.widgets.filter(widget => widget.parentId === parentId)
    const index = siblings.length
    const defaults = widgetDefaults(type)
    const bounds = containerBounds(parentId)
    const rawX = x ?? (parentId ? 16 + (index % 3) * 18 : 52 + (index % 4) * 22)
    const rawY = y ?? (parentId ? 16 + (index % 4) * 22 : 46 + (index % 6) * 34)
    const frame = {
      x: Math.max(0, Math.min(Math.max(0, bounds.width - defaults.w), rawX)),
      y: Math.max(0, Math.min(Math.max(0, bounds.height - defaults.h), rawY)),
    }
    const widget = createWidget(type, frame.x, frame.y, { parentId })
    currentProject.value.layout.widgets.push(widget)
    setWidgetFrame(widget, { ...clampWidgetFrame(widget, frame.x, frame.y), zIndex: siblings.length + 1 })
    selectWidget(widget.id)
    markDirty()
  }

  function insertWidgets(importedWidgets: LowCodeWidget[], offsetX = 24, offsetY = 24) {
    const project = currentProject.value
    if (!project || !Array.isArray(importedWidgets) || !importedWidgets.length) return [] as LowCodeWidget[]
    pushHistory()
    const idMap = new Map<string, string>()
    importedWidgets.forEach(widget => idMap.set(widget.id, makeId('widget')))
    const importedIds = new Set(importedWidgets.map(widget => widget.id))
    const copies = importedWidgets.map(widget => {
      const copy = clone(widget)
      const originalParentId = copy.parentId
      copy.id = idMap.get(widget.id) || makeId('widget')
      copy.parentId = originalParentId && importedIds.has(originalParentId)
        ? idMap.get(originalParentId)
        : undefined
      normalizeWidget(copy)
      const frame = getWidgetConfig(copy).layout
      if (!copy.parentId) {
        setWidgetFrame(copy, { x: frame.x + offsetX, y: frame.y + offsetY })
      }
      return copy
    })
    const targetWidgets = project.layout.widgets
    targetWidgets.push(...copies)
    copies.forEach((widget, index) => {
      const siblings = targetWidgets.filter(item => item.parentId === widget.parentId && item.id !== widget.id)
      setWidgetFrame(widget, { zIndex: Math.max(0, ...siblings.map(item => getWidgetConfig(item).layout.zIndex), 0) + index + 1 })
    })
    selectedWidgetIds.value = copies.filter(widget => !widget.parentId).map(widget => widget.id)
    if (!selectedWidgetIds.value.length) selectedWidgetIds.value = [copies[0].id]
    selectedWidgetId.value = selectedWidgetIds.value[0] || copies[0].id
    markDirty()
    return copies
  }

  function onCanvasDrop(event: DragEvent, parentId?: string) {
    const layerId = event.dataTransfer?.getData('application/codeless-layer') || ''
    if (layerId) {
      onCanvasLayerDrop(event, parentId, layerId)
      return
    }

    dropTargetContainerId.value = ''
    const type = event.dataTransfer?.getData('application/codeless-widget') as WidgetType
    if (!type || !currentProject.value) return
    const parent = parentId ? widgetById(parentId) : undefined
    if (parentId && (!isContainerWidget(parent) || isWidgetLocked(parent))) return
    let target = event.currentTarget instanceof HTMLElement ? event.currentTarget : canvasRef.value
    if (!target) return
    if (parentId) {
      const contentLayer = target.matches('[data-container-id]')
        ? target
        : target.querySelector<HTMLElement>('[data-container-id]')
      if (!contentLayer) return
      target = contentLayer
    }
    const rect = target.getBoundingClientRect()
    const defaults = widgetDefaults(type)
    const bounds = containerBounds(parentId)
    const x = (event.clientX - rect.left) / zoom.value - defaults.w / 2
    const y = (event.clientY - rect.top) / zoom.value - defaults.h / 2
    addWidget(type,
      Math.max(0, Math.min(Math.max(0, bounds.width - defaults.w), Math.round(x / 8) * 8)),
      Math.max(0, Math.min(Math.max(0, bounds.height - defaults.h), Math.round(y / 8) * 8)),
      parentId)
  }

  function onCanvasLayerDrop(event: DragEvent, parentId?: string, sourceId = '') {
    dropTargetContainerId.value = ''
    if (!currentProject.value) return
    const widgetId = sourceId || event.dataTransfer?.getData('application/codeless-layer') || ''
    const source = widgetById(widgetId)
    if (!source || isWidgetLocked(source)) return
    if (parentId && !canDropIntoContainer(parentId, [source.id])) return

    let target: HTMLElement | null = null
    if (parentId) {
      const currentTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
      target = currentTarget?.matches('[data-container-id]')
        ? currentTarget
        : currentTarget?.querySelector<HTMLElement>('[data-container-id]') || null
    } else {
      target = canvasRef.value
    }
    if (!target) return

    const rect = target.getBoundingClientRect()
    const frame = getWidgetConfig(source).layout
    const localX = (event.clientX - rect.left) / zoom.value - frame.width / 2
    const localY = (event.clientY - rect.top) / zoom.value - frame.height / 2
    const parentAbsolute = parentId ? absolutePosition(widgetById(parentId)!) : { x: 0, y: 0 }
    const contentBox = parentId ? containerContentBox(parentId) : { x: 0, y: 0 }
    const desiredAbsolute = {
      x: parentAbsolute.x + contentBox.x + localX,
      y: parentAbsolute.y + contentBox.y + localY,
    }
    const before = {
      parentId: source.parentId,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    }
    pushHistory()
    if (!applyWidgetParent(source, parentId, desiredAbsolute)) {
      discardPendingHistory()
      return
    }
    const next = getWidgetConfig(source).layout
    const changed = before.parentId !== source.parentId || before.x !== next.x || before.y !== next.y
      || before.width !== next.width || before.height !== next.height
    if (!changed) {
      discardPendingHistory()
      return
    }
    selectWidget(source.id)
    markDirty()
  }

  function zoomBy(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return zoom.value
    const nextZoom = canvasViewport.setZoom(zoom.value * factor)
    updateCanvasViewport()
    return nextZoom
  }

  function fitCanvas(mode: 'page' | 'selection' = 'page') {
    canvasViewport.updateViewportSize()
    if (mode === 'selection' && selectedWidgets.value.length) {
      const rects = selectedWidgets.value.map(widget => {
        const position = absolutePosition(widget)
        const frame = layoutModel.renderedWidgetFrame(widget)
        return { x: position.x, y: position.y, right: position.x + frame.width, bottom: position.y + frame.height }
      })
      if (rects.length) {
        const left = Math.min(...rects.map(rect => rect.x))
        const top = Math.min(...rects.map(rect => rect.y))
        const right = Math.max(...rects.map(rect => rect.right))
        const bottom = Math.max(...rects.map(rect => rect.bottom))
        const fitted = canvasViewport.fitSelection({
          x: left,
          y: top,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
        })
        if (fitted) {
          updateCanvasViewport()
          return true
        }
      }
    }
    const fitted = canvasViewport.fitPage()
    if (fitted) updateCanvasViewport()
    return fitted
  }

  function handleCanvasWheel(event: WheelEvent) {
    canvasViewport.handleWheel(event)
    updateCanvasViewport()
  }

  function handleCanvasPanPointerDown(event: PointerEvent, force = false) {
    if (force) canvasViewport.startPan(event)
    else canvasViewport.handlePointerDown(event)
  }

  function handleCanvasPanPointerMove(event: PointerEvent) {
    canvasViewport.handlePointerMove(event)
    updateCanvasViewport()
  }

  function handleCanvasPanPointerUp(event: PointerEvent) {
    canvasViewport.handlePointerUp(event)
    updateCanvasViewport()
  }

  function handleCanvasPanPointerCancel(event: PointerEvent) {
    canvasViewport.handlePointerCancel(event)
    updateCanvasViewport()
  }

  function handleCanvasViewportKeydown(event: KeyboardEvent) {
    canvasViewport.handleKeydown(event)
  }

  function handleCanvasViewportKeyup(event: KeyboardEvent) {
    canvasViewport.handleKeyup(event)
  }

  function absolutePosition(widget: LowCodeWidget) {
    const widgets = currentProject.value?.layout.widgets || []
    const byId = new Map(widgets.map(item => [item.id, item]))
    let x = getWidgetConfig(widget).layout.x
    let y = getWidgetConfig(widget).layout.y
    const seen = new Set<string>()
    let parent = widget.parentId ? byId.get(widget.parentId) : undefined
    while (parent && !seen.has(parent.id)) {
      const frame = getWidgetConfig(parent).layout
      const contentBox = containerContentBox(parent.id)
      x += frame.x + contentBox.x
      y += frame.y + contentBox.y
      seen.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    return { x, y }
  }

  function guideFrameForWidget(widget: LowCodeWidget): CanvasGuideFrame {
    const position = absolutePosition(widget)
    const frame = layoutModel.renderedWidgetFrame(widget)
    const layout = getWidgetConfig(widget).layout
    return {
      id: widget.id,
      parentId: widget.parentId,
      x: position.x,
      y: position.y,
      width: Math.max(1, frame.width || layout.width),
      height: Math.max(1, frame.height || layout.height),
      rotation: layout.rotation,
      locked: layout.locked,
      hidden: layout.hidden,
    }
  }

  function absoluteParentOrigin(widget: LowCodeWidget) {
    if (!widget.parentId) return { x: 0, y: 0 }
    const parent = widgetById(widget.parentId)
    if (!parent) return { x: 0, y: 0 }
    const parentPosition = absolutePosition(parent)
    const content = containerContentBox(parent.id)
    return { x: parentPosition.x + content.x, y: parentPosition.y + content.y }
  }

  function applyAbsoluteFrameResults(widgets: LowCodeWidget[], results: CanvasGuideFrame[]) {
    const resultById = new Map(results.map(frame => [frame.id, frame]))
    const updates = widgets.flatMap(widget => {
      const result = resultById.get(widget.id)
      if (!result) return []
      const origin = absoluteParentOrigin(widget)
      const next = clampWidgetFrame(widget, result.x - origin.x, result.y - origin.y)
      return [{ widget, patch: { x: next.x, y: next.y } }]
    })
    if (!updates.length) return false
    pushHistory()
    applyWidgetFrameBatch(updates)
    markDirty()
    return true
  }

  function selectedLayoutWidgets() {
    const ids = new Set(selectedWidgetIds.value)
    return selectedWidgets.value.filter(widget => !isWidgetLocked(widget)
      && !Array.from(ids).some(id => id !== widget.id && isDescendantOf(widget.id, id)))
  }

  function alignSelectedWidgets(alignment: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') {
    const widgets = selectedLayoutWidgets()
    if (widgets.length < 2) return
    const frames = widgets.map(guideFrameForWidget)
    const normalized = alignment === 'centerX' ? 'center' : alignment === 'centerY' ? 'middle' : alignment
    const results = alignFrames(frames, normalized, {})
    if (applyAbsoluteFrameResults(widgets, results)) notify('\u5df2\u5b8c\u6210\u591a\u9009\u5bf9\u9f50', 'success')
  }

  function distributeSelectedWidgets(axis: 'x' | 'y') {
    const widgets = selectedLayoutWidgets()
    if (widgets.length < 3) return
    const results = distributeFrames(widgets.map(guideFrameForWidget), axis, { preserveOuterBounds: true })
    if (applyAbsoluteFrameResults(widgets, results)) notify(axis === 'x' ? '\u5df2\u5b8c\u6210\u6c34\u5e73\u7b49\u95f4\u8ddd' : '\u5df2\u5b8c\u6210\u5782\u76f4\u7b49\u95f4\u8ddd', 'success')
  }

  function toggleCanvasGrid() { gridEnabled.value = !gridEnabled.value }
  function toggleCanvasSnap() { snapEnabled.value = !snapEnabled.value; if (!snapEnabled.value) canvasGuideLines.value = [] }

  function normalizeSiblingZIndexes(parentId?: string) {
    const siblings = (currentProject.value?.layout.widgets || [])
      .filter(widget => widget.parentId === parentId)
      .sort((a, b) => getWidgetConfig(a).layout.zIndex - getWidgetConfig(b).layout.zIndex)
    siblings.forEach((widget, index) => setWidgetFrame(widget, { zIndex: index + 1 }))
  }

  /** Keep absolute visual position when changing the parent container. */
  function layerSiblings(parentId?: string) {
    const widgets = currentProject.value?.layout.widgets || []
    const sourceOrder = new Map(widgets.map((widget, index) => [widget.id, index]))
    return widgets
      .filter(widget => widget.parentId === parentId)
      .sort((a, b) => getWidgetConfig(b).layout.zIndex - getWidgetConfig(a).layout.zIndex || (sourceOrder.get(b.id)! - sourceOrder.get(a.id)!))
  }

  function normalizeLayerOrder(siblings: LowCodeWidget[]) {
    siblings.forEach((widget, index) => setWidgetFrame(widget, { zIndex: siblings.length - index }))
  }

  function applyWidgetParent(widget: LowCodeWidget, parentId?: string, absoluteOverride?: { x: number; y: number }, options: { allowLockedTarget?: boolean } = {}) {
    const parent = parentId ? widgetById(parentId) : undefined
    if (parentId && (!isContainerWidget(parent) || (!options.allowLockedTarget && isWidgetLocked(parent)))) return false
    if (parentId === widget.id || (parentId && isDescendantOf(parentId, widget.id))) return false
    if (widget.parentId === parentId && !absoluteOverride) return true
    const previousParentId = widget.parentId
    const absolute = absoluteOverride || absolutePosition(widget)
    widget.parentId = parentId || undefined
    const parentAbsolute = parent ? absolutePosition(parent) : { x: 0, y: 0 }
    const parentContentBox = parent ? containerContentBox(parent.id) : { x: 0, y: 0, width: 0, height: 0 }
    const local = clampWidgetFrame(widget, absolute.x - parentAbsolute.x - parentContentBox.x, absolute.y - parentAbsolute.y - parentContentBox.y)
    setWidgetFrame(widget, local)
    if (previousParentId !== parentId) {
      normalizeSiblingZIndexes(previousParentId)
      normalizeSiblingZIndexes(parentId)
    }
    return true
  }

  function reparentWidget(widgetId: string, parentId?: string) {
    const project = currentProject.value
    const widget = widgetById(widgetId)
    if (!project || !widget || isWidgetLocked(widget) || widget.parentId === parentId) return false
    if (parentId && !canDropIntoContainer(parentId, [widgetId])) return false
    pushHistory()
    if (!applyWidgetParent(widget, parentId)) {
      discardPendingHistory()
      return false
    }
    markDirty()
    return true
  }

  function moveLayerToIndex(widgetId: string, targetIndex: number) {
    const widget = widgetById(widgetId)
    if (!widget || isWidgetLocked(widget)) return
    const siblings = layerSiblings(widget.parentId)
    const fromIndex = siblings.findIndex(item => item.id === widgetId)
    if (fromIndex < 0) return
    const nextIndex = Math.max(0, Math.min(siblings.length - 1, Math.round(targetIndex)))
    if (fromIndex === nextIndex) return
    pushHistory()
    siblings.splice(fromIndex, 1)
    siblings.splice(nextIndex, 0, widget)
    normalizeLayerOrder(siblings)
    markDirty()
  }

  type LayerDropPosition = 'before' | 'after' | 'inside'

  function reorderWidgetsByLayer(widgetId: string, targetId: string, position: LayerDropPosition = 'before') {
    const source = widgetById(widgetId)
    const target = widgetById(targetId)
    if (!source || !target || source.id === target.id || isWidgetLocked(source)) return

    if (position === 'inside' && isContainerWidget(target)) {
      if (canDropIntoContainer(target.id, [source.id])) reparentWidget(source.id, target.id)
      return
    }

    const targetParentId = target.parentId
    if (targetParentId && !canDropIntoContainer(targetParentId, [source.id])) return

    if (source.parentId === targetParentId) {
      const siblings = layerSiblings(targetParentId)
      const nextSiblings = siblings.filter(item => item.id !== source.id)
      const targetIndex = nextSiblings.findIndex(item => item.id === target.id)
      if (targetIndex < 0) return
      const insertIndex = targetIndex + (position === 'after' ? 1 : 0)
      nextSiblings.splice(insertIndex, 0, source)
      const unchanged = nextSiblings.every((item, index) => item.id === siblings[index]?.id)
      if (unchanged) return
      pushHistory()
      normalizeLayerOrder(nextSiblings)
      markDirty()
      return
    }

    const oldParentId = source.parentId
    const absolute = absolutePosition(source)
    pushHistory()
    if (!applyWidgetParent(source, targetParentId, absolute)) {
      discardPendingHistory()
      return
    }
    const nextSiblings = layerSiblings(targetParentId).filter(item => item.id !== source.id)
    const targetIndex = nextSiblings.findIndex(item => item.id === target.id)
    if (targetIndex < 0) {
      discardPendingHistory()
      return
    }
    nextSiblings.splice(targetIndex + (position === 'after' ? 1 : 0), 0, source)
    normalizeLayerOrder(nextSiblings)
    if (oldParentId !== targetParentId) normalizeSiblingZIndexes(oldParentId)
    markDirty()
  }

  let moveState: MoveState | null = null
  let resizeState: ResizeState | null = null
  let selectionState: SelectionState | null = null
  let panelResizeState: { side: 'component' | 'inspector'; startX: number; startWidth: number } | null = null
  let moveFrame = 0
  let resizeFrame = 0
  let pendingMoveEvent: PointerEvent | null = null
  let lastMoveEvent: PointerEvent | null = null
  let pendingResizeEvent: PointerEvent | null = null

  function setPointerInteractionActive(active: boolean) {
    if (typeof document !== 'undefined') document.body.classList.toggle('codeless-pointer-active', active)
  }


  function applyWidgetFrameBatch(updates: Array<{ widget: LowCodeWidget; patch: Parameters<typeof setWidgetFrame>[1] }>) {
    for (const update of updates) setWidgetFrame(update.widget, update.patch)
  }

  // Synthetic pointer events used by automation (and a few embedded webviews)
  // do not always have an active pointer to capture.  Pointer capture is an
  // enhancement, not a prerequisite for moving, resizing, or marquee-selecting.
  function trySetPointerCapture(target: HTMLElement, pointerId: number) {
    try { target.setPointerCapture?.(pointerId) } catch { /* no active pointer */ }
  }

  function tryReleasePointerCapture(target: HTMLElement, pointerId: number) {
    try {
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture?.(pointerId)
    } catch { /* capture may already have been released */ }
  }

  function canvasPoint(event: PointerEvent) {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const width = currentProject.value?.layout.canvas.width || 960
    const height = currentProject.value?.layout.canvas.height || 720
    return {
      x: Math.max(0, Math.min(width, (event.clientX - rect.left) / zoom.value)),
      y: Math.max(0, Math.min(height, (event.clientY - rect.top) / zoom.value)),
    }
  }

  function updateCanvasSelection(event: PointerEvent) {
    if (!selectionState || !currentProject.value) return
    const point = canvasPoint(event)
    const state = selectionState
    const left = Math.min(state.startX, point.x)
    const top = Math.min(state.startY, point.y)
    const width = Math.abs(point.x - state.startX)
    const height = Math.abs(point.y - state.startY)
    if (!state.moved && Math.hypot(width, height) < dragThreshold) return
    state.moved = true
    suppressNextCanvasClick = true
    selectionBox.value = { x: left, y: top, width, height }

    const selected = selectWidgetsInRect(
      currentProject.value.layout.widgets,
      { x: left, y: top, width, height },
      absolutePosition,
      widget => getWidgetConfig(widget).layout,
    )
    const nextIds = state.additive
      ? Array.from(new Set([...selectedWidgetIds.value, ...selected]))
      : selected
    selectedWidgetIds.value = nextIds
    selectedWidgetId.value = nextIds[nextIds.length - 1] || ''
  }

  function startCanvasSelection(event: PointerEvent) {
    // Keep selection gestures on the canvas background only. This guard also
    // protects callers that invoke the composable directly, bypassing the
    // BuilderView capture-phase event boundary.
    const targetElement = event.target instanceof Element ? event.target : null
    if (targetElement?.closest('[data-widget-id]')) return
    if (event.button !== 0 || !currentProject.value || moveState || resizeState || selectionState) return
    const target = canvasRef.value
    if (!target) return
    selectionState = {
      startX: canvasPoint(event).x,
      startY: canvasPoint(event).y,
      pointerId: event.pointerId,
      target,
      moved: false,
      additive: event.shiftKey,
    }
    selectionBox.value = null
    trySetPointerCapture(target, event.pointerId)
    window.addEventListener('pointermove', updateCanvasSelection)
    window.addEventListener('pointerup', stopCanvasSelection, { once: true })
    window.addEventListener('pointercancel', stopCanvasSelection, { once: true })
  }

  function stopCanvasSelection(event?: PointerEvent) {
    const state = selectionState
    if (!state) return
    if (event?.type === 'pointercancel') {
      selectionBox.value = null
      suppressNextCanvasClick = false
    } else if (event?.type === 'pointerup') {
      selectionBox.value = null
    }
    window.removeEventListener('pointermove', updateCanvasSelection)
    window.removeEventListener('pointerup', stopCanvasSelection)
    window.removeEventListener('pointercancel', stopCanvasSelection)
    tryReleasePointerCapture(state.target, state.pointerId)
    selectionState = null
    if (!state.moved) selectionBox.value = null
  }

  function handleCanvasClick(event?: MouseEvent) {
    if (suppressNextCanvasClick) {
      suppressNextCanvasClick = false
      return
    }
    if (event?.shiftKey) return
    clearSelection()
  }

  function startPanelResize(event: PointerEvent, side: 'component' | 'inspector') {
    event.preventDefault()
    event.stopPropagation()
    panelResizeState = {
      side,
      startX: event.clientX,
      startWidth: side === 'component' ? componentPanelWidth.value : inspectorPanelWidth.value,
    }
    panelResizeSide.value = side
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', resizePanels)
    window.addEventListener('pointerup', stopPanelResize, { once: true })
    window.addEventListener('pointercancel', stopPanelResize, { once: true })
  }

  function resizePanels(event: PointerEvent) {
    if (!panelResizeState) return
    const delta = event.clientX - panelResizeState.startX
    const { min, max } = designerPanelWidthLimits(panelResizeState.side)
    const next = Math.round(Math.max(min, Math.min(max, panelResizeState.startWidth + (panelResizeState.side === 'component' ? delta : -delta))))
    if (panelResizeState.side === 'component') componentPanelWidth.value = next
    else inspectorPanelWidth.value = next
  }

  function clampPanelWidths() {
    const componentLimits = designerPanelWidthLimits('component')
    const inspectorLimits = designerPanelWidthLimits('inspector')
    componentPanelWidth.value = Math.max(componentLimits.min, Math.min(componentLimits.max, componentPanelWidth.value))
    inspectorPanelWidth.value = Math.max(inspectorLimits.min, Math.min(inspectorLimits.max, inspectorPanelWidth.value))
  }

  function stopPanelResize() {
    window.removeEventListener('pointermove', resizePanels)
    window.removeEventListener('pointercancel', stopPanelResize)
    if (panelResizeState?.side === 'component') saveDesignerPanelWidth('codeless-component-panel-width', componentPanelWidth.value)
    if (panelResizeState?.side === 'inspector') saveDesignerPanelWidth('codeless-inspector-panel-width', inspectorPanelWidth.value)
    panelResizeState = null
    panelResizeSide.value = ''
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  function startWidgetMove(event: PointerEvent, widget: LowCodeWidget) {
    if (event.button !== 0) return
    normalizeWidget(widget)
    if (!currentProject.value) return
    // A locked node must remain selectable so it can be unlocked from the
    // inspector/context menu. Do not prevent the native click in this branch.
    if (isWidgetLocked(widget)) {
      selectWidget(widget.id, event.shiftKey)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (moveState || resizeState) return

    const clickedWasSelected = selectedWidgetIds.value.includes(widget.id)
    const selectedCandidates = clickedWasSelected
      ? selectedWidgets.value
      : event.shiftKey
        ? [...selectedWidgets.value, widget]
        : [widget]
    const candidateIds = new Set(selectedCandidates.map(item => item.id))
    const widgets = selectedCandidates.filter(item => {
      if (isWidgetLocked(item)) return false
      return !Array.from(candidateIds).some(id => id !== item.id && isDescendantOf(item.id, id))
    })
    if (!widgets.length) return
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    if (!target) return

    moveState = {
      widgets: widgets.map(item => {
        const frame = getWidgetConfig(item).layout
        const absolute = absolutePosition(item)
        return { widget: item, originX: frame.x, originY: frame.y, originAbsoluteX: absolute.x, originAbsoluteY: absolute.y }
      }),
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      target,
      moved: false,
      axis: '',
      primaryWidgetId: widget.id,
      clickedWasSelected,
      selectionAdditive: event.shiftKey,
      deltaX: 0,
      deltaY: 0,
      historyLengthBefore: historyStack.value.length,
      futureBefore: clone(futureStack.value),
      dirtyBefore: dirty.value,
      layoutBefore: clone(currentProject.value.layout),
    }
    trySetPointerCapture(target, event.pointerId)
    window.addEventListener('pointermove', queueMoveWidget)
    window.addEventListener('pointerup', stopWidgetMove, { once: true })
    window.addEventListener('pointercancel', stopWidgetMove, { once: true })
  }

  function queueMoveWidget(event: PointerEvent) {
    if (!moveState) return
    const coalesced = event.getCoalescedEvents?.() || []
    const nextEvent = coalesced[coalesced.length - 1] || event
    lastMoveEvent = nextEvent
    pendingMoveEvent = nextEvent
    if (moveFrame) return
    moveFrame = window.requestAnimationFrame(() => {
      moveFrame = 0
      const nextEvent = pendingMoveEvent
      pendingMoveEvent = null
      if (nextEvent) applyMoveWidget(nextEvent)
    })
  }

  function applyMoveWidget(event: PointerEvent) {
    if (!moveState || !currentProject.value) return
    const state = moveState
    const screenDx = event.clientX - state.startX
    const screenDy = event.clientY - state.startY
    if (!state.moved) {
      if (Math.hypot(screenDx, screenDy) < dragThreshold) return
      pushHistory()
      state.moved = true
      if (!state.clickedWasSelected) selectWidget(state.primaryWidgetId, state.selectionAdditive)
      suppressNextWidgetClick = true
      draggingWidgetId.value = state.primaryWidgetId
      draggingWidgetIds.value = state.widgets.map(item => item.widget.id)
      setPointerInteractionActive(true)
    }
    let dx = screenDx / zoom.value
    let dy = screenDy / zoom.value
    if (event.shiftKey) {
      if (!state.axis) state.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      if (state.axis === 'x') dy = 0
      else dx = 0
    } else {
      state.axis = ''
    }
    let minDx = -Infinity
    let maxDx = Infinity
    let minDy = -Infinity
    let maxDy = Infinity
    state.widgets.forEach(({ widget, originX, originY }) => {
      const bounds = containerBounds(widget.parentId)
      const frame = getWidgetConfig(widget).layout
      minDx = Math.max(minDx, -originX)
      maxDx = Math.min(maxDx, bounds.width - frame.width - originX)
      minDy = Math.max(minDy, -originY)
      maxDy = Math.min(maxDy, bounds.height - frame.height - originY)
    })
    const requestedDx = Math.round(dx)
    const requestedDy = Math.round(dy)
    const visualDx = Math.max(minDx, Math.min(maxDx, requestedDx))
    const visualDy = Math.max(minDy, Math.min(maxDy, requestedDy))
    let finalDx = visualDx
    let finalDy = visualDy
    let activeGuides: CanvasGuideLine[] = []
    if (snapEnabled.value && !event.altKey) {
      const movingFrames = state.widgets.map(({ widget, originAbsoluteX, originAbsoluteY }) => {
        const frame = getWidgetConfig(widget).layout
        return { id: widget.id, parentId: widget.parentId, x: originAbsoluteX, y: originAbsoluteY, width: frame.width, height: frame.height }
      })
      const movingBounds = getCanvasGuideBounds(movingFrames)
      if (movingBounds) {
        const movingIds = new Set(state.widgets.map(item => item.widget.id))
        const referenceFrames = (currentProject.value.layout.widgets || [])
          .filter(widget => !movingIds.has(widget.id) && !state.widgets.some(item => isDescendantOf(widget.id, item.widget.id)))
          .map(widget => guideFrameForWidget(widget))
        const snap = smartSnapFrame({
          id: '__moving-selection__',
          x: movingBounds.x + visualDx,
          y: movingBounds.y + visualDy,
          width: movingBounds.width,
          height: movingBounds.height,
        }, {
          referenceFrames,
          canvas: { x: 0, y: 0, width: currentProject.value.layout.canvas.width, height: currentProject.value.layout.canvas.height },
          gridSize: gridEnabled.value ? gridSize.value : undefined,
          threshold: 6,
          excludeIds: ['__moving-selection__'],
        })
        finalDx = Math.max(minDx, Math.min(maxDx, Math.round(snap.frame.x - movingBounds.x)))
        finalDy = Math.max(minDy, Math.min(maxDy, Math.round(snap.frame.y - movingBounds.y)))
        activeGuides = snap.guides
      }
    }
    state.deltaX = Math.round(finalDx)
    state.deltaY = Math.round(finalDy)
    canvasGuideLines.value = showCanvasGuides.value ? activeGuides : []
    applyWidgetFrameBatch(state.widgets.map(({ widget, originX, originY }) => {
      const next = clampWidgetFrame(widget, originX + finalDx, originY + finalDy)
      return { widget, patch: { x: next.x, y: next.y } }
    }))
    dropTargetContainerId.value = containerAtPoint(event, state.widgets.map(item => item.widget.id))
  }

  function containerAtPoint(event: PointerEvent, movingIds: string[] = []) {
    if (typeof document === 'undefined') return ''
    const movingSet = new Set(movingIds)
    for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
      const widgetElement = element.closest<HTMLElement>('[data-widget-id]')
      const widgetId = widgetElement?.dataset.widgetId || ''
      // Ignore the moving subtree itself and any of its descendants. This keeps
      // the target stable when a container is dragged across its own children.
      if (widgetId && (movingSet.has(widgetId) || movingIds.some(id => isDescendantOf(widgetId, id)))) continue

      const contentElement = element.closest<HTMLElement>('[data-container-id]')
      const contentContainerId = contentElement?.dataset.containerId || ''
      if (contentContainerId && canDropIntoContainer(contentContainerId, movingIds)) return contentContainerId

      // A container header, close button or empty padding area may not be inside
      // the content layer. Treat the container widget itself as a valid target so
      // dropping is not limited to the tiny content region.
      if (widgetId && isContainerWidget(widgetById(widgetId)) && canDropIntoContainer(widgetId, movingIds)) return widgetId
    }
    return ''
  }

  function reparentMovedWidgets(state: MoveState, event: PointerEvent) {
    if (!state.moved) return
    const movingIds = state.widgets.map(item => item.widget.id)
    const targetId = containerAtPoint(event, movingIds)
    if (!targetId) return
    const topLevel = state.widgets.filter(({ widget }) => !state.widgets.some(other => other.widget.id !== widget.id && isDescendantOf(widget.id, other.widget.id)))
    topLevel.forEach(({ widget, originAbsoluteX, originAbsoluteY }) => {
      applyWidgetParent(widget, targetId, { x: originAbsoluteX + state.deltaX, y: originAbsoluteY + state.deltaY })
    })
    if (topLevel.length) markDirty()
  }

  function rollbackMove(state: MoveState) {
    if (currentProject.value) {
      currentProject.value.layout = clone(state.layoutBefore)
      currentProject.value.layout.widgets.forEach(normalizeWidget)
    }
    discardPendingHistory()
    historyStack.value.splice(state.historyLengthBefore)
    futureStack.value = clone(state.futureBefore)
    dirty.value = state.dirtyBefore
  }

  function comparableLayout(layout: PageLayout) {
    const snapshot = clone(layout)
    snapshot.widgets.forEach(widget => {
      const meta = widget.config?.meta as Record<string, unknown> | undefined
      if (meta) delete meta.updatedAt
    })
    return JSON.stringify(snapshot)
  }

  function layoutChangedFrom(layout: PageLayout) {
    return Boolean(currentProject.value && comparableLayout(currentProject.value.layout) !== comparableLayout(layout))
  }

  function stopWidgetMove(event?: PointerEvent) {
    const cancelled = event?.type === 'pointercancel'
    if (moveFrame) {
      window.cancelAnimationFrame(moveFrame)
      moveFrame = 0
    }
    if (!cancelled && event?.type === 'pointerup') {
      pendingMoveEvent = null
      lastMoveEvent = event
      applyMoveWidget(event)
    } else if (!cancelled && pendingMoveEvent) {
      const lastEvent = pendingMoveEvent
      pendingMoveEvent = null
      applyMoveWidget(lastEvent)
    } else {
      pendingMoveEvent = null
    }
    window.removeEventListener('pointermove', queueMoveWidget)
    window.removeEventListener('pointerup', stopWidgetMove)
    window.removeEventListener('pointercancel', stopWidgetMove)
    const state = moveState
    try {
      // Release capture before changing parentId. Reparenting can remove the
      // original DOM node from the document, which otherwise leaves the browser
      // holding a stale pointer target and makes the next drag unreliable.
      if (state) tryReleasePointerCapture(state.target, state.pointerId)
      if (state?.moved && cancelled) rollbackMove(state)
      if (state?.moved && !cancelled && lastMoveEvent) reparentMovedWidgets(state, lastMoveEvent)
      // Returning to the original position should not create an undo entry or
      // mark the project dirty, even if the pointer crossed the drag threshold.
      if (state?.moved && !cancelled && !layoutChangedFrom(state.layoutBefore)) rollbackMove(state)
      if (state?.moved && !cancelled && layoutChangedFrom(state.layoutBefore)) markDirty()
      if (!state?.moved || cancelled) suppressNextWidgetClick = false
    } finally {
      // Always clear the visual drag state in the same tick as the model update,
      // including cross-container moves. This lets the newly mounted node accept
      // pointerdown immediately after a drop, even if a DOM update or capture
      // release failed during finalization.
      draggingWidgetId.value = ''
      draggingWidgetIds.value = []
      dropTargetContainerId.value = ''
      canvasGuideLines.value = []
      setPointerInteractionActive(false)
      moveState = null
      pendingMoveEvent = null
      lastMoveEvent = null
    }
  }

  function startWidgetResize(event: PointerEvent, widget: LowCodeWidget, handle: string) {
    event.preventDefault()
    event.stopPropagation()
    normalizeWidget(widget)
    if (isWidgetLocked(widget) || moveState || resizeState || !currentProject.value) return
    selectWidget(widget.id)
    const frame = getWidgetConfig(widget).layout
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    if (!target) return
    resizeState = {
      widget,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      target,
      origin: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      moved: false,
      historyLengthBefore: historyStack.value.length,
      futureBefore: clone(futureStack.value),
      dirtyBefore: dirty.value,
      layoutBefore: clone(currentProject.value.layout),
    }
    trySetPointerCapture(target, event.pointerId)
    window.addEventListener('pointermove', queueResizeWidget)
    window.addEventListener('pointerup', stopWidgetResize, { once: true })
    window.addEventListener('pointercancel', stopWidgetResize, { once: true })
  }

  function queueResizeWidget(event: PointerEvent) {
    if (!resizeState) return
    pendingResizeEvent = event
    if (resizeFrame) return
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0
      const nextEvent = pendingResizeEvent
      pendingResizeEvent = null
      if (nextEvent) applyResizeWidget(nextEvent)
    })
  }

  function applyResizeWidget(event: PointerEvent) {
    if (!resizeState || !currentProject.value) return
    const state = resizeState
    const screenDx = event.clientX - state.startX
    const screenDy = event.clientY - state.startY
    if (!state.moved) {
      if (Math.hypot(screenDx, screenDy) < dragThreshold) return
      pushHistory()
      state.moved = true
      draggingWidgetId.value = state.widget.id
      draggingWidgetIds.value = [state.widget.id]
      suppressNextWidgetClick = true
      setPointerInteractionActive(true)
    }
    const dx = screenDx / zoom.value
    const dy = screenDy / zoom.value
    const bounds = containerBounds(state.widget.parentId)
    const minimum = widgetMinimumSize(state.widget)
    const minWidth = Math.min(bounds.width, Math.max(56, minimum.width))
    const minHeight = Math.min(bounds.height, Math.max(30, minimum.height))
    let { x, y, width, height } = state.origin
    if (state.handle.includes('e')) width = Math.max(minWidth, state.origin.width + dx)
    if (state.handle.includes('s')) height = Math.max(minHeight, state.origin.height + dy)
    if (state.handle.includes('w')) {
      x = Math.min(state.origin.x + state.origin.width - minWidth, state.origin.x + dx)
      width = state.origin.width - (x - state.origin.x)
    }
    if (state.handle.includes('n')) {
      y = Math.min(state.origin.y + state.origin.height - minHeight, state.origin.y + dy)
      height = state.origin.height - (y - state.origin.y)
    }
    if (event.shiftKey) {
      const ratio = state.origin.width / state.origin.height
      if (Math.abs(dx) > Math.abs(dy)) height = Math.max(minHeight, width / ratio)
      else width = Math.max(minWidth, height * ratio)
      if (state.handle.includes('n')) y = state.origin.y + state.origin.height - height
      if (state.handle.includes('w')) x = state.origin.x + state.origin.width - width
    }
    const nextWidth = Math.max(minWidth, Math.min(bounds.width, Math.round(width)))
    const nextHeight = Math.max(minHeight, Math.min(bounds.height, Math.round(height)))
    const nextPosition = clampWidgetFrame(state.widget, x, y, nextWidth, nextHeight)
    applyWidgetFrameBatch([{
      widget: state.widget,
      patch: { ...nextPosition, width: nextWidth, height: nextHeight },
    }])
    if (isContainerWidget(state.widget)) clampChildrenToParent(state.widget)
  }

  function stopWidgetResize(event?: PointerEvent) {
    const cancelled = event?.type === 'pointercancel'
    if (resizeFrame) {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = 0
    }
    if (!cancelled && event?.type === 'pointerup') {
      pendingResizeEvent = null
      applyResizeWidget(event)
    } else if (!cancelled && pendingResizeEvent) {
      const lastEvent = pendingResizeEvent
      pendingResizeEvent = null
      applyResizeWidget(lastEvent)
    } else {
      pendingResizeEvent = null
    }
    window.removeEventListener('pointermove', queueResizeWidget)
    window.removeEventListener('pointerup', stopWidgetResize)
    window.removeEventListener('pointercancel', stopWidgetResize)
    const state = resizeState
    const resizeChanged = Boolean(state?.moved && layoutChangedFrom(state.layoutBefore))
    if (state?.moved && (!resizeChanged || cancelled) && currentProject.value) {
      currentProject.value.layout = clone(state.layoutBefore)
      currentProject.value.layout.widgets.forEach(normalizeWidget)
    discardPendingHistory()
      historyStack.value.splice(state.historyLengthBefore)
      futureStack.value = clone(state.futureBefore)
      dirty.value = state.dirtyBefore
    }
    if (state) tryReleasePointerCapture(state.target, state.pointerId)
    if (resizeChanged && !cancelled) markDirty()
    if (!state?.moved || cancelled) suppressNextWidgetClick = false
    draggingWidgetId.value = ''
    draggingWidgetIds.value = []
    setPointerInteractionActive(false)
    resizeState = null
  }

  function inlineFieldFor(widget: LowCodeWidget, event?: MouseEvent): InlineEditingField | '' {
    const target = event?.target instanceof HTMLElement ? event.target : null
    if (widget.type === 'table' || widget.type === 'divider') return ''
    if (widget.type === 'heading') return target?.closest('.render-heading p') ? 'description' : 'text'
    if (widget.type === 'image') return target?.closest('.render-image small') ? 'description' : 'text'
    if (widget.type === 'stat') return target?.closest('.render-stat p b') ? 'trend' : 'text'
    if (widget.type === 'input' || widget.type === 'select') return target?.closest('.render-field > div') ? 'placeholder' : 'label'
    if (['modal', 'card', 'frame', 'stack', 'grid', 'drawer'].includes(widget.type)) {
      if (target?.closest('.render-container-header p, .render-drawer-description, .render-modal-card > p')) return 'description'
      return 'title'
    }
    return 'text'
  }

  function isInlineEditing(widgetId: string) {
    return inlineEditingWidgetId.value === widgetId
  }

  function startInlineEdit(widget: LowCodeWidget, event?: MouseEvent) {
    normalizeWidget(widget)
    if (isWidgetLocked(widget)) return
    const field = inlineFieldFor(widget, event)
    if (!field) return
    if (inlineEditingWidgetId.value) commitInlineEdit()
    if (moveState) stopWidgetMove()
    if (resizeState) stopWidgetResize()
    selectWidget(widget.id)
    const content = getWidgetConfig(widget).content as unknown as Record<string, unknown>
    inlineEditingWidgetId.value = widget.id
    inlineEditingField.value = field
    inlineEditingValue.value = String(content[field] ?? '')
    inlineEditingOriginalValue.value = inlineEditingValue.value
    inlineEditingFutureStack = clone(futureStack.value)
    pushHistory()
    inlineEditingHistoryIndex = historyStack.value.length
    void nextTick(() => {
      if (typeof document === 'undefined') return
      const editor = Array.from(document.querySelectorAll<HTMLElement>('[data-inline-editor]')).find(item => item.dataset.inlineEditor === widget.id)
      if (!editor) return
      editor.focus()
      if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) editor.select()
    })
  }

  function resetInlineEditState() {
    inlineEditingWidgetId.value = ''
    inlineEditingField.value = ''
    inlineEditingValue.value = ''
    inlineEditingOriginalValue.value = ''
    inlineEditingHistoryIndex = -1
    inlineEditingFutureStack = null
  }

  function commitInlineEdit() {
    const widgetId = inlineEditingWidgetId.value
    const field = inlineEditingField.value
    if (!widgetId || !field) return
    const widget = currentProject.value?.layout.widgets.find(item => item.id === widgetId)
    if (!widget) {
      resetInlineEditState()
      return
    }
    const nextValue = inlineEditingValue.value
    const changed = nextValue !== inlineEditingOriginalValue.value
    if (changed) {
      const content = getWidgetConfig(widget).content as unknown as Record<string, unknown>
      content[field] = nextValue
      syncLegacyProps(widget)
      markDirty()
    } else if (inlineEditingHistoryIndex >= 0 && historyStack.value.length === inlineEditingHistoryIndex) {
      discardPendingHistory()
      futureStack.value = inlineEditingFutureStack || []
    }
    resetInlineEditState()
  }

  function cancelInlineEdit() {
    if (!inlineEditingWidgetId.value) return
    if (inlineEditingHistoryIndex >= 0 && historyStack.value.length === inlineEditingHistoryIndex) {
      discardPendingHistory()
      futureStack.value = inlineEditingFutureStack || []
    }
    resetInlineEditState()
  }

  function descendantIds(widgetId: string) {
    const widgets = currentProject.value?.layout.widgets || []
    const result = new Set<string>()
    const visit = (parentId: string) => widgets.filter(widget => widget.parentId === parentId).forEach(child => {
      if (result.has(child.id)) return
      result.add(child.id)
      visit(child.id)
    })
    visit(widgetId)
    return result
  }

  function removeSelectedWidget() {
    if (!currentProject.value || !selectedWidgetIds.value.length) return
    const selected = selectedWidgets.value
    const removable = selected.filter(widget => !isWidgetLocked(widget))
    if (!removable.length) return
    const ids = new Set(removable.map(widget => widget.id))
    pushHistory()
    removable.filter(widget => isContainerWidget(widget)).forEach(parent => {
      const children = currentProject.value!.layout.widgets.filter(widget => widget.parentId === parent.id && !ids.has(widget.id))
      children.forEach(child => applyWidgetParent(child, parent.parentId, undefined, { allowLockedTarget: true }))
    })
    currentProject.value.layout.widgets = currentProject.value.layout.widgets.filter(widget => !ids.has(widget.id))
    clearSelection()
    markDirty()
  }

  function copySelectedWidgets() {
    if (!currentProject.value || !selectedWidgets.value.length) return
    const ids = new Set(selectedWidgets.value.flatMap(widget => [widget.id, ...descendantIds(widget.id)]))
    clipboardWidgets.value = clone(currentProject.value.layout.widgets.filter(widget => ids.has(widget.id)))
  }

  function pasteWidgets(parentId?: string) {
    if (!currentProject.value || !clipboardWidgets.value.length) return
    pushHistory()
    const idMap = new Map<string, string>()
    clipboardWidgets.value.forEach(item => idMap.set(item.id, makeId('widget')))
    const copiedRoots = clipboardWidgets.value.filter(item => !item.parentId)
    const pasteParentId = parentId && canDropIntoContainer(parentId, copiedRoots.map(item => item.id)) ? parentId : undefined
    const copies = clipboardWidgets.value.map(item => {
      const copy = clone(item)
      copy.id = idMap.get(item.id) || makeId('widget')
      copy.parentId = copy.parentId && idMap.has(copy.parentId)
        ? idMap.get(copy.parentId)
        : pasteParentId
      normalizeWidget(copy)
      return copy
    })
    // Paste containers together with their descendants and remap all parent IDs.
    currentProject.value.layout.widgets.push(...copies)
    copies.forEach(copy => {
      const frame = getWidgetConfig(copy).layout
      const offset = copy.parentId ? { x: frame.x + 16, y: frame.y + 16 } : { x: frame.x + 24, y: frame.y + 24 }
      const next = clampWidgetFrame(copy, offset.x, offset.y)
      setWidgetFrame(copy, next)
    })
    copies.forEach((widget, index) => setWidgetFrame(widget, { zIndex: currentProject.value!.layout.widgets.filter(item => item.parentId === widget.parentId).length + index + 1 }))
    selectedWidgetIds.value = copies.map(widget => widget.id)
    selectedWidgetId.value = copies[0]?.id || ''
    markDirty()
  }

  function duplicateSelectedWidget() {
    copySelectedWidgets()
    pasteWidgets()
  }

  function cutSelectedWidgets() {
    if (!selectedWidgets.value.length) return
    copySelectedWidgets()
    removeSelectedWidget()
  }

  function renameSelectedWidget() {
    const widget = selectedWidget.value
    if (!widget) return
    const nextName = window.prompt('重命名组件', widget.name)?.trim()
    if (!nextName || nextName === widget.name) return
    pushHistory()
    widget.name = nextName
    markDirty()
  }

  function toggleSelectedHidden() {
    if (!selectedWidgets.value.length) return
    const shouldHide = selectedWidgets.value.some(widget => !getWidgetConfig(widget).layout.hidden)
    pushHistory()
    selectedWidgets.value.forEach(widget => setWidgetFrame(widget, { hidden: shouldHide }))
    markDirty()
  }

  function toggleWidgetHidden(widgetId: string) {
    const widget = widgetById(widgetId)
    if (!widget) return
    pushHistory()
    setWidgetFrame(widget, { hidden: !getWidgetConfig(widget).layout.hidden })
    markDirty()
  }

  function toggleWidgetLocked(widgetId: string) {
    const widget = widgetById(widgetId)
    if (!widget) return
    pushHistory()
    setWidgetFrame(widget, { locked: !getWidgetConfig(widget).layout.locked })
    markDirty()
  }

  function selectAllWidgets() {
    if (!currentProject.value?.layout.widgets.length) return
    selectedWidgetIds.value = currentProject.value.layout.widgets.map(widget => widget.id)
    selectedWidgetId.value = selectedWidgetIds.value[selectedWidgetIds.value.length - 1] || ''
  }

  function canMoveSelectedLayer(delta: -1 | 1) {
    if (!currentProject.value || !selectedWidgets.value.length) return false
    const selectedIds = new Set(selectedWidgetIds.value)
    const movable = selectedWidgets.value.filter(widget => !isWidgetLocked(widget) && !Array.from(selectedIds).some(id => id !== widget.id && isDescendantOf(widget.id, id)))
    if (!movable.length) return false
    const groups = new Map<string, LowCodeWidget[]>()
    movable.forEach(widget => {
      const key = widget.parentId || ''
      groups.set(key, [...(groups.get(key) || []), widget])
    })
    return Array.from(groups.entries()).some(([parentKey, group]) => {
      const siblings = layerSiblings(parentKey || undefined)
      const selected = new Set(group.map(widget => widget.id))
      return siblings.some((widget, index) => {
        if (!selected.has(widget.id)) return false
        const adjacent = siblings[index - delta]
        return Boolean(adjacent && !selected.has(adjacent.id))
      })
    })
  }

  function moveSelectedLayer(delta: -1 | 1) {
    if (!currentProject.value || !selectedWidgets.value.length || !canMoveSelectedLayer(delta)) return
    const selectedIds = new Set(selectedWidgetIds.value)
    const movable = selectedWidgets.value.filter(widget => !isWidgetLocked(widget) && !Array.from(selectedIds).some(id => id !== widget.id && isDescendantOf(widget.id, id)))
    const groups = new Map<string, LowCodeWidget[]>()
    movable.forEach(widget => {
      const key = widget.parentId || ''
      groups.set(key, [...(groups.get(key) || []), widget])
    })
    pushHistory()
    groups.forEach((group, parentKey) => {
      const siblings = layerSiblings(parentKey || undefined)
      const selected = new Set(group.map(widget => widget.id))
      if (delta > 0) {
        for (let index = 1; index < siblings.length; index += 1) {
          if (selected.has(siblings[index].id) && !selected.has(siblings[index - 1].id)) {
            ;[siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]]
          }
        }
      } else {
        for (let index = siblings.length - 2; index >= 0; index -= 1) {
          if (selected.has(siblings[index].id) && !selected.has(siblings[index + 1].id)) {
            ;[siblings[index], siblings[index + 1]] = [siblings[index + 1], siblings[index]]
          }
        }
      }
      normalizeLayerOrder(siblings)
    })
    markDirty()
  }

  function bringToFront() {
    if (!currentProject.value || !selectedWidgets.value.length) return
    const movable = selectedWidgets.value.filter(widget => !isWidgetLocked(widget))
    if (!movable.length) return
    const groups = new Map<string, LowCodeWidget[]>()
    movable.forEach(widget => {
      const key = widget.parentId || ''
      groups.set(key, [...(groups.get(key) || []), widget])
    })
    pushHistory()
    groups.forEach((group, parentKey) => {
      const siblings = currentProject.value!.layout.widgets.filter(widget => (widget.parentId || '') === parentKey)
      const max = Math.max(0, ...siblings.map(widget => getWidgetConfig(widget).layout.zIndex))
      group.sort((a, b) => getWidgetConfig(a).layout.zIndex - getWidgetConfig(b).layout.zIndex)
        .forEach((widget, index) => setWidgetFrame(widget, { zIndex: max + index + 1 }))
    })
    markDirty()
  }

  function sendToBack() {
    if (!currentProject.value || !selectedWidgets.value.length) return
    const movable = selectedWidgets.value.filter(widget => !isWidgetLocked(widget))
    if (!movable.length) return
    const selectedIds = new Set(movable.map(widget => widget.id))
    const groups = new Map<string, LowCodeWidget[]>()
    movable.forEach(widget => {
      const key = widget.parentId || ''
      groups.set(key, [...(groups.get(key) || []), widget])
    })
    pushHistory()
    groups.forEach((group, parentKey) => {
      const siblings = currentProject.value!.layout.widgets
        .filter(widget => (widget.parentId || '') === parentKey)
        .sort((a, b) => getWidgetConfig(a).layout.zIndex - getWidgetConfig(b).layout.zIndex)
      const ordered = [
        ...siblings.filter(widget => selectedIds.has(widget.id)).sort((a, b) => getWidgetConfig(a).layout.zIndex - getWidgetConfig(b).layout.zIndex),
        ...siblings.filter(widget => !selectedIds.has(widget.id)),
      ]
      ordered.forEach((widget, index) => setWidgetFrame(widget, { zIndex: index + 1 }))
    })
    markDirty()
  }

  function toggleSelectedLocked() {
    if (!selectedWidgets.value.length) return
    pushHistory()
    const shouldLock = selectedWidgets.value.some(widget => !getWidgetConfig(widget).layout.locked)
    selectedWidgets.value.forEach(widget => setWidgetFrame(widget, { locked: shouldLock }))
    markDirty()
  }

  const selectedComponentDefinition = computed(() => {
    const widget = selectedWidget.value
    const link = getComponentLink(widget)
    return link ? getComponentDefinition(currentProject.value, link.definitionId) : undefined
  })
  const selectedComponentInstanceCount = computed(() => {
    const definition = selectedComponentDefinition.value
    return definition ? componentInstanceCount(currentProject.value, definition.id) : 0
  })

  function createSelectedComponentDefinition(migrateLegacyVariants = false) {
    const project = currentProject.value
    const widget = selectedWidget.value
    if (!project || !widget) return false
    if (getComponentLink(widget)?.role === 'definition') {
      notify('当前选中的是组件定义，无需重复创建。', 'info')
      return false
    }
    pushHistory()
    const definition = migrateLegacyVariants
      ? migrateLegacyVariantsToComponent(project, widget)
      : createComponentDefinition(project, widget)
    if (!definition) {
      notify('未能根据当前组件创建组件定义。', 'info')
      return false
    }
    markDirty()
    notify('已创建组件：' + definition.name)
    return true
  }

  function createSelectedComponentInstance() {
    const project = currentProject.value
    const widget = selectedWidget.value
    if (!project || !widget) return false
    const link = getComponentLink(widget)
    if (!link) {
      notify('请先选中一个已关联的组件定义。', 'info')
      return false
    }
    pushHistory()
    const instance = createComponentInstance(project, widget)
    if (!instance) return false
    selectWidget(instance.id)
    markDirty()
    notify('已创建 ' + instance.name + ' 的实例')
    return true
  }

  function refreshSelectedComponentInstance(mode: 'preserve-overrides' | 'reset-overrides' = 'preserve-overrides') {
    const project = currentProject.value
    const widget = selectedWidget.value
    if (!project || !widget) return false
    pushHistory()
    if (!refreshComponentInstance(project, widget, mode)) return false
    markDirty()
    notify(mode === 'reset-overrides' ? '已重置局部覆盖并同步组件最新变更。' : '已保留局部覆盖并同步组件最新变更。')
    return true
  }

  function detachSelectedComponentInstance() {
    const widget = selectedWidget.value
    if (!widget) return false
    pushHistory()
    if (!detachComponentInstance(widget)) return false
    markDirty()
    notify('已解除组件实例关联。')
    return true
  }

  function syncWidget(widget: LowCodeWidget | undefined) {
    if (!widget) return
    normalizeWidget(widget)
    const project = currentProject.value
    if (project) {
      const link = getComponentLink(widget)
      if (link?.role === 'definition') publishComponentDefinition(project, widget)
      else if (link?.role === 'instance') recordComponentInstanceOverrides(project, widget)
    }
    beginExternalHistory()
    markDirty({ preserveHistory: true })
  }

  function updateWidgetVariant(event: Event) {
    const widget = selectedWidget.value
    if (!widget) return
    const value = (event.target as HTMLSelectElement).value
    const config = getWidgetConfig(widget)
    config.variant = value || undefined
    config.content.variant = value || undefined
    syncLegacyProps(widget)
    syncWidget(widget)
  }

  function updateWidgetTokenRef(key: keyof WidgetStyleTokenRefs, event: Event) {
    const widget = selectedWidget.value
    if (!widget) return
    const value = (event.target as HTMLSelectElement).value
    const config = getWidgetConfig(widget)
    config.style.tokenRefs ||= {}
    if (value) config.style.tokenRefs[key] = value
    else delete config.style.tokenRefs[key]
    config.meta.updatedAt = new Date().toISOString()
    syncLegacyProps(widget)
    syncWidget(widget)
  }

  function updateDataSource(widget: LowCodeWidget, event: Event) {
    const table = (event.target as HTMLSelectElement).value
    const config = getWidgetConfig(widget)
    if (!table) config.data = { source: 'static' }
    else config.data = { ...config.data, source: 'table', table, mode: config.data.mode || 'list' }
    syncLegacyProps(widget)
    syncWidget(widget)
  }

  function updateDataBinding(widget: LowCodeWidget, binding: WidgetDataBinding) {
    const config = getWidgetConfig(widget)
    const cleanBinding = Object.fromEntries(Object.entries(binding).filter(([, value]) => value !== undefined && value !== '')) as WidgetDataBinding
    config.data = cleanBinding.source === 'table' ? { ...cleanBinding, source: 'table' } : { source: 'static' }
    syncLegacyProps(widget)
    syncWidget(widget)
  }

  function updateSubmitTarget(widget: LowCodeWidget, event: Event) {
    const table = (event.target as HTMLSelectElement).value
    const config = getWidgetConfig(widget)
    config.submitTo = table ? { table } : undefined
    syncLegacyProps(widget)
    syncWidget(widget)
  }
  function updateColumns(event: Event) {
    if (!selectedWidget.value) return
    const text = (event.target as HTMLTextAreaElement).value
    getWidgetConfig(selectedWidget.value).content.columns = parseColumns(text)
    syncLegacyProps(selectedWidget.value)
    syncWidget(selectedWidget.value)
  }

  function updateOptions(event: Event) {
    if (!selectedWidget.value) return
    const text = (event.target as HTMLTextAreaElement).value
    getWidgetConfig(selectedWidget.value).content.options = parseOptions(text)
    syncLegacyProps(selectedWidget.value)
    syncWidget(selectedWidget.value)
  }

  function serializeWidgetColumns(widget: LowCodeWidget) { return serializeColumns(getWidgetConfig(widget).content.columns) }
  function serializeWidgetOptions(widget: LowCodeWidget) { return serializeOptions(getWidgetConfig(widget).content.options) }

  function isWebGLWidget(widget: LowCodeWidget) {
    return performance.isWebGLWidget(widget, selectedWidgetIds, isInlineEditing)
  }

  function setWebGLSupported(value: boolean) {
    performance.setWebGLSupported(value)
  }

  function toggleWebGLAcceleration() {
    if (!largeProjectMode.value) {
      notify('\u5927\u9879\u76ee\u4e2d WebGL \u4e0d\u53ef\u7528\uff0c\u5df2\u4fdd\u7559 DOM \u6e32\u67d3', 'info')
      return
    }
    const enabled = performance.toggleWebGLAcceleration()
    notify(enabled ? '\u5df2\u5f00\u542f WebGL \u5c40\u90e8\u52a0\u901f' : '\u5df2\u5173\u95ed WebGL \u5c40\u90e8\u52a0\u901f', 'info')
  }

  function webglWidgetFrame(widget: LowCodeWidget) {
    return performance.webglWidgetFrame(widget)
  }

  function widgetStyle(widget: LowCodeWidget) {
    const frame = layoutModel.renderedWidgetFrame(widget)
    return {
      left: `${frame.x}px`,
      top: `${frame.y}px`,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      zIndex: frame.zIndex,
      transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
      opacity: frame.hidden ? 0.28 : 1,
    }
  }

  function addWidgetEvent(widget = selectedWidget.value, eventType?: WidgetEventType) {
    if (!widget) return
    const event = eventType || eventOptionsForWidget(widget.type)[0]?.value
    if (!event) return
    pushHistory()
    const events = getWidgetEvents(widget)
    const nextEvent: WidgetEvent = {
      id: makeId('event'),
      event,
      enabled: true,
      actions: [{ id: makeId('action'), type: 'showToast', value: `${widget.name}已触发` }],
    }
    events.push(nextEvent)
    syncLegacyProps(widget)
    markDirty()
  }

  function removeWidgetEvent(eventId: string) {
    if (!selectedWidget.value) return
    const events = getWidgetEvents(selectedWidget.value)
    if (!events.some(item => item.id === eventId)) return
    pushHistory()
    getWidgetConfig(selectedWidget.value).interaction.events = events.filter(item => item.id !== eventId)
    syncLegacyProps(selectedWidget.value)
    markDirty()
  }

  function addEventAction(eventId: string, type: WidgetEventActionType = 'showToast') {
    const event = selectedWidget.value && getWidgetEvents(selectedWidget.value).find(item => item.id === eventId)
    if (!event) return
    pushHistory()
    const action: WidgetEventAction = { id: makeId('action'), type }
    if (type === 'showToast') action.value = 'Action completed'
    event.actions.push(action)
    markDirty()
  }

  function removeEventAction(eventId: string, actionId: string) {
    const event = selectedWidget.value && getWidgetEvents(selectedWidget.value).find(item => item.id === eventId)
    if (!event) return
    pushHistory()
    event.actions = event.actions.filter(action => action.id !== actionId)
    markDirty()
  }

  function resetDesigner(options: DesignerResetOptions = {}) {
    // The history controller owns onLayoutHistoryReset/onHistoryPruned collaboration callbacks.
    persistence.clear()
    history.reset(options)
    clearSelection()
    clipboardWidgets.value = []
    dirty.value = false
  }

  function moveSelectedBy(dx: number, dy: number) {
    if (!currentProject.value || !selectedWidgetIds.value.length) return
    const selectedIds = new Set(selectedWidgetIds.value)
    const movable = selectedWidgets.value.filter(widget => {
      if (isWidgetLocked(widget)) return false
      return !Array.from(selectedIds).some(id => id !== widget.id && isDescendantOf(widget.id, id))
    })
    if (!movable.length) return
    let minDx = -Infinity
    let maxDx = Infinity
    let minDy = -Infinity
    let maxDy = Infinity
    movable.forEach(widget => {
      const frame = getWidgetConfig(widget).layout
      const bounds = containerBounds(widget.parentId)
      minDx = Math.max(minDx, -frame.x)
      maxDx = Math.min(maxDx, bounds.width - frame.width - frame.x)
      minDy = Math.max(minDy, -frame.y)
      maxDy = Math.min(maxDy, bounds.height - frame.height - frame.y)
    })
    const actualDx = Math.max(minDx, Math.min(maxDx, dx))
    const actualDy = Math.max(minDy, Math.min(maxDy, dy))
    if (actualDx === 0 && actualDy === 0) return
    pushHistory()
    movable.forEach(widget => {
      const frame = getWidgetConfig(widget).layout
      setWidgetFrame(widget, { x: frame.x + actualDx, y: frame.y + actualDy })
    })
    markDirty()
  }

  function onKeydown(event: KeyboardEvent) {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)
    if (activeArea?.value !== 'builder') return
    const command = event.ctrlKey || event.metaKey
    if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault()
      removeSelectedWidget()
      return
    }
    if (command && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void flushAutoSave()
      return
    }
    if (!editing && command && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? (historyOptions.onRedo?.() || redo()) : (historyOptions.onUndo?.() || undo())
      return
    }
    if (!editing && command && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      historyOptions.onRedo?.() || redo()
      return
    }
    if (!editing && command && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      copySelectedWidgets()
      return
    }
    if (!editing && command && event.key.toLowerCase() === 'x') {
      event.preventDefault()
      cutSelectedWidgets()
      return
    }
    if (!editing && command && event.key.toLowerCase() === 'v') {
      event.preventDefault()
      pasteWidgets()
      return
    }
    if (!editing && command && event.key.toLowerCase() === 'd') {
      event.preventDefault()
      duplicateSelectedWidget()
      return
    }
    if (!editing && command && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selectAllWidgets()
      return
    }
    if (!editing && event.shiftKey && event.key === '1') {
      event.preventDefault()
      fitCanvas('page')
      return
    }
    if (!editing && event.shiftKey && event.key === '2') {
      event.preventDefault()
      fitCanvas('selection')
      return
    }
    if (!editing && event.key === 'Escape') {
      event.preventDefault()
      if (contextMenu.value.visible) {
        closeContextMenu()
        return
      }
      if (selectionState) {
        stopCanvasSelection({ type: 'pointercancel' } as PointerEvent)
        clearSelection()
        return
      }
      if (moveState) {
        stopWidgetMove({ type: 'pointercancel' } as PointerEvent)
        return
      }
      if (resizeState) {
        stopWidgetResize({ type: 'pointercancel' } as PointerEvent)
        return
      }
      clearSelection()
      return
    }
    if (!editing && selectedWidgets.value.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const step = event.shiftKey ? 10 : 1
      moveSelectedBy(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)
    }
  }

  onMounted(() => {
    clampPanelWidths()
    const viewport = canvasViewportRef.value
    viewport?.addEventListener('scroll', updateCanvasViewport, { passive: true })
    window.addEventListener('resize', updateCanvasViewport)
    void nextTick(updateCanvasViewport)
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('resize', clampPanelWidths)
    window.addEventListener('resize', closeContextMenu)
    window.addEventListener('scroll', closeContextMenu, true)
    window.addEventListener('pointerdown', handleDocumentPointerDown)
  })
  onBeforeUnmount(() => {
    canvasViewportRef.value?.removeEventListener('scroll', updateCanvasViewport)
    window.removeEventListener('resize', updateCanvasViewport)
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', clampPanelWidths)
    window.removeEventListener('resize', closeContextMenu)
    window.removeEventListener('scroll', closeContextMenu, true)
    window.removeEventListener('pointerdown', handleDocumentPointerDown)
    window.removeEventListener('pointermove', queueMoveWidget)
    window.removeEventListener('pointercancel', stopWidgetMove)
    window.removeEventListener('pointermove', updateCanvasSelection)
    window.removeEventListener('pointercancel', stopCanvasSelection)
    window.removeEventListener('pointermove', queueResizeWidget)
    window.removeEventListener('pointercancel', stopWidgetResize)
    // Do not discard a final debounced save solely because Builder unmounts.
    void flushAutoSave()
    history.dispose()
    stopCanvasSelection({ type: 'pointercancel' } as PointerEvent)
    stopWidgetMove()
    stopWidgetResize()
    stopPanelResize()
  })

  return {
    isWidgetLocked, isWidgetSelfLocked,
    selectedWidgetId, selectedWidgetIds, selectedWidgets, paletteSearch, paletteTab, inspectorTab, zoom, dirty, dirtyRevision, canvasRef, canvasViewportRef, canvasViewport, canvasRootWidgets, canvasChildrenFor, canvasVisibleWidgetIds, updateCanvasViewport, historyStack, futureStack,
    gridEnabled, snapEnabled, showCanvasGuides, gridSize, canvasGuideLines, canvasGridStyle,
    largeProjectMode, webglAcceleration, webglSupported, webglWidgetIds, webglWidgets, performanceSummary, isWebGLWidget, setWebGLSupported, toggleWebGLAcceleration, webglWidgetFrame,
    markDirty, flushAutoSave, flushHistory, clearFutureHistory, beginExternalHistory, syncHistoryBaseline,
    selectedWidget, selectedComponentDefinition, selectedComponentInstanceCount, filteredGroups, layerWidgets, componentPanelWidth, inspectorPanelWidth, panelResizeSide, draggingWidgetId, draggingWidgetIds, dropTargetContainerId, selectionBox, setDropTargetContainer,
    inlineEditingWidgetId, inlineEditingField, inlineEditingValue, isInlineEditing, startInlineEdit, commitInlineEdit, cancelInlineEdit,
    zoomBy, fitCanvas,
    pushHistory, undo, redo, selectWidget, handleWidgetClick, handleWidgetContextMenu, handleCanvasContextMenu, closeContextMenu, repositionContextMenu, contextMenu, canPaste, clearSelection, canDropIntoContainer, startPaletteDrag, addWidget, onCanvasDrop, handleCanvasWheel, moveLayerToIndex, reorderWidgetsByLayer, reparentWidget,
    startPanelResize, startCanvasSelection, handleCanvasClick, insertWidgets, handleCanvasPanPointerDown, handleCanvasPanPointerMove, handleCanvasPanPointerUp, handleCanvasPanPointerCancel, handleCanvasViewportKeydown, handleCanvasViewportKeyup,
    startWidgetMove, startWidgetResize, removeSelectedWidget, duplicateSelectedWidget, copySelectedWidgets, cutSelectedWidgets, pasteWidgets, renameSelectedWidget, selectAllWidgets, bringToFront, sendToBack, moveSelectedLayer, canMoveSelectedLayer,
    alignSelectedWidgets, distributeSelectedWidgets, toggleCanvasGrid, toggleCanvasSnap,
    toggleSelectedLocked, toggleSelectedHidden, toggleWidgetLocked, toggleWidgetHidden, createSelectedComponentDefinition, createSelectedComponentInstance, refreshSelectedComponentInstance, detachSelectedComponentInstance, syncWidget, updateWidgetVariant, updateWidgetTokenRef, updateDataSource, updateDataBinding, updateSubmitTarget, updateColumns, updateOptions, serializeWidgetColumns, serializeWidgetOptions, widgetStyle, resetDesigner,
    addWidgetEvent, removeWidgetEvent, addEventAction, removeEventAction,
  }
}
