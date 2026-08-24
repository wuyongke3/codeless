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
const elementPlusTypes = new Set(['badge', 'tag', 'alert', 'progress', 'switch', 'checkbox', 'radio', 'datePicker', 'pagination', 'breadcrumb', 'tabs', 'collapse', 'modal', 'drawer', 'loading'])

function fieldValue(widget: any, field: WidgetFieldSchema): string | number {
  const value = getWidgetFieldValue(widget, field.key)
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return ''
}

function fieldChecked(widget: any, field: WidgetFieldSchema) {
  return Boolean(getWidgetFieldValue(widget, field.key))
}

function optionFieldValue(widget: any, field: WidgetFieldSchema) {
  const value = getWidgetFieldValue(widget, field.key)
  return serializeOptions(Array.isArray(value) ? value as any[] : [])
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

function showElementPlusFields(type: string) {
  return elementPlusTypes.has(type)
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
      <div class="panel-tabs"><button :class="{ active: state.paletteTab === 'components' }" @click="state.paletteTab = 'components'">缁勪欢</button><button :class="{ active: state.paletteTab === 'pages' }" @click="state.paletteTab = 'pages'">椤甸潰</button></div>
      <template v-if="state.paletteTab === 'components'">
        <label class="panel-search"><AppIcon name="search" :size="15" /><input v-model="state.paletteSearch" placeholder="鎼滅储缁勪欢" /></label>
        <div class="component-scroll"><div v-for="group in state.filteredGroups" :key="group.name" class="component-group"><p>{{ group.name }}</p><div class="component-grid"><button v-for="item in group.items" :key="item.type" :data-widget-type="item.type" draggable="true" @dragstart="state.startPaletteDrag($event, item.type)" @dragend="state.setDropTargetContainer()" @click="state.addWidget(item.type)"><span><AppIcon :name="item.icon" :size="18" /></span><div><strong>{{ item.name }}</strong><small>{{ item.description }}</small></div><AppIcon name="plus" :size="14" /></button></div></div></div>
        <div class="panel-tip"><AppIcon name="cursor" :size="15" /><span>鎷栨嫿缁勪欢鍒扮敾甯冿紱鍙屽嚮鏂囧瓧鐩存帴缂栬緫锛汼hift 澶氶€夛紝鏂瑰悜閿Щ鍔紝Ctrl/Cmd+D 澶嶅埗</span></div>
      </template>
      <div v-else class="pages-panel">
        <div class="page-list-head"><span>搴旂敤椤甸潰</span><div><button title="鏂板缓椤甸潰" @click="pageCreateOpen = true"><AppIcon name="plus" :size="15" /></button><button title="澶嶅埗褰撳墠椤甸潰" @click="state.duplicatePage()"><AppIcon name="copy" :size="13" /></button></div></div>
        <div class="page-list">
          <div v-for="page in state.pages" :key="page.id" :class="['page-item', { active: page.id === state.currentProject.currentPageId }]" @click="state.selectPage(page.id)">
            <span><AppIcon name="apps" :size="15" /></span><div><strong>{{ page.name }}</strong><small>{{ page.path }}</small></div>
            <button class="page-menu" title="椤甸潰鎿嶄綔" @click.stop="state.renamePage(page.id)"><AppIcon name="more" :size="13" /></button>
          </div>
        </div>
        <div class="layers-panel">
          <div class="layers-head"><span>鍥惧眰锛坽{ state.currentProject.layout.widgets.length }}锛</span><AppIcon name="layers" :size="14" /></div>
          <VirtualLayerTree v-if="state.currentProject.layout.widgets.length" :widgets="state.currentProject.layout.widgets" :state="state" />
          <div v-else class="layer-empty">鏆傛棤鍥惧眰</div>
        </div>
      </div>
      <div class="panel-resize-handle panel-resize-handle-right" :class="{ active: state.panelResizeSide === 'component' }" title="鎷栨嫿璋冩暣缁勪欢闈㈡澘瀹藉害" @pointerdown.stop="state.startPanelResize($event, 'component')"></div>
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
          <div v-if="!state.currentProject.layout.widgets.length" class="empty-canvas"><span><AppIcon name="layers" :size="26" /></span><strong>浠庡乏渚ф嫋鍏ョ涓€涓粍</strong><p>涔熷彲浠ュ崟鍑荤粍浠讹紝灏嗗畠蹇€熸坊鍔犲埌鐢诲竷</p></div>
        </div>
      </div></div>
      <div class="canvas-footer"><span><AppIcon name="monitor" :size="14" />{{ state.currentProject.layout.canvas.width }} ? {{ state.currentProject.layout.canvas.height }}</span><span>Zoom {{ Math.round(state.zoom * 100) }}%</span><button class="canvas-mode-toggle" type="button" :class="{ active: state.gridEnabled }" data-testid="canvas-grid-toggle" @click.stop="state.toggleCanvasGrid">{{ state.gridEnabled ? `${state.gridSize}px grid` : 'Grid off' }}</button><button class="canvas-mode-toggle" type="button" :class="{ active: state.snapEnabled }" data-testid="canvas-snap-toggle" @click.stop="state.toggleCanvasSnap">{{ state.snapEnabled ? 'Smart snap' : 'Snap off' }}</button><span v-if="state.largeProjectMode" class="canvas-performance-summary" data-testid="canvas-performance-summary"><i></i>{{ state.performanceSummary.total }} widgets ? Visible {{ state.performanceSummary.visible }} ? WebGL {{ state.performanceSummary.accelerated }}</span><button v-if="state.largeProjectMode" class="canvas-performance-toggle" data-testid="canvas-performance-toggle" :class="{ active: state.webglAcceleration && state.webglSupported }" @click.stop="state.toggleWebGLAcceleration">{{ state.webglAcceleration && state.webglSupported ? 'WebGL acceleration on' : 'Enable WebGL acceleration' }}</button><span v-else><i></i>Drag 1px / Shift constrains direction</span></div>
    </div>

    <aside class="inspector-panel" :style="{ '--panel-width': `${state.inspectorPanelWidth}px` }">
      <template v-if="state.selectedWidget">
        <div class="inspector-head"><div><span><AppIcon :name="componentDefinition(state.selectedWidget.type).icon" :size="17" /></span><div><small>褰撳墠閫変腑</small><strong>{{ state.selectedWidget.name }}</strong></div></div><button @click="state.clearSelection()"><AppIcon name="close" :size="16" /></button></div>
        <div class="panel-tabs inspector-tabs"><button :class="{ active: state.inspectorTab === 'properties' }" @click="state.inspectorTab = 'properties'">灞炴€</button><button :class="{ active: state.inspectorTab === 'events' }" @click="state.inspectorTab = 'events'">浜や簰</button></div>
        <div v-if="state.inspectorTab === 'properties'" class="inspector-scroll">
          <section class="component-usage"><div><span><AppIcon name="info" :size="14" /></span><div><strong>鎬庝箞鐢</strong><p>{{ componentDefinition(state.selectedWidget.type).usage }}</p></div></div><small>缁熶竴鍗忚 v1 路 content / style / data / interaction</small></section>
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
          <section class="property-section"><div class="property-title"><span>鍩虹淇℃伅</span><AppIcon name="chevron-down" :size="14" /></div>
            <label class="property-field"><span>缁勪欢鍚嶇О</span><input v-model="state.selectedWidget.name" @input="state.markDirty()" /></label>
            <label v-if="state.selectedWidget.type !== 'divider' && !['input', 'select'].includes(state.selectedWidget.type)" class="property-field"><span>{{ state.selectedWidget.type === 'stat' ? '鎸囨爣鍚嶇О' : state.selectedWidget.type === 'image' ? '鍗犱綅鏍囬' : '鏄剧ず鏂囧瓧' }}</span><input v-model="state.selectedWidget.config.content.text" @input="state.syncWidget(state.selectedWidget)" /></label>
            <label v-if="['heading', 'image'].includes(state.selectedWidget.type)" class="property-field"><span>{{ state.selectedWidget.type === 'image' ? '鍗犱綅璇存槑' : '璇存槑鏂囧瓧' }}</span><textarea v-model="state.selectedWidget.config.content.description" rows="2" @input="state.syncWidget(state.selectedWidget)"></textarea></label>
            <label v-if="['input', 'select'].includes(state.selectedWidget.type)" class="property-field"><span>瀛楁鏍囩</span><input v-model="state.selectedWidget.config.content.label" @input="state.syncWidget(state.selectedWidget)" /></label>
            <label v-if="state.selectedWidget.type === 'input'" class="property-field"><span>鍗犱綅鎻愮ず</span><input v-model="state.selectedWidget.config.content.placeholder" @input="state.syncWidget(state.selectedWidget)" /></label>
            <label v-if="state.selectedWidget.type === 'select'" class="property-field"><span>Static options (one per line)</span><textarea :value="state.serializeWidgetOptions(state.selectedWidget)" rows="4" placeholder="Label|value" @input="state.updateOptions"></textarea></label>
            <label v-if="state.selectedWidget.type === 'table'" class="property-field"><span>琛ㄦ牸鍒楋紙瀛楁|鏄剧ず鍚峾瀹藉害</span><textarea :value="state.serializeWidgetColumns(state.selectedWidget)" rows="4" placeholder="name|瀹㈡埛鍚嶇О|180" @input="state.updateColumns"></textarea></label>
            <div v-if="state.selectedWidget.type === 'stat'" class="property-row"><label class="property-field"><span>闈欐€佹暟</span><input v-model="state.selectedWidget.config.content.value" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>瓒嬪娍</span><input v-model="state.selectedWidget.config.content.trend" @input="state.syncWidget(state.selectedWidget)" /></label></div>
            <label v-if="state.selectedWidget.type === 'image'" class="property-field"><span>鍥剧墖鍦板潃</span><input v-model="state.selectedWidget.config.content.src" placeholder="https://... 鎴?file://..." @input="state.syncWidget(state.selectedWidget)" /></label>
            <label v-if="state.selectedWidget.type === 'image'" class="property-field"><span>鏇夸唬鏂囨湰</span><input v-model="state.selectedWidget.config.content.alt" @input="state.syncWidget(state.selectedWidget)" /></label>
            <div v-if="['input', 'select'].includes(state.selectedWidget.type)" class="property-row"><label class="property-field"><span>瀛楁</span><input v-model="state.selectedWidget.config.data.field" placeholder="渚嬪 customer_name" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>榛樿</span><input v-model="state.selectedWidget.config.content.defaultValue" @input="state.syncWidget(state.selectedWidget)" /></label></div><label v-if="state.selectedWidget.type === 'input'" class="property-field"><span>鍊肩被</span><select v-model="state.selectedWidget.config.content.valueType" @change="state.syncWidget(state.selectedWidget)"><option value="text">鏂囨湰</option><option value="number">鏁板瓧</option><option value="email">閭</option><option value="phone">鐢佃瘽</option><option value="date">鏃ユ湡</option><option value="datetime">鏃ユ湡鏃堕棿</option></select></label>
            <label v-if="['input', 'select'].includes(state.selectedWidget.type)" class="property-check"><input v-model="state.selectedWidget.config.validation.required" type="checkbox" @change="state.syncWidget(state.selectedWidget)" /><span><i><AppIcon name="check" :size="12" /></i>璁句负蹇呭～</span></label>
          </section>
          <section v-if="showElementPlusFields(state.selectedWidget.type)" class="property-section component-config-section">
            <div class="property-title"><span>缁勪欢閰嶇疆</span><AppIcon name="settings" :size="14" /></div>
            <template v-for="field in componentDefinition(state.selectedWidget.type).fields" :key="field.key">
              <label v-if="field.kind !== 'checkbox'" class="property-field">
                <span>{{ field.label }}</span>
                <textarea v-if="field.kind === 'textarea'" :value="fieldValue(state.selectedWidget, field)" :placeholder="field.placeholder" rows="3" @input="updateConfigField($event, state.selectedWidget, field)"></textarea>
                <textarea v-else-if="field.kind === 'options'" :value="optionFieldValue(state.selectedWidget, field)" :placeholder="field.placeholder || 'Label|value, one option per line'" rows="3" @input="updateConfigField($event, state.selectedWidget, field)"></textarea>
                <input v-else-if="field.kind === 'number'" :value="fieldValue(state.selectedWidget, field)" type="number" :min="field.min" :max="field.max" :step="field.step" @input="updateConfigField($event, state.selectedWidget, field)" />
                <input v-else-if="field.kind === 'color'" :value="fieldValue(state.selectedWidget, field)" type="color" @input="updateConfigField($event, state.selectedWidget, field)" />
                <select v-else-if="field.kind === 'select'" :value="fieldValue(state.selectedWidget, field)" @change="updateConfigField($event, state.selectedWidget, field)"><option v-for="option in field.options || []" :key="option.value" :value="option.value">{{ option.label }}</option></select>
                <input v-else :value="fieldValue(state.selectedWidget, field)" :placeholder="field.placeholder" @input="updateConfigField($event, state.selectedWidget, field)" />
              </label>
              <label v-else class="property-check"><input :checked="fieldChecked(state.selectedWidget, field)" type="checkbox" @change="updateConfigField($event, state.selectedWidget, field)" /><span><i><AppIcon name="check" :size="12" /></i>{{ field.label }}</span></label>
            </template>
          </section><section v-if="state.selectedWidget.type === 'button' || Object.keys(state.selectedWidget.config.variants || {}).length" class="property-section">
            <div class="property-title"><span>缁勪欢鍙樹綋</span><AppIcon name="layers" :size="14" /></div>
            <label class="property-field"><span>鍙樹綋</span><select :value="state.selectedWidget.config.variant || state.selectedWidget.config.content.variant || ''" @change="state.updateWidgetVariant"><option value="">榛樿</option><option v-for="(_, variantName) in state.selectedWidget.config.variants || {}" :key="String(variantName)" :value="String(variantName)">{{ variantName }}</option></select></label>
          </section>
          <section class="property-section">
            <div class="property-title"><span>璁捐 Token</span><AppIcon name="sparkle" :size="14" /></div>
            <label class="property-field"><span>寮鸿皟鑹</span><select :value="state.selectedWidget.config.style.tokenRefs?.accent || ''" @change="state.updateWidgetTokenRef('accent', $event)"><option value="">鏈缃</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>鑳屾櫙鑹</span><select :value="state.selectedWidget.config.style.tokenRefs?.background || ''" @change="state.updateWidgetTokenRef('background', $event)"><option value="">鏈缃</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>鏂囨湰鑹</span><select :value="state.selectedWidget.config.style.tokenRefs?.color || ''" @change="state.updateWidgetTokenRef('color', $event)"><option value="">鏈缃</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>鍦嗚 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.borderRadius || ''" @change="state.updateWidgetTokenRef('borderRadius', $event)"><option value="">鏈缃</option><option v-for="option in tokenOptionsFor('radius')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['heading', 'text', 'button', 'link', 'icon'].includes(state.selectedWidget.type)" class="property-field"><span>瀛楀彿 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.fontSize || ''" @change="state.updateWidgetTokenRef('fontSize', $event)"><option value="">鏈缃</option><option v-for="option in tokenOptionsFor('typography')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['card', 'frame', 'stack', 'grid', 'drawer'].includes(state.selectedWidget.type)" class="property-field"><span>鍐呰竟璺?Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.padding || ''" @change="state.updateWidgetTokenRef('padding', $event)"><option value="">鏈缃</option><option v-for="option in tokenOptionsFor('spacing')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['stack', 'grid'].includes(state.selectedWidget.type)" class="property-field"><span>闂撮殭 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.gap || ''" @change="state.updateWidgetTokenRef('gap', $event)"><option value="">鏈缃</option><option v-for="option in tokenOptionsFor('spacing')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['card', 'frame', 'stack', 'grid', 'drawer'].includes(state.selectedWidget.type)" class="property-field"><span>闃村奖 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.shadow || ''" @change="state.updateWidgetTokenRef('shadow', $event)"><option value="">鏈缃</option><option v-for="option in tokenOptionsFor('shadow')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          </section>
          <section class="property-section"><div class="property-title"><span>鏍峰紡</span><AppIcon name="chevron-down" :size="14" /></div>
            <label v-if="!['input', 'select'].includes(state.selectedWidget.type)" class="property-field"><span>寮鸿皟</span><div class="color-control"><input v-model="state.selectedWidget.config.style.accent" type="color" @input="state.syncWidget(state.selectedWidget)" /><input v-model="state.selectedWidget.config.style.accent" @input="state.syncWidget(state.selectedWidget)" /></div></label>
            <label v-if="['heading', 'text'].includes(state.selectedWidget.type)" class="property-field"><span>瀵归綈鏂瑰紡</span><div class="segmented-control"><button :class="{ active: state.selectedWidget.config.style.textAlign === 'left' }" @click="state.selectedWidget.config.style.textAlign = 'left'; state.syncWidget(state.selectedWidget)"></button><button :class="{ active: state.selectedWidget.config.style.textAlign === 'center' }" @click="state.selectedWidget.config.style.textAlign = 'center'; state.syncWidget(state.selectedWidget)"></button><button :class="{ active: state.selectedWidget.config.style.textAlign === 'right' }" @click="state.selectedWidget.config.style.textAlign = 'right'; state.syncWidget(state.selectedWidget)"></button></div></label>
            <label v-if="['heading', 'text'].includes(state.selectedWidget.type)" class="property-field"><span>瀛楀彿</span><div class="unit-input"><input v-model.number="state.selectedWidget.config.style.fontSize" type="number" min="10" max="72" @input="state.syncWidget(state.selectedWidget)" /><em>px</em></div></label>
            <label v-if="['button', 'input', 'select', 'table', 'stat', 'image'].includes(state.selectedWidget.type)" class="property-field"><span>鍦嗚</span><div class="unit-input"><input v-model.number="state.selectedWidget.config.style.borderRadius" type="number" min="0" max="40" @input="state.syncWidget(state.selectedWidget)" /><em>px</em></div></label>
          </section>
          <section class="property-section"><div class="property-title"><span>甯冨眬涓庡浘</span><AppIcon name="chevron-down" :size="14" /></div><div class="position-grid"><label><span>X</span><input v-model.number="state.selectedWidget.config.layout.x" type="number" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>Y</span><input v-model.number="state.selectedWidget.config.layout.y" type="number" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>W</span><input v-model.number="state.selectedWidget.config.layout.width" type="number" min="24" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>H</span><input v-model.number="state.selectedWidget.config.layout.height" type="number" min="24" @input="state.syncWidget(state.selectedWidget)" /></label></div><label class="property-check layer-check"><input v-model="state.selectedWidget.config.layout.locked" type="checkbox" @change="state.syncWidget(state.selectedWidget)" /><span><i><AppIcon name="lock" :size="11" /></i>閿佸畾缁勪欢锛岄伩鍏嶈鎿嶄綔</span></label><label class="property-check layer-check"><input v-model="state.selectedWidget.config.layout.hidden" type="checkbox" @change="state.syncWidget(state.selectedWidget)" /><span><i><AppIcon name="eye" :size="11" /></i>鍦ㄩ瑙堜腑闅愯棌</span></label></section>
          <section v-if="componentDefinition(state.selectedWidget.type).capabilities.dataBinding" class="property-section"><div class="property-title"><span>鏁版嵁缁戝畾</span><AppIcon name="chevron-down" :size="14" /></div>
            <label class="property-field"><span>缁戝畾鏁版嵁</span><select :value="state.selectedWidget.config.data.table || ''" @change="state.updateDataSource(state.selectedWidget, $event)"><option value="">涓嶇粦瀹氾紝浣跨敤闈欐€佹暟</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}锛坽{ table.name }}锛</option></select></label>
            <template v-if="state.selectedWidget.config.data.table">
              <label class="property-field"><span>鏌ヨ妯″紡</span><select v-model="state.selectedWidget.config.data.mode" @change="state.syncWidget(state.selectedWidget)"><option value="list">澶氳鍒楄〃</option><option value="single">鍗曡鏁版嵁</option><option v-if="state.selectedWidget.type === 'stat'" value="count">璁板綍璁℃暟</option><option v-if="state.selectedWidget.type === 'stat'" value="aggregate">鑱氬悎璁＄畻</option></select></label>
              <div v-if="state.selectedWidget.type === 'select'" class="property-row"><label class="property-field"><span>鏄剧ず瀛楁</span><input v-model="state.selectedWidget.config.data.labelField" placeholder="name" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>鍊煎瓧</span><input v-model="state.selectedWidget.config.data.valueField" placeholder="id" @input="state.syncWidget(state.selectedWidget)" /></label></div>
              <template v-if="state.selectedWidget.config.data.mode === 'aggregate'"><label class="property-field"><span>鑱氬悎鍑芥暟</span><select v-model="state.selectedWidget.config.data.aggregate.function" @change="state.syncWidget(state.selectedWidget)"><option value="count">璁℃暟</option><option value="sum">姹傚拰</option><option value="avg">骞冲潎</option><option value="min">鏈€灏</option><option value="max">鏈€澶</option></select></label><label class="property-field"><span>鑱氬悎瀛楁</span><input v-model="state.selectedWidget.config.data.aggregate.field" placeholder="amount" @input="state.syncWidget(state.selectedWidget)" /></label></template>
              <label class="property-field"><span>杩囨护鏉′欢</span><input v-model="state.selectedWidget.config.data.where" placeholder="渚嬪 status = '璺熻繘'" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>鎺掑簭瀛楁</span><input v-model="state.selectedWidget.config.data.orderBy" placeholder="渚嬪 id DESC" @input="state.syncWidget(state.selectedWidget)" /></label><label v-if="state.selectedWidget.config.data.mode === 'list'" class="property-field"><span>杩斿洖琛屾暟</span><input v-model.number="state.selectedWidget.config.data.limit" type="number" min="1" max="200" @input="state.syncWidget(state.selectedWidget)" /></label>
            </template>
          </section>
          <section v-if="state.selectedWidget.type === 'button'" class="property-section"><div class="property-title"><span>鍏煎琛ㄥ崟鎻愪氦</span><AppIcon name="chevron-down" :size="14" /></div><label class="property-field"><span>鎻愪氦鍒版暟鎹〃</span><select :value="state.selectedWidget.config.submitTo?.table || ''" @change="state.updateSubmitTarget(state.selectedWidget, $event)"><option value="">涓嶆彁</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}锛坽{ table.name }}锛</option></select></label><small class="field-help">鏇村鏉傜殑鎻愪氦銆佹彁绀哄拰瀵艰埅锛岃鍦ㄢ€滀氦浜掆€濅腑閰嶇疆鍔ㄤ綔閾</small></section>
        </div>
        <div v-else class="events-panel">
          <div class="events-panel-head"><div><span><AppIcon name="flow" :size="18" /></span><div><strong>缁勪欢浜や簰</strong><small>閰嶇疆浜嬩欢瑙﹀彂鍚庣殑鍔ㄤ綔</small></div></div><button class="primary-button compact" @click="state.addWidgetEvent()"><AppIcon name="plus" :size="14" />娣诲姞浜嬩欢</button></div>
          <div v-if="!state.selectedWidget.config.interaction.events?.length" class="events-empty"><AppIcon name="cursor" :size="22" /><p>涓鸿繖涓粍浠舵坊鍔犱簨浠躲€傝〃鏍兼敮鎸佲€滆鐐瑰嚮鏃垛€濓紝杈撳叆妗嗗拰涓嬫媺妗嗘敮鎸佲€滃€煎彉鍖栨椂鈥</p></div>
          <article v-for="event in state.selectedWidget.config.interaction.events" :key="event.id" class="event-card"><header><div><span class="event-dot"></span><select v-model="event.event" @change="state.markDirty()"><option v-for="option in eventOptionsForWidget(state.selectedWidget.type)" :key="option.value" :value="option.value">{{ option.label }}</option></select></div><label class="event-enabled"><input v-model="event.enabled" type="checkbox" @change="state.markDirty()" />鍚敤</label><button class="icon-button tiny danger-text" @click="state.removeWidgetEvent(event.id)"><AppIcon name="trash" :size="14" /></button></header>
            <div class="event-actions"><div v-for="(action, actionIndex) in event.actions" :key="action.id" class="event-action"><span>{{ Number(actionIndex) + 1 }}</span><select v-model="action.type" @change="state.markDirty()"><option v-for="option in eventActionOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select><select v-if="action.type === 'setValue'" v-model="action.target" @change="state.markDirty()"><option value="">閫夋嫨鐩爣缁勪欢</option><option v-for="targetWidget in state.currentProject.layout.widgets.filter((item: any) => item.type === 'input' || item.type === 'select')" :key="targetWidget.id" :value="targetWidget.id">{{ targetWidget.name }} 路 {{ targetWidget.config?.content?.label || targetWidget.name }}</option></select><select v-else-if="action.type === 'submitData'" v-model="action.target" @change="state.markDirty()"><option value="">閫夋嫨鎻愪氦鐨勬暟鎹〃</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}锛坽{ table.name }}锛</option></select><select v-else-if="action.type === 'showModal' || action.type === 'hideModal'" v-model="action.target" @change="state.markDirty()"><option value="">鍏ㄩ儴寮圭獥</option><option v-for="service in state.currentProject.layout.widgets.filter((item: any) => item.type === 'modal')" :key="service.id" :value="service.id">{{ service.name }}</option></select><select v-else-if="action.type === 'showLoading' || action.type === 'hideLoading'" v-model="action.target" @change="state.markDirty()"><option value="">鍏ㄩ儴 Loading</option><option v-for="service in state.currentProject.layout.widgets.filter((item: any) => item.type === 'loading')" :key="service.id" :value="service.id">{{ service.name }}</option></select><input v-else-if="['navigate', 'navigateBack', 'setRouteState', 'emitPageEvent'].includes(action.type)" v-model="action.target" :placeholder="actionTargetPlaceholder(action.type)" @input="state.markDirty()" /><input v-if="['setValue', 'showToast'].includes(action.type)" v-model="action.value" :placeholder="action.type === 'setValue' ? '鍙敤 {{ value }} / {{ row.id }}' : '鎻愮ず鍐呭锛屽彲鐢?{{ value }} / {{ row.name }}'" @input="state.markDirty()" /><input v-if="['setRouteState', 'emitPageEvent'].includes(action.type)" v-model="action.payload" placeholder="鍊兼垨 JSON / 妯℃澘" @input="state.markDirty()" /><button class="icon-button tiny danger-text" @click="state.removeEventAction(event.id, action.id)"><AppIcon name="close" :size="13" /></button></div></div><button class="event-add-action" @click="state.addEventAction(event.id)"><AppIcon name="plus" :size="13" />娣诲姞鍔ㄤ綔</button>
          </article>
          <div class="events-tip"><AppIcon name="info" :size="13" /><span>鍔ㄤ綔鎸変粠涓婂埌涓嬫墽琛岋紱琛岀偣鍑讳簨浠朵腑鍙娇鐢?#123;&#123; row.field &#125;&#125;锛岃〃鍗曞瓧娈靛彲浣跨敤 &#123;&#123; form.field &#125;&#125;</span></div>
        </div>
        <div class="inspector-actions"><button @click="state.duplicateSelectedWidget"><AppIcon name="copy" :size="15" />澶嶅埗</button><button @click="state.bringToFront"><AppIcon name="layers" :size="15" />缃《</button><button @click="state.toggleSelectedLocked"><AppIcon name="lock" :size="15" />閿佸畾</button><button class="danger" @click="state.removeSelectedWidget"><AppIcon name="trash" :size="15" />鍒犻櫎</button></div>
      </template>
      <template v-else>
        <div class="inspector-empty-head"><span>椤甸潰灞炴€</span><AppIcon name="settings" :size="17" /></div><div class="inspector-scroll page-properties"><div class="page-preview-card"><div><span></span><span></span><span></span></div><strong>{{ state.currentProject.layout.pageName }}</strong><small>{{ state.currentProject.layout.canvas.width }} 脳 {{ state.currentProject.layout.canvas.height }} 妗岄潰鐢诲竷</small></div><section class="property-section" data-testid="page-properties-panel">
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
            <div class="property-title"><span>璁捐绯荤粺</span><AppIcon name="sparkle" :size="14" /></div>
            <label class="property-field"><span>褰撳墠涓婚</span><select :value="ensureDesignSystem().activeThemeId" @change="updateDesignTheme"><option v-for="theme in designThemes()" :key="theme.id" :value="theme.id">{{ theme.name }} ({{ theme.mode }})</option></select></label>
            <div class="property-row"><label class="property-field"><span>涓昏壊</span><div class="color-control"><input :value="designColorValue('primary')" type="color" @input="updateDesignColor('primary', $event)" /><input :value="designColorValue('primary')" @input="updateDesignColor('primary', $event)" /></div></label><label class="property-field"><span>鐢诲竷鑹</span><div class="color-control"><input :value="designColorValue('canvas')" type="color" @input="updateDesignColor('canvas', $event)" /><input :value="designColorValue('canvas')" @input="updateDesignColor('canvas', $event)" /></div></label></div>
            <div class="property-row"><label class="property-field"><span>琛ㄩ潰鑹</span><div class="color-control"><input :value="designColorValue('surface')" type="color" @input="updateDesignColor('surface', $event)" /><input :value="designColorValue('surface')" type="text" @input="updateDesignColor('surface', $event)" /></div></label><label class="property-field"><span>鏂囧瓧鑹</span><div class="color-control"><input :value="designColorValue('text')" type="color" @input="updateDesignColor('text', $event)" /><input :value="designColorValue('text')" type="text" @input="updateDesignColor('text', $event)" /></div></label></div>
            <button class="ghost-button compact token-manager-trigger" type="button" @click="tokenManagerOpen = true"><AppIcon name="sparkle" :size="14" />&#x7BA1;&#x7406;&#x5168;&#x90E8; Token</button>
            <small class="field-help">涓婚鍜?Token 淇濆瓨鍦ㄥ綋鍓嶆湰鍦伴」鐩腑锛屼笉渚濊禆浜戝悓姝ャ€</small>
          </section>
          <section class="property-section page-route-section"><div class="property-title"><span>&#x8def;&#x7531;&#x4e0e;&#x5bfc;&#x822a;</span><AppIcon name="flow" :size="14" /></div><label class="property-field"><span>&#x8def;&#x5f84;</span><input :value="state.currentPage?.path || '/index'" placeholder="/detail" @change="state.updatePagePath(state.currentPage.id, ($event.target as HTMLInputElement).value)" /></label><div class="page-route-actions"><button :class="{ active: state.currentProject.entryPageId === state.currentPage?.id }" @click="state.setEntryPage(state.currentPage.id)"><AppIcon name="home" :size="13" /><span v-if="state.currentProject.entryPageId === state.currentPage?.id">褰撳墠鍏ュ彛</span><span v-else>璁句负鍏ュ彛</span></button><button @click="state.addPageGuard()"><AppIcon name="lock" :size="13" />&#x6dfb;&#x52a0;&#x5b88;&#x536b;</button></div><div v-if="state.currentPage?.guards?.length" class="page-guards"><article v-for="guard in state.currentPage.guards" :key="guard.id" class="page-guard-card"><header><select v-model="guard.type" @change="state.updatePageGuard(state.currentPage.id, guard.id, { type: guard.type })"><option value="auth">&#x767b;&#x5f55;&#x6821;&#x9a8c;</option><option value="condition">&#x6761;&#x4ef6;&#x8868;&#x8fbe;&#x5f0f;</option><option value="unsaved">&#x672a;&#x4fdd;&#x5b58;&#x786e;&#x8ba4;</option></select><label><input v-model="guard.enabled" type="checkbox" @change="state.updatePageGuard(state.currentPage.id, guard.id, { enabled: guard.enabled })" />&#x542f;&#x7528;</label><button class="icon-button tiny danger-text" @click="state.removePageGuard(state.currentPage.id, guard.id)"><AppIcon name="trash" :size="13" /></button></header><input v-if="guard.type === 'condition'" v-model="guard.expression" placeholder="&#x4f8b;&#x5982; isLoggedIn &#x6216; routeState.userId != null" @input="state.markDirty()" /><input v-model="guard.redirect" placeholder="&#x5931;&#x8d25;&#x65f6;&#x8df3;&#x8f6c;&#x5230;&#x7684;&#x8def;&#x5f84;&#xff08;&#x53ef;&#x9009;&#xff09;" @input="state.markDirty()" /><input v-model="guard.message" placeholder="&#x62e6;&#x622a;&#x63d0;&#x793a;&#xff08;&#x53ef;&#x9009;&#xff09;" @input="state.markDirty()" /></article></div><small class="field-help">&#x5b88;&#x536b;&#x6309;&#x8def;&#x7531;&#x548c;&#x9875;&#x9762;&#x987a;&#x5e8f;&#x6267;&#x884c;&#xff1b;&#x4e0d;&#x901a;&#x8fc7;&#x65f6;&#x53ef;&#x914d;&#x7f6e;&#x91cd;&#x5b9a;&#x5411;&#x3002;</small></section><div class="empty-inspector-tip"><AppIcon name="cursor" :size="18" /><p>鍦ㄧ敾甯冧腑閫夋嫨缁勪欢锛岀紪杈?content銆乻tyle銆乨ata 鍜?interaction銆係hift 鍙閫夛紝Delete 鍒犻櫎锛孋trl/Cmd+C/V 澶嶅埗绮樿创</p></div></div><div class="page-danger-zone"><button @click="state.showDeleteConfirm = true"><AppIcon name="trash" :size="15" />鍒犻櫎搴旂敤</button></div>
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
