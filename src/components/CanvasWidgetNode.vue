<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import WidgetRenderer from './WidgetRenderer.vue'
import type { LowCodeWidget } from '../types/lowcode'
import { getWidgetConfig, isContainerType } from '../composables/widgetConfig'

defineOptions({ name: 'CanvasWidgetNode' })

type DesignerState = Record<string, any>

const props = defineProps<{
  widget: LowCodeWidget
  widgets: LowCodeWidget[]
  state: DesignerState
}>()

const children = computed(() => props.state.canvasChildrenFor?.(props.widget.id) || props.widgets
  .filter(item => item.parentId === props.widget.id)
  .sort((a, b) => getWidgetConfig(a).layout.zIndex - getWidgetConfig(b).layout.zIndex))
const isContainer = computed(() => isContainerType(props.widget.type))
const selected = computed(() => props.state.selectedWidgetIds.includes(props.widget.id))
const interactionLocked = computed(() => props.state.isWidgetLocked?.(props.widget.id) ?? Boolean(props.widget.config?.layout?.locked))
const inlineEditing = computed(() => props.state.isInlineEditing(props.widget.id))

function layerDragId(event: DragEvent) {
  return event.dataTransfer?.getData('application/codeless-layer') || ''
}

function movingIds(event: DragEvent) {
  const id = layerDragId(event)
  return id ? [id] : []
}

function isDescendantOf(widgetId: string, ancestorId: string) {
  const byId = new Map(props.widgets.map(item => [item.id, item]))
  const seen = new Set<string>()
  let cursor = byId.get(widgetId)
  while (cursor?.parentId && !seen.has(cursor.parentId)) {
    if (cursor.parentId === ancestorId) return true
    seen.add(cursor.parentId)
    cursor = byId.get(cursor.parentId)
  }
  return false
}

/** Block invalid layer drops before they bubble into an outer container. */
function blocksLayerDrop(event: DragEvent) {
  const sourceId = layerDragId(event)
  return Boolean(sourceId && (sourceId === props.widget.id || isDescendantOf(props.widget.id, sourceId)))
}

function canAcceptDrop(event: DragEvent) {
  return isContainer.value && props.state.canDropIntoContainer?.(props.widget.id, movingIds(event))
}

function rejectLayerDrop(event: DragEvent) {
  if (!blocksLayerDrop(event)) return false
  event.stopPropagation()
  props.state.setDropTargetContainer?.('')
  return true
}

function handleDragOver(event: DragEvent) {
  if (rejectLayerDrop(event) || !canAcceptDrop(event)) return
  event.stopPropagation()
  props.state.setDropTargetContainer?.(props.widget.id, movingIds(event))
}

function handleChildrenDragOver(event: DragEvent) {
  if (rejectLayerDrop(event) || !canAcceptDrop(event)) return
  event.stopPropagation()
  props.state.setDropTargetContainer?.(props.widget.id, movingIds(event))
}

function handleDrop(event: DragEvent) {
  if (rejectLayerDrop(event) || !canAcceptDrop(event)) return
  event.stopPropagation()
  props.state.onCanvasDrop(event, props.widget.id)
}

function handleChildrenDrop(event: DragEvent) {
  if (rejectLayerDrop(event) || !canAcceptDrop(event)) return
  event.stopPropagation()
  props.state.onCanvasDrop(event, props.widget.id)
}
</script>

<template>
  <div
    :data-widget-id="widget.id"
    :data-testid="`canvas-widget-${widget.id}`"
    :data-widget-type="widget.type"
    :class="['canvas-widget', `widget-${widget.type}`, { selected, dragging: state.draggingWidgetIds?.includes(widget.id) || state.draggingWidgetId === widget.id, 'drop-target': state.dropTargetContainerId === widget.id, locked: interactionLocked, hidden: widget.config?.layout?.hidden }]"
    :aria-selected="selected"
    :style="state.widgetStyle(widget)"
    @pointerdown.stop="state.startWidgetMove($event, widget)"
    @click.stop="state.handleWidgetClick(widget.id, $event)"
    @contextmenu.stop.prevent="state.handleWidgetContextMenu($event, widget.id)"
    @dblclick.stop="state.startInlineEdit(widget, $event)"
    @dragover.prevent="handleDragOver"
    @drop.prevent="handleDrop"
  >
    <span v-if="selected" class="widget-label">
      {{ widget.name }}
      <small v-if="interactionLocked" title="组件已锁定"><AppIcon name="lock" :size="10" /></small>
      <small v-if="isContainer" title="容器"><AppIcon name="layers" :size="10" /></small>
    </span>
    <div v-if="inlineEditing" class="canvas-inline-editor" @pointerdown.stop @click.stop @dblclick.stop>
      <textarea v-if="state.inlineEditingField === 'description' || (state.inlineEditingField === 'text' && widget.type === 'text')" v-model="state.inlineEditingValue" :data-inline-editor="widget.id" :aria-label="`编辑${widget.name}`" @keydown.stop.ctrl.enter.prevent="state.commitInlineEdit" @keydown.stop.meta.enter.prevent="state.commitInlineEdit" @keydown.stop.esc.prevent="state.cancelInlineEdit" @blur="state.commitInlineEdit"></textarea>
      <input v-else v-model="state.inlineEditingValue" :data-inline-editor="widget.id" :aria-label="`编辑${widget.name}`" @keydown.stop.enter.exact.prevent="state.commitInlineEdit" @keydown.stop.esc.prevent="state.cancelInlineEdit" @blur="state.commitInlineEdit" />
    </div>
    <WidgetRenderer :widget="widget" :design-system="state.currentProject?.designSystem" :runtime="false">
      <template v-if="isContainer" #children>
        <div class="canvas-children-layer" :data-container-id="widget.id" @dragover.prevent="handleChildrenDragOver" @drop.prevent="handleChildrenDrop">
          <CanvasWidgetNode v-for="child in children" :key="child.id" :widget="child" :widgets="widgets" :state="state" />
          <div v-if="!children.length" class="container-empty-hint">拖入组件到此容器</div>
        </div>
      </template>
    </WidgetRenderer>
    <template v-if="selected && !interactionLocked">
      <i class="handle nw" @pointerdown.stop="state.startWidgetResize($event, widget, 'nw')"></i><i class="handle n" @pointerdown.stop="state.startWidgetResize($event, widget, 'n')"></i><i class="handle ne" @pointerdown.stop="state.startWidgetResize($event, widget, 'ne')"></i><i class="handle e" @pointerdown.stop="state.startWidgetResize($event, widget, 'e')"></i><i class="handle se" @pointerdown.stop="state.startWidgetResize($event, widget, 'se')"></i><i class="handle s" @pointerdown.stop="state.startWidgetResize($event, widget, 's')"></i><i class="handle sw" @pointerdown.stop="state.startWidgetResize($event, widget, 'sw')"></i><i class="handle w" @pointerdown.stop="state.startWidgetResize($event, widget, 'w')"></i>
    </template>
  </div>
</template>
