<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LowCodeWidget } from '../types/lowcode'
import { getWidgetConfig, isContainerType } from '../composables/widgetConfig'
import LayerTreeItem from './LayerTreeItem.vue'

defineOptions({ name: 'VirtualLayerTree' })

type DesignerState = Record<string, any>
type LayerRow = { widget: LowCodeWidget; depth: number }

const props = defineProps<{
  widgets: LowCodeWidget[]
  state: DesignerState
  rootDepth?: number
}>()

const viewportRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const expandedIds = ref<Set<string>>(new Set())
const rowHeight = 33
const overscan = 8

const childrenByParent = computed(() => {
  const map = new Map<string, LowCodeWidget[]>()
  const sourceOrder = new Map(props.widgets.map((widget, index) => [widget.id, index]))
  for (const widget of props.widgets) {
    const key = widget.parentId || ''
    const children = map.get(key) || []
    children.push(widget)
    map.set(key, children)
  }
  map.forEach(children => children.sort((a, b) => {
    return getWidgetConfig(b).layout.zIndex - getWidgetConfig(a).layout.zIndex
      || (sourceOrder.get(b.id)! - sourceOrder.get(a.id)!)
  }))
  return map
})

const rows = computed<LayerRow[]>(() => {
  const result: LayerRow[] = []
  const visit = (parentId: string, depth: number) => {
    for (const widget of childrenByParent.value.get(parentId) || []) {
      result.push({ widget, depth: depth + (props.rootDepth || 0) })
      if (isContainerType(widget.type) && expandedIds.value.has(widget.id)) visit(widget.id, depth + 1)
    }
  }
  visit('', 0)
  return result
})

const virtualized = computed(() => rows.value.length > 60)
const startIndex = computed(() => virtualized.value
  ? Math.max(0, Math.floor(scrollTop.value / rowHeight) - overscan)
  : 0)
const endIndex = computed(() => virtualized.value
  ? Math.min(rows.value.length, Math.ceil((scrollTop.value + (viewportRef.value?.clientHeight || 320)) / rowHeight) + overscan)
  : rows.value.length)
const visibleRows = computed(() => rows.value.slice(startIndex.value, endIndex.value))
const offset = computed(() => startIndex.value * rowHeight)
const totalHeight = computed(() => rows.value.length * rowHeight)

function syncExpanded() {
  const validIds = new Set(props.widgets.filter(widget => isContainerType(widget.type)).map(widget => widget.id))
  const next = new Set<string>()
  validIds.forEach(id => next.add(id))
  expandedIds.value.forEach(id => { if (validIds.has(id)) next.add(id) })
  expandedIds.value = next
}

function toggleExpanded(widgetId: string) {
  const next = new Set(expandedIds.value)
  if (next.has(widgetId)) next.delete(widgetId)
  else next.add(widgetId)
  expandedIds.value = next
}

function onScroll(event: Event) {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop
}

watch(() => props.widgets.map(widget => `${widget.id}:${widget.parentId || ''}:${widget.type}`), syncExpanded, { immediate: true })
</script>

<template>
  <div ref="viewportRef" class="layer-list layer-list-viewport" :class="{ 'is-virtualized': virtualized }" @scroll="onScroll">
    <div class="layer-virtual-spacer" :style="{ height: `${totalHeight}px` }">
      <div class="layer-virtual-window" :style="{ transform: `translateY(${offset}px)` }">
        <LayerTreeItem
          v-for="row in visibleRows"
          :key="row.widget.id"
          :widget="row.widget"
          :widgets="widgets"
          :state="state"
          :depth="row.depth"
          :expanded="expandedIds.has(row.widget.id)"
          :virtual="true"
          @toggle="toggleExpanded"
        />
      </div>
    </div>
  </div>
</template>