import type { CSSProperties, MaybeRefOrGetter, Ref } from 'vue'

/** A logical canvas size in design coordinates. */
export interface DesignerCanvasSize {
  width: number
  height: number
}

/** A point in viewport-local screen coordinates or canvas coordinates. */
export interface DesignerCanvasPoint {
  x: number
  y: number
}

/** A rectangle in logical canvas coordinates. */
export interface DesignerCanvasRect extends DesignerCanvasPoint, DesignerCanvasSize {}

export type DesignerCanvasAnchor = DesignerCanvasPoint | 'center'

export interface DesignerCanvasFitOptions {
  /** Padding in viewport pixels around the fitted rectangle. */
  padding?: number
  /** Override the composable's minimum zoom for this fit operation. */
  minZoom?: number
  /** Override the composable's maximum zoom for this fit operation. */
  maxZoom?: number
}

export interface DesignerCanvasViewportOptions {
  /** The logical page size. Used by fitPage and contentStyle. */
  pageSize?: MaybeRefOrGetter<DesignerCanvasSize | null | undefined>
  /** The current selection bounds in logical canvas coordinates. */
  selectionBounds?: MaybeRefOrGetter<DesignerCanvasRect | null | undefined>
  /** Optional headless/test fallback when no viewport element is mounted. */
  viewportSize?: MaybeRefOrGetter<DesignerCanvasSize | null | undefined>
  /** Existing refs can be supplied when a host already owns the template refs. */
  viewportRef?: Ref<HTMLElement | null>
  contentRef?: Ref<HTMLElement | null>
  initialZoom?: MaybeRefOrGetter<number>
  minZoom?: MaybeRefOrGetter<number>
  maxZoom?: MaybeRefOrGetter<number>
  /** Absolute zoom delta used by keyboard +/- shortcuts. */
  zoomStep?: MaybeRefOrGetter<number>
  /** Multiplicative base used by Ctrl/Cmd + wheel. */
  wheelZoomFactor?: MaybeRefOrGetter<number>
  fitPadding?: MaybeRefOrGetter<number>
  wheelZoom?: boolean
  wheelPan?: boolean
  panWithSpace?: boolean
  panWithMiddleButton?: boolean
  panWithAlt?: boolean
  /** Automatically bind wheel/pointer/keyboard/resize listeners on mount. */
  autoAttach?: boolean
}

export interface DesignerCanvasViewportSnapshot {
  zoom: number
  pan: DesignerCanvasPoint
  viewport: DesignerCanvasSize
}

export interface DesignerCanvasViewportApi {
  viewportRef: Ref<HTMLElement | null>
  contentRef: Ref<HTMLElement | null>
  zoom: Ref<number>
  pan: Ref<DesignerCanvasPoint>
  minZoom: Readonly<Ref<number>>
  maxZoom: Readonly<Ref<number>>
  zoomPercent: Readonly<Ref<number>>
  viewportSize: Readonly<Ref<DesignerCanvasSize>>
  isPanning: Readonly<Ref<boolean>>
  contentStyle: Readonly<Ref<CSSProperties>>
  viewportStyle: Readonly<Ref<CSSProperties>>
  setZoom: (value: number, anchor?: DesignerCanvasAnchor) => number
  zoomIn: (anchor?: DesignerCanvasAnchor) => number
  zoomOut: (anchor?: DesignerCanvasAnchor) => number
  resetZoom: (anchor?: DesignerCanvasAnchor) => number
  setPan: (point: DesignerCanvasPoint) => void
  panBy: (delta: DesignerCanvasPoint) => void
  centerOn: (bounds: DesignerCanvasRect) => boolean
  fitPage: (pageSize?: DesignerCanvasSize | null, options?: DesignerCanvasFitOptions) => boolean
  fitSelection: (selection?: DesignerCanvasRect | null, options?: DesignerCanvasFitOptions) => boolean
  fitSelectionOrPage: (options?: DesignerCanvasFitOptions) => boolean
  screenToCanvas: (point: DesignerCanvasPoint) => DesignerCanvasPoint
  canvasToScreen: (point: DesignerCanvasPoint) => DesignerCanvasPoint
  updateViewportSize: () => DesignerCanvasSize
  attachViewport: (element?: HTMLElement | null) => void
  detachViewport: () => void
  handleWheel: (event: WheelEvent) => void
  handlePointerDown: (event: PointerEvent) => boolean
  startPan: (event: PointerEvent) => boolean
  handlePointerMove: (event: PointerEvent) => void
  handlePointerUp: (event: PointerEvent) => void
  handlePointerCancel: (event: PointerEvent) => void
  handleKeydown: (event: KeyboardEvent) => void
  handleKeyup: (event: KeyboardEvent) => void
}
