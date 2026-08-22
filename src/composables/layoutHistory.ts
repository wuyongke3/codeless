import type { LowCodeWidget, PageLayout } from '../types/lowcode'

export interface LayoutMetaSnapshot {
  version: number
  pageName: string
  canvas: PageLayout['canvas']
}

export interface WidgetPatch {
  id: string
  before?: LowCodeWidget
  after?: LowCodeWidget
}

export interface LayoutPatch {
  beforeMeta: LayoutMetaSnapshot
  afterMeta: LayoutMetaSnapshot
  widgetChanges: WidgetPatch[]
  orderBefore?: string[]
  orderAfter?: string[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function serialize(value: unknown) {
  return JSON.stringify(value)
}

function metaSnapshot(layout: PageLayout): LayoutMetaSnapshot {
  return {
    version: layout.version,
    pageName: layout.pageName,
    canvas: { ...layout.canvas },
  }
}

export function createLayoutPatch(before: PageLayout, after: PageLayout): LayoutPatch | null {
  const beforeById = new Map(before.widgets.map(widget => [widget.id, widget]))
  const afterById = new Map(after.widgets.map(widget => [widget.id, widget]))
  const ids = new Set([...beforeById.keys(), ...afterById.keys()])
  const widgetChanges: WidgetPatch[] = []

  ids.forEach(id => {
    const beforeWidget = beforeById.get(id)
    const afterWidget = afterById.get(id)
    if (serialize(beforeWidget) === serialize(afterWidget)) return
    widgetChanges.push({
      id,
      before: beforeWidget ? clone(beforeWidget) : undefined,
      after: afterWidget ? clone(afterWidget) : undefined,
    })
  })

  const beforeMeta = metaSnapshot(before)
  const afterMeta = metaSnapshot(after)
  const metaChanged = serialize(beforeMeta) !== serialize(afterMeta)
  const beforeOrder = before.widgets.map(widget => widget.id)
  const afterOrder = after.widgets.map(widget => widget.id)
  const orderChanged = serialize(beforeOrder) !== serialize(afterOrder)

  if (!metaChanged && !widgetChanges.length && !orderChanged) return null

  return {
    beforeMeta,
    afterMeta,
    widgetChanges,
    ...(orderChanged ? { orderBefore: beforeOrder, orderAfter: afterOrder } : {}),
  }
}

export function applyLayoutPatch(layout: PageLayout, patch: LayoutPatch, direction: 'undo' | 'redo'): PageLayout {
  const useBefore = direction === 'undo'
  const meta = useBefore ? patch.beforeMeta : patch.afterMeta
  const widgetMap = new Map(layout.widgets.map(widget => [widget.id, widget]))

  for (const change of patch.widgetChanges) {
    const nextWidget = useBefore ? change.before : change.after
    if (nextWidget) widgetMap.set(change.id, clone(nextWidget))
    else widgetMap.delete(change.id)
  }

  const targetOrder = useBefore ? patch.orderBefore : patch.orderAfter
  const widgets = targetOrder
    ? targetOrder.flatMap(id => {
      const widget = widgetMap.get(id)
      return widget ? [widget] : []
    })
    : layout.widgets.map(widget => widgetMap.get(widget.id) || widget)

  return {
    ...layout,
    version: meta.version,
    pageName: meta.pageName,
    canvas: { ...meta.canvas },
    widgets,
  }
}
