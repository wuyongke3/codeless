import type { LowCodeWidget, PageLayout } from '../../types/lowcode'
import { getRenderedWidgetFrame } from '../autoLayout'
import { getWidgetConfig, setWidgetFrame } from '../widgetConfig'

export interface DesignerLayoutModel {
  containerHeaderHeight: (parent: LowCodeWidget) => number
  styleDescriptionHeight: (parent: LowCodeWidget) => number
  containerContentBox: (parentId?: string) => { x: number; y: number; width: number; height: number }
  containerBounds: (parentId?: string) => { width: number; height: number }
  widgetMinimumSize: (widget: LowCodeWidget) => { width: number; height: number }
  clampWidgetFrame: (widget: LowCodeWidget, x: number, y: number, width?: number, height?: number) => { x: number; y: number; width: number; height: number }
  clampChildrenToParent: (parent: LowCodeWidget) => void
  renderedWidgetFrame: (widget: LowCodeWidget) => ReturnType<typeof getRenderedWidgetFrame>
}

export function createDesignerLayoutModel(options: {
  getWidgets: () => LowCodeWidget[]
  getCanvas: () => PageLayout['canvas'] | undefined
  getWidgetById: (id: string) => LowCodeWidget | undefined
}): DesignerLayoutModel {
  const widgets = () => options.getWidgets()

  function containerHeaderHeight(parent: LowCodeWidget) {
    if (parent.type === 'drawer') return getWidgetConfig(parent).content.description ? 58 : 38
    if (!['card', 'frame', 'stack', 'grid'].includes(parent.type)) return 0
    const content = getWidgetConfig(parent).content
    if (!content.title && !content.description) return 0
    return content.description ? 48 : 28
  }

  function styleDescriptionHeight(parent: LowCodeWidget) {
    return getWidgetConfig(parent).content.description ? 18 : 0
  }

  function containerContentBox(parentId?: string) {
    const parent = parentId ? options.getWidgetById(parentId) : undefined
    if (!parent) {
      const canvas = options.getCanvas()
      return { x: 0, y: 0, width: canvas?.width || 960, height: canvas?.height || 720 }
    }
    const frame = getWidgetConfig(parent).layout
    const style = getWidgetConfig(parent).style
    if (parent.type === 'modal') {
      const descriptionHeight = styleDescriptionHeight(parent)
      const top = 12 + 28 + descriptionHeight
      const reservedBottom = 12 + 30 + 12
      return {
        x: 12,
        y: top,
        width: Math.max(24, frame.width - 24),
        height: Math.max(24, frame.height - top - reservedBottom),
      }
    }
    const padding = Math.max(parent.type === 'drawer' ? 8 : 0, Number(style.padding) || (parent.type === 'drawer' ? 16 : 0))
    const headerHeight = containerHeaderHeight(parent)
    if (parent.type === 'loading') return { x: 0, y: 0, width: frame.width, height: frame.height }
    return {
      x: padding,
      y: padding + headerHeight,
      width: Math.max(24, frame.width - padding * 2),
      height: Math.max(24, frame.height - padding * 2 - headerHeight),
    }
  }

  function containerBounds(parentId?: string) {
    const box = containerContentBox(parentId)
    return { width: box.width, height: box.height }
  }

  function widgetMinimumSize(widget: LowCodeWidget) {
    if (widget.type === 'modal') return { width: 240, height: 180 }
    if (widget.type === 'loading') return { width: 180, height: 72 }
    return { width: 24, height: 24 }
  }

  function clampWidgetFrame(widget: LowCodeWidget, x: number, y: number, width?: number, height?: number) {
    const frame = getWidgetConfig(widget).layout
    const bounds = containerBounds(widget.parentId)
    const minimum = widgetMinimumSize(widget)
    const minWidth = Math.min(bounds.width, minimum.width)
    const minHeight = Math.min(bounds.height, minimum.height)
    const nextWidth = Math.max(minWidth, Math.min(bounds.width, width ?? frame.width))
    const nextHeight = Math.max(minHeight, Math.min(bounds.height, height ?? frame.height))
    return {
      x: Math.max(0, Math.min(Math.max(0, bounds.width - nextWidth), Math.round(x))),
      y: Math.max(0, Math.min(Math.max(0, bounds.height - nextHeight), Math.round(y))),
      width: nextWidth,
      height: nextHeight,
    }
  }

  function clampChildrenToParent(parent: LowCodeWidget) {
    const children = widgets().filter(widget => widget.parentId === parent.id)
    children.forEach(child => {
      const frame = getWidgetConfig(child).layout
      setWidgetFrame(child, clampWidgetFrame(child, frame.x, frame.y, frame.width, frame.height))
      clampChildrenToParent(child)
    })
  }

  return {
    containerHeaderHeight,
    styleDescriptionHeight,
    containerContentBox,
    containerBounds,
    widgetMinimumSize,
    clampWidgetFrame,
    clampChildrenToParent,
    renderedWidgetFrame: (widget: LowCodeWidget) => getRenderedWidgetFrame(widget, widgets()),
  }
}
