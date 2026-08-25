<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { DesignSystem, DesignTheme } from '../types/lowcode'
import AppIcon from '../components/AppIcon.vue'
import BuilderHeader from '../components/builder/BuilderHeader.vue'
import CreatePageDialog from '../components/builder/CreatePageDialog.vue'
import ReviewPanel from '../components/ReviewPanel.vue'
import InspectPanel from '../components/InspectPanel.vue'
import WidgetRenderer from '../components/WidgetRenderer.vue'
import CanvasWidgetNode from '../components/CanvasWidgetNode.vue'
import CanvasWebGLLayer from '../components/CanvasWebGLLayer.vue'
import CanvasContextMenu from '../components/CanvasContextMenu.vue'
import CommandPalette from '../components/CommandPalette.vue'
import TokenManagerPanel from '../components/TokenManagerPanel.vue'
import VirtualLayerTree from '../components/VirtualLayerTree.vue'
import { eventOptionsForWidget, widgetEventActionLabels } from '../composables/utils'
import { widgetDefinitionMap, type WidgetFieldSchema } from '../components/registry/widgetRegistry'
import { DEFAULT_DESIGN_SYSTEM, normalizeDesignSystem } from '../composables/designSystem'
import { getWidgetFieldValue, parseOptions, serializeOptions, setWidgetConfigValue } from '../composables/widgetConfig'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)
const canvasRef = props.ui.canvasRef
const canvasViewportRef = props.ui.canvasViewportRef
const commandPaletteOpen = ref(false)
const tokenManagerOpen = ref(false)
const pageCreateOpen = ref(false)
const layerCanvasExpanded = ref(true)
const spacePressed = ref(false)
const eventActionOptions = Object.entries(widgetEventActionLabels).map(([value, label]) => ({ value, label }))
const tokenOptionMap = {
  color: [
    { label: 'Primary', value: 'color.primary' },
    { label: 'Secondary', value: 'color.secondary' },
    { label: 'Text', value: 'color.text' },
    { label: 'Muted text', value: 'color.muted' },
    { label: 'Surface', value: 'color.surface' },
    { label: 'Canvas', value: 'color.canvas' },
    { label: 'Border', value: 'color.border' },
  ],
  radius: [
    { label: 'Small radius', value: 'radius.sm' },
    { label: 'Medium radius', value: 'radius.md' },
    { label: 'Large radius', value: 'radius.lg' },
    { label: 'Pill radius', value: 'radius.pill' },
  ],
  typography: [
    { label: 'Small text', value: 'type.sm' },
    { label: 'Body text', value: 'type.body' },
    { label: 'Large text', value: 'type.lg' },
    { label: 'Heading', value: 'type.heading' },
  ],
  spacing: [
    { label: 'Small spacing', value: 'space.sm' },
    { label: 'Medium spacing', value: 'space.md' },
    { label: 'Large spacing', value: 'space.lg' },
    { label: 'Extra large spacing', value: 'space.xl' },
  ],
  shadow: [
    { label: 'No shadow', value: 'shadow.none' },
    { label: 'Small shadow', value: 'shadow.sm' },
    { label: 'Medium shadow', value: 'shadow.md' },
  ],
} as const

function tokenOptionsFor(kind: keyof typeof tokenOptionMap) {
  return tokenOptionMap[kind]
}

function ensureDesignSystem(): DesignSystem {
  if (!state.currentProject) return DEFAULT_DESIGN_SYSTEM
  if (!state.currentProject.designSystem) state.currentProject.designSystem = normalizeDesignSystem()
  return state.currentProject.designSystem
}

function designThemes() {
  return ensureDesignSystem().themes
}

function activeDesignTheme(): DesignTheme | undefined {
  const system = ensureDesignSystem()
  return system.themes.find(theme => theme.id === system.activeThemeId) || system.themes[0]
}

function designColorValue(key: string) {
  return activeDesignTheme()?.tokens.colors[key] || '#665cf6'
}

function updateDesignTheme(event: Event) {
  const system = ensureDesignSystem()
  system.activeThemeId = (event.target as HTMLSelectElement).value
  state.markDirty()
}

function updateDesignColor(key: string, event: Event) {
  const theme = activeDesignTheme()
  if (!theme) return
  theme.tokens.colors[key] = (event.target as HTMLInputElement).value
  state.markDirty()
}
function componentDefinition(type: string) {
  return widgetDefinitionMap[type as keyof typeof widgetDefinitionMap] || widgetDefinitionMap.text
}

function fieldValue(widget: any, field: WidgetFieldSchema): string | number {
  const value = getWidgetFieldValue(widget, field.key)
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return ''
}

function colorFieldValue(widget: any, field: WidgetFieldSchema) {
  const value = fieldValue(widget, field)
  return typeof value === 'string' && /^#[\da-fA-F]{6}$/.test(value) ? value : '#665cf6'
}

function fieldChecked(widget: any, field: WidgetFieldSchema) {
  return Boolean(getWidgetFieldValue(widget, field.key))
}

function optionFieldValue(widget: any, field: WidgetFieldSchema) {
  const value = getWidgetFieldValue(widget, field.key)
  return serializeOptions(Array.isArray(value) ? value as any[] : [])
}

function columnFieldValue(widget: any) {
  return state.serializeWidgetColumns(widget)
}

function updateConfigField(event: Event, widget: any, field: WidgetFieldSchema) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  let value: unknown = target.value
  if (field.kind === 'checkbox') value = (target as HTMLInputElement).checked
  if (field.kind === 'number') value = target.value === '' ? undefined : Number(target.value)
  if (field.kind === 'options') value = parseOptions(target.value)
  setWidgetConfigValue(widget, field.key, value)
  state.syncWidget(widget)
}

