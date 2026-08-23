import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toValue,
  watch,
  type CSSProperties,
  type Ref,
} from 'vue'
import type {
  DesignerCanvasAnchor,
  DesignerCanvasFitOptions,
  DesignerCanvasPoint,
  DesignerCanvasRect,
  DesignerCanvasSize,
  DesignerCanvasViewportApi,
  DesignerCanvasViewportOptions,
} from '../types/designerCanvasViewport'

const DEFAULT_MIN_ZOOM = 0.1
const DEFAULT_MAX_ZOOM = 4
const DEFAULT_ZOOM = 1
const DEFAULT_ZOOM_STEP = 0.1
const DEFAULT_WHEEL_ZOOM_FACTOR = 1.1
const DEFAULT_FIT_PADDING = 32

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positiveNumber(value: unknown, fallback: number) {
  const result = finiteNumber(value, fallback)
  return result > 0 ? result : fallback
}

function nonNegativeNumber(value: unknown, fallback: number) {
  const result = finiteNumber(value, fallback)
  return result >= 0 ? result : fallback
}

function validSize(value: DesignerCanvasSize | null | undefined): DesignerCanvasSize | null {
  if (!value) return null
  const width = finiteNumber(value.width, 0)
  const height = finiteNumber(value.height, 0)
  return width > 0 && height > 0 ? { width, height } : null
}

function validRect(value: DesignerCanvasRect | null | undefined): DesignerCanvasRect | null {
  if (!value) return null
  const width = finiteNumber(value.width, 0)
  const height = finiteNumber(value.height, 0)
  if (width <= 0 || height <= 0) return null
  return {
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    width,
    height,
  }
}

export function clampCanvasZoom(value: number, minZoom: number, maxZoom: number) {
  const min = Math.min(minZoom, maxZoom)
  const max = Math.max(minZoom, maxZoom)
  return Math.max(min, Math.min(max, finiteNumber(value, min)))
}

/**
 * Returns the pan required to keep an anchor point stationary while zooming.
 * `pan` and `anchor` are viewport-local pixels; the returned pan is also pixels.
 */
export function zoomCanvasAroundPoint(
  pan: DesignerCanvasPoint,
  oldZoom: number,
  nextZoom: number,
  anchor: DesignerCanvasPoint,
): DesignerCanvasPoint {
  const safeOldZoom = Math.max(0.0001, oldZoom)
  const canvasPoint = {
    x: (anchor.x - pan.x) / safeOldZoom,
    y: (anchor.y - pan.y) / safeOldZoom,
  }
  return {
    x: anchor.x - canvasPoint.x * nextZoom,
    y: anchor.y - canvasPoint.y * nextZoom,
  }
}

