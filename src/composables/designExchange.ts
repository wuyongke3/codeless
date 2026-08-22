import type { DesignExchangeDocument, DesignExchangeNode, DesignExchangeNodeType } from '../types/designExchange'
import type { LowCodeProject, LowCodeWidget, PageLayout, WidgetProps, WidgetType } from '../types/lowcode'
import { widgetDefinitionMap } from '../components/registry/widgetRegistry'
import { createWidget, makeId } from './utils'
import { getWidgetConfig, normalizeWidget, setWidgetFrame, syncLegacyProps } from './widgetConfig'

const containerTypes = new Set<WidgetType>(['card', 'frame', 'stack', 'grid', 'modal', 'loading', 'drawer'])
const allowedWidgetTypes = new Set<WidgetType>(Object.keys(widgetDefinitionMap) as WidgetType[])

function finite(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

function safeColor(value: unknown) {
  if (typeof value !== 'string') return undefined
  const color = value.trim()
  return color === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined
}

function nodeTypeForWidget(widget: LowCodeWidget): DesignExchangeNodeType {
  if (widget.type === 'heading' || widget.type === 'text') return 'text'
  if (widget.type === 'divider') return 'line'
  if (widget.type === 'image') return 'image'
  if (widget.type === 'avatar') return 'ellipse'
  if (containerTypes.has(widget.type)) return 'frame'
  if (widget.type === 'icon') return 'component'
  return 'rectangle'
}

function textForWidget(widget: LowCodeWidget) {
  const content = getWidgetConfig(widget).content
  const value = content.text ?? content.label ?? content.title ?? content.description
  return typeof value === 'string' && value.trim() ? value.slice(0, 20000) : undefined
}

function toDesignNode(widget: LowCodeWidget, byId: Map<string, LowCodeWidget>, included: Set<string>): DesignExchangeNode {
  const config = getWidgetConfig(widget)
  const frame = config.layout
  const style = config.style
  const node: DesignExchangeNode = {
    id: widget.id,
    name: String(widget.name || widget.type).slice(0, 240),
    type: nodeTypeForWidget(widget),
    x: finite(frame.x, 0, -100000, 100000),
    y: finite(frame.y, 0, -100000, 100000),
    width: finite(frame.width, 120, 1, 100000),
    height: finite(frame.height, 60, 1, 100000),
    rotation: finite(frame.rotation, 0, -3600, 3600),
    visible: !frame.hidden,
    locked: Boolean(frame.locked),
    opacity: finite(style.opacity, 1, 0, 1),
    codelessType: widget.type,
  }
  const fill = safeColor(style.background) || safeColor(style.accent)
  const stroke = safeColor(style.borderColor) || safeColor(style.accent)
  if (fill) node.fills = [fill]
  if (stroke && widget.type !== 'text' && widget.type !== 'heading') node.strokes = [stroke]
  if (style.borderRadius !== undefined) node.cornerRadius = finite(style.borderRadius, 0, 0, 10000)
  const text = textForWidget(widget)
  if (text) {
    node.text = {
      characters: text,
      fontSize: finite(style.fontSize, widget.type === 'heading' ? 28 : 14, 1, 256),
      fontWeight: finite(style.fontWeight, widget.type === 'heading' ? 700 : 400, 100, 900),
      textAlign: style.textAlign || 'left',
    }
    const textColor = safeColor(style.color) || safeColor(style.accent)
    if (textColor) node.fills = [textColor]
  }
  const children = (Array.from(byId.values())
    .filter(child => child.parentId === widget.id && included.has(child.id))
    .sort((left, right) => getWidgetConfig(left).layout.zIndex - getWidgetConfig(right).layout.zIndex)
    .map(child => toDesignNode(child, byId, included)))
  if (children.length) node.children = children
  return node
}

export function exportDesignExchangeFromLayout(
  layout: PageLayout,
  widgets: LowCodeWidget[] = layout.widgets,
  selectedWidgetIds: string[] = [],
): DesignExchangeDocument {
  const byId = new Map(widgets.map(widget => [widget.id, widget]))
  const selected = new Set(selectedWidgetIds.filter(id => byId.has(id)))
  const included = selected.size
    ? new Set(Array.from(selected).flatMap(id => [id, ...descendantIds(id, byId)]))
    : new Set(widgets.map(widget => widget.id))
  const roots = widgets
    .filter(widget => included.has(widget.id) && (!widget.parentId || !included.has(widget.parentId)))
    .sort((left, right) => getWidgetConfig(left).layout.zIndex - getWidgetConfig(right).layout.zIndex)
  return {
    format: 'codeless-design',
    schemaVersion: 1,
    source: { kind: 'codeless', name: 'Codeless Builder', version: '1.0.0' },
    exportedAt: new Date().toISOString(),
    name: layout.pageName || 'Codeless Page',
    canvas: { ...layout.canvas },
    nodes: roots.map(widget => toDesignNode(widget, byId, included)),
  }
}

export function exportDesignExchangeFromProject(project: LowCodeProject, selectedWidgetIds: string[] = []) {
  return exportDesignExchangeFromLayout(project.layout, project.layout.widgets, selectedWidgetIds)
}

function descendantIds(id: string, byId: Map<string, LowCodeWidget>) {
  const result: string[] = []
  for (const widget of byId.values()) {
    if (widget.parentId !== id) continue
    result.push(widget.id, ...descendantIds(widget.id, byId))
  }
  return result
}

function fallbackWidgetType(node: DesignExchangeNode): WidgetType {
  if (node.codelessType && allowedWidgetTypes.has(node.codelessType as WidgetType)) return node.codelessType as WidgetType
  if (node.type === 'text') {
    return node.text && (Number(node.text.fontSize) >= 24 || Number(node.text.fontWeight) >= 600) ? 'heading' : 'text'
  }
  if (node.type === 'line') return 'divider'
  if (node.type === 'image') return 'image'
  if (node.type === 'ellipse') return 'avatar'
  if (node.type === 'component' || node.type === 'instance' || node.type === 'rectangle') return 'card'
  if (node.type === 'frame' || node.type === 'group' || node.type === 'section') return 'frame'
  return 'frame'
}

function importProps(node: DesignExchangeNode, type: WidgetType): WidgetProps {
  const text = node.text?.characters || (type === 'image' ? node.name : undefined)
  return {
    text,
    src: undefined,
    alt: node.name,
    accent: safeColor(node.fills?.[0]) || safeColor(node.strokes?.[0]),
    fontSize: node.text?.fontSize,
    align: node.text?.textAlign,
    radius: node.cornerRadius,
  }
}

function applyImportedStyle(widget: LowCodeWidget, node: DesignExchangeNode, zIndex: number) {
  const config = getWidgetConfig(widget)
  const fill = safeColor(node.fills?.[0])
  const stroke = safeColor(node.strokes?.[0])
  if (fill) {
    if (widget.type === 'text' || widget.type === 'heading' || widget.type === 'link') config.style.color = fill
    else config.style.background = fill
    config.style.accent = fill
  }
  if (stroke) config.style.borderColor = stroke
  if (node.text?.fontSize) config.style.fontSize = finite(node.text.fontSize, config.style.fontSize || 14, 1, 256)
  if (node.text?.fontWeight) config.style.fontWeight = Math.round(finite(node.text.fontWeight, 400, 100, 900))
  if (node.text?.textAlign) config.style.textAlign = node.text.textAlign
  if (node.cornerRadius !== undefined) config.style.borderRadius = finite(node.cornerRadius, 0, 0, 10000)
  if (node.opacity !== undefined) config.style.opacity = finite(node.opacity, 1, 0, 1)
  setWidgetFrame(widget, {
    rotation: finite(node.rotation, 0, -3600, 3600),
    locked: Boolean(node.locked),
    hidden: node.visible === false,
    zIndex,
  })
  syncLegacyProps(widget)
}

export interface DesignExchangeImportConversion {
  widgets: LowCodeWidget[]
  sourceName: string
  nodeCount: number
}

export function importDesignExchangeDocument(document: DesignExchangeDocument, offsetX = 24, offsetY = 24): DesignExchangeImportConversion {
  const widgets: LowCodeWidget[] = []
  let nodeCount = 0
  const visit = (node: DesignExchangeNode, parentId: string | undefined, siblingIndex: number, isRoot: boolean) => {
    nodeCount += 1
    const type = fallbackWidgetType(node)
    const widget = createWidget(type, Math.round(finite(node.x, 0, -100000, 100000) + (isRoot ? offsetX : 0)), Math.round(finite(node.y, 0, -100000, 100000) + (isRoot ? offsetY : 0)), {
      name: String(node.name || type).slice(0, 240),
      parentId,
      w: Math.round(finite(node.width, 120, 24, 100000)),
      h: Math.round(finite(node.height, 60, 24, 100000)),
      props: importProps(node, type),
    })
    normalizeWidget(widget)
    applyImportedStyle(widget, node, siblingIndex + 1)
    widgets.push(widget)
    for (const [index, child] of (node.children || []).entries()) visit(child, widget.id, index, false)
  }
  for (const [index, node] of document.nodes.entries()) visit(node, undefined, index, true)
  return { widgets, sourceName: document.source.name || document.name, nodeCount }
}

export function buildDesignExchangeForSelection(layout: PageLayout, selectedWidgetIds: string[] = []) {
  return exportDesignExchangeFromLayout(layout, layout.widgets, selectedWidgetIds)
}

export function makeImportedWidgetId() { return makeId('widget') }

