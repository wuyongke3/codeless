import type {
  CanvasAlignment,
  CanvasAlignmentOptions,
  CanvasDistributionAxis,
  CanvasDistributionOptions,
  CanvasGuideAxis,
  CanvasGuideEdge,
  CanvasGuideFrame,
  CanvasGuideFrameInput,
  CanvasGuideLine,
  CanvasGuideLineOptions,
  CanvasGuidePoint,
  CanvasGuideRect,
  CanvasGridOptions,
  CanvasRequestedDelta,
  CanvasSnapDeltaResult,
  CanvasSnapOptions,
  CanvasSnapResult,
  CanvasSmartSnapOptions,
  CanvasRect,
  GuideLine,
} from '../../types/designerCanvasGuides'

/** Re-export the stable canvas-guide contracts for integration call sites. */
export type { CanvasRect, CanvasSnapResult, GuideLine } from '../../types/designerCanvasGuides'

const DEFAULT_SNAP_THRESHOLD = 6
const EPSILON = 1e-9

type RecordValue = Record<string, unknown>

type AxisAnchor = {
  offset: number
  edge: CanvasGuideEdge
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object'
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function firstNumber(...values: unknown[]) {
  return values.map(finiteNumber).find(value => value !== undefined)
}

function positiveNumber(value: unknown, fallback: number) {
  const result = finiteNumber(value)
  return result === undefined ? fallback : Math.max(0, result)
}

function readNested(record: RecordValue | undefined, key: string): RecordValue | undefined {
  const value = record?.[key]
  return isRecord(value) ? value : undefined
}

function readFrameRecord(input: unknown): {
  source: RecordValue
  layout: RecordValue
} {
  const source = isRecord(input) ? input : {}
  const configLayout = readNested(readNested(source, 'config'), 'layout')
  const layout = configLayout || readNested(source, 'layout') || readNested(source, 'frame') || source
  return { source, layout }
}

function optionalString(...values: unknown[]) {
  return values.find(value => typeof value === 'string' && value.length > 0) as string | undefined
}

/** Normalize LowCodeWidget, WidgetLayoutConfig, or loose `{ x, y, width, height }` input. */
export function normalizeCanvasGuideFrame(input: CanvasGuideFrameInput): CanvasGuideFrame {
  const { source, layout } = readFrameRecord(input)
  const x = firstNumber(layout.x, source.x) ?? 0
  const y = firstNumber(layout.y, source.y) ?? 0
  const width = positiveNumber(firstNumber(layout.width, layout.w, source.width, source.w), 0)
  const height = positiveNumber(firstNumber(layout.height, layout.h, source.height, source.h), 0)
  const frame: CanvasGuideFrame = { x, y, width, height }
  const id = optionalString(source.id, layout.id)
  const parentId = optionalString(source.parentId, layout.parentId)
  const rotation = firstNumber(layout.rotation, source.rotation)
  if (id) frame.id = id
  if (parentId) frame.parentId = parentId
  if (rotation !== undefined) frame.rotation = rotation
  if (typeof layout.locked === 'boolean' || typeof source.locked === 'boolean') frame.locked = Boolean(layout.locked ?? source.locked)
  if (typeof layout.hidden === 'boolean' || typeof source.hidden === 'boolean') frame.hidden = Boolean(layout.hidden ?? source.hidden)
  return frame
}

/** Alias useful at call sites that already use `frameOf` terminology. */
export const frameOf = normalizeCanvasGuideFrame

export function getCanvasGuideEdges(input: CanvasGuideFrameInput) {
  const frame = normalizeCanvasGuideFrame(input)
  return {
    left: frame.x,
    centerX: frame.x + frame.width / 2,
    right: frame.x + frame.width,
    top: frame.y,
    centerY: frame.y + frame.height / 2,
    bottom: frame.y + frame.height,
  }
}

export function getCanvasGuideBounds(inputs: readonly CanvasGuideFrameInput[]): CanvasGuideRect | null {
  if (!inputs.length) return null
  const frames = inputs.map(normalizeCanvasGuideFrame)
  const left = Math.min(...frames.map(frame => frame.x))
  const top = Math.min(...frames.map(frame => frame.y))
  const right = Math.max(...frames.map(frame => frame.x + frame.width))
  const bottom = Math.max(...frames.map(frame => frame.y + frame.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function axesForFrame(frame: CanvasGuideFrame, options: CanvasGuideLineOptions): CanvasGuideLine[] {
  const edges = getCanvasGuideEdges(frame)
  const kind = options.kind || 'reference'
  const lines: CanvasGuideLine[] = []
  const sourceId = options.sourceId || frame.id
  const add = (axis: CanvasGuideAxis, position: number, edge: CanvasGuideEdge) => {
    lines.push({ axis, position, kind, ...(sourceId ? { sourceId } : {}), edge })
  }
  if (options.includeEdges !== false) {
    add('x', edges.left, 'start')
    add('x', edges.right, 'end')
    add('y', edges.top, 'start')
    add('y', edges.bottom, 'end')
  }
  if (options.includeCenters !== false) {
    add('x', edges.centerX, 'center')
    add('y', edges.centerY, 'center')
  }
  return lines
}

/** Return the edge/center reference lines for one frame. */
export function getFrameGuideLines(
  input: CanvasGuideFrameInput,
  options: CanvasGuideLineOptions = {},
): CanvasGuideLine[] {
  return axesForFrame(normalizeCanvasGuideFrame(input), options)
}

/** Collect reference lines from peer frames, optionally excluding the moving selection. */
export function collectReferenceGuides(
  inputs: readonly CanvasGuideFrameInput[],
  options: CanvasGuideLineOptions & { excludeIds?: readonly string[] } = {},
): CanvasGuideLine[] {
  const excluded = new Set(options.excludeIds || [])
  return inputs
    .map(normalizeCanvasGuideFrame)
    .filter(frame => !frame.id || !excluded.has(frame.id))
    .flatMap(frame => axesForFrame(frame, options))
}

function resolveGridSize(size: number | CanvasGuidePoint) {
  if (typeof size === 'number') {
    const value = positiveNumber(size, 0)
    return { x: value, y: value }
  }
  return {
    x: positiveNumber(size.x, 0),
    y: positiveNumber(size.y, 0),
  }
}

export function snapValueToGrid(value: number, size: number, origin = 0) {
  const safeSize = positiveNumber(size, 0)
  if (!safeSize) return value
  const safeOrigin = finiteNumber(origin) ?? 0
  return safeOrigin + Math.round((value - safeOrigin) / safeSize) * safeSize
}

/** Stable short name for scalar grid snapping. */
export const gridSnap = snapValueToGrid

export function snapPointToGrid(point: CanvasGuidePoint, options: CanvasGridOptions): CanvasGuidePoint {
  const size = resolveGridSize(options.size)
  const origin = options.origin || { x: 0, y: 0 }
  return {
    x: snapValueToGrid(point.x, size.x, origin.x),
    y: snapValueToGrid(point.y, size.y, origin.y),
  }
}

export function snapFrameToGrid(
  input: CanvasGuideFrameInput,
  options: CanvasGridOptions,
): CanvasGuideFrame {
  const frame = normalizeCanvasGuideFrame(input)
  const point = snapPointToGrid(frame, options)
  return { ...frame, x: point.x, y: point.y }
}

/** Return grid coordinates in ascending order for the inclusive range. */
export function gridPositions(start: number, end: number, size: number, origin = 0) {
  const safeSize = positiveNumber(size, 0)
  if (!safeSize || !Number.isFinite(start) || !Number.isFinite(end)) return [] as number[]
  const lower = Math.min(start, end)
  const upper = Math.max(start, end)
  const first = Math.ceil((lower - origin - EPSILON) / safeSize)
  const last = Math.floor((upper - origin + EPSILON) / safeSize)
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => origin + (first + index) * safeSize)
}

export function createGridGuides(bounds: CanvasGuideRect, options: CanvasGridOptions): CanvasGuideLine[] {
  const size = resolveGridSize(options.size)
  const origin = options.origin || { x: 0, y: 0 }
  return [
    ...gridPositions(bounds.x, bounds.x + bounds.width, size.x, origin.x).map(position => ({ axis: 'x' as const, position, kind: 'grid' as const })),
    ...gridPositions(bounds.y, bounds.y + bounds.height, size.y, origin.y).map(position => ({ axis: 'y' as const, position, kind: 'grid' as const })),
  ]
}

function axisAnchors(frame: CanvasGuideFrame, axis: CanvasGuideAxis, options: CanvasSnapOptions): AxisAnchor[] {
  const length = axis === 'x' ? frame.width : frame.height
  const anchors: AxisAnchor[] = []
  if (options.includeEdges !== false) {
    anchors.push({ offset: 0, edge: 'start' }, { offset: length, edge: 'end' })
  }
  if (options.includeCenters !== false) anchors.push({ offset: length / 2, edge: 'center' })
  return anchors
}

function guidePriority(kind: CanvasGuideLine['kind']) {
  return kind === 'grid' ? 1 : 0
}

function chooseSnap(
  frame: CanvasGuideFrame,
  axis: CanvasGuideAxis,
  guides: readonly CanvasGuideLine[],
  options: CanvasSnapOptions,
): { delta: number; guide: CanvasGuideLine } | undefined {
  const threshold = Math.max(0, finiteNumber(options.threshold) ?? DEFAULT_SNAP_THRESHOLD)
  const axisPosition = axis === 'x' ? frame.x : frame.y
  const candidates = guides
    .filter(guide => guide.axis === axis && Number.isFinite(guide.position))
    .flatMap(guide => axisAnchors(frame, axis, options).map(anchor => ({
      delta: guide.position - (axisPosition + anchor.offset),
      guide,
    })))
    .filter(candidate => Math.abs(candidate.delta) <= threshold + EPSILON)
    .sort((left, right) => {
      const distance = Math.abs(left.delta) - Math.abs(right.delta)
      if (Math.abs(distance) > EPSILON) return distance
      return guidePriority(left.guide.kind) - guidePriority(right.guide.kind)
    })
  return candidates[0]
}

function gridCandidateGuides(
  frame: CanvasGuideFrame,
  options: CanvasSmartSnapOptions,
): CanvasGuideLine[] {
  if (!options.gridSize) return []
  const size = resolveGridSize(options.gridSize)
  const origin = options.gridOrigin || { x: 0, y: 0 }
  const xLines = axisAnchors(frame, 'x', options).map(anchor => ({
    axis: 'x' as const,
    position: snapValueToGrid(frame.x + anchor.offset, size.x, origin.x),
    kind: 'grid' as const,
  }))
  const yLines = axisAnchors(frame, 'y', options).map(anchor => ({
    axis: 'y' as const,
    position: snapValueToGrid(frame.y + anchor.offset, size.y, origin.y),
    kind: 'grid' as const,
  }))
  return [...xLines, ...yLines]
}

function snapFrameWithGuides(
  input: CanvasGuideFrameInput,
  guides: readonly CanvasGuideLine[],
  options: CanvasSnapOptions = {},
): CanvasSnapResult {
  const frame = normalizeCanvasGuideFrame(input)
  const xMatch = chooseSnap(frame, 'x', guides, options)
  const yMatch = chooseSnap(frame, 'y', guides, options)
  const dx = xMatch?.delta || 0
  const dy = yMatch?.delta || 0
  return {
    frame: { ...frame, x: frame.x + dx, y: frame.y + dy },
    delta: { x: dx, y: dy },
    snapped: Boolean(xMatch || yMatch),
    ...(xMatch ? { xGuide: xMatch.guide } : {}),
    ...(yMatch ? { yGuide: yMatch.guide } : {}),
    guides: [xMatch?.guide, yMatch?.guide].filter((guide): guide is CanvasGuideLine => Boolean(guide)),
  }
}

/**
 * Compute a selection movement delta that keeps the requested movement and adds
 * the nearest peer-edge/center correction within the supplied threshold.
 */
export function computeSnapDelta(
  movingRects: readonly CanvasGuideFrameInput[],
  otherRects: readonly CanvasGuideFrameInput[],
  requested: CanvasRequestedDelta,
  threshold = DEFAULT_SNAP_THRESHOLD,
): CanvasSnapDeltaResult {
  const requestedDx = 'dx' in requested ? requested.dx : requested.x
  const requestedDy = 'dy' in requested ? requested.dy : requested.y
  const dx = finiteNumber(requestedDx) ?? 0
  const dy = finiteNumber(requestedDy) ?? 0
  const movingBounds = getCanvasGuideBounds(movingRects)
  if (!movingBounds) return { dx, dy, guides: [] }

  const movingIds = movingRects
    .map(normalizeCanvasGuideFrame)
    .map(frame => frame.id)
    .filter((id): id is string => Boolean(id))
  const guides = collectReferenceGuides(otherRects, {
    includeEdges: true,
    includeCenters: true,
    excludeIds: movingIds,
  })
  const movedBounds: CanvasGuideFrame = { ...movingBounds, x: movingBounds.x + dx, y: movingBounds.y + dy }
  const options: CanvasSnapOptions = { threshold }
  const xMatch = chooseSnap(movedBounds, 'x', guides, options)
  const yMatch = chooseSnap(movedBounds, 'y', guides, options)
  const snappedDx = dx + (xMatch?.delta || 0)
  const snappedDy = dy + (yMatch?.delta || 0)
  return {
    dx: snappedDx,
    dy: snappedDy,
    guides: [xMatch?.guide, yMatch?.guide].filter((guide): guide is CanvasGuideLine => Boolean(guide)),
  }
}

/** Snap one frame against explicit guide lines. */
export function snapFrameToGuides(
  input: CanvasGuideFrameInput,
  guides: readonly CanvasGuideLine[],
  options: CanvasSnapOptions = {},
): CanvasSnapResult {
  return snapFrameWithGuides(input, guides, options)
}

/**
 * Snap one moving frame to peer edge/center lines, canvas edges, explicit guides,
 * and optionally the nearest grid coordinates.
 */
export function smartSnapFrame(
  input: CanvasGuideFrameInput,
  referencesOrOptions: readonly CanvasGuideFrameInput[] | CanvasSmartSnapOptions = [],
  maybeOptions: CanvasSmartSnapOptions = {},
): CanvasSnapResult {
  let references: readonly CanvasGuideFrameInput[]
  let options: CanvasSmartSnapOptions
  if (Array.isArray(referencesOrOptions)) {
    references = referencesOrOptions
    options = maybeOptions
  } else {
    const smartOptions = referencesOrOptions as CanvasSmartSnapOptions
    references = smartOptions.referenceFrames || []
    options = smartOptions
  }
  const excluded = new Set(options.excludeIds || [])
  if (normalizeCanvasGuideFrame(input).id) excluded.add(normalizeCanvasGuideFrame(input).id as string)
  const guides = [
    ...(options.guides || []),
    ...collectReferenceGuides(references, {
      includeEdges: options.includeEdges,
      includeCenters: options.includeCenters,
      excludeIds: [...excluded],
    }),
    ...(options.canvas ? getFrameGuideLines(options.canvas, { kind: 'canvas' }) : []),
    ...gridCandidateGuides(normalizeCanvasGuideFrame(input), options),
  ]
  return snapFrameWithGuides(input, guides, options)
}

function updateFramePosition(frame: CanvasGuideFrame, x: number, y: number) {
  return { ...frame, x, y }
}

function resolveAlignmentReference(
  frames: readonly CanvasGuideFrame[],
  options: CanvasAlignmentOptions,
): CanvasGuideRect | null {
  if (options.reference) return normalizeCanvasGuideFrame(options.reference)
  if (options.anchorId) {
    const anchor = frames.find(frame => frame.id === options.anchorId)
    if (anchor) return anchor
  }
  return getCanvasGuideBounds(frames)
}

/** Align normalized frame results without mutating the input widgets. */
export function alignFrames(
  inputs: readonly CanvasGuideFrameInput[],
  alignment: CanvasAlignment,
  options: CanvasAlignmentOptions = {},
): CanvasGuideFrame[] {
  const frames = inputs.map(normalizeCanvasGuideFrame)
  const reference = resolveAlignmentReference(frames, options)
  if (!reference) return frames
  return frames.map(frame => {
    if (alignment === 'left') return updateFramePosition(frame, reference.x, frame.y)
    if (alignment === 'right') return updateFramePosition(frame, reference.x + reference.width - frame.width, frame.y)
    if (alignment === 'top') return updateFramePosition(frame, frame.x, reference.y)
    if (alignment === 'bottom') return updateFramePosition(frame, frame.x, reference.y + reference.height - frame.height)
    if (alignment === 'center' || alignment === 'horizontal-center') {
      return updateFramePosition(frame, reference.x + (reference.width - frame.width) / 2, frame.y)
    }
    return updateFramePosition(frame, frame.x, reference.y + (reference.height - frame.height) / 2)
  })
}

export const alignWidgetFrames = alignFrames

/** Stable rectangle-oriented alias for multi-selection alignment. */
export const alignRects = alignFrames

/** Compatibility alias for integrations that consume calculated frame updates. */
export const calculateAlignmentUpdates = alignFrames

function distributionAxis(axis: CanvasDistributionAxis): CanvasGuideAxis {
  return axis === 'y' || axis === 'vertical' ? 'y' : 'x'
}

/** Distribute frame gaps evenly while preserving the outer frame edges by default. */
export function distributeFrames(
  inputs: readonly CanvasGuideFrameInput[],
  axis: CanvasDistributionAxis,
  options: CanvasDistributionOptions = {},
): CanvasGuideFrame[] {
  const frames = inputs.map(normalizeCanvasGuideFrame)
  if (frames.length < 3) return frames
  const coordinateAxis = distributionAxis(axis)
  const ordered = frames
    .map((frame, index) => ({ frame, index }))
    .sort((left, right) => {
      const leftValue = coordinateAxis === 'x' ? left.frame.x : left.frame.y
      const rightValue = coordinateAxis === 'x' ? right.frame.x : right.frame.y
      return leftValue - rightValue || left.index - right.index
    })
  const preserveOuterBounds = options.preserveOuterBounds !== false
  const start = coordinateAxis === 'x' ? ordered[0].frame.x : ordered[0].frame.y
  const last = ordered[ordered.length - 1].frame
  const end = coordinateAxis === 'x' ? last.x + last.width : last.y + last.height
  const totalSize = ordered.reduce((sum, item) => sum + (coordinateAxis === 'x' ? item.frame.width : item.frame.height), 0)
  const gap = (end - start - totalSize) / (ordered.length - 1)
  let cursor = start
  const nextByIndex = new Map<number, CanvasGuideFrame>()
  ordered.forEach(({ frame, index }, position) => {
    const size = coordinateAxis === 'x' ? frame.width : frame.height
    const nextPosition = preserveOuterBounds
      ? (position === 0 ? start : position === ordered.length - 1 ? end - size : cursor)
      : cursor
    const next = coordinateAxis === 'x'
      ? updateFramePosition(frame, nextPosition, frame.y)
      : updateFramePosition(frame, frame.x, nextPosition)
    nextByIndex.set(index, next)
    cursor = nextPosition + size + gap
  })
  return frames.map((_, index) => nextByIndex.get(index) || frames[index])
}

export const equalizeFrameSpacing = distributeFrames
export const distributeWidgetFrames = distributeFrames

/** Stable rectangle-oriented alias for even spacing. */
export const distributeRects = distributeFrames
