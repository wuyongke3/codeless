<script setup lang="ts">
import { reactive } from 'vue'
import type { DesignSystem, DesignTheme } from '../types/lowcode'
import AppIcon from '../components/AppIcon.vue'
import ReviewPanel from '../components/ReviewPanel.vue'
import InspectPanel from '../components/InspectPanel.vue'
import WidgetRenderer from '../components/WidgetRenderer.vue'
import CanvasWidgetNode from '../components/CanvasWidgetNode.vue'
import CanvasContextMenu from '../components/CanvasContextMenu.vue'
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
const eventActionOptions = Object.entries(widgetEventActionLabels).map(([value, label]) => ({ value, label }))
const tokenOptionMap = {
  color: [
    { label: '主色', value: 'color.primary' },
    { label: '辅助色', value: 'color.secondary' },
    { label: '文字色', value: 'color.text' },
    { label: '次要文字', value: 'color.muted' },
    { label: '表面色', value: 'color.surface' },
    { label: '画布色', value: 'color.canvas' },
    { label: '边框色', value: 'color.border' },
  ],
  radius: [
    { label: '小圆角', value: 'radius.sm' },
    { label: '中圆角', value: 'radius.md' },
    { label: '大圆角', value: 'radius.lg' },
    { label: '胶囊圆角', value: 'radius.pill' },
  ],
  typography: [
    { label: '小号字', value: 'type.sm' },
    { label: '正文字', value: 'type.body' },
    { label: '大号字', value: 'type.lg' },
    { label: '标题字', value: 'type.heading' },
  ],
  spacing: [
    { label: '小间距', value: 'space.sm' },
    { label: '中间距', value: 'space.md' },
    { label: '大间距', value: 'space.lg' },
    { label: '超大间距', value: 'space.xl' },
  ],
  shadow: [
    { label: '无阴影', value: 'shadow.none' },
    { label: '小阴影', value: 'shadow.sm' },
    { label: '中阴影', value: 'shadow.md' },
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
  if (type === 'setValue') return '选择要赋值的组件'
  if (type === 'submitData') return '选择提交的数据表'
  if (type === 'navigateBack') return '返回上一页'
  if (type === 'setRouteState') return '状态键，例如 selectedId 或 shared.userId'
  if (type === 'emitPageEvent') return '事件名，例如 customer.updated'
  if (['showModal', 'hideModal'].includes(type)) return '选择弹窗组件，留空表示全部'
  if (['showLoading', 'hideLoading'].includes(type)) return '选择 Loading 组件，留空表示全部'
  return '/detail、页面路径或工作区目标'
}
function startLayerDrag(event: DragEvent, widgetId: string) {
  event.dataTransfer?.setData('application/codeless-layer', widgetId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function dropLayer(event: DragEvent, targetId: string) {
  const widgetId = event.dataTransfer?.getData('application/codeless-layer')
  if (widgetId && widgetId !== targetId) state.reorderWidgetsByLayer(widgetId, targetId)
}
</script>

<template>
<div v-if="state.currentProject" class="builder-view">
  <div class="builder-toolbar">
    <div class="builder-breadcrumb"><span>{{ state.currentProject.layout.pageName }}</span><AppIcon name="chevron-right" :size="14" /><strong>画布</strong><em v-if="state.selectedWidgetIds.length > 1">已选中 {{ state.selectedWidgetIds.length }} 个</em></div>
    <div class="builder-center-tools"><button :disabled="!state.historyStack.length" title="撤销 Ctrl/Cmd+Z" @click="state.undo"><AppIcon name="undo" :size="17" /></button><button :disabled="!state.futureStack.length" title="重做 Ctrl/Cmd+Shift+Z" @click="state.redo"><AppIcon name="redo" :size="17" /></button><i></i><select v-model.number="state.zoom" title="Ctrl/Cmd + 滚轮缩放"><option :value="0.25">25%</option><option :value="0.5">50%</option><option :value="0.75">75%</option><option :value="1">100%</option><option :value="1.5">150%</option><option :value="2">200%</option></select></div>
    <div class="builder-actions"><span :class="['save-state', { dirty: state.dirty }]"><i></i>{{ state.saving ? '正在保存...' : state.dirty ? '有未保存更改' : '已保存到本地' }}</span><button class="ghost-button compact" @click="state.resetRuntimeValues(); state.showPreview = true"><AppIcon name="eye" :size="16" />预览</button><button class="ghost-button compact" @click="state.toggleReviewPanel()">Review</button><button class="ghost-button compact" :disabled="!state.selectedWidget" @click="state.toggleInspectPanel()">Inspect</button><button class="ghost-button compact" @click="state.importProject"><AppIcon name="upload" :size="16" />????</button><button class="ghost-button compact" @click="state.exportProject"><AppIcon name="download" :size="16" />????</button><button class="ghost-button compact" data-design-exchange="import" title="?? Figma Plugin ? Codeless ?? JSON" @click="state.importDesignExchange"><AppIcon name="upload" :size="16" />?? JSON ??</button><button class="ghost-button compact" data-design-exchange="export" title="???????????????? JSON" @click="state.exportDesignExchange"><AppIcon name="download" :size="16" />?? JSON ??</button><button class="ghost-button compact" @click="state.saveProject()"><AppIcon name="save" :size="16" />保存</button><button class="primary-button compact" @click="state.publishProject"><AppIcon name="play" :size="15" />发布</button></div>
  </div>
  <section class="builder-layout" :style="{ '--component-panel-width': state.componentPanelWidth + 'px', '--inspector-panel-width': state.inspectorPanelWidth + 'px' }">
    <aside class="component-panel" :style="{ '--panel-width': `${state.componentPanelWidth}px` }">
      <div class="panel-tabs"><button :class="{ active: state.paletteTab === 'components' }" @click="state.paletteTab = 'components'">组件</button><button :class="{ active: state.paletteTab === 'pages' }" @click="state.paletteTab = 'pages'">页面</button></div>
      <template v-if="state.paletteTab === 'components'">
        <label class="panel-search"><AppIcon name="search" :size="15" /><input v-model="state.paletteSearch" placeholder="搜索组件" /></label>
        <div class="component-scroll"><div v-for="group in state.filteredGroups" :key="group.name" class="component-group"><p>{{ group.name }}</p><div class="component-grid"><button v-for="item in group.items" :key="item.type" :data-widget-type="item.type" draggable="true" @dragstart="state.startPaletteDrag($event, item.type)" @dragend="state.setDropTargetContainer()" @click="state.addWidget(item.type)"><span><AppIcon :name="item.icon" :size="18" /></span><div><strong>{{ item.name }}</strong><small>{{ item.description }}</small></div><AppIcon name="plus" :size="14" /></button></div></div></div>
        <div class="panel-tip"><AppIcon name="cursor" :size="15" /><span>拖拽组件到画布；双击文字直接编辑；Shift 多选，方向键移动，Ctrl/Cmd+D 复制</span></div>
      </template>
      <div v-else class="pages-panel">
        <div class="page-list-head"><span>应用页面</span><div><button title="新建页面" @click="state.createPage()"><AppIcon name="plus" :size="15" /></button><button title="复制当前页面" @click="state.duplicatePage()"><AppIcon name="copy" :size="13" /></button></div></div>
        <div class="page-list">
          <div v-for="page in state.pages" :key="page.id" :class="['page-item', { active: page.id === state.currentProject.currentPageId }]" @click="state.selectPage(page.id)">
            <span><AppIcon name="apps" :size="15" /></span><div><strong>{{ page.name }}</strong><small>{{ page.path }}</small></div>
            <button class="page-menu" title="页面操作" @click.stop="state.renamePage(page.id)"><AppIcon name="more" :size="13" /></button>
          </div>
        </div>
        <div class="layers-panel">
          <div class="layers-head"><span>图层（{{ state.currentProject.layout.widgets.length }}）</span><AppIcon name="layers" :size="14" /></div>
          <VirtualLayerTree v-if="state.currentProject.layout.widgets.length" :widgets="state.currentProject.layout.widgets" :state="state" />
          <div v-else class="layer-empty">暂无图层</div>
        </div>
      </div>
      <div class="panel-resize-handle panel-resize-handle-right" :class="{ active: state.panelResizeSide === 'component' }" title="拖拽调整组件面板宽度" @pointerdown.stop="state.startPanelResize($event, 'component')"></div>
    </aside>

    <div class="canvas-workspace" @wheel="state.handleCanvasWheel" @click="state.clearSelection()" @contextmenu.stop.prevent="state.handleCanvasContextMenu">
      <div class="canvas-rulers"><span>0</span><span>240</span><span>480</span><span>720</span><span>960</span></div>
      <div ref="canvasViewportRef" class="canvas-stage" @scroll="state.updateCanvasViewport"><div class="canvas-frame" :style="{ width: `${state.currentProject.layout.canvas.width * state.zoom}px`, height: `${state.currentProject.layout.canvas.height * state.zoom}px` }">
        <div ref="canvasRef" class="design-canvas" :style="{ transform: `scale(${state.zoom})`, background: state.currentProject.layout.canvas.background }" @dragover.prevent="state.setDropTargetContainer('')" @drop.stop.prevent="state.onCanvasDrop" @pointerdown.stop="state.startCanvasSelection" @click.stop="state.handleCanvasClick" @contextmenu.stop.prevent="state.handleCanvasContextMenu">
          <div class="canvas-grid-pattern"></div>
          <CanvasWidgetNode v-for="widget in state.canvasRootWidgets" :key="widget.id" :widget="widget" :widgets="state.currentProject.layout.widgets" :state="state" />
          <div v-if="state.selectionBox" class="canvas-selection-box" :style="{ left: `${state.selectionBox.x}px`, top: `${state.selectionBox.y}px`, width: `${state.selectionBox.width}px`, height: `${state.selectionBox.height}px` }"></div>
          <div v-if="!state.currentProject.layout.widgets.length" class="empty-canvas"><span><AppIcon name="layers" :size="26" /></span><strong>从左侧拖入第一个组</strong><p>也可以单击组件，将它快速添加到画布</p></div>
        </div>
      </div></div>
      <div class="canvas-footer"><span><AppIcon name="monitor" :size="14" />{{ state.currentProject.layout.canvas.width }} × {{ state.currentProject.layout.canvas.height }}</span><span>缩放 {{ Math.round(state.zoom * 100) }}%</span><span><i></i>8px 网格参考 · 拖拽 1px / Shift 约束方向</span></div>
    </div>

    <aside class="inspector-panel" :style="{ '--panel-width': `${state.inspectorPanelWidth}px` }">
      <template v-if="state.selectedWidget">
        <div class="inspector-head"><div><span><AppIcon :name="componentDefinition(state.selectedWidget.type).icon" :size="17" /></span><div><small>当前选中</small><strong>{{ state.selectedWidget.name }}</strong></div></div><button @click="state.clearSelection()"><AppIcon name="close" :size="16" /></button></div>
        <div class="panel-tabs inspector-tabs"><button :class="{ active: state.inspectorTab === 'properties' }" @click="state.inspectorTab = 'properties'">属性</button><button :class="{ active: state.inspectorTab === 'events' }" @click="state.inspectorTab = 'events'">交互</button></div>
        <div v-if="state.inspectorTab === 'properties'" class="inspector-scroll">
          <section class="component-usage"><div><span><AppIcon name="info" :size="14" /></span><div><strong>怎么用</strong><p>{{ componentDefinition(state.selectedWidget.type).usage }}</p></div></div><small>统一协议 v1 · content / style / data / interaction</small></section>
          <section class="property-section"><div class="property-title"><span>基础信息</span><AppIcon name="chevron-down" :size="14" /></div>
            <label class="property-field"><span>组件名称</span><input v-model="state.selectedWidget.name" @input="state.markDirty()" /></label>
            <label v-if="state.selectedWidget.type !== 'divider' && !['input', 'select'].includes(state.selectedWidget.type)" class="property-field"><span>{{ state.selectedWidget.type === 'stat' ? '指标名称' : state.selectedWidget.type === 'image' ? '占位标题' : '显示文字' }}</span><input v-model="state.selectedWidget.config.content.text" @input="state.syncWidget(state.selectedWidget)" /></label>
            <label v-if="['heading', 'image'].includes(state.selectedWidget.type)" class="property-field"><span>{{ state.selectedWidget.type === 'image' ? '占位说明' : '说明文字' }}</span><textarea v-model="state.selectedWidget.config.content.description" rows="2" @input="state.syncWidget(state.selectedWidget)"></textarea></label>
            <label v-if="['input', 'select'].includes(state.selectedWidget.type)" class="property-field"><span>字段标签</span><input v-model="state.selectedWidget.config.content.label" @input="state.syncWidget(state.selectedWidget)" /></label>
            <label v-if="state.selectedWidget.type === 'input'" class="property-field"><span>占位提示</span><input v-model="state.selectedWidget.config.content.placeholder" @input="state.syncWidget(state.selectedWidget)" /></label>
            <label v-if="state.selectedWidget.type === 'select'" class="property-field"><span>静态选项（每行一项）</span><textarea :value="state.serializeWidgetOptions(state.selectedWidget)" rows="4" placeholder="显示名|实际值" @input="state.updateOptions"></textarea></label>
            <label v-if="state.selectedWidget.type === 'table'" class="property-field"><span>表格列（字段|显示名|宽度</span><textarea :value="state.serializeWidgetColumns(state.selectedWidget)" rows="4" placeholder="name|客户名称|180" @input="state.updateColumns"></textarea></label>
            <div v-if="state.selectedWidget.type === 'stat'" class="property-row"><label class="property-field"><span>静态数</span><input v-model="state.selectedWidget.config.content.value" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>趋势</span><input v-model="state.selectedWidget.config.content.trend" @input="state.syncWidget(state.selectedWidget)" /></label></div>
            <label v-if="state.selectedWidget.type === 'image'" class="property-field"><span>图片地址</span><input v-model="state.selectedWidget.config.content.src" placeholder="https://... 或 file://..." @input="state.syncWidget(state.selectedWidget)" /></label>
            <label v-if="state.selectedWidget.type === 'image'" class="property-field"><span>替代文本</span><input v-model="state.selectedWidget.config.content.alt" @input="state.syncWidget(state.selectedWidget)" /></label>
            <div v-if="['input', 'select'].includes(state.selectedWidget.type)" class="property-row"><label class="property-field"><span>字段</span><input v-model="state.selectedWidget.config.data.field" placeholder="例如 customer_name" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>默认</span><input v-model="state.selectedWidget.config.content.defaultValue" @input="state.syncWidget(state.selectedWidget)" /></label></div><label v-if="state.selectedWidget.type === 'input'" class="property-field"><span>值类</span><select v-model="state.selectedWidget.config.content.valueType" @change="state.syncWidget(state.selectedWidget)"><option value="text">文本</option><option value="number">数字</option><option value="email">邮箱</option><option value="phone">电话</option><option value="date">日期</option><option value="datetime">日期时间</option></select></label>
            <label v-if="['input', 'select'].includes(state.selectedWidget.type)" class="property-check"><input v-model="state.selectedWidget.config.validation.required" type="checkbox" @change="state.syncWidget(state.selectedWidget)" /><span><i><AppIcon name="check" :size="12" /></i>设为必填</span></label>
          </section>
          <section v-if="showElementPlusFields(state.selectedWidget.type)" class="property-section component-config-section">
            <div class="property-title"><span>组件配置</span><AppIcon name="settings" :size="14" /></div>
            <template v-for="field in componentDefinition(state.selectedWidget.type).fields" :key="field.key">
              <label v-if="field.kind !== 'checkbox'" class="property-field">
                <span>{{ field.label }}</span>
                <textarea v-if="field.kind === 'textarea'" :value="fieldValue(state.selectedWidget, field)" :placeholder="field.placeholder" rows="3" @input="updateConfigField($event, state.selectedWidget, field)"></textarea>
                <textarea v-else-if="field.kind === 'options'" :value="optionFieldValue(state.selectedWidget, field)" :placeholder="field.placeholder || '显示名|实际值，每行一项'" rows="3" @input="updateConfigField($event, state.selectedWidget, field)"></textarea>
                <input v-else-if="field.kind === 'number'" :value="fieldValue(state.selectedWidget, field)" type="number" :min="field.min" :max="field.max" :step="field.step" @input="updateConfigField($event, state.selectedWidget, field)" />
                <input v-else-if="field.kind === 'color'" :value="fieldValue(state.selectedWidget, field)" type="color" @input="updateConfigField($event, state.selectedWidget, field)" />
                <select v-else-if="field.kind === 'select'" :value="fieldValue(state.selectedWidget, field)" @change="updateConfigField($event, state.selectedWidget, field)"><option v-for="option in field.options || []" :key="option.value" :value="option.value">{{ option.label }}</option></select>
                <input v-else :value="fieldValue(state.selectedWidget, field)" :placeholder="field.placeholder" @input="updateConfigField($event, state.selectedWidget, field)" />
              </label>
              <label v-else class="property-check"><input :checked="fieldChecked(state.selectedWidget, field)" type="checkbox" @change="updateConfigField($event, state.selectedWidget, field)" /><span><i><AppIcon name="check" :size="12" /></i>{{ field.label }}</span></label>
            </template>
          <section v-if="state.selectedWidget.type === 'button' || Object.keys(state.selectedWidget.config.variants || {}).length" class="property-section">
            <div class="property-title"><span>组件变体</span><AppIcon name="layers" :size="14" /></div>
            <label class="property-field"><span>变体</span><select :value="state.selectedWidget.config.variant || state.selectedWidget.config.content.variant || ''" @change="state.updateWidgetVariant"><option value="">默认</option><option v-for="(_, variantName) in state.selectedWidget.config.variants || {}" :key="String(variantName)" :value="String(variantName)">{{ variantName }}</option></select></label>
          </section>
          <section class="property-section">
            <div class="property-title"><span>设计 Token</span><AppIcon name="sparkle" :size="14" /></div>
            <label class="property-field"><span>强调色</span><select :value="state.selectedWidget.config.style.tokenRefs?.accent || ''" @change="state.updateWidgetTokenRef('accent', $event)"><option value="">未设置</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>背景色</span><select :value="state.selectedWidget.config.style.tokenRefs?.background || ''" @change="state.updateWidgetTokenRef('background', $event)"><option value="">未设置</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>文本色</span><select :value="state.selectedWidget.config.style.tokenRefs?.color || ''" @change="state.updateWidgetTokenRef('color', $event)"><option value="">未设置</option><option v-for="option in tokenOptionsFor('color')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label class="property-field"><span>圆角 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.borderRadius || ''" @change="state.updateWidgetTokenRef('borderRadius', $event)"><option value="">未设置</option><option v-for="option in tokenOptionsFor('radius')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['heading', 'text', 'button', 'link', 'icon'].includes(state.selectedWidget.type)" class="property-field"><span>字号 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.fontSize || ''" @change="state.updateWidgetTokenRef('fontSize', $event)"><option value="">未设置</option><option v-for="option in tokenOptionsFor('typography')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['card', 'frame', 'stack', 'grid', 'drawer'].includes(state.selectedWidget.type)" class="property-field"><span>内边距 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.padding || ''" @change="state.updateWidgetTokenRef('padding', $event)"><option value="">未设置</option><option v-for="option in tokenOptionsFor('spacing')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['stack', 'grid'].includes(state.selectedWidget.type)" class="property-field"><span>间隙 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.gap || ''" @change="state.updateWidgetTokenRef('gap', $event)"><option value="">未设置</option><option v-for="option in tokenOptionsFor('spacing')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label v-if="['card', 'frame', 'stack', 'grid', 'drawer'].includes(state.selectedWidget.type)" class="property-field"><span>阴影 Token</span><select :value="state.selectedWidget.config.style.tokenRefs?.shadow || ''" @change="state.updateWidgetTokenRef('shadow', $event)"><option value="">未设置</option><option v-for="option in tokenOptionsFor('shadow')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          </section>
          </section>          <section class="property-section"><div class="property-title"><span>样式</span><AppIcon name="chevron-down" :size="14" /></div>
            <label v-if="!['input', 'select'].includes(state.selectedWidget.type)" class="property-field"><span>强调</span><div class="color-control"><input v-model="state.selectedWidget.config.style.accent" type="color" @input="state.syncWidget(state.selectedWidget)" /><input v-model="state.selectedWidget.config.style.accent" @input="state.syncWidget(state.selectedWidget)" /></div></label>
            <label v-if="['heading', 'text'].includes(state.selectedWidget.type)" class="property-field"><span>对齐方式</span><div class="segmented-control"><button :class="{ active: state.selectedWidget.config.style.textAlign === 'left' }" @click="state.selectedWidget.config.style.textAlign = 'left'; state.syncWidget(state.selectedWidget)"></button><button :class="{ active: state.selectedWidget.config.style.textAlign === 'center' }" @click="state.selectedWidget.config.style.textAlign = 'center'; state.syncWidget(state.selectedWidget)"></button><button :class="{ active: state.selectedWidget.config.style.textAlign === 'right' }" @click="state.selectedWidget.config.style.textAlign = 'right'; state.syncWidget(state.selectedWidget)"></button></div></label>
            <label v-if="['heading', 'text'].includes(state.selectedWidget.type)" class="property-field"><span>字号</span><div class="unit-input"><input v-model.number="state.selectedWidget.config.style.fontSize" type="number" min="10" max="72" @input="state.syncWidget(state.selectedWidget)" /><em>px</em></div></label>
            <label v-if="['button', 'input', 'select', 'table', 'stat', 'image'].includes(state.selectedWidget.type)" class="property-field"><span>圆角</span><div class="unit-input"><input v-model.number="state.selectedWidget.config.style.borderRadius" type="number" min="0" max="40" @input="state.syncWidget(state.selectedWidget)" /><em>px</em></div></label>
          </section>
          <section class="property-section"><div class="property-title"><span>布局与图</span><AppIcon name="chevron-down" :size="14" /></div><div class="position-grid"><label><span>X</span><input v-model.number="state.selectedWidget.config.layout.x" type="number" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>Y</span><input v-model.number="state.selectedWidget.config.layout.y" type="number" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>W</span><input v-model.number="state.selectedWidget.config.layout.width" type="number" min="24" @input="state.syncWidget(state.selectedWidget)" /></label><label><span>H</span><input v-model.number="state.selectedWidget.config.layout.height" type="number" min="24" @input="state.syncWidget(state.selectedWidget)" /></label></div><label class="property-check layer-check"><input v-model="state.selectedWidget.config.layout.locked" type="checkbox" @change="state.syncWidget(state.selectedWidget)" /><span><i><AppIcon name="lock" :size="11" /></i>锁定组件，避免误操作</span></label><label class="property-check layer-check"><input v-model="state.selectedWidget.config.layout.hidden" type="checkbox" @change="state.syncWidget(state.selectedWidget)" /><span><i><AppIcon name="eye" :size="11" /></i>在预览中隐藏</span></label></section>
          <section v-if="componentDefinition(state.selectedWidget.type).capabilities.dataBinding" class="property-section"><div class="property-title"><span>数据绑定</span><AppIcon name="chevron-down" :size="14" /></div>
            <label class="property-field"><span>绑定数据</span><select :value="state.selectedWidget.config.data.table || ''" @change="state.updateDataSource(state.selectedWidget, $event)"><option value="">不绑定，使用静态数</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option></select></label>
            <template v-if="state.selectedWidget.config.data.table">
              <label class="property-field"><span>查询模式</span><select v-model="state.selectedWidget.config.data.mode" @change="state.syncWidget(state.selectedWidget)"><option value="list">多行列表</option><option value="single">单行数据</option><option v-if="state.selectedWidget.type === 'stat'" value="count">记录计数</option><option v-if="state.selectedWidget.type === 'stat'" value="aggregate">聚合计算</option></select></label>
              <div v-if="state.selectedWidget.type === 'select'" class="property-row"><label class="property-field"><span>显示字段</span><input v-model="state.selectedWidget.config.data.labelField" placeholder="name" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>值字</span><input v-model="state.selectedWidget.config.data.valueField" placeholder="id" @input="state.syncWidget(state.selectedWidget)" /></label></div>
              <template v-if="state.selectedWidget.config.data.mode === 'aggregate'"><label class="property-field"><span>聚合函数</span><select v-model="state.selectedWidget.config.data.aggregate.function" @change="state.syncWidget(state.selectedWidget)"><option value="count">计数</option><option value="sum">求和</option><option value="avg">平均</option><option value="min">最小</option><option value="max">最大</option></select></label><label class="property-field"><span>聚合字段</span><input v-model="state.selectedWidget.config.data.aggregate.field" placeholder="amount" @input="state.syncWidget(state.selectedWidget)" /></label></template>
              <label class="property-field"><span>过滤条件</span><input v-model="state.selectedWidget.config.data.where" placeholder="例如 status = '跟进'" @input="state.syncWidget(state.selectedWidget)" /></label><label class="property-field"><span>排序字段</span><input v-model="state.selectedWidget.config.data.orderBy" placeholder="例如 id DESC" @input="state.syncWidget(state.selectedWidget)" /></label><label v-if="state.selectedWidget.config.data.mode === 'list'" class="property-field"><span>返回行数</span><input v-model.number="state.selectedWidget.config.data.limit" type="number" min="1" max="200" @input="state.syncWidget(state.selectedWidget)" /></label>
            </template>
          </section>
          <section v-if="state.selectedWidget.type === 'button'" class="property-section"><div class="property-title"><span>兼容表单提交</span><AppIcon name="chevron-down" :size="14" /></div><label class="property-field"><span>提交到数据表</span><select :value="state.selectedWidget.config.submitTo?.table || ''" @change="state.updateSubmitTarget(state.selectedWidget, $event)"><option value="">不提</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option></select></label><small class="field-help">更复杂的提交、提示和导航，请在“交互”中配置动作链</small></section>
        </div>
        <div v-else class="events-panel">
          <div class="events-panel-head"><div><span><AppIcon name="flow" :size="18" /></span><div><strong>组件交互</strong><small>配置事件触发后的动作</small></div></div><button class="primary-button compact" @click="state.addWidgetEvent()"><AppIcon name="plus" :size="14" />添加事件</button></div>
          <div v-if="!state.selectedWidget.config.interaction.events?.length" class="events-empty"><AppIcon name="cursor" :size="22" /><p>为这个组件添加事件。表格支持“行点击时”，输入框和下拉框支持“值变化时”</p></div>
          <article v-for="event in state.selectedWidget.config.interaction.events" :key="event.id" class="event-card"><header><div><span class="event-dot"></span><select v-model="event.event" @change="state.markDirty()"><option v-for="option in eventOptionsForWidget(state.selectedWidget.type)" :key="option.value" :value="option.value">{{ option.label }}</option></select></div><label class="event-enabled"><input v-model="event.enabled" type="checkbox" @change="state.markDirty()" />启用</label><button class="icon-button tiny danger-text" @click="state.removeWidgetEvent(event.id)"><AppIcon name="trash" :size="14" /></button></header>
            <div class="event-actions"><div v-for="(action, actionIndex) in event.actions" :key="action.id" class="event-action"><span>{{ Number(actionIndex) + 1 }}</span><select v-model="action.type" @change="state.markDirty()"><option v-for="option in eventActionOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select><select v-if="action.type === 'setValue'" v-model="action.target" @change="state.markDirty()"><option value="">选择目标组件</option><option v-for="targetWidget in state.currentProject.layout.widgets.filter((item: any) => item.type === 'input' || item.type === 'select')" :key="targetWidget.id" :value="targetWidget.id">{{ targetWidget.name }} · {{ targetWidget.config?.content?.label || targetWidget.name }}</option></select><select v-else-if="action.type === 'submitData'" v-model="action.target" @change="state.markDirty()"><option value="">选择提交的数据表</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option></select><select v-else-if="action.type === 'showModal' || action.type === 'hideModal'" v-model="action.target" @change="state.markDirty()"><option value="">全部弹窗</option><option v-for="service in state.currentProject.layout.widgets.filter((item: any) => item.type === 'modal')" :key="service.id" :value="service.id">{{ service.name }}</option></select><select v-else-if="action.type === 'showLoading' || action.type === 'hideLoading'" v-model="action.target" @change="state.markDirty()"><option value="">全部 Loading</option><option v-for="service in state.currentProject.layout.widgets.filter((item: any) => item.type === 'loading')" :key="service.id" :value="service.id">{{ service.name }}</option></select><input v-else-if="['navigate', 'navigateBack', 'setRouteState', 'emitPageEvent'].includes(action.type)" v-model="action.target" :placeholder="actionTargetPlaceholder(action.type)" @input="state.markDirty()" /><input v-if="['setValue', 'showToast'].includes(action.type)" v-model="action.value" :placeholder="action.type === 'setValue' ? '可用 {{ value }} / {{ row.id }}' : '提示内容，可用 {{ value }} / {{ row.name }}'" @input="state.markDirty()" /><input v-if="['setRouteState', 'emitPageEvent'].includes(action.type)" v-model="action.payload" placeholder="值或 JSON / 模板" @input="state.markDirty()" /><button class="icon-button tiny danger-text" @click="state.removeEventAction(event.id, action.id)"><AppIcon name="close" :size="13" /></button></div></div><button class="event-add-action" @click="state.addEventAction(event.id)"><AppIcon name="plus" :size="13" />添加动作</button>
          </article>
          <div class="events-tip"><AppIcon name="info" :size="13" /><span>动作按从上到下执行；行点击事件中可使用&#123;&#123; row.field &#125;&#125;，表单字段可使用 &#123;&#123; form.field &#125;&#125;</span></div>
        </div>
        <div class="inspector-actions"><button @click="state.duplicateSelectedWidget"><AppIcon name="copy" :size="15" />复制</button><button @click="state.bringToFront"><AppIcon name="layers" :size="15" />置顶</button><button @click="state.toggleSelectedLocked"><AppIcon name="lock" :size="15" />锁定</button><button class="danger" @click="state.removeSelectedWidget"><AppIcon name="trash" :size="15" />删除</button></div>
      </template>
      <template v-else>
        <div class="inspector-empty-head"><span>页面属性</span><AppIcon name="settings" :size="17" /></div><div class="inspector-scroll page-properties"><div class="page-preview-card"><div><span></span><span></span><span></span></div><strong>{{ state.currentProject.layout.pageName }}</strong><small>{{ state.currentProject.layout.canvas.width }} × {{ state.currentProject.layout.canvas.height }} 桌面画布</small></div><section class="property-section"><div class="property-title"><span>页面设置</span><AppIcon name="chevron-down" :size="14" /></div><label class="property-field"><span>页面名称</span><input v-model="state.currentProject.layout.pageName" @input="state.markDirty()" /></label><label class="property-field"><span>画布背景</span><div class="color-control"><input v-model="state.currentProject.layout.canvas.background" type="color" @input="state.markDirty()" /><input v-model="state.currentProject.layout.canvas.background" @input="state.markDirty()" /></div></label></section><section class="property-section design-system-section">
            <div class="property-title"><span>设计系统</span><AppIcon name="sparkle" :size="14" /></div>
            <label class="property-field"><span>当前主题</span><select :value="ensureDesignSystem().activeThemeId" @change="updateDesignTheme"><option v-for="theme in designThemes()" :key="theme.id" :value="theme.id">{{ theme.name }} ({{ theme.mode }})</option></select></label>
            <div class="property-row"><label class="property-field"><span>主色</span><div class="color-control"><input :value="designColorValue('primary')" type="color" @input="updateDesignColor('primary', $event)" /><input :value="designColorValue('primary')" @input="updateDesignColor('primary', $event)" /></div></label><label class="property-field"><span>画布色</span><div class="color-control"><input :value="designColorValue('canvas')" type="color" @input="updateDesignColor('canvas', $event)" /><input :value="designColorValue('canvas')" @input="updateDesignColor('canvas', $event)" /></div></label></div>
            <div class="property-row"><label class="property-field"><span>表面色</span><div class="color-control"><input :value="designColorValue('surface')" type="color" @input="updateDesignColor('surface', $event)" /><input :value="designColorValue('surface')" type="text" @input="updateDesignColor('surface', $event)" /></div></label><label class="property-field"><span>文字色</span><div class="color-control"><input :value="designColorValue('text')" type="color" @input="updateDesignColor('text', $event)" /><input :value="designColorValue('text')" type="text" @input="updateDesignColor('text', $event)" /></div></label></div>
            <small class="field-help">主题和 Token 保存在当前本地项目中，不依赖云同步。</small>
          </section>
          <section class="property-section page-route-section"><div class="property-title"><span>&#x8def;&#x7531;&#x4e0e;&#x5bfc;&#x822a;</span><AppIcon name="flow" :size="14" /></div><label class="property-field"><span>&#x8def;&#x5f84;</span><input :value="state.currentPage?.path || '/index'" placeholder="/detail" @change="state.updatePagePath(state.currentPage.id, ($event.target as HTMLInputElement).value)" /></label><div class="page-route-actions"><button :class="{ active: state.currentProject.entryPageId === state.currentPage?.id }" @click="state.setEntryPage(state.currentPage.id)"><AppIcon name="home" :size="13" /><span v-if="state.currentProject.entryPageId === state.currentPage?.id">当前入口</span><span v-else>设为入口</span></button><button @click="state.addPageGuard()"><AppIcon name="lock" :size="13" />&#x6dfb;&#x52a0;&#x5b88;&#x536b;</button></div><div v-if="state.currentPage?.guards?.length" class="page-guards"><article v-for="guard in state.currentPage.guards" :key="guard.id" class="page-guard-card"><header><select v-model="guard.type" @change="state.updatePageGuard(state.currentPage.id, guard.id, { type: guard.type })"><option value="auth">&#x767b;&#x5f55;&#x6821;&#x9a8c;</option><option value="condition">&#x6761;&#x4ef6;&#x8868;&#x8fbe;&#x5f0f;</option><option value="unsaved">&#x672a;&#x4fdd;&#x5b58;&#x786e;&#x8ba4;</option></select><label><input v-model="guard.enabled" type="checkbox" @change="state.updatePageGuard(state.currentPage.id, guard.id, { enabled: guard.enabled })" />&#x542f;&#x7528;</label><button class="icon-button tiny danger-text" @click="state.removePageGuard(state.currentPage.id, guard.id)"><AppIcon name="trash" :size="13" /></button></header><input v-if="guard.type === 'condition'" v-model="guard.expression" placeholder="&#x4f8b;&#x5982; isLoggedIn &#x6216; routeState.userId != null" @input="state.markDirty()" /><input v-model="guard.redirect" placeholder="&#x5931;&#x8d25;&#x65f6;&#x8df3;&#x8f6c;&#x5230;&#x7684;&#x8def;&#x5f84;&#xff08;&#x53ef;&#x9009;&#xff09;" @input="state.markDirty()" /><input v-model="guard.message" placeholder="&#x62e6;&#x622a;&#x63d0;&#x793a;&#xff08;&#x53ef;&#x9009;&#xff09;" @input="state.markDirty()" /></article></div><small class="field-help">&#x5b88;&#x536b;&#x6309;&#x8def;&#x7531;&#x548c;&#x9875;&#x9762;&#x987a;&#x5e8f;&#x6267;&#x884c;&#xff1b;&#x4e0d;&#x901a;&#x8fc7;&#x65f6;&#x53ef;&#x914d;&#x7f6e;&#x91cd;&#x5b9a;&#x5411;&#x3002;</small></section><div class="empty-inspector-tip"><AppIcon name="cursor" :size="18" /><p>在画布中选择组件，编辑 content、style、data 和 interaction。Shift 可多选，Delete 删除，Ctrl/Cmd+C/V 复制粘贴</p></div></div><div class="page-danger-zone"><button @click="state.showDeleteConfirm = true"><AppIcon name="trash" :size="15" />删除应用</button></div>
      </template>
      <div class="panel-resize-handle panel-resize-handle-left" :class="{ active: state.panelResizeSide === 'inspector' }" title="拖拽调整属性面板宽度" @pointerdown.stop="state.startPanelResize($event, 'inspector')"></div>
    </aside>
  </section>
  <ReviewPanel v-if="state.showReviewPanel" :ui="ui" />
  <InspectPanel v-if="state.showInspectPanel" :ui="ui" />
  <CanvasContextMenu :ui="ui" />
</div>
</template>
