<script lang="ts">
let mountedNodeCount = 0
let spacePressed = false
const spacePanPointers = new Map<number, HTMLElement>()
const spacePanCleanupTimers = new Map<number, ReturnType<typeof setTimeout>>()

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function trackSpaceKeydown(event: KeyboardEvent) {
  if (event.code === 'Space' && !isEditableTarget(event.target)) spacePressed = true
}

function trackSpaceKeyup(event: KeyboardEvent) {
  if (event.code === 'Space') spacePressed = false
}

function resetSpacePanTracking() {
  spacePressed = false
}

function trackSpacePanPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !spacePressed || !(event.target instanceof Element)) return
  const widgetNode = event.target.closest<HTMLElement>('[data-widget-id]')
  if (widgetNode) spacePanPointers.set(event.pointerId, widgetNode)
}

function clearSpacePanPointer(pointerId: number) {
  const timer = spacePanCleanupTimers.get(pointerId)
  if (timer) clearTimeout(timer)
  spacePanCleanupTimers.delete(pointerId)
  spacePanPointers.delete(pointerId)
}

function scheduleSpacePanPointerCleanup(event: PointerEvent) {
  if (!spacePanPointers.has(event.pointerId)) return
  if (event.type === 'pointercancel') {
    clearSpacePanPointer(event.pointerId)
    return
  }
  const timer = setTimeout(() => clearSpacePanPointer(event.pointerId), 0)
  spacePanCleanupTimers.set(event.pointerId, timer)
}

function attachSpacePanTracking() {
  if (typeof window === 'undefined') return
  window.addEventListener('keydown', trackSpaceKeydown)
  window.addEventListener('keyup', trackSpaceKeyup)
  window.addEventListener('blur', resetSpacePanTracking)
  window.addEventListener('pointerdown', trackSpacePanPointerDown, true)
  window.addEventListener('pointerup', scheduleSpacePanPointerCleanup, true)
  window.addEventListener('pointercancel', scheduleSpacePanPointerCleanup, true)
}

function detachSpacePanTracking() {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', trackSpaceKeydown)
  window.removeEventListener('keyup', trackSpaceKeyup)
  window.removeEventListener('blur', resetSpacePanTracking)
  window.removeEventListener('pointerdown', trackSpacePanPointerDown, true)
  window.removeEventListener('pointerup', scheduleSpacePanPointerCleanup, true)
  window.removeEventListener('pointercancel', scheduleSpacePanPointerCleanup, true)
  spacePanCleanupTimers.forEach(timer => clearTimeout(timer))
  spacePanCleanupTimers.clear()
  spacePanPointers.clear()
  spacePressed = false
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
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
const renderInWebGL = computed(() => Boolean(props.state.isWebGLWidget?.(props.widget)))

onMounted(() => {
  mountedNodeCount += 1
  if (mountedNodeCount === 1) attachSpacePanTracking()
})

onBeforeUnmount(() => {
  mountedNodeCount -= 1
  if (mountedNodeCount === 0) detachSpacePanTracking()
})

function isTrackedSpacePan(event: PointerEvent) {
  return event.button === 0 && spacePanPointers.has(event.pointerId)
}

function handleWidgetPointerDown(event: PointerEvent) {
  // The canvas capture handler claims Space+primary-button gestures. Do not
  // consume an event it has already reserved for viewport panning.
  if (isTrackedSpacePan(event) || event.defaultPrevented) return
  event.stopPropagation()
  props.state.startWidgetMove(event, props.widget)
}

function handleWidgetResizePointerDown(event: PointerEvent, handle: string) {
  if (isTrackedSpacePan(event) || event.defaultPrevented) return
  event.stopPropagation()
  props.state.startWidgetResize(event, props.widget, handle)
}

function handleWidgetClick(event: MouseEvent) {
  const widgetNode = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const pointerId = (event as PointerEvent).pointerId
  const trackedWidget = typeof pointerId === 'number' ? spacePanPointers.get(pointerId) : undefined
  if (spacePressed || trackedWidget === widgetNode) {
    if (typeof pointerId === 'number') clearSpacePanPointer(pointerId)
    // Keep the existing click boundary so a pan cannot fall through and clear
    // the selection in the canvas click handler.
    event.stopPropagation()
    return
  }
  event.stopPropagation()
  props.state.handleWidgetClick(props.widget.id, event)
}

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
    :class="['canvas-widget', `widget-${widget.type}`, { selected, dragging: state.draggingWidgetIds?.includes(widget.id) || state.draggingWidgetId === widget.id, 'drop-target': state.dropTargetContainerId === widget.id, locked: interactionLocked, hidden: widget.config?.layout?.hidden, 'webgl-placeholder': renderInWebGL, 'component-master': widget.config?.component?.role === 'definition', 'component-instance': widget.config?.component?.role === 'instance' }]"
    :aria-selected="selected"
    :style="state.widgetStyle(widget)"
    @pointerdown="handleWidgetPointerDown"
    @click="handleWidgetClick"
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
    <div v-if="renderInWebGL" class="canvas-webgl-placeholder" aria-hidden="true"></div>
    <WidgetRenderer v-else :widget="widget" :design-system="state.currentProject?.designSystem" :runtime="false">
      <template v-if="isContainer" #children>
        <div class="canvas-children-layer" :data-container-id="widget.id" @dragover.prevent="handleChildrenDragOver" @drop.prevent="handleChildrenDrop">
          <CanvasWidgetNode v-for="child in children" :key="child.id" :widget="child" :widgets="widgets" :state="state" />
          <div v-if="!children.length" class="container-empty-hint">拖入组件到此容器</div>
        </div>
      </template>
    </WidgetRenderer>
    <template v-if="selected && !interactionLocked">
      <i class="handle nw" @pointerdown="handleWidgetResizePointerDown($event, 'nw')"></i><i class="handle n" @pointerdown="handleWidgetResizePointerDown($event, 'n')"></i><i class="handle ne" @pointerdown="handleWidgetResizePointerDown($event, 'ne')"></i><i class="handle e" @pointerdown="handleWidgetResizePointerDown($event, 'e')"></i><i class="handle se" @pointerdown="handleWidgetResizePointerDown($event, 'se')"></i><i class="handle s" @pointerdown="handleWidgetResizePointerDown($event, 's')"></i><i class="handle sw" @pointerdown="handleWidgetResizePointerDown($event, 'sw')"></i><i class="handle w" @pointerdown="handleWidgetResizePointerDown($event, 'w')"></i>
    </template>
  </div>
</template>
