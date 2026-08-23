import type { LowCodeWidget, WidgetLayoutConfig } from './lowcode'

/** A finite, axis-aligned rectangle in canvas coordinates. */
export interface CanvasGuideRect {
  x: number
  y: number
  width: number
  height: number
}

/** Stable integration name for an axis-aligned canvas rectangle. */
export interface CanvasRect extends CanvasGuideRect {
  id?: string
}

export interface CanvasGuidePoint {
  x: number
  y: number
}

/** A normalized frame used by the guide algorithms. */
export interface CanvasGuideFrame extends CanvasRect {
  id?: string
  parentId?: string
  rotation?: number
  locked?: boolean
  hidden?: boolean
}

/** Loose frame-like input accepted by the pure algorithms. */
export interface CanvasGuideFrameRecord {
  id?: string
  parentId?: string
  x?: number
  y?: number
  width?: number
  height?: number
  w?: number
  h?: number
  rotation?: number
  locked?: boolean
  hidden?: boolean
  layout?: CanvasGuideFrameRecord
  frame?: CanvasGuideFrameRecord
  config?: { layout?: CanvasGuideFrameRecord }
}

export type CanvasGuideFrameInput =
  | LowCodeWidget
  | WidgetLayoutConfig
  | CanvasGuideFrame
  | CanvasGuideFrameRecord

export type CanvasGuideAxis = 'x' | 'y'
export type CanvasGuideLineKind = 'grid' | 'reference' | 'canvas'
export type CanvasGuideEdge = 'start' | 'center' | 'end'

/** A vertical (`x`) or horizontal (`y`) guide coordinate. */
export interface CanvasGuideLine {
  axis: CanvasGuideAxis
  position: number
  kind: CanvasGuideLineKind
  sourceId?: string
  edge?: CanvasGuideEdge
}

/** Stable integration name for a rendered guide line. */
export type GuideLine = CanvasGuideLine

export interface CanvasGuideLineOptions {
  includeEdges?: boolean
  includeCenters?: boolean
  kind?: Exclude<CanvasGuideLineKind, 'grid'>
  sourceId?: string
}

export interface CanvasGridOptions {
  size: number | CanvasGuidePoint
  origin?: CanvasGuidePoint
}

export interface CanvasSnapOptions {
  threshold?: number
  includeEdges?: boolean
  includeCenters?: boolean
}

export interface CanvasSmartSnapOptions extends CanvasSnapOptions {
  referenceFrames?: readonly CanvasGuideFrameInput[]
  guides?: readonly CanvasGuideLine[]
  canvas?: CanvasGuideRect | CanvasGuideFrameInput
  excludeIds?: readonly string[]
  gridSize?: number | CanvasGuidePoint
  gridOrigin?: CanvasGuidePoint
}

export interface CanvasSnapResult {
  frame: CanvasGuideFrame
  delta: CanvasGuidePoint
  snapped: boolean
  xGuide?: CanvasGuideLine
  yGuide?: CanvasGuideLine
  guides: CanvasGuideLine[]
}

export interface CanvasSnapDeltaResult {
  dx: number
  dy: number
  guides: GuideLine[]
}

export type CanvasRequestedDelta = CanvasGuidePoint | { dx: number; dy: number }

export type CanvasAlignment =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'horizontal-center'
  | 'vertical-center'

export type CanvasDistributionAxis = 'x' | 'y' | 'horizontal' | 'vertical'

export interface CanvasAlignmentOptions {
  /** Align against this frame instead of the selection bounds. */
  reference?: CanvasGuideFrameInput
  /** Resolve the reference frame from the input collection by id. */
  anchorId?: string
}

export interface CanvasDistributionOptions {
  /** Keep the first and last frame edges fixed. Defaults to true. */
  preserveOuterBounds?: boolean
}

export type CanvasGuideFramePatch = Pick<CanvasGuideFrame, 'x' | 'y'> & { id?: string }

export type CanvasSmartSnapInput =
  | readonly CanvasGuideFrameInput[]
  | CanvasSmartSnapOptions