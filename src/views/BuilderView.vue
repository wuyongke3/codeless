<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import WidgetRenderer from '../components/WidgetRenderer.vue'
import { paletteGroups } from '../composables/utils'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)
const canvasRef = props.ui.canvasRef
</script>

<template>
<div v-if="state.currentProject" class="builder-view">
        <div class="builder-toolbar">
          <div class="builder-breadcrumb"><span>{{ state.currentProject.layout.pageName }}</span><AppIcon name="chevron-right" :size="14" /><strong>画布</strong></div>
          <div class="builder-center-tools"><button :disabled="!state.historyStack.length" @click="state.undo"><AppIcon name="undo" :size="17" /></button><button :disabled="!state.futureStack.length" @click="state.redo"><AppIcon name="redo" :size="17" /></button><i></i><select v-model.number="state.zoom"><option :value="0.6">60%</option><option :value="0.7">70%</option><option :value="0.78">78%</option><option :value="0.9">90%</option><option :value="1">100%</option></select></div>
          <div class="builder-actions"><span :class="['save-state', { dirty: state.dirty }]"><i></i>{{ state.saving ? '正在保存...' : state.dirty ? '有未保存更改' : '已保存到本地' }}</span><button class="ghost-button compact" @click="state.showPreview = true"><AppIcon name="eye" :size="16" />预览</button><button class="ghost-button compact" @click="state.saveProject()"><AppIcon name="save" :size="16" />保存</button><button class="primary-button compact" @click="state.publishProject"><AppIcon name="play" :size="15" />发布</button></div>
        </div>
        <section class="builder-layout">
          <aside class="component-panel">
            <div class="panel-tabs"><button :class="{ active: state.paletteTab === 'components' }" @click="state.paletteTab = 'components'">组件</button><button :class="{ active: state.paletteTab === 'pages' }" @click="state.paletteTab = 'pages'">页面</button></div>
            <template v-if="state.paletteTab === 'components'">
              <label class="panel-search"><AppIcon name="search" :size="15" /><input v-model="state.paletteSearch" placeholder="搜索组件" /></label>
              <div class="component-scroll"><div v-for="group in state.filteredGroups" :key="group.name" class="component-group"><p>{{ group.name }}</p><div class="component-grid"><button v-for="item in group.items" :key="item.type" draggable="true" @dragstart="state.startPaletteDrag($event, item.type)" @click="state.addWidget(item.type)"><span><AppIcon :name="item.icon" :size="18" /></span><div><strong>{{ item.name }}</strong><small>{{ item.description }}</small></div><AppIcon name="plus" :size="14" /></button></div></div></div>
              <div class="panel-tip"><AppIcon name="cursor" :size="15" /><span>拖拽组件到画布，或单击快速添加</span></div>
            </template>
            <div v-else class="pages-panel"><div><span>应用页面</span><button @click="state.notify('页面创建功能已预留', 'info')"><AppIcon name="plus" :size="15" /></button></div><button class="page-item active"><span><AppIcon name="apps" :size="15" /></span><div><strong>{{ state.currentProject.layout.pageName }}</strong><small>/index</small></div><AppIcon name="more" :size="15" /></button><button class="page-item"><span><AppIcon name="settings" :size="15" /></span><div><strong>应用设置</strong><small>/settings</small></div><em>预留</em></button></div>
          </aside>

          <div class="canvas-workspace" @click="state.selectedWidgetId = ''">
            <div class="canvas-rulers"><span>0</span><span>240</span><span>480</span><span>720</span><span>960</span></div>
            <div class="canvas-stage"><div class="canvas-frame" :style="{ width: `${960 * state.zoom}px`, height: `${720 * state.zoom}px` }">
              <div ref="canvasRef" class="design-canvas" :style="{ transform: `scale(${state.zoom})`, background: state.currentProject.layout.canvas.background }" @dragover.prevent @drop.stop.prevent="state.onCanvasDrop" @click.stop="state.selectedWidgetId = ''">
                <div class="canvas-grid-pattern"></div>
                <div v-for="widget in state.currentProject.layout.widgets" :key="widget.id" :class="['canvas-widget', `widget-${widget.type}`, { selected: state.selectedWidgetId === widget.id }]" :style="state.widgetStyle(widget)" @pointerdown="state.startWidgetMove($event, widget)" @click.stop="state.selectedWidgetId = widget.id">
                  <span v-if="state.selectedWidgetId === widget.id" class="widget-label">{{ widget.name }}</span><i v-if="state.selectedWidgetId === widget.id" class="handle nw"></i><i v-if="state.selectedWidgetId === widget.id" class="handle ne"></i><i v-if="state.selectedWidgetId === widget.id" class="handle sw"></i><i v-if="state.selectedWidgetId === widget.id" class="handle se"></i>
                  <WidgetRenderer :widget="widget" :on-submit="state.submitFormToTable" />
                </div>
                <div v-if="!state.currentProject.layout.widgets.length" class="empty-canvas"><span><AppIcon name="layers" :size="26" /></span><strong>从左侧拖入第一个组件</strong><p>也可以单击组件，将它快速添加到画布</p></div>
              </div>
            </div></div>
            <div class="canvas-footer"><span><AppIcon name="monitor" :size="14" />960 × 720</span><span>缩放 {{ Math.round(state.zoom * 100) }}%</span><span><i></i>8px 网格已开启</span></div>
          </div>

          <aside class="inspector-panel">
            <template v-if="state.selectedWidget">
              <div class="inspector-head"><div><span><AppIcon :name="paletteGroups.flatMap(g => g.items).find(i => i.type === state.selectedWidget?.type)?.icon || 'apps'" :size="17" /></span><div><small>当前选中</small><strong>{{ state.selectedWidget.name }}</strong></div></div><button @click="state.selectedWidgetId = ''"><AppIcon name="close" :size="16" /></button></div>
              <div class="panel-tabs inspector-tabs"><button :class="{ active: state.inspectorTab === 'properties' }" @click="state.inspectorTab = 'properties'">属性</button><button :class="{ active: state.inspectorTab === 'events' }" @click="state.inspectorTab = 'events'">交互</button></div>
              <div v-if="state.inspectorTab === 'properties'" class="inspector-scroll">
                <section class="property-section"><div class="property-title"><span>内容</span><AppIcon name="chevron-down" :size="14" /></div>
                  <label class="property-field"><span>组件名称</span><input v-model="state.selectedWidget.name" @input="state.dirty = true" /></label>
                  <label v-if="state.selectedWidget.type !== 'divider'" class="property-field"><span>{{ state.selectedWidget.type === 'stat' ? '指标名称' : '显示文字' }}</span><input v-model="state.selectedWidget.props.text" @input="state.dirty = true" /></label>
                  <label v-if="state.selectedWidget.type === 'heading' || state.selectedWidget.type === 'image'" class="property-field"><span>说明文字</span><textarea v-model="state.selectedWidget.props.description" rows="2" @input="state.dirty = true"></textarea></label>
                  <label v-if="state.selectedWidget.type === 'input'" class="property-field"><span>占位提示</span><input v-model="state.selectedWidget.props.placeholder" @input="state.dirty = true" /></label>
                  <label v-if="state.selectedWidget.type === 'select'" class="property-field"><span>选项（逗号分隔）</span><textarea v-model="state.selectedWidget.props.options" rows="2" @input="state.dirty = true"></textarea></label>
                  <label v-if="state.selectedWidget.type === 'table'" class="property-field"><span>列（逗号分隔）</span><textarea :value="state.selectedWidget.props.columns?.join(', ')" rows="3" @input="state.updateColumns"></textarea></label>
                  <div v-if="state.selectedWidget.type === 'stat'" class="property-row"><label class="property-field"><span>数值</span><input v-model="state.selectedWidget.props.value" @input="state.dirty = true" /></label><label class="property-field"><span>趋势</span><input v-model="state.selectedWidget.props.trend" @input="state.dirty = true" /></label></div>
                  <label v-if="state.selectedWidget.type === 'input' || state.selectedWidget.type === 'select'" class="property-check"><input v-model="state.selectedWidget.props.required" type="checkbox" @change="state.dirty = true" /><span><i><AppIcon name="check" :size="12" /></i>设为必填项</span></label>
                </section>
                <section class="property-section"><div class="property-title"><span>样式</span><AppIcon name="chevron-down" :size="14" /></div>
                  <label v-if="!['input', 'select'].includes(state.selectedWidget.type)" class="property-field"><span>强调色</span><div class="color-control"><input v-model="state.selectedWidget.props.accent" type="color" @input="state.dirty = true" /><input v-model="state.selectedWidget.props.accent" @input="state.dirty = true" /></div></label>
                  <label v-if="state.selectedWidget.type === 'heading' || state.selectedWidget.type === 'text'" class="property-field"><span>对齐方式</span><div class="segmented-control"><button :class="{ active: state.selectedWidget.props.align === 'left' }" @click="state.selectedWidget.props.align = 'left'; state.dirty = true">左</button><button :class="{ active: state.selectedWidget.props.align === 'center' }" @click="state.selectedWidget.props.align = 'center'; state.dirty = true">中</button><button :class="{ active: state.selectedWidget.props.align === 'right' }" @click="state.selectedWidget.props.align = 'right'; state.dirty = true">右</button></div></label>
                  <label v-if="state.selectedWidget.type === 'button'" class="property-field"><span>按钮样式</span><select v-model="state.selectedWidget.props.variant" @change="state.dirty = true"><option value="primary">主要按钮</option><option value="secondary">次要按钮</option><option value="outline">描边按钮</option></select></label>
                  <label v-if="state.selectedWidget.type === 'heading' || state.selectedWidget.type === 'text'" class="property-field"><span>字号</span><div class="unit-input"><input v-model.number="state.selectedWidget.props.fontSize" type="number" @input="state.dirty = true" /><em>px</em></div></label>
                  <label v-if="['button', 'input', 'select', 'table', 'stat', 'image'].includes(state.selectedWidget.type)" class="property-field"><span>圆角</span><div class="unit-input"><input v-model.number="state.selectedWidget.props.radius" type="number" @input="state.dirty = true" /><em>px</em></div></label>
                </section>                <section class="property-section"><div class="property-title"><span>布局</span><AppIcon name="chevron-down" :size="14" /></div><div class="position-grid"><label><span>X</span><input v-model.number="state.selectedWidget.x" type="number" @input="state.dirty = true" /></label><label><span>Y</span><input v-model.number="state.selectedWidget.y" type="number" @input="state.dirty = true" /></label><label><span>W</span><input v-model.number="state.selectedWidget.w" type="number" @input="state.dirty = true" /></label><label><span>H</span><input v-model.number="state.selectedWidget.h" type="number" @input="state.dirty = true" /></label></div></section>
                <section class="property-section"><div class="property-title"><span>数据绑定</span><AppIcon name="chevron-down" :size="14" /></div>
                  <label class="property-field"><span>绑定数据表</span><select :value="state.selectedWidget.props.dataSource?.table || ''" @change="state.selectedWidget.props.dataSource = { table: ($event.target as HTMLSelectElement).value, mode: 'list' }; state.dirty = true"><option value="">不绑定</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option></select></label>
                  <template v-if="state.selectedWidget.props.dataSource?.table">
                    <label class="property-field"><span>查询模式</span><select v-model="state.selectedWidget.props.dataSource.mode" @change="state.dirty = true"><option value="list">多行列表</option><option value="single">单行数据</option><option value="count">记录计数</option><option value="aggregate">聚合计数</option></select></label>
                    <label class="property-field"><span>排序字段</span><input v-model="state.selectedWidget.props.dataSource.orderBy" placeholder="如 id DESC" @input="state.dirty = true" /></label>
                    <label class="property-field"><span>过滤条件</span><input v-model="state.selectedWidget.props.dataSource.where" placeholder="如 status = '跟进中'" @input="state.dirty = true" /></label>
                    <label v-if="state.selectedWidget.props.dataSource.mode === 'list'" class="property-field"><span>返回行数</span><input v-model.number="state.selectedWidget.props.dataSource.limit" type="number" min="1" max="200" @input="state.dirty = true" /></label>
                  </template>
                </section>
                <section v-if="state.selectedWidget.type === 'button'" class="property-section"><div class="property-title"><span>表单提交</span><AppIcon name="chevron-down" :size="14" /></div>
                  <label class="property-field"><span>提交到数据表</span><select :value="state.selectedWidget.props.submitTo?.table || ''" @change="state.selectedWidget.props.submitTo = { table: ($event.target as HTMLSelectElement).value }; state.dirty = true"><option value="">不提交</option><option v-for="table in state.tables" :key="table.name" :value="table.name">{{ table.title }}（{{ table.name }}）</option></select></label>
                </section>
              </div>
              <div v-else class="events-panel"><span><AppIcon name="flow" :size="24" /></span><h4>配置组件交互</h4><p>为组件添加点击、提交或值变化事件。</p><button @click="state.notify('事件配置功能已预留', 'info')"><AppIcon name="plus" :size="15" />添加事件</button></div>
              <div class="inspector-actions"><button @click="state.duplicateSelectedWidget"><AppIcon name="copy" :size="15" />复制</button><button class="danger" @click="state.removeSelectedWidget"><AppIcon name="trash" :size="15" />删除</button></div>
            </template>
            <template v-else>
              <div class="inspector-empty-head"><span>页面属性</span><AppIcon name="settings" :size="17" /></div><div class="inspector-scroll page-properties"><div class="page-preview-card"><div><span></span><span></span><span></span></div><strong>{{ state.currentProject.layout.pageName }}</strong><small>960 × 720 桌面画布</small></div><section class="property-section"><div class="property-title"><span>页面设置</span><AppIcon name="chevron-down" :size="14" /></div><label class="property-field"><span>页面名称</span><input v-model="state.currentProject.layout.pageName" @input="state.dirty = true" /></label><label class="property-field"><span>画布背景</span><div class="color-control"><input v-model="state.currentProject.layout.canvas.background" type="color" @input="state.dirty = true" /><input v-model="state.currentProject.layout.canvas.background" @input="state.dirty = true" /></div></label></section><div class="empty-inspector-tip"><AppIcon name="cursor" :size="18" /><p>在画布中选择一个组件，即可编辑它的内容、样式和交互。</p></div></div><div class="page-danger-zone"><button @click="state.showDeleteConfirm = true"><AppIcon name="trash" :size="15" />删除应用</button></div>
            </template>
          </aside>
        </section>
      </div>
</template>