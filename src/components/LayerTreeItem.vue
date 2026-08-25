<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import type { LowCodeWidget } from '../types/lowcode'
import { getWidgetConfig, isContainerType } from '../composables/widgetConfig'
import { widgetDefinitionMap } from './registry/widgetRegistry'

defineOptions({ name: 'LayerTreeItem' })

type DesignerState = Record<string, any>
const props = defineProps<{ widget: LowCodeWidget; widgets: LowCodeWidget[]; state: DesignerState; depth?: number; expanded?: boolean; virtual?: boolean }>()
const emit = defineEmits<{ toggle: [widgetId: string] }>()
const localExpanded = ref(true)
const dragging = ref(false)
const depth = computed(() => props.depth || 0)
const isExpanded = computed(() => typeof props.expanded === 'boolean' ? props.expanded : localExpanded.value)
const children = computed(() => props.widgets
  .filter(item => item.parentId === props.widget.id)
  .sort((a, b) => getWidgetConfig(b).layout.zIndex - getWidgetConfig(a).layout.zIndex))
const isContainer = computed(() => isContainerType(props.widget.type))
const selfLocked = computed(() => props.state.isWidgetSelfLocked?.(props.widget.id) ?? Boolean(props.widget.config?.layout?.locked))
const interactionLocked = computed(() => props.state.isWidgetLocked?.(props.widget.id) ?? selfLocked.value)
const dropPosition = ref<'before' | 'after' | 'inside' | ''>('')

function toggleExpanded() {
  if (props.virtual || typeof props.expanded === 'boolean') emit('toggle', props.widget.id)
  else localExpanded.value = !localExpanded.value
}

function startDrag(event: DragEvent) {
  if (interactionLocked.value) {
    event.preventDefault()
    return
  }
  dragging.value = true
  event.dataTransfer?.setData('application/codeless-layer', props.widget.id)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
  }
}

function canReorderBeforeAfter(sourceId: string) {
  if (!sourceId || sourceId === props.widget.id || props.state.isWidgetLocked?.(sourceId)) return false
  const parentId = props.widget.parentId
  return !parentId || Boolean(props.state.canDropIntoContainer?.(parentId, [sourceId]))
}

function dragOver(event: DragEvent) {
  const sourceId = event.dataTransfer?.getData('application/codeless-layer') || ''
  const movingIds = sourceId ? [sourceId] : []
  if (!sourceId || sourceId === props.widget.id) {
    dropPosition.value = ''
    props.state.setDropTargetContainer?.('')
    return
  }

  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const rect = target?.getBoundingClientRect()
  const ratio = rect ? (event.clientY - rect.top) / Math.max(1, rect.height) : 0.5
  const nextPosition = isContainer.value && ratio > 0.28 && ratio < 0.72
    ? 'inside'
    : ratio < 0.5 ? 'before' : 'after'

  const valid = nextPosition === 'inside'
    ? Boolean(props.state.canDropIntoContainer?.(props.widget.id, movingIds))
    : canReorderBeforeAfter(sourceId)
  if (!valid) {
    dropPosition.value = ''
    props.state.setDropTargetContainer?.('')
    return
  }

  event.preventDefault()
  event.stopPropagation()
  dropPosition.value = nextPosition
  if (nextPosition === 'inside') toggleExpandIfNeeded()
  props.state.setDropTargetContainer?.(nextPosition === 'inside' ? props.widget.id : '', movingIds)
}

function toggleExpandIfNeeded() {
  if (!isContainer.value || isExpanded.value) return
  if (props.virtual || typeof props.expanded === 'boolean') emit('toggle', props.widget.id)
  else localExpanded.value = true
}

function handleDragLeave(event: DragEvent) {
  const current = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const next = event.relatedTarget instanceof Node ? event.relatedTarget : null
  if (current && next && current.contains(next)) return
  clearDragTarget()
}

function clearDragTarget() {
  dropPosition.value = ''
  if (props.state.dropTargetContainerId === props.widget.id) props.state.setDropTargetContainer?.('')
}

function endDrag() {
  dragging.value = false
  clearDragTarget()
}

function toggleVisibility(event: MouseEvent) {
  event.stopPropagation()
  props.state.toggleWidgetHidden?.(props.widget.id)
}

function toggleLock(event: MouseEvent) {
  event.stopPropagation()
  props.state.toggleWidgetLocked?.(props.widget.id)
}

function drop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  const sourceId = event.dataTransfer?.getData('application/codeless-layer') || ''
  if (sourceId && sourceId !== props.widget.id && dropPosition.value) {
    props.state.reorderWidgetsByLayer(sourceId, props.widget.id, dropPosition.value)
  }
  clearDragTarget()
}
</script>

<template>
  <div class="layer-tree-node">
    <div class="layer-item" :data-layer-id="widget.id" :class="{ active: state.selectedWidgetIds.includes(widget.id), dragging, 'is-container': isContainer, 'is-hidden': widget.config?.layout?.hidden, locked: interactionLocked, 'drop-target': state.dropTargetContainerId === widget.id, 'drop-before': dropPosition === 'before', 'drop-after': dropPosition === 'after', 'drop-inside': dropPosition === 'inside' }" :style="{ paddingLeft: `${6 + depth * 14}px` }" :draggable="!interactionLocked" @dragstart="startDrag" @dragover="dragOver" @dragleave="handleDragLeave" @drop="drop" @dragend="endDrag" @click="state.handleWidgetClick?.(widget.id, $event)" @contextmenu.stop.prevent="state.handleWidgetContextMenu?.($event, widget.id)">
      <button v-if="isContainer" class="layer-toggle" :aria-label="isExpanded ? '收起图层' : '展开图层'" @click.stop="toggleExpanded"><AppIcon :name="isExpanded ? 'chevron-down' : 'chevron-right'" :size="11" /></button><span v-else class="layer-toggle-spacer"></span>
      <span class="layer-icon"><AppIcon :name="widgetDefinitionMap[widget.type]?.icon || 'apps'" :size="13" /></span><strong>{{ widget.name }}</strong><small v-if="isContainer">{{ children.length }} 个</small><span class="layer-item-actions"><button type="button" :class="{ active: !widget.config?.layout?.hidden }" :aria-label="widget.config?.layout?.hidden ? '显示图层' : '隐藏图层'" :title="widget.config?.layout?.hidden ? '显示图层' : '隐藏图层'" @click="toggleVisibility"><AppIcon :name="widget.config?.layout?.hidden ? 'eye-off' : 'eye'" :size="12" /></button><button type="button" :class="{ active: selfLocked }" :aria-label="selfLocked ? '解锁图层' : '锁定图层'" :title="selfLocked ? '解锁图层' : '锁定图层'" @click="toggleLock"><AppIcon :name="selfLocked ? 'lock' : 'unlock'" :size="12" /></button></span>
    </div>
    <div v-if="isExpanded && !virtual" class="layer-children">
      <LayerTreeItem v-for="child in children" :key="child.id" :widget="child" :widgets="widgets" :state="state" :depth="depth + 1" />
    </div>
  </div>
</template>