/** Returns a centered zoom and pan for fitting a logical rectangle in a viewport. */
export function fitCanvasRect(
  bounds: DesignerCanvasRect,
  viewport: DesignerCanvasSize,
  padding: number,
  minZoom: number,
  maxZoom: number,
) {
  const safeBounds = validRect(bounds)
  const safeViewport = validSize(viewport)
  if (!safeBounds || !safeViewport) return null

  const safePadding = Math.max(0, finiteNumber(padding, 0))
  const availableWidth = Math.max(1, safeViewport.width - safePadding * 2)
  const availableHeight = Math.max(1, safeViewport.height - safePadding * 2)
  const zoom = clampCanvasZoom(
    Math.min(availableWidth / safeBounds.width, availableHeight / safeBounds.height),
    minZoom,
    maxZoom,
  )
  const center = {
    x: safeViewport.width / 2,
    y: safeViewport.height / 2,
  }
  return {
    zoom,
    pan: {
      x: center.x - (safeBounds.x + safeBounds.width / 2) * zoom,
      y: center.y - (safeBounds.y + safeBounds.height / 2) * zoom,
    },
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(target.tagName)
}

function pointFromWheelEvent(event: WheelEvent, viewport: HTMLElement | null): DesignerCanvasPoint {
  if (!viewport) return { x: 0, y: 0 }
  const rect = viewport.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function eventDelta(event: WheelEvent, viewport: HTMLElement | null) {
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? Math.max(1, viewport?.clientHeight || 1)
      : 1
  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  }
}

export function useDesignerCanvasViewport(
  options: DesignerCanvasViewportOptions = {},
): DesignerCanvasViewportApi {
  const viewportRef = options.viewportRef || ref<HTMLElement | null>(null)
  const contentRef = options.contentRef || ref<HTMLElement | null>(null)

  const minZoom = computed(() => positiveNumber(
    options.minZoom === undefined ? DEFAULT_MIN_ZOOM : toValue(options.minZoom),
    DEFAULT_MIN_ZOOM,
  ))
  const maxZoom = computed(() => Math.max(minZoom.value, positiveNumber(
    options.maxZoom === undefined ? DEFAULT_MAX_ZOOM : toValue(options.maxZoom),
    DEFAULT_MAX_ZOOM,
  )))
  const zoomStep = computed(() => positiveNumber(
    options.zoomStep === undefined ? DEFAULT_ZOOM_STEP : toValue(options.zoomStep),
    DEFAULT_ZOOM_STEP,
  ))
  const wheelZoomFactor = computed(() => Math.max(1.001, positiveNumber(
    options.wheelZoomFactor === undefined ? DEFAULT_WHEEL_ZOOM_FACTOR : toValue(options.wheelZoomFactor),
    DEFAULT_WHEEL_ZOOM_FACTOR,
  )))
  const fitPadding = computed(() => nonNegativeNumber(
    options.fitPadding === undefined ? DEFAULT_FIT_PADDING : toValue(options.fitPadding),
    DEFAULT_FIT_PADDING,
  ))

  const zoom = ref(clampCanvasZoom(
    options.initialZoom === undefined ? DEFAULT_ZOOM : toValue(options.initialZoom),
    minZoom.value,
    maxZoom.value,
  ))
  const pan = ref<DesignerCanvasPoint>({ x: 0, y: 0 })
  const viewportSize = ref<DesignerCanvasSize>({ width: 0, height: 0 })
  const pointerPanState = shallowRef<{
    pointerId: number
    lastX: number
    lastY: number
    target: HTMLElement
  } | null>(null)
  const spacePressed = ref(false)
  const attachedViewport = shallowRef<HTMLElement | null>(null)

  const isPanning = computed(() => pointerPanState.value !== null)
  const zoomPercent = computed(() => Math.round(zoom.value * 100))
  const configuredPageSize = computed(() => validSize(options.pageSize ? toValue(options.pageSize) : null))
  const configuredSelection = computed(() => validRect(options.selectionBounds ? toValue(options.selectionBounds) : null))

  const contentStyle = computed<CSSProperties>(() => {
    const page = configuredPageSize.value
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: `${page?.width || 0}px`,
      height: `${page?.height || 0}px`,
      transformOrigin: '0 0',
      transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${zoom.value})`,
      willChange: isPanning.value ? 'transform' : undefined,
    }
  })

  const viewportStyle = computed<CSSProperties>(() => ({
    position: 'relative',
    overflow: 'hidden',
    touchAction: 'none',
    overscrollBehavior: 'contain',
  }))

  function readViewportSize(): DesignerCanvasSize {
    const viewport = viewportRef.value
    if (viewport) {
      const width = viewport.clientWidth || viewport.getBoundingClientRect().width
      const height = viewport.clientHeight || viewport.getBoundingClientRect().height
      if (width > 0 && height > 0) return { width, height }
    }
    return validSize(options.viewportSize ? toValue(options.viewportSize) : null) || { width: 0, height: 0 }
  }

  function updateViewportSize() {
    viewportSize.value = readViewportSize()
    return viewportSize.value
  }

  function resolvePageSize(explicit?: DesignerCanvasSize | null) {
    const direct = validSize(explicit)
    if (direct) return direct
    if (configuredPageSize.value) return configuredPageSize.value
    const content = contentRef.value
    if (!content) return null
    return validSize({ width: content.offsetWidth, height: content.offsetHeight })
  }

  function resolveSelection(explicit?: DesignerCanvasRect | null) {
    return validRect(explicit) || configuredSelection.value
  }

  function anchorPoint(anchor: DesignerCanvasAnchor = 'center'): DesignerCanvasPoint {
    if (anchor !== 'center') return anchor
    return {
      x: viewportSize.value.width / 2,
      y: viewportSize.value.height / 2,
    }
  }

  function setPan(point: DesignerCanvasPoint) {
    pan.value = {
      x: finiteNumber(point.x, pan.value.x),
      y: finiteNumber(point.y, pan.value.y),
    }
  }

  function panBy(delta: DesignerCanvasPoint) {
    setPan({
      x: pan.value.x + finiteNumber(delta.x, 0),
      y: pan.value.y + finiteNumber(delta.y, 0),
    })
  }

  function setZoom(value: number, anchor: DesignerCanvasAnchor = 'center') {
    const nextZoom = clampCanvasZoom(value, minZoom.value, maxZoom.value)
    if (nextZoom === zoom.value) return nextZoom
    const nextPan = zoomCanvasAroundPoint(pan.value, zoom.value, nextZoom, anchorPoint(anchor))
    pan.value = nextPan
    zoom.value = nextZoom
    return nextZoom
  }

  function zoomIn(anchor: DesignerCanvasAnchor = 'center') {
    return setZoom(zoom.value + zoomStep.value, anchor)
  }

  function zoomOut(anchor: DesignerCanvasAnchor = 'center') {
    return setZoom(zoom.value - zoomStep.value, anchor)
  }

  function resetZoom(anchor: DesignerCanvasAnchor = 'center') {
    const initial = options.initialZoom === undefined ? DEFAULT_ZOOM : toValue(options.initialZoom)
    return setZoom(initial, anchor)
  }

  function centerOn(bounds: DesignerCanvasRect) {
    const result = fitCanvasRect(bounds, viewportSize.value, 0, zoom.value, zoom.value)
    if (!result) return false
    setPan(result.pan)
    return true
  }

  function fitBounds(bounds: DesignerCanvasRect, fitOptions: DesignerCanvasFitOptions = {}) {
    const min = positiveNumber(fitOptions.minZoom, minZoom.value)
    const max = Math.max(min, positiveNumber(fitOptions.maxZoom, maxZoom.value))
    const result = fitCanvasRect(
      bounds,
      viewportSize.value,
      fitOptions.padding === undefined ? fitPadding.value : fitOptions.padding,
      min,
      max,
    )
    if (!result) return false
    zoom.value = result.zoom
    pan.value = result.pan
    return true
  }

  function fitPage(pageSize?: DesignerCanvasSize | null, fitOptions?: DesignerCanvasFitOptions) {
    const page = resolvePageSize(pageSize)
    return page ? fitBounds({ x: 0, y: 0, ...page }, fitOptions) : false
  }

  function fitSelection(selection?: DesignerCanvasRect | null, fitOptions?: DesignerCanvasFitOptions) {
    const bounds = resolveSelection(selection)
    return bounds ? fitBounds(bounds, fitOptions) : false
  }

  function fitSelectionOrPage(fitOptions?: DesignerCanvasFitOptions) {
    return fitSelection(undefined, fitOptions) || fitPage(undefined, fitOptions)
  }

  function screenToCanvas(point: DesignerCanvasPoint): DesignerCanvasPoint {
    return {
      x: (point.x - pan.value.x) / Math.max(0.0001, zoom.value),
      y: (point.y - pan.value.y) / Math.max(0.0001, zoom.value),
    }
  }

  function canvasToScreen(point: DesignerCanvasPoint): DesignerCanvasPoint {
    return {
      x: pan.value.x + point.x * zoom.value,
      y: pan.value.y + point.y * zoom.value,
    }
  }

  function handleWheel(event: WheelEvent) {
    if (isEditableTarget(event.target)) return
    const { x, y } = eventDelta(event, viewportRef.value)
    const zoomModifier = event.ctrlKey || event.metaKey || (event.altKey && options.wheelZoom !== false)
    if (options.wheelZoom !== false && zoomModifier) {
      event.preventDefault()
      const normalizedDelta = Math.max(-4, Math.min(4, y / 100))
      const factor = Math.pow(wheelZoomFactor.value, -normalizedDelta)
      setZoom(zoom.value * factor, pointFromWheelEvent(event, viewportRef.value))
      return
    }
    if (options.wheelPan === false) return
    const horizontal = event.shiftKey ? y + x : x
    const vertical = event.shiftKey ? 0 : y
    if (horizontal === 0 && vertical === 0) return
    event.preventDefault()
    panBy({ x: -horizontal, y: -vertical })
  }

  function shouldStartPointerPan(event: PointerEvent) {
    if (options.panWithMiddleButton !== false && event.button === 1) return true
    if (options.panWithSpace !== false && spacePressed.value && event.button === 0) return true
    return options.panWithAlt === true && event.altKey && event.button === 0
  }

  function startPan(event: PointerEvent) {
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : viewportRef.value
    if (!target) return false
    event.preventDefault()
    try { target.setPointerCapture(event.pointerId) } catch { /* Pointer capture is optional in test DOMs. */ }
    pointerPanState.value = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      target,
    }
    return true
  }

  function handlePointerDown(event: PointerEvent) {
    if (!shouldStartPointerPan(event)) return false
    return startPan(event)
  }

  function handlePointerMove(event: PointerEvent) {
    const state = pointerPanState.value
    if (!state || state.pointerId !== event.pointerId) return
    event.preventDefault()
    panBy({ x: event.clientX - state.lastX, y: event.clientY - state.lastY })
    state.lastX = event.clientX
    state.lastY = event.clientY
  }

  function handlePointerUp(event: PointerEvent) {
    const state = pointerPanState.value
    if (!state || state.pointerId !== event.pointerId) return
    try { state.target.releasePointerCapture(event.pointerId) } catch { /* Pointer capture is optional in test DOMs. */ }
    pointerPanState.value = null
  }

  function handlePointerCancel(event: PointerEvent) {
    handlePointerUp(event)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (isEditableTarget(event.target)) return
    const key = event.key.toLowerCase()
    const command = event.ctrlKey || event.metaKey

    if (options.panWithSpace !== false && event.key === ' ') {
      spacePressed.value = true
      event.preventDefault()
      return
    }

    if (command && (key === '=' || key === '+')) {
      event.preventDefault()
      zoomIn()
      return
    }
    if (command && (key === '-' || key === '_')) {
      event.preventDefault()
      zoomOut()
      return
    }
    if (command && key === '0') {
      event.preventDefault()
      resetZoom()
      return
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (key === '+' || key === '=') {
      event.preventDefault()
      zoomIn()
      return
    }
    if (key === '-' || key === '_') {
      event.preventDefault()
      zoomOut()
      return
    }
    if (key === '0') {
      event.preventDefault()
      resetZoom()
      return
    }
    if (key === '1' || key === 'home') {
      event.preventDefault()
      fitPage()
      return
    }
    if (key === '2') {
      event.preventDefault()
      fitSelectionOrPage()
      return
    }
    if (key === 'f') {
      event.preventDefault()
      fitSelectionOrPage()
    }
  }

  function handleKeyup(event: KeyboardEvent) {
    if (event.key === ' ') spacePressed.value = false
  }

  function cancelActivePan() {
    const state = pointerPanState.value
    if (!state) return
    try { state.target.releasePointerCapture(state.pointerId) } catch { /* Pointer capture is optional in test DOMs. */ }
    pointerPanState.value = null
    spacePressed.value = false
  }

  const wheelListenerOptions: AddEventListenerOptions = { capture: true, passive: false }
  const captureListenerOptions: AddEventListenerOptions = { capture: true }

  function attachViewport(element: HTMLElement | null = viewportRef.value) {
    if (!element || attachedViewport.value === element) return
    detachViewport()
    element.addEventListener('wheel', handleWheel, wheelListenerOptions)
    element.addEventListener('pointerdown', handlePointerDown, captureListenerOptions)
    element.addEventListener('pointermove', handlePointerMove, captureListenerOptions)
    element.addEventListener('pointerup', handlePointerUp, captureListenerOptions)
    element.addEventListener('pointercancel', handlePointerCancel, captureListenerOptions)
    attachedViewport.value = element
    updateViewportSize()
  }

  function detachViewport() {
    const element = attachedViewport.value
    if (!element) return
    element.removeEventListener('wheel', handleWheel, wheelListenerOptions)
    element.removeEventListener('pointerdown', handlePointerDown, captureListenerOptions)
    element.removeEventListener('pointermove', handlePointerMove, captureListenerOptions)
    element.removeEventListener('pointerup', handlePointerUp, captureListenerOptions)
    element.removeEventListener('pointercancel', handlePointerCancel, captureListenerOptions)
    attachedViewport.value = null
    cancelActivePan()
  }

  const autoAttach = options.autoAttach !== false
  watch(viewportRef, value => {
    if (!autoAttach) return
    if (value) attachViewport(value)
    else detachViewport()
  }, { flush: 'post' })

  watch([minZoom, maxZoom], () => {
    if (zoom.value < minZoom.value || zoom.value > maxZoom.value) {
      zoom.value = clampCanvasZoom(zoom.value, minZoom.value, maxZoom.value)
    }
  })

  onMounted(() => {
    updateViewportSize()
    if (!autoAttach) return
    attachViewport()
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('keyup', handleKeyup)
    window.addEventListener('resize', updateViewportSize)
    window.addEventListener('blur', cancelActivePan)
    void nextTick(updateViewportSize)
  })

  onBeforeUnmount(() => {
    detachViewport()
    if (!autoAttach || typeof window === 'undefined') return
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('keyup', handleKeyup)
    window.removeEventListener('resize', updateViewportSize)
    window.removeEventListener('blur', cancelActivePan)
  })

  return {
    viewportRef,
    contentRef,
    zoom,
    pan,
    minZoom,
    maxZoom,
    zoomPercent,
    viewportSize,
    isPanning,
    contentStyle,
    viewportStyle,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    setPan,
    panBy,
    centerOn,
    fitPage,
    fitSelection,
    fitSelectionOrPage,
    screenToCanvas,
    canvasToScreen,
    updateViewportSize,
    attachViewport,
    detachViewport,
    handleWheel,
    handlePointerDown,
    startPan,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleKeydown,
    handleKeyup,
  } satisfies DesignerCanvasViewportApi
}