function actionTargetPlaceholder(type: string) {
  if (type === 'setValue') return 'Select the component to update'
  if (type === 'submitData') return 'Select the data table to submit'
  if (type === 'navigateBack') return 'Return to the previous page'
  if (type === 'setRouteState') return 'State key, e.g. selectedId or shared.userId'
  if (type === 'emitPageEvent') return 'Event name, e.g. customer.updated'
  if (['showModal', 'hideModal'].includes(type)) return 'Select a modal; leave empty for all'
  if (['showLoading', 'hideLoading'].includes(type)) return 'Select a loading widget; leave empty for all'
  return '/detail, a page path, or a workspace target'
}
function startLayerDrag(event: DragEvent, widgetId: string) {
  event.dataTransfer?.setData('application/codeless-layer', widgetId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function dropLayer(event: DragEvent, targetId: string) {
  const widgetId = event.dataTransfer?.getData('application/codeless-layer')
  if (widgetId && widgetId !== targetId) state.reorderWidgetsByLayer(widgetId, targetId)
}

function startCanvasPointer(event: PointerEvent) {
  const shouldPan = event.button === 1 || (event.button === 0 && spacePressed.value)

  // The canvas uses capture phase so blank-canvas gestures can start before
  // nested nodes receive the pointer event. A node gesture must stay owned by
  // CanvasWidgetNode; otherwise marquee selection and widget dragging start
  // at the same time and leave both interaction states active. Space+drag is
  // intentionally exempt because it is the viewport-pan gesture.
  const target = event.target instanceof Element ? event.target : null
  if (!shouldPan && target?.closest('[data-widget-id]')) return

  if (!shouldPan) {
    state.startCanvasSelection(event)
    return
  }
  event.preventDefault()
  event.stopPropagation()
  state.handleCanvasPanPointerDown(event, true)
}

function handleDesignerKeydown(event: KeyboardEvent) {
  state.handleCanvasViewportKeydown(event)
  if (event.code === 'Space' && !event.repeat && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) {
    event.preventDefault()
    spacePressed.value = true
  }
}

function handleDesignerKeyup(event: KeyboardEvent) {
  state.handleCanvasViewportKeyup(event)
  if (event.code === 'Space') spacePressed.value = false
}

onMounted(() => {
  window.addEventListener('keydown', handleDesignerKeydown)
  window.addEventListener('keyup', handleDesignerKeyup)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleDesignerKeydown)
  window.removeEventListener('keyup', handleDesignerKeyup)
})

</script>

<template>
<div v-if="state.currentProject" class="builder-view">
  <BuilderHeader
    :project-name="state.currentProject.name"
    :page-name="state.currentProject.layout.pageName"
    :selection-count="state.selectedWidgetIds.length"
    :dirty="state.dirty"
    :saving="state.saving"
    :can-undo="Boolean(state.historyStack.length)"
    :can-redo="Boolean(state.futureStack.length)"
    :zoom="state.zoom"
    :has-session="Boolean(state.session)"
    :can-inspect="Boolean(state.selectedWidget)"
    @update:zoom="state.zoom = $event"
    @open-command="commandPaletteOpen = true"
    @undo="state.undo"
    @redo="state.redo"
    @save="state.saveProject()"
    @collaboration="state.toggleCollaborationPanel"
    @preview="state.resetRuntimeValues(); state.showPreview = true"
    @review="state.toggleReviewPanel()"
    @inspect="state.toggleInspectPanel()"
    @import-project="state.importProject"
    @export-project="state.exportProject"
    @import-design-exchange="state.importDesignExchange"
    @export-design-exchange="state.exportDesignExchange"
    @publish="state.publishProject"
  />
  <section class="builder-layout" :style="{ '--component-panel-width': state.componentPanelWidth + 'px', '--inspector-panel-width': state.inspectorPanelWidth + 'px' }">
    <aside class="component-panel" :style="{ '--panel-width': `${state.componentPanelWidth}px` }">
      <nav class="panel-tabs panel-side-tabs" aria-label="设计器面板" aria-orientation="vertical">
        <button data-panel-tab="components" :class="{ active: state.paletteTab === 'components' }" type="button" @click="state.paletteTab = 'components'"><AppIcon name="apps" :size="15" /><span>组件</span></button>
        <button data-panel-tab="pages" :class="{ active: state.paletteTab === 'pages' }" type="button" @click="state.paletteTab = 'pages'"><AppIcon name="tabs" :size="15" /><span>页面</span></button>
        <button data-panel-tab="layers" :class="{ active: state.paletteTab === 'layers' }" type="button" @click="state.paletteTab = 'layers'"><AppIcon name="layers" :size="15" /><span>图层</span></button>
      </nav>
      <template v-if="state.paletteTab === 'components'">
        <label class="panel-search"><AppIcon name="search" :size="15" /><input v-model="state.paletteSearch" placeholder="搜索组件" /></label>
        <div class="component-scroll"><div v-for="group in state.filteredGroups" :key="group.name" class="component-group"><p>{{ group.name }}</p><div class="component-grid"><button v-for="item in group.items" :key="item.type" :data-widget-type="item.type" draggable="true" @dragstart="state.startPaletteDrag($event, item.type)" @dragend="state.setDropTargetContainer()" @click="state.addWidget(item.type)"><span><AppIcon :name="item.icon" :size="18" /></span><div><strong>{{ item.name }}</strong><small>{{ item.description }}</small></div><AppIcon name="plus" :size="14" /></button></div></div></div>
        <div class="panel-tip"><AppIcon name="cursor" :size="15" /><span>拖拽组件到画布；双击文字直接编辑，Shift 多选，方向键移动，Ctrl/Cmd+D 复制</span></div>
      </template>
      <section v-else-if="state.paletteTab === 'pages'" class="pages-panel" aria-label="页面列表">
        <div class="page-list-head"><span>页面</span><div><button title="新建页面" aria-label="新建页面" @click="pageCreateOpen = true"><AppIcon name="plus" :size="15" /></button><button title="复制当前页面" aria-label="复制当前页面" @click="state.duplicatePage()"><AppIcon name="copy" :size="13" /></button></div></div>
        <div class="page-list" role="list">
          <div v-for="page in state.pages" :key="page.id" class="page-item-row" role="listitem"><button :class="['page-item', { active: page.id === state.currentProject.currentPageId }]" type="button" @click="state.selectPage(page.id)"><span class="page-item-icon"><AppIcon name="tabs" :size="14" /></span><span class="page-item-copy"><strong>{{ page.name }}</strong><small>{{ page.path }}</small></span><span v-if="page.id === state.currentProject.entryPageId" class="page-entry-badge">入口</span></button><button class="page-menu" type="button" title="重命名页面" :aria-label="`重命名页面：${page.name}`" @click="state.renamePage(page.id)"><AppIcon name="more" :size="13" /></button></div>
        </div>
      </section>
      <section v-else class="layers-panel layer-panel-view" aria-label="图层面板">
        <div class="layers-head"><span>图层</span><small>{{ state.currentProject.layout.widgets.length }}</small></div>
        <div class="layer-page-root">
          <button class="layer-page-root-row" type="button" :aria-expanded="layerCanvasExpanded" @click="layerCanvasExpanded = !layerCanvasExpanded; state.clearSelection()"><span class="layer-toggle"><AppIcon :name="layerCanvasExpanded ? 'chevron-down' : 'chevron-right'" :size="11" /></span><span class="layer-icon layer-page-root-icon"><AppIcon name="frame" :size="13" /></span><span class="layer-page-root-copy"><strong>{{ state.currentPage?.name || state.currentProject.layout.pageName }}</strong><small>{{ state.currentProject.layout.canvas.width }} × {{ state.currentProject.layout.canvas.height }}</small></span></button>
          <VirtualLayerTree v-if="layerCanvasExpanded && state.currentProject.layout.widgets.length" :widgets="state.currentProject.layout.widgets" :state="state" :root-depth="1" />
          <div v-else-if="layerCanvasExpanded" class="layer-empty">画板为空，拖入组件以创建图层</div>
        </div>
      </section>
      <div class="panel-resize-handle panel-resize-handle-right" :class="{ active: state.panelResizeSide === 'component' }" title="拖拽调整组件面板宽度" @pointerdown.stop="state.startPanelResize($event, 'component')"></div>
    </aside>

    <div class="canvas-workspace" @wheel="state.handleCanvasWheel" @click="state.clearSelection()" @contextmenu.stop.prevent="state.handleCanvasContextMenu">
      <div class="canvas-rulers"><span>0</span><span>240</span><span>480</span><span>720</span><span>960</span></div>
      <div ref="canvasViewportRef" class="canvas-stage" :class="{ 'is-panning': state.canvasViewport.isPanning }" @scroll="state.updateCanvasViewport"><div class="canvas-frame" :style="state.canvasViewport.contentStyle">
        <div ref="canvasRef" :class="['design-canvas', { 'large-project-canvas': state.largeProjectMode }]" :style="{ width: `${state.currentProject.layout.canvas.width}px`, height: `${state.currentProject.layout.canvas.height}px`, background: state.currentProject.layout.canvas.background, transform: `translate(${state.currentProject.layout.canvas.x || 0}px, ${state.currentProject.layout.canvas.y || 0}px)` }" @dragover.prevent="state.setDropTargetContainer('')" @drop.stop.prevent="state.onCanvasDrop" @pointerdown.capture="startCanvasPointer" @pointermove="state.handleCanvasPanPointerMove" @pointerup="state.handleCanvasPanPointerUp" @pointercancel="state.handleCanvasPanPointerCancel" @click.stop="state.handleCanvasClick" @contextmenu.stop.prevent="state.handleCanvasContextMenu">
          <div class="canvas-grid-pattern" :style="state.canvasGridStyle"></div>
          <div v-if="state.showCanvasGuides" class="canvas-guides-layer" aria-hidden="true">
            <div
              v-for="guide in state.canvasGuideLines"
              :key="`${guide.axis}-${guide.position}`"
              :class="['canvas-guide-line', `is-${guide.axis === 'x' ? 'vertical' : 'horizontal'}`]"
              :style="guide.axis === 'x' ? { left: `${guide.position}px` } : { top: `${guide.position}px` }"
            ></div>
          </div>
          <CanvasWebGLLayer
            :widgets="state.webglWidgets"
            :visible-ids="state.canvasVisibleWidgetIds"
            :render-ids="state.webglWidgetIds"
            :enabled="state.largeProjectMode && state.webglAcceleration"
            :zoom="state.zoom"
            :canvas-width="state.currentProject.layout.canvas.width"
            :canvas-height="state.currentProject.layout.canvas.height"
            :get-frame="state.webglWidgetFrame"
            @webgl-ready="state.setWebGLSupported"
          />
          <CanvasWidgetNode v-for="widget in state.canvasRootWidgets" :key="widget.id" :widget="widget" :widgets="state.currentProject.layout.widgets" :state="state" />
          <div v-if="state.selectionBox" class="canvas-selection-box" :style="{ left: `${state.selectionBox.x}px`, top: `${state.selectionBox.y}px`, width: `${state.selectionBox.width}px`, height: `${state.selectionBox.height}px` }"></div>
          <div v-if="state.selectedWidgetIds.length > 1" class="canvas-selection-toolbar" @pointerdown.stop @click.stop>
            <span>Selected: {{ state.selectedWidgetIds.length }}</span>
            <button type="button" title="Align left" @click="state.alignSelectedWidgets('left')">Left</button>
            <button type="button" title="Align horizontal center" @click="state.alignSelectedWidgets('centerX')">Center</button>
            <button type="button" title="Align right" @click="state.alignSelectedWidgets('right')">Right</button>
            <button type="button" title="Align top" @click="state.alignSelectedWidgets('top')">Top</button>
            <button type="button" title="Align vertical center" @click="state.alignSelectedWidgets('centerY')">Middle</button>
            <button type="button" title="Align bottom" @click="state.alignSelectedWidgets('bottom')">Bottom</button>
            <i></i>
            <button type="button" title="Distribute horizontally" :disabled="state.selectedWidgetIds.length < 3" @click="state.distributeSelectedWidgets('x')">?</button>
            <button type="button" title="Distribute vertically" :disabled="state.selectedWidgetIds.length < 3" @click="state.distributeSelectedWidgets('y')">?</button>
          </div>
          <div v-if="!state.currentProject.layout.widgets.length" class="empty-canvas"><span><AppIcon name="layers" :size="26" /></span><strong>从左侧拖入第一个组件</strong><p>也可双击组件，将它快速添加到画布</p></div>
        </div>
      </div></div>
      <div class="canvas-footer"><span><AppIcon name="monitor" :size="14" />{{ state.currentProject.layout.canvas.width }} ? {{ state.currentProject.layout.canvas.height }}</span><span>Zoom {{ Math.round(state.zoom * 100) }}%</span><button class="canvas-mode-toggle" type="button" :class="{ active: state.gridEnabled }" data-testid="canvas-grid-toggle" @click.stop="state.toggleCanvasGrid">{{ state.gridEnabled ? `${state.gridSize}px grid` : 'Grid off' }}</button><button class="canvas-mode-toggle" type="button" :class="{ active: state.snapEnabled }" data-testid="canvas-snap-toggle" @click.stop="state.toggleCanvasSnap">{{ state.snapEnabled ? 'Smart snap' : 'Snap off' }}</button><span v-if="state.largeProjectMode" class="canvas-performance-summary" data-testid="canvas-performance-summary"><i></i>{{ state.performanceSummary.total }} widgets ? Visible {{ state.performanceSummary.visible }} ? WebGL {{ state.performanceSummary.accelerated }}</span><button v-if="state.largeProjectMode" class="canvas-performance-toggle" data-testid="canvas-performance-toggle" :class="{ active: state.webglAcceleration && state.webglSupported }" @click.stop="state.toggleWebGLAcceleration">{{ state.webglAcceleration && state.webglSupported ? 'WebGL acceleration on' : 'Enable WebGL acceleration' }}</button><span v-else><i></i>Drag 1px / Shift constrains direction</span></div>
    </div>

    <aside class="inspector-panel" :style="{ '--panel-width': `${state.inspectorPanelWidth}px` }">
      <template v-if="state.selectedWidget">
        <div class="inspector-head"><div><span><AppIcon :name="componentDefinition(state.selectedWidget.type).icon" :size="17" /></span><div><small>当前选中</small><strong>{{ state.selectedWidget.name }}</strong></div></div><button @click="state.clearSelection()"><AppIcon name="close" :size="16" /></button></div>
        <div class="panel-tabs inspector-tabs"><button :class="{ active: state.inspectorTab === 'properties' }" @click="state.inspectorTab = 'properties'">属性</button><button :class="{ active: state.inspectorTab === 'events' }" @click="state.inspectorTab = 'events'">交互</button></div>
        <div v-if="state.inspectorTab === 'properties'" class="inspector-scroll">
          <section class="component-usage"><div><span><AppIcon name="info" :size="14" /></span><div><strong>组件说明</strong><p>{{ componentDefinition(state.selectedWidget.type).usage }}</p></div></div><small>统一协议 v1：content / style / data / interaction</small></section>
          <section class="property-section component-link-section" data-testid="component-link-panel">
            <div class="property-title"><span>Reusable component</span><AppIcon name="layers" :size="14" /></div>
            <template v-if="!state.selectedWidget.config.component">
              <p class="component-link-copy">Create a local master component. Instances and overrides stay in this project.</p>
              <button class="ghost-button compact component-link-button" type="button" data-component-action="create-definition" @click="state.createSelectedComponentDefinition()"><AppIcon name="layers" :size="14" />Create master</button>
              <button v-if="Object.keys(state.selectedWidget.config.variants || {}).length" class="text-button compact" type="button" data-component-action="migrate-variants" @click="state.createSelectedComponentDefinition(true)">Migrate legacy variants</button>
            </template>
            <template v-else-if="state.selectedWidget.config.component.role === 'definition'">
              <div class="component-link-summary"><span class="component-link-badge master">MASTER</span><strong>{{ state.selectedComponentDefinition?.name || state.selectedWidget.name }}</strong></div>
              <p class="component-link-copy">v{{ state.selectedComponentDefinition?.version || 1 }} &middot; {{ state.selectedComponentInstanceCount }} instances. Editing this node updates instances while preserving local overrides.</p>
              <button class="ghost-button compact component-link-button" type="button" data-component-action="create-instance" @click="state.createSelectedComponentInstance()"><AppIcon name="copy" :size="14" />Insert instance</button>
            </template>
            <template v-else>
              <div class="component-link-summary"><span class="component-link-badge instance">INSTANCE</span><strong>{{ state.selectedComponentDefinition?.name || 'Missing master' }}</strong></div>
              <p v-if="state.selectedWidget.config.component.conflicts?.length" class="component-link-copy warning">{{ state.selectedWidget.config.component.conflicts.length }} update conflicts; local overrides are preserved.</p>
              <p v-else class="component-link-copy">v{{ state.selectedWidget.config.component.sourceVersion }} &middot; {{ state.selectedWidget.config.component.overrides?.length || 0 }} local overrides.</p>
              <div class="component-link-actions"><button class="ghost-button compact" type="button" data-component-action="refresh-instance" @click="state.refreshSelectedComponentInstance()">Keep overrides</button><button class="text-button compact" type="button" data-component-action="reset-instance" @click="state.refreshSelectedComponentInstance('reset-overrides')">Reset overrides</button></div>
              <button class="text-button compact danger-text" type="button" data-component-action="detach-instance" @click="state.detachSelectedComponentInstance()">Detach to node</button>
            </template>
          </section>
          <section class="property-section"><div class="property-title"><span>基础信息</span><AppIcon name="chevron-down" :size="14" /></div>
            <label class="property-field"><span>组件名称</span><input v-model="state.selectedWidget.name" @input="state.markDirty()" /></label>
          </section>
          <section class="property-section component-config-section">
            <div class="property-title"><span>组件配置</span><AppIcon name="settings" :size="14" /></div>
            <template v-for="field in componentDefinition(state.selectedWidget.type).fields" :key="field.key">
              <label v-if="field.kind !== 'checkbox' && field.kind !== 'data' && !field.key.startsWith('data.')" class="property-field">
                <span>{{ field.label }}</span>
                <textarea v-if="field.kind === 'textarea'" :value="fieldValue(state.selectedWidget, field)" :placeholder="field.placeholder" rows="3" @input="updateConfigField($event, state.selectedWidget, field)"></textarea>
                <textarea v-else-if="field.kind === 'options'" :value="optionFieldValue(state.selectedWidget, field)" :placeholder="field.placeholder || '标签|值，每行一个选项'" rows="3" @input="updateConfigField($event, state.selectedWidget, field)"></textarea>
                <textarea v-else-if="field.kind === 'columns'" :value="columnFieldValue(state.selectedWidget)" placeholder="字段|标题|宽度，每行一列" rows="4" @input="state.updateColumns"></textarea>
                <input v-else-if="field.kind === 'number'" :value="fieldValue(state.selectedWidget, field)" type="number" :min="field.min" :max="field.max" :step="field.step" @input="updateConfigField($event, state.selectedWidget, field)" />
                <input v-else-if="field.kind === 'color'" :value="colorFieldValue(state.selectedWidget, field)" type="color" @input="updateConfigField($event, state.selectedWidget, field)" />
                <select v-else-if="field.kind === 'select'" :value="fieldValue(state.selectedWidget, field)" @change="updateConfigField($event, state.selectedWidget, field)"><option v-for="option in field.options || []" :key="option.value" :value="option.value">{{ option.label }}</option></select>
                <input v-else :value="fieldValue(state.selectedWidget, field)" :placeholder="field.placeholder" @input="updateConfigField($event, state.selectedWidget, field)" />
              </label>
              <label v-else-if="field.kind === 'checkbox'" class="property-check"><input :checked="fieldChecked(state.selectedWidget, field)" type="checkbox" @change="updateConfigField($event, state.selectedWidget, field)" /><span><i><AppIcon name="check" :size="12" /></i>{{ field.label }}</span></label>
            </template>
          </section><section v-if="state.selectedWidget.type === 'button' || Object.keys(state.selectedWidget.config.variants || {}).length" class="property-section">
            <div class="property-title"><span>组件变体</span><AppIcon name="layers" :size="14" /></div>
            <label class="property-field"><span>变体</span><select :value="state.selectedWidget.config.variant || state.selectedWidget.config.content.variant || ''" @change="state.updateWidgetVariant"><option value="">默认</option><option v-for="(_, variantName) in state.selectedWidget.config.variants || {}" :key="String(variantName)" :value="String(variantName)">{{ variantName }}</option></select></label>
          </section>
          <section class="property-section">
            <div class="property-title"><span>设计 Token</span><AppIcon name="sparkle" :size="14" /></div>
            <label class="property-field"><span>强调色</span><select :value="state.selectedWidget.config.style.tokenRefs?.accent || ''" @change="state.updateWidgetTokenRef('accent', $event)"><option value="">不使用</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>背景色</span><select :value="state.selectedWidget.config.style.tokenRefs?.background || ''" @change="state.updateWidgetTokenRef('background', $event)"><option value="">不使用</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>文本色</span><select :value="state.selectedWidget.config.style.tokenRefs?.color || ''" @change="state.updateWidgetTokenRef('color', $event)"><option value="">不使用</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>圆角 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.borderRadius || ''" @change="state.updateWidgetTokenRef('borderRadius', $event)"><option value="">不使用</option><option v-for="option in tokenOptionsFor('radius')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['heading', 'text', 'button', 'link', 'icon'].includes(state.selectedWidget.type)" class="property-field"><span>字号 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.fontSize || ''" @change="state.updateWidgetTokenRef('fontSize', $event)"><option value="">不使用</option><option v-for="option in tokenOptionsFor('typography')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['card', 'frame', 'stack', 'grid', 'drawer'].includes(state.selectedWidget.type)" class="property-field"><span>内边距 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.padding || ''" @change="state.updateWidgetTokenRef('padding', $event)"><option value="">不使用</option><option v-for="option in tokenOptionsFor('spacing')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['stack', 'grid'].includes(state.selectedWidget.type)" class="property-field"><span>间隙 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.gap || ''" @change="state.updateWidgetTokenRef('gap', $event)"><option value="">不使用</option><option v-for="option in tokenOptionsFor('spacing')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['card', 'frame', 'stack', 'grid', 'drawer'].includes(state.selectedWidget.type)" class="property-field"><span>阴影 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.shadow || ''" @change="state.updateWidgetTokenRef('shadow', $event)"><option value="">不使用</option><option v-for="option in tokenOptionsFor('shadow')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          </section>
          <section class="property-section"><div class="property-title"><span>样式</span><AppIcon name="chevron-down" :size="14" /></div>
            <label v-if="!['input', 'select'].includes(state.selectedWidget.type)" class="property-field"><span>强调</span><div class="color-control"><input v-model="state.selectedWidget.config.style.accent" type="color" @input="state.syncWidget(state.selectedWidget)" /><input v-model="state.selectedWidget.config.style.accent" @input="state.syncWidget(state.selectedWidget)" /></div></label>
            <label v-if="['heading', 'text'].includes(state.selectedWidget.type)" class="property-field"><span>对齐方式</span><div class="segmented-control"><button :class="{ active: state.selectedWidget.config.style.textAlign === 'left' }" @click="state.selectedWidget.config.style.textAlign = 'left'; state.syncWidget(state.selectedWidget)"></button><button :class="{ active: state.selectedWidget.config.style.textAlign === 'center' }" @click="state.selectedWidget.config.style.textAlign = 'center'; state.syncWidget(state.selectedWidget)"></button><button :class="{ active: state.selectedWidget.config.style.textAlign === 'right' }" @click="state.selectedWidget.config.style.textAlign = 'right'; state.syncWidget(state.selectedWidget)"></button></div></label>
            <label v-if="['heading', 'text'].includes(state.selectedWidget.type)" class="property-field"><span>字号</span><div class="unit-input"><input v-model.number="state.selectedWidget.config.style.fontSize" type="number" min="10" max="72" @input="state.syncWidget(state.selectedWidget)" /><em>px</em></div></label>
            <label v-if="['button', 'input', 'select', 'table', 'stat', 'image'].includes(state.selectedWidget.type)" class="property-field"><span>圆角</span><div class="unit-input"><input v-model.number="state.selectedWidget.config.style.borderRadius" type="number" min="0" max="40" @input="state.syncWidget(state.selectedWidget)" /><em>px</em></div></label>
          </section>
          <section class="property-section"><div class="property-title"><span>布局与图层</span><AppIcon name="chevron-down" :size="14" /></div><div class="position-grid"><label><span>X</span><input v-model.number="state.selectedWidget.config.layout.x" type="number" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>Y</span><input v-model.number="state.selectedWidget.config.layout.y" type="number" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>W</span><input v-model.number="state.selectedWidget.config.layout.width" type="number" min="24" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>H</span><input v-model.number="state.selectedWidget.config.layout.height" type="number" min="24" @input="state.syncWidget(state.selectedWidget)" /></label></div><label class="property-check layer-check"><input v-model="state.selectedWidget.config.layout.locked" type="checkbox" @change="state.syncWidget(state.selectedWidget)" /><span><i><AppIcon name="lock" :size="11" /></i>锁定组件，禁止拖拽和调整</span></label><label class="property-check layer-check"><input v-model="state.selectedWidget.config.layout.hidden" type="checkbox" @change="state.syncWidget(state.selectedWidget)" /><span><i><AppIcon name="eye" :size="11" /></i>在预览中隐藏</span></label></section>
          <section v-if="componentDefinition(state.selectedWidget.type).capabilities.dataBinding" class="property-section"><div class="property-title"><span>数据绑定</span><AppIcon name="chevron-down" :size="14" /></div>
            <label class="property-field"><span>绑定数据</span><select :value="state.selectedWidget.config.data.table || ''" @change="state.updateDataSource(state.selectedWidget, $event)"><option value="">不绑定数据（静态数值）</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option></select></label>
            <template v-if="state.selectedWidget.config.data.table">
              <label class="property-field"><span>查询模式</span><select v-model="state.selectedWidget.config.data.mode" @change="state.syncWidget(state.selectedWidget)"><option value="list">多行列表</option><option value="single">单行数据</option><option v-if="state.selectedWidget.type === 'stat'" value="count">记录计数</option><option v-if="state.selectedWidget.type === 'stat'" value="aggregate">聚合计算</option></select></label>
              <div v-if="state.selectedWidget.type === 'select'" class="property-row"><label class="property-field"><span>显示字段</span><input v-model="state.selectedWidget.config.data.labelField" placeholder="name" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>值字</span><input v-model="state.selectedWidget.config.data.valueField" placeholder="id" @input="state.syncWidget(state.selectedWidget)" /></label></div>
              <template v-if="state.selectedWidget.config.data.mode === 'aggregate'"><label class="property-field"><span>聚合函数</span><select v-model="state.selectedWidget.config.data.aggregate.function" @change="state.syncWidget(state.selectedWidget)"><option value="count">计数</option><option value="sum">求和</option><option value="avg">平均</option><option value="min">最小值</option><option value="max">最大值</option></select></label><label class="property-field"><span>聚合字段</span><input v-model="state.selectedWidget.config.data.aggregate.field" placeholder="amount" @input="state.syncWidget(state.selectedWidget)" /></label></template>
              <label class="property-field"><span>过滤条件</span><input v-model="state.selectedWidget.config.data.where" placeholder="例如 status = '跟进'" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>排序字段</span><input v-model="state.selectedWidget.config.data.orderBy" placeholder="例如 id DESC" @input="state.syncWidget(state.selectedWidget)" /></label><label v-if="state.selectedWidget.config.data.mode === 'list'" class="property-field"><span>返回行数</span><input v-model.number="state.selectedWidget.config.data.limit" type="number" min="1" max="200" @input="state.syncWidget(state.selectedWidget)" /></label>
            </template>
          </section>
          <section v-if="state.selectedWidget.type === 'button'" class="property-section"><div class="property-title"><span>兼容表单提交</span><AppIcon name="chevron-down" :size="14" /></div><label class="property-field"><span>提交到数据表</span><select :value="state.selectedWidget.config.submitTo?.table || ''" @change="state.updateSubmitTarget(state.selectedWidget, $event)"><option value="">不提交</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option></select></label><small class="field-help">按钮可将当前页面表单字段提交到选定数据表。</small></section>
        </div>
        <div v-else class="events-panel">
          <div class="events-panel-head"><div><span><AppIcon name="flow" :size="18" /></span><div><strong>组件交互</strong><small>配置事件触发后的动作</small></div></div><button class="primary-button compact" @click="state.addWidgetEvent()"><AppIcon name="plus" :size="14" />添加事件</button></div>
          <div v-if="!state.selectedWidget.config.interaction.events?.length" class="events-empty"><AppIcon name="cursor" :size="22" /><p>暂未配置交互事件。点击下方按钮添加事件处理逻辑。</p></div>
          <article v-for="event in state.selectedWidget.config.interaction.events" :key="event.id" class="event-card"><header><div><span class="event-dot"></span><select v-model="event.event" @change="state.markDirty()"><option v-for="option in eventOptionsForWidget(state.selectedWidget.type)" :key="option.value" :value="option.value">{{ option.label }}</option></select></div><label class="event-enabled"><input v-model="event.enabled" type="checkbox" @change="state.markDirty()" />启用</label><button class="icon-button tiny danger-text" @click="state.removeWidgetEvent(event.id)"><AppIcon name="trash" :size="14" /></button></header>
            <div class="event-actions"><div v-for="(action, actionIndex) in event.actions" :key="action.id" class="event-action"><span>{{ Number(actionIndex) + 1 }}</span><select v-model="action.type" @change="state.markDirty()"><option v-for="option in eventActionOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select><select v-if="action.type === 'setValue'" v-model="action.target" @change="state.markDirty()"><option value="">选择目标组件</option><option v-for="targetWidget in state.currentProject.layout.widgets.filter((item: any) => item.type === 'input' || item.type === 'select')" :key="targetWidget.id" :value="targetWidget.id">{{ targetWidget.name }} 路 {{ targetWidget.config?.content?.label || targetWidget.name }}</option></select><select v-else-if="action.type === 'submitData'" v-model="action.target" @change="state.markDirty()"><option value="">选择提交的数据表</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option></select><select v-else-if="action.type === 'showModal' || action.type === 'hideModal'" v-model="action.target" @change="state.markDirty()"><option value="">全部弹窗</option><option v-for="service in state.currentProject.layout.widgets.filter((item: any) => item.type === 'modal')" :key="service.id" :value="service.id">{{ service.name }}</option></select><select v-else-if="action.type === 'showLoading' || action.type === 'hideLoading'" v-model="action.target" @change="state.markDirty()"><option value="">全部 Loading</option><option v-for="service in state.currentProject.layout.widgets.filter((item: any) => item.type === 'loading')" :key="service.id" :value="service.id">{{ service.name }}</option></select><input v-else-if="['navigate', 'navigateBack', 'setRouteState', 'emitPageEvent'].includes(action.type)" v-model="action.target" :placeholder="actionTargetPlaceholder(action.type)" @input="state.markDirty()" /><input v-if="['setValue', 'showToast'].includes(action.type)" v-model="action.value" :placeholder="action.type === 'setValue' ? '可用 {{ value }} / {{ row.id }}' : '提示文本，支持 {{ value }} / {{ row.name }}'" @input="state.markDirty()" /><input v-if="['setRouteState', 'emitPageEvent'].includes(action.type)" v-model="action.payload" placeholder="值或 JSON / 模板" @input="state.markDirty()" /><button class="icon-button tiny danger-text" @click="state.removeEventAction(event.id, action.id)"><AppIcon name="close" :size="13" /></button></div></div><button class="event-add-action" @click="state.addEventAction(event.id)"><AppIcon name="plus" :size="13" />添加动作</button>
          </article>
          <div class="events-tip"><AppIcon name="info" :size="13" /><span v-pre>事件支持使用数据模板，例如 {{ row.field }}；表单字段使用 {{ form.field }}。</span></div>
        </div>
        <div class="inspector-actions"><button @click="state.duplicateSelectedWidget"><AppIcon name="copy" :size="15" />复制</button><button @click="state.bringToFront"><AppIcon name="layers" :size="15" />置顶</button><button @click="state.toggleSelectedLocked"><AppIcon name="lock" :size="15" />锁定</button><button class="danger" @click="state.removeSelectedWidget"><AppIcon name="trash" :size="15" />删除</button></div>
      </template>
      <template v-else>
        <div class="inspector-empty-head"><span>页面属性</span><AppIcon name="settings" :size="17" /></div><div class="inspector-scroll page-properties"><div class="page-preview-card"><div><span></span><span></span><span></span></div><strong>{{ state.currentProject.layout.pageName }}</strong><small>{{ state.currentProject.layout.canvas.width }} × {{ state.currentProject.layout.canvas.height }} 桌面画布</small></div><section class="property-section" data-testid="page-properties-panel">
              <div class="property-title"><span>Page settings</span><AppIcon name="chevron-down" :size="14" /></div>
              <label class="property-field"><span>Page name</span><input :value="state.currentPage?.name || state.currentProject.layout.pageName" @change="state.updateCurrentPageProperties({ name: ($event.target as HTMLInputElement).value })" /></label>
              <div class="property-row">
                <label class="property-field"><span>Width</span><input :value="state.currentProject.layout.canvas.width" type="number" min="160" max="10000" step="1" @change="state.updateCurrentPageProperties({ canvas: { width: Number(($event.target as HTMLInputElement).value) } })" /></label>
                <label class="property-field"><span>Height</span><input :value="state.currentProject.layout.canvas.height" type="number" min="160" max="10000" step="1" @change="state.updateCurrentPageProperties({ canvas: { height: Number(($event.target as HTMLInputElement).value) } })" /></label>
              </div>
              <div class="property-row">
                <label class="property-field"><span>Position X</span><input :value="state.currentProject.layout.canvas.x || 0" type="number" step="1" @change="state.updateCurrentPageProperties({ canvas: { x: Number(($event.target as HTMLInputElement).value) } })" /></label>
                <label class="property-field"><span>Position Y</span><input :value="state.currentProject.layout.canvas.y || 0" type="number" step="1" @change="state.updateCurrentPageProperties({ canvas: { y: Number(($event.target as HTMLInputElement).value) } })" /></label>
              </div>
              <label class="property-field"><span>Canvas background</span><div class="color-control"><input :value="state.currentProject.layout.canvas.background" type="color" @change="state.updateCurrentPageProperties({ canvas: { background: ($event.target as HTMLInputElement).value } })" /><input :value="state.currentProject.layout.canvas.background" @change="state.updateCurrentPageProperties({ canvas: { background: ($event.target as HTMLInputElement).value } })" /></div></label>
              <small class="field-help">Position affects only the editor canvas. Preview and publish render from the page origin.</small>
            </section><section class="property-section design-system-section">
            <div class="property-title"><span>设计系统</span><AppIcon name="sparkle" :size="14" /></div>
            <label class="property-field"><span>当前主题</span><select :value="ensureDesignSystem().activeThemeId" @change="updateDesignTheme"><option v-for="theme in designThemes()" :key="theme.id" :value="theme.id">{{ theme.name }} ({{ theme.mode }})</option></select></label>
            <div class="property-row"><label class="property-field"><span>主色</span><div class="color-control"><input :value="designColorValue('primary')" type="color" @input="updateDesignColor('primary', $event)" /><input :value="designColorValue('primary')" @input="updateDesignColor('primary', $event)" /></div></label><label class="property-field"><span>画布色</span><div class="color-control"><input :value="designColorValue('canvas')" type="color" @input="updateDesignColor('canvas', $event)" /><input :value="designColorValue('canvas')" @input="updateDesignColor('canvas', $event)" /></div></label></div>
            <div class="property-row"><label class="property-field"><span>表面色</span><div class="color-control"><input :value="designColorValue('surface')" type="color" @input="updateDesignColor('surface', $event)" /><input :value="designColorValue('surface')" type="text" @input="updateDesignColor('surface', $event)" /></div></label><label class="property-field"><span>文本色</span><div class="color-control"><input :value="designColorValue('text')" type="color" @input="updateDesignColor('text', $event)" /><input :value="designColorValue('text')" type="text" @input="updateDesignColor('text', $event)" /></div></label></div>
            <button class="ghost-button compact token-manager-trigger" type="button" @click="tokenManagerOpen = true"><AppIcon name="sparkle" :size="14" />&#x7BA1;&#x7406;&#x5168;&#x90E8; Token</button>
            <small class="field-help">主题 Token 可同步到组件样式，便于统一调整。</small>
          </section>
          <section class="property-section page-route-section"><div class="property-title"><span>&#x8def;&#x7531;&#x4e0e;&#x5bfc;&#x822a;</span><AppIcon name="flow" :size="14" /></div><label class="property-field"><span>&#x8def;&#x5f84;</span><input :value="state.currentPage?.path || '/index'" placeholder="/detail" @change="state.updatePagePath(state.currentPage.id, ($event.target as HTMLInputElement).value)" /></label><div class="page-route-actions"><button :class="{ active: state.currentProject.entryPageId === state.currentPage?.id }" @click="state.setEntryPage(state.currentPage.id)"><AppIcon name="home" :size="13" /><span v-if="state.currentProject.entryPageId === state.currentPage?.id">当前入口</span><span v-else>设为入口</span></button><button @click="state.addPageGuard()"><AppIcon name="lock" :size="13" />&#x6dfb;&#x52a0;&#x5b88;&#x536b;</button></div><div v-if="state.currentPage?.guards?.length" class="page-guards"><article v-for="guard in state.currentPage.guards" :key="guard.id" class="page-guard-card"><header><select v-model="guard.type" @change="state.updatePageGuard(state.currentPage.id, guard.id, { type: guard.type })"><option value="auth">&#x767b;&#x5f55;&#x6821;&#x9a8c;</option><option value="condition">&#x6761;&#x4ef6;&#x8868;&#x8fbe;&#x5f0f;</option><option value="unsaved">&#x672a;&#x4fdd;&#x5b58;&#x786e;&#x8ba4;</option></select><label><input v-model="guard.enabled" type="checkbox" @change="state.updatePageGuard(state.currentPage.id, guard.id, { enabled: guard.enabled })" />&#x542f;&#x7528;</label><button class="icon-button tiny danger-text" @click="state.removePageGuard(state.currentPage.id, guard.id)"><AppIcon name="trash" :size="13" /></button></header><input v-if="guard.type === 'condition'" v-model="guard.expression" placeholder="&#x4f8b;&#x5982; isLoggedIn &#x6216; routeState.userId != null" @input="state.markDirty()" /><input v-model="guard.redirect" placeholder="&#x5931;&#x8d25;&#x65f6;&#x8df3;&#x8f6c;&#x5230;&#x7684;&#x8def;&#x5f84;&#xff08;&#x53ef;&#x9009;&#xff09;" @input="state.markDirty()" /><input v-model="guard.message" placeholder="&#x62e6;&#x622a;&#x63d0;&#x793a;&#xff08;&#x53ef;&#x9009;&#xff09;" @input="state.markDirty()" /></article></div><small class="field-help">&#x5b88;&#x536b;&#x6309;&#x8def;&#x7531;&#x548c;&#x9875;&#x9762;&#x987a;&#x5e8f;&#x6267;&#x884c;&#xff1b;&#x4e0d;&#x901a;&#x8fc7;&#x65f6;&#x53ef;&#x914d;&#x7f6e;&#x91cd;&#x5b9a;&#x5411;&#x3002;</small></section><div class="empty-inspector-tip"><AppIcon name="cursor" :size="18" /><p>在画布中选择组件，编辑 content、style、data 和 interaction。Shift 可多选，Delete 删除，Ctrl/Cmd+C/V 复制粘贴</p></div></div><div class="page-danger-zone"><button @click="state.showDeleteConfirm = true"><AppIcon name="trash" :size="15" />删除应用</button></div>
      </template>
      <div class="panel-resize-handle panel-resize-handle-left" :class="{ active: state.panelResizeSide === 'inspector' }" title="Drag to resize the inspector panel" @pointerdown.stop="state.startPanelResize($event, 'inspector')"></div>
    </aside>
  </section>
  <ReviewPanel v-if="state.showReviewPanel" :ui="ui" />
  <InspectPanel v-if="state.showInspectPanel" :ui="ui" />
  <CanvasContextMenu :ui="ui" />
  <CommandPalette :ui="ui" v-model:open="commandPaletteOpen" />
  <TokenManagerPanel :ui="ui" v-model:open="tokenManagerOpen" />
  <CreatePageDialog
    v-model:open="pageCreateOpen"
    :existing-paths="state.pages.map((page: any) => page.path)"
    @create="state.createPage"
  />
</div>
</template>
