import type { LowCodeWidget, WidgetLayoutConfig } from '../types/lowcode'
import { getWidgetConfig } from './widgetConfig'

export interface RenderedWidgetFrame extends WidgetLayoutConfig {}

function headerHeight(widget: LowCodeWidget) {
  const config = getWidgetConfig(widget)
  if (!['card', 'frame', 'stack', 'grid'].includes(widget.type)) return 0
  if (!config.content.title && !config.content.description) return 0
  return config.content.description ? 48 : 28
}

export function containerContentBox(widget: LowCodeWidget) {
  const config = getWidgetConfig(widget)
  const frame = config.layout
  const padding = Math.max(0, Number(config.style.padding) || 0)
  const header = headerHeight(widget)
  if (widget.type === 'modal') {
    const descriptionHeight = config.content.description ? 18 : 0
    const top = 12 + 28 + descriptionHeight
    return { x: 12, y: top, width: Math.max(24, frame.width - 24), height: Math.max(24, frame.height - top - 54) }
  }
  if (widget.type === 'loading') return { x: 0, y: 0, width: frame.width, height: frame.height }
  return {
    x: padding,
    y: padding + header,
    width: Math.max(24, frame.width - padding * 2),
    height: Math.max(24, frame.height - padding * 2 - header),
  }
}

function orderedChildren(parent: LowCodeWidget, widgets: LowCodeWidget[]) {
  return widgets
    .map((widget, index) => ({ widget, index }))
    .filter(item => item.widget.parentId === parent.id)
    .sort((a, b) => getWidgetConfig(a.widget).layout.zIndex - getWidgetConfig(b.widget).layout.zIndex || a.index - b.index)
    .map(item => item.widget)
}

function numeric(value: unknown, fallback: number) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function alignmentOffset(mode: string | undefined, freeSpace: number) {
  if (mode === 'center') return Math.max(0, freeSpace / 2)
  if (mode === 'end') return Math.max(0, freeSpace)
  return 0
}

/**
 * Calculate a child's local frame without mutating persisted x/y values.
 * Persisted coordinates remain available as an escape hatch when layoutMode is absolute.
 */
export function getAutoLayoutFrame(widget: LowCodeWidget, widgets: LowCodeWidget[]): RenderedWidgetFrame | undefined {
  if (!widget.parentId) return undefined
  const parent = widgets.find(item => item.id === widget.parentId)
  if (!parent || !['stack', 'grid'].includes(parent.type)) return undefined
  const parentConfig = getWidgetConfig(parent)
  if (parentConfig.content.layoutMode === 'absolute') return undefined

  const siblings = orderedChildren(parent, widgets)
  const index = siblings.findIndex(item => item.id === widget.id)
  if (index < 0) return undefined
  const frame = getWidgetConfig(widget).layout
  const box = containerContentBox(parent)
  const gap = Math.max(0, numeric(parentConfig.style.gap, 0))
  const align = parentConfig.style.alignItems || 'start'
  const base = { ...frame }

  if (parent.type === 'grid') {
    const columns = Math.max(1, Math.round(numeric(parentConfig.content.columnsCount, 2)))
    const column = index % columns
    const row = Math.floor(index / columns)
    const cellWidth = Math.max(24, (box.width - gap * (columns - 1)) / columns)
    const rows = Math.ceil(siblings.length / columns)
    const rowHeights = Array.from({ length: rows }, (_, rowIndex) => Math.max(24, ...siblings.slice(rowIndex * columns, rowIndex * columns + columns).map(item => getWidgetConfig(item).layout.height)))
    const y = rowHeights.slice(0, row).reduce((sum, height) => sum + height + gap, 0)
    const height = Math.min(frame.height, Math.max(24, rowHeights[row] || frame.height))
    const width = Math.min(frame.width, cellWidth)
    const crossOffset = alignmentOffset(align, cellWidth - width)
    return { ...base, x: column * (cellWidth + gap) + crossOffset, y, width, height }
  }

  const direction = parentConfig.content.direction || 'column'
  const isRow = direction === 'row'
  const mainSize = isRow ? box.width : box.height
  const crossSize = isRow ? box.height : box.width
  const flexChildren = siblings.filter(item => item.type === 'spacer' && getWidgetConfig(item).content.flex)
  const fixedMain = siblings.reduce((sum, item) => {
    if (item.type === 'spacer' && getWidgetConfig(item).content.flex) return sum
    const childFrame = getWidgetConfig(item).layout
    return sum + (isRow ? childFrame.width : childFrame.height)
  }, 0)
  const flexSize = flexChildren.length ? Math.max(24, (mainSize - fixedMain - gap * Math.max(0, siblings.length - 1)) / flexChildren.length) : 0
  const totalMain = fixedMain + flexSize * flexChildren.length + gap * Math.max(0, siblings.length - 1)
  const justify = parentConfig.style.justifyContent || 'start'
  const freeSpace = Math.max(0, mainSize - totalMain)
  const startOffset = alignmentOffset(justify === 'space-between' ? 'start' : justify, freeSpace)
  const effectiveGap = justify === 'space-between' && siblings.length > 1 ? gap + freeSpace / (siblings.length - 1) : gap
  let cursor = startOffset
  for (const sibling of siblings) {
    if (sibling.id === widget.id) break
    const siblingFrame = getWidgetConfig(sibling).layout
    const siblingMain = sibling.type === 'spacer' && getWidgetConfig(sibling).content.flex
      ? flexSize
      : (isRow ? siblingFrame.width : siblingFrame.height)
    cursor += siblingMain + effectiveGap
  }
  const ownMain = widget.type === 'spacer' && getWidgetConfig(widget).content.flex ? flexSize : (isRow ? frame.width : frame.height)
  const ownCross = isRow ? frame.height : frame.width
  const resolvedCross = align === 'stretch' ? crossSize : Math.min(ownCross, crossSize)
  const crossOffset = alignmentOffset(align, crossSize - resolvedCross)
  if (isRow) return { ...base, x: cursor, y: crossOffset, width: ownMain, height: resolvedCross }
  return { ...base, x: crossOffset, y: cursor, width: resolvedCross, height: ownMain }
}

export function getRenderedWidgetFrame(widget: LowCodeWidget, widgets: LowCodeWidget[]) {
  return getAutoLayoutFrame(widget, widgets) || getWidgetConfig(widget).layout
}
