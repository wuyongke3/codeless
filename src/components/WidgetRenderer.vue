<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import AppIcon from './AppIcon.vue'
import type { DesignSystem, LowCodeWidget, WidgetColumn, WidgetEventType } from '../types/lowcode'
import { resolveWidgetConfig } from '../composables/widgetConfig'

export interface RuntimeEventPayload {
  value?: string
  row?: Record<string, unknown>
  index?: number
}

type RuntimeEventHandler = (widget: LowCodeWidget, event: WidgetEventType, payload?: RuntimeEventPayload) => void | Promise<void>
type RuntimeValueChangeHandler = (widget: LowCodeWidget, value: string) => void

const props = withDefaults(defineProps<{
  widget: LowCodeWidget
  designSystem?: DesignSystem
  runtime?: boolean
  runtimeValue?: string
  onEvent?: RuntimeEventHandler
  onValueChange?: RuntimeValueChangeHandler
  serviceVisible?: boolean
  selectedRow?: Record<string, unknown>
  dataRefreshKey?: number
}>(), {
  runtime: false,
})

const config = computed(() => resolveWidgetConfig(props.widget, props.designSystem))
const serviceIsVisible = computed(() => props.serviceVisible ?? config.value.content.visible !== false)
const inputValue = ref(String(props.runtimeValue ?? config.value.content.value ?? config.value.content.defaultValue ?? ''))
const runtimeRows = ref<Record<string, unknown>[]>([])
const runtimeColumns = ref<string[]>([])
const runtimeCount = ref(0)
const runtimeLoading = ref(false)
const runtimeError = ref('')
const imageError = ref(false)
const alertDismissed = ref(false)
const paginationPage = ref(Number(config.value.content.currentPage) || 1)
const activeTabKey = ref(String(config.value.content.activeKey || config.value.content.options?.[0]?.value || ''))
const collapseExpanded = ref(config.value.content.expanded !== false)
const tooltipAnchor = ref<HTMLElement | null>(null)
const tooltipBubble = ref<HTMLElement | null>(null)
const tooltipVisible = ref(!props.runtime)
const tooltipStyle = ref<Record<string, string>>({})
let queryRequestId = 0
let tooltipFrame = 0

function tooltipSide() {
  return String(config.value.content.placement || 'top')
}

function positionTooltip() {
  if (!tooltipAnchor.value || !tooltipBubble.value || typeof window === 'undefined') return
  const trigger = tooltipAnchor.value.querySelector('.tooltip-trigger') as HTMLElement | null
  if (!trigger) return
  const triggerRect = trigger.getBoundingClientRect()
  const bubbleRect = tooltipBubble.value.getBoundingClientRect()
  const gap = 8
  const edge = 8
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const requested = tooltipSide()
  let side = requested
  const fits = (candidate: string) => {
    if (candidate === 'top') return triggerRect.top - gap - bubbleRect.height >= edge
    if (candidate === 'bottom') return triggerRect.bottom + gap + bubbleRect.height <= viewportHeight - edge
    if (candidate === 'left') return triggerRect.left - gap - bubbleRect.width >= edge
    return triggerRect.right + gap + bubbleRect.width <= viewportWidth - edge
  }
  const opposite: Record<string, string> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
  if (!fits(side) && fits(opposite[side] || 'top')) side = opposite[side] || 'top'

  let left = triggerRect.left + (triggerRect.width - bubbleRect.width) / 2
  let top = triggerRect.top - bubbleRect.height - gap
  if (side === 'bottom') top = triggerRect.bottom + gap
  if (side === 'left') {
    left = triggerRect.left - bubbleRect.width - gap
    top = triggerRect.top + (triggerRect.height - bubbleRect.height) / 2
  }
  if (side === 'right') {
    left = triggerRect.right + gap
    top = triggerRect.top + (triggerRect.height - bubbleRect.height) / 2
  }
  left = Math.max(edge, Math.min(left, viewportWidth - bubbleRect.width - edge))
  top = Math.max(edge, Math.min(top, viewportHeight - bubbleRect.height - edge))
  tooltipStyle.value = { left: left + 'px', top: top + 'px' }
}

function scheduleTooltipPosition() {
  if (tooltipFrame) cancelAnimationFrame(tooltipFrame)
  tooltipFrame = requestAnimationFrame(() => {
    tooltipFrame = 0
    positionTooltip()
  })
}

function showTooltip() {
  tooltipVisible.value = true
  void nextTick(scheduleTooltipPosition)
}

function hideTooltip() {
  tooltipVisible.value = !props.runtime
}

function handleTooltipViewportChange() {
  if (tooltipVisible.value) scheduleTooltipPosition()
}

onMounted(() => {
  window.addEventListener('resize', handleTooltipViewportChange)
  window.addEventListener('scroll', handleTooltipViewportChange, true)
  void nextTick(scheduleTooltipPosition)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleTooltipViewportChange)
  window.removeEventListener('scroll', handleTooltipViewportChange, true)
  if (tooltipFrame) cancelAnimationFrame(tooltipFrame)
})
watch(() => [config.value.content.title, config.value.content.placement], () => { void nextTick(scheduleTooltipPosition) })

const dataBindingEnabled = computed(() => props.runtime && config.value.data.source === 'table' && Boolean(config.value.data.table))
const displayColumns = computed<WidgetColumn[]>(() => {
  if (config.value.content.columns?.length) return config.value.content.columns.filter(column => column.visible !== false)
  return runtimeColumns.value.map(column => ({ key: column, label: column }))
})
const tableDisplayColumns = computed<WidgetColumn[]>(() => config.value.content.showIndex
  ? [{ key: '__index', label: '#', width: 52, align: 'center' }, ...displayColumns.value]
  : displayColumns.value)
const staticOptions = computed(() => config.value.content.options || [])
const pageCount = computed(() => Math.max(1, Math.ceil((Number(config.value.content.total) || 0) / Math.max(1, Number(config.value.content.pageSize) || 10))))
const paginationPages = computed(() => {
  const total = pageCount.value
  const current = Math.min(total, Math.max(1, paginationPage.value))
  const start = Math.max(1, Math.min(current - 2, total - 4))
  return Array.from({ length: Math.min(5, total) }, (_value, index) => start + index)
})
const runtimeAggregate = computed(() => runtimeRows.value[0]?.value ?? runtimeRows.value[0]?.count ?? '')
const statValue = computed(() => {
  if (config.value.data.mode === 'count') return runtimeError.value ? '—' : runtimeCount.value.toLocaleString()
  if (config.value.data.mode === 'aggregate') return runtimeError.value ? '—' : formatValue(runtimeAggregate.value)
  return formatValue(config.value.content.value)
})

watch(() => [props.widget.id, props.runtimeValue, config.value.content.value, config.value.content.defaultValue], () => {
  inputValue.value = String(props.runtimeValue ?? config.value.content.value ?? config.value.content.defaultValue ?? '')
})
watch(() => config.value.content.src, () => { imageError.value = false })
watch(() => config.value.content.currentPage, value => { paginationPage.value = Number(value) || 1 })
watch(() => [config.value.content.activeKey, config.value.content.options], () => {
  const options = config.value.content.options || []
  if (!options.some(option => option.value === activeTabKey.value)) activeTabKey.value = String(config.value.content.activeKey || options[0]?.value || '')
})
watch(() => config.value.content.expanded, value => { collapseExpanded.value = value !== false })
watch(() => [props.widget.id, config.value.content.text, config.value.content.title, config.value.content.description], () => {
  alertDismissed.value = false
})

watchEffect((onCleanup) => {
  const requestId = ++queryRequestId
  let active = true
  onCleanup(() => { active = false })

  // 运行时动作会递增该 key，触发当前表格重新查询而不影响其他组件。
  void props.dataRefreshKey
  const dataSource = config.value.data
  const queryRows = window.lowcode?.queryRows
  if (!dataBindingEnabled.value || !dataSource.table || !queryRows) {
    runtimeRows.value = []
    runtimeColumns.value = []
    runtimeCount.value = 0
    runtimeLoading.value = false
    runtimeError.value = ''
    return
  }

  runtimeLoading.value = true
  runtimeError.value = ''
  void (async () => {
    try {
      const result = await queryRows(dataSource.table!, {
        columns: Object.values(dataSource.fields || {}).filter(Boolean),
        where: dataSource.where,
        orderBy: dataSource.orderBy,
        mode: dataSource.mode,
        limit: dataSource.mode === 'count' || dataSource.mode === 'aggregate' ? 1 : (dataSource.limit || (props.widget.type === 'table' ? 10 : 20)),
        aggregate: dataSource.aggregate,
      })
      if (!active || requestId !== queryRequestId) return
      runtimeRows.value = result.rows
      runtimeColumns.value = result.columns
      runtimeCount.value = dataSource.mode === 'count' ? result.total : result.rows.length
    } catch (error) {
      if (!active || requestId !== queryRequestId) return
      runtimeRows.value = []
      runtimeColumns.value = []
      runtimeCount.value = 0
      runtimeError.value = error instanceof Error ? error.message : '数据加载失败'
    } finally {
      if (active && requestId === queryRequestId) runtimeLoading.value = false
    }
  })()
})

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  return String(value)
}

function rowValue(row: Record<string, unknown>, column: WidgetColumn, index: number) {
  if (column.key === '__index') return index + 1
  const key = column.key || config.value.data.fields?.[String(index)] || runtimeColumns.value[index]
  return row[key] ?? ''
}

function cellValue(row: Record<string, unknown>, column: WidgetColumn, index: number) {
  const value = rowValue(row, column, index)
  if (column.format === 'date' && value) {
    const date = new Date(String(value))
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('zh-CN')
  }
  return formatValue(value)
}

function cellStyle(column: WidgetColumn) {
  return {
    textAlign: column.align || 'left',
    width: column.width ? `${column.width}px` : undefined,
    minWidth: column.width ? `${column.width}px` : undefined,
  }
}

function tableGridStyle() {
  return {
    gridTemplateColumns: tableDisplayColumns.value.map(column => column.width ? `${column.width}px` : 'minmax(100px, 1fr)').join(' '),
  }
}

function selectOption(row: Record<string, unknown>) {
  const valueField = config.value.data.valueField || config.value.data.fields?.value || runtimeColumns.value[0] || ''
  const labelField = config.value.data.labelField || config.value.data.fields?.label || runtimeColumns.value[0] || valueField
  return { value: String(row[valueField] ?? ''), label: String(row[labelField] ?? row[valueField] ?? '') }
}

async function emitEvent(event: WidgetEventType, payload: RuntimeEventPayload = {}) {
  if (!props.runtime || !props.onEvent) return
  await props.onEvent(props.widget, event, payload)
}

function handleValueInput() {
  if (!props.runtime) return
  props.onValueChange?.(props.widget, String(inputValue.value || ''))
}

function handleValueChange() {
  if (!props.runtime) return
  const value = String(inputValue.value || '')
  props.onValueChange?.(props.widget, value)
  void emitEvent('change', { value })
}

function handleBooleanChange(checked: boolean) {
  inputValue.value = String(checked)
  if (!props.runtime) return
  props.onValueChange?.(props.widget, inputValue.value)
  void emitEvent('change', { value: inputValue.value })
}

function checkboxValues() {
  return String(inputValue.value || '').split(',').map(value => value.trim()).filter(Boolean)
}

function handleCheckboxChange(value: string, checked: boolean) {
  const options = config.value.content.options || []
  if (!options.length) {
    handleBooleanChange(checked)
    return
  }
  const values = new Set(checkboxValues())
  if (checked) values.add(value)
  else values.delete(value)
  inputValue.value = [...values].join(',')
  if (!props.runtime) return
  props.onValueChange?.(props.widget, inputValue.value)
  void emitEvent('change', { value: inputValue.value })
}

function handleRadioChange(value: string) {
  inputValue.value = value
  if (!props.runtime) return
  props.onValueChange?.(props.widget, value)
  void emitEvent('change', { value })
}

function handlePageChange(page: number) {
  const maxPage = pageCount.value
  paginationPage.value = Math.max(1, Math.min(maxPage, page))
  if (!props.runtime) return
  const value = String(paginationPage.value)
  props.onValueChange?.(props.widget, value)
  void emitEvent('change', { value })
}

function selectTab(value: string) {
  activeTabKey.value = value
  if (!props.runtime) return
  props.onValueChange?.(props.widget, value)
  void emitEvent('change', { value })
}

function toggleCollapse() {
  collapseExpanded.value = !collapseExpanded.value
  if (!props.runtime) return
  const value = String(collapseExpanded.value)
  props.onValueChange?.(props.widget, value)
  void emitEvent('change', { value })
}

function dismissAlert() {
  alertDismissed.value = true
  void emitEvent('close')
}

function badgeText() {
  const raw = config.value.content.value ?? config.value.content.text ?? ''
  if (raw === '' || raw === null || raw === undefined) return ''
  const value = Number(raw)
  const max = Number(config.value.content.max)
  if (Number.isFinite(value) && Number.isFinite(max) && max > 0 && value > max) return `${max}+`
  return String(raw)
}

function progressPercent() {
  return Math.max(0, Math.min(100, Number(config.value.content.percentage) || 0))
}

function handleLinkClick(event: MouseEvent) {
  const href = String(config.value.content.href || '')
  if (!props.runtime || !href || href === '#') event.preventDefault()
  handleClick()
}

function handleClick() {
  void emitEvent('click')
}

function rowIdentity(row: Record<string, unknown>) {
  for (const key of ['id', '_id', 'uuid']) {
    if (row[key] !== undefined && row[key] !== null) return `${key}:${String(row[key])}`
  }
  return undefined
}

function isSelectedRow(row: Record<string, unknown>) {
  if (!props.selectedRow) return false
  const currentIdentity = rowIdentity(row)
  const selectedIdentity = rowIdentity(props.selectedRow)
  return currentIdentity && selectedIdentity ? currentIdentity === selectedIdentity : row === props.selectedRow
}

function handleRowClick(row: Record<string, unknown>, index: number) {
  void emitEvent('rowClick', { row, index })
}

async function handleButtonClick() {
  if (!props.runtime || config.value.content.disabled || config.value.content.loading) return
  await emitEvent('click')
  await emitEvent('submit', { value: String(inputValue.value || '') })
}

function handleImageError() {
  imageError.value = true
}

function handleServiceOverlay() {
  if (!props.runtime || config.value.content.closeOnOverlay === false) return
  void emitEvent('close')
}

function containerHeaderHeight() {
  if (props.widget.type === 'drawer') return config.value.content.description ? 58 : 38
  if (!['card', 'frame', 'stack', 'grid'].includes(props.widget.type)) return 0
  if (!config.value.content.title && !config.value.content.description) return 0
  return config.value.content.description ? 48 : 28
}

function containerStyle() {
  const padding = Math.max(props.widget.type === 'drawer' ? 8 : 0, Number(config.value.style.padding) || (props.widget.type === 'drawer' ? 16 : 0))
  const header = containerHeaderHeight()
  return {
    '--container-padding': `${padding}px`,
    '--container-content-top': `${padding + header}px`,
    '--container-content-right': `${padding}px`,
    '--container-content-bottom': `${padding}px`,
    '--container-content-left': `${padding}px`,
    '--container-header-height': `${header}px`,
    '--accent': config.value.style.accent || '#665cf6',
    background: config.value.style.background || '#ffffff',
    borderRadius: `${config.value.style.borderRadius || 10}px`,
    boxShadow: typeof config.value.style.shadow === 'string'
      ? config.value.style.shadow
      : config.value.style.shadow
        ? '0 10px 24px rgba(32,35,55,.12)'
        : undefined,
    opacity: config.value.style.opacity,
  }
}
</script>

<template>
  <div v-if="widget.type === 'heading'" class="render-heading" :style="{ textAlign: config.style.textAlign, color: config.style.color || config.style.accent || '#171a2b', opacity: config.style.opacity }" @click="handleClick">
    <h2 :style="{ fontSize: `${config.style.fontSize || 28}px`, fontWeight: config.style.fontWeight || 700 }">{{ config.content.text }}</h2><p v-if="config.content.description">{{ config.content.description }}</p>

  </div>
  <p v-else-if="widget.type === 'text'" class="render-text" :style="{ textAlign: config.style.textAlign, fontSize: `${config.style.fontSize || 14}px`, color: config.style.color || config.style.accent || '#62677a', opacity: config.style.opacity }" @click="handleClick">{{ config.content.text }}</p>
  <button v-else-if="widget.type === 'button'" :class="['render-button', config.content.variant || 'primary', { 'is-loading': config.content.loading }]" :style="{ '--accent': config.style.accent || '#665cf6', background: config.style.background || undefined, borderColor: config.style.borderColor || undefined, borderRadius: `${config.style.borderRadius || 10}px`, opacity: config.style.opacity }" :disabled="!runtime || config.content.disabled || config.content.loading" @click="handleButtonClick"><span v-if="config.content.loading" class="render-button-spinner"></span>{{ config.content.loading ? '加载中…' : config.content.text }}</button>
  <label v-else-if="widget.type === 'input'" class="render-field">
    <span>{{ config.content.label || config.content.text }} <i v-if="config.validation.required">*</i></span>
    <div :style="{ borderRadius: `${config.style.borderRadius || 9}px` }"><AppIcon name="input" :size="15" /><input v-model="inputValue" :type="config.content.valueType === 'email' ? 'email' : config.content.valueType === 'phone' ? 'tel' : config.content.valueType === 'number' ? 'number' : config.content.valueType === 'date' ? 'date' : config.content.valueType === 'datetime' ? 'datetime-local' : 'text'" :placeholder="config.content.placeholder" :required="config.validation.required" :disabled="!runtime || config.content.disabled" :readonly="config.content.readOnly" :minlength="config.validation.minLength" :maxlength="config.validation.maxLength" :min="config.validation.min" :max="config.validation.max" :pattern="config.validation.pattern" @input="handleValueInput" @change="handleValueChange" /></div>
  </label>
  <label v-else-if="widget.type === 'select'" class="render-field">
    <span>{{ config.content.label || config.content.text }} <i v-if="config.validation.required">*</i></span>
    <div :style="{ borderRadius: `${config.style.borderRadius || 9}px` }">
      <select v-model="inputValue" :required="config.validation.required" :disabled="!runtime" @change="handleValueChange">
        <option value="">请选择</option>
        <template v-if="dataBindingEnabled">
          <option v-for="(row, index) in runtimeRows" :key="index" :value="selectOption(row).value">{{ selectOption(row).label }}</option>
        </template>
        <template v-else>
          <option v-for="option in staticOptions" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}</option>
        </template>
      </select>
      <AppIcon name="chevron-down" :size="14" />
    </div>
    <small v-if="runtimeLoading" class="field-status">正在加载选项…</small><small v-else-if="runtimeError" class="field-status error">{{ runtimeError }}</small><small v-else-if="dataBindingEnabled && !runtimeRows.length" class="field-status">暂无可选项</small>
  </label>
  <div v-else-if="widget.type === 'badge'" class="render-badge-wrap" @click="handleClick">
    <span v-if="(badgeText() || config.content.showZero !== false) && !(badgeText() === '0' && config.content.showZero === false)" class="render-badge" :style="{ background: config.style.accent || '#f56c6c', borderRadius: `${config.style.borderRadius || 999}px`, opacity: config.style.opacity }">{{ badgeText() || '0' }}</span>
  </div>
  <div v-else-if="widget.type === 'tag'" v-show="!alertDismissed || !runtime" :class="['render-tag', `tone-${config.content.tone || 'primary'}`]" :style="{ '--accent': config.style.accent || '#665cf6', borderRadius: `${config.style.borderRadius || 6}px`, opacity: config.style.opacity }" @click="handleClick">
    <span>{{ config.content.text }}</span><button v-if="config.content.closable" type="button" aria-label="关闭标签" @click.stop="dismissAlert"><AppIcon name="close" :size="11" /></button>
  </div>
  <div v-else-if="widget.type === 'alert'" v-show="!alertDismissed || !runtime" :class="['render-alert', `tone-${config.content.tone || 'info'}`]" :style="{ '--accent': config.style.accent || '#409eff', borderRadius: `${config.style.borderRadius || 8}px`, opacity: config.style.opacity }" @click="handleClick">
    <AppIcon name="info" :size="17" /><div class="render-alert-copy"><strong v-if="config.content.title">{{ config.content.title }}</strong><p v-if="config.content.description">{{ config.content.description }}</p></div><button v-if="config.content.closable" type="button" aria-label="关闭提示" @click.stop="dismissAlert"><AppIcon name="close" :size="13" /></button>
  </div>
  <div v-else-if="widget.type === 'progress'" class="render-progress" :style="{ '--accent': config.style.accent || '#665cf6', opacity: config.style.opacity }" @click="handleClick">
    <div class="render-progress-head"><span v-if="config.content.text">{{ config.content.text }}</span><strong v-if="config.content.showText !== false">{{ progressPercent() }}%</strong></div><div class="render-progress-track"><i :class="`status-${config.content.status || 'normal'}`" :style="{ width: `${progressPercent()}%` }"></i></div>
  </div>
  <label v-else-if="widget.type === 'switch'" class="render-switch-field" @click.stop>
    <span>{{ config.content.label || config.content.text }}</span><button type="button" :class="['render-switch', { checked: inputValue === 'true' }]" :aria-pressed="inputValue === 'true'" :disabled="!runtime || config.content.disabled" @click="handleBooleanChange(inputValue !== 'true')"><i></i></button><small>{{ inputValue === 'true' ? config.content.activeText : config.content.inactiveText }}</small>
  </label>
  <fieldset v-else-if="widget.type === 'checkbox'" class="render-choice-field" @click.stop>
    <legend>{{ config.content.label || config.content.text }}</legend>
    <template v-if="config.content.options?.length"><label v-for="option in config.content.options" :key="option.value" class="render-choice"><input type="checkbox" :checked="checkboxValues().includes(option.value)" :disabled="!runtime || config.content.disabled || option.disabled" @change="handleCheckboxChange(option.value, ($event.target as HTMLInputElement).checked)" /><span>{{ option.label }}</span></label></template>
    <label v-else class="render-choice"><input type="checkbox" :checked="inputValue === 'true'" :disabled="!runtime || config.content.disabled" @change="handleBooleanChange(($event.target as HTMLInputElement).checked)" /><span>{{ config.content.label || config.content.text }}</span></label>
  </fieldset>
  <fieldset v-else-if="widget.type === 'radio'" class="render-choice-field" @click.stop>
    <legend>{{ config.content.label || config.content.text }}</legend><label v-for="option in config.content.options" :key="option.value" class="render-choice"><input type="radio" :name="widget.id" :value="option.value" :checked="inputValue === option.value" :disabled="!runtime || config.content.disabled || option.disabled" @change="handleRadioChange(option.value)" /><span>{{ option.label }}</span></label>
  </fieldset>
  <label v-else-if="widget.type === 'datePicker'" class="render-field">
    <span>{{ config.content.label || config.content.text }} <i v-if="config.validation.required">*</i></span><div :style="{ borderRadius: `${config.style.borderRadius || 9}px` }"><AppIcon name="calendar" :size="15" /><input v-model="inputValue" :type="config.content.valueType === 'datetime' ? 'datetime-local' : 'date'" :placeholder="config.content.placeholder" :required="config.validation.required" :disabled="!runtime || config.content.disabled" @input="handleValueInput" @change="handleValueChange" /></div>
  </label>
  <div v-else-if="widget.type === 'pagination'" class="render-pagination" :style="{ '--accent': config.style.accent || '#665cf6', opacity: config.style.opacity }" @click="handleClick">
    <button type="button" :disabled="!runtime || paginationPage <= 1" @click.stop="handlePageChange(paginationPage - 1)"><AppIcon name="chevron-right" :size="13" style="transform:rotate(180deg)" /></button><button v-for="page in paginationPages" :key="page" type="button" :class="{ active: page === paginationPage }" :disabled="!runtime" @click.stop="handlePageChange(page)">{{ page }}</button><button type="button" :disabled="!runtime || paginationPage >= pageCount" @click.stop="handlePageChange(paginationPage + 1)"><AppIcon name="chevron-right" :size="13" /></button>
  </div>
  <nav v-else-if="widget.type === 'breadcrumb'" class="render-breadcrumb" :style="{ '--accent': config.style.accent || '#665cf6', opacity: config.style.opacity }" @click="handleClick"><template v-for="(option, index) in config.content.options" :key="option.value"><button type="button" :class="{ current: index === (config.content.options?.length || 1) - 1 }" @click.stop="handleClick">{{ option.label }}</button><span v-if="index < (config.content.options?.length || 1) - 1">{{ config.content.separator || '/' }}</span></template></nav>
  <div v-else-if="widget.type === 'tabs'" class="render-tabs" :style="{ '--accent': config.style.accent || '#665cf6', borderRadius: `${config.style.borderRadius || 8}px`, opacity: config.style.opacity }" @click="handleClick">
    <div class="render-tabs-head"><button v-for="option in config.content.options" :key="option.value" type="button" :class="{ active: option.value === activeTabKey }" @click.stop="selectTab(option.value)">{{ option.label }}</button></div><div class="render-tabs-panel"><slot name="children" /><span v-if="!$slots.children">{{ config.content.options?.find(option => option.value === activeTabKey)?.label || '暂无内容' }}</span></div>
  </div>
  <div v-else-if="widget.type === 'collapse'" class="render-collapse" :style="{ '--accent': config.style.accent || '#665cf6', borderRadius: `${config.style.borderRadius || 8}px`, opacity: config.style.opacity }" @click="handleClick">
    <button type="button" class="render-collapse-head" :aria-expanded="collapseExpanded" @click.stop="toggleCollapse"><span>{{ config.content.options?.[0]?.label || config.content.label || config.content.text || '折叠面板' }}</span><AppIcon name="chevron-down" :size="14" :class="{ rotated: collapseExpanded }" /></button><div v-show="collapseExpanded" class="render-collapse-panel"><slot name="children" /><span v-if="!$slots.children">{{ config.content.options?.[0]?.value || '面板内容' }}</span></div>
  </div>
  <div v-else-if="widget.type === 'avatar'" class="render-avatar" :class="{ square: config.content.shape === 'square' }" :style="{ '--accent': config.style.accent || '#665cf6', borderRadius: `${config.content.shape === 'square' ? config.style.borderRadius || 8 : 999}px`, opacity: config.style.opacity }" @click="handleClick"><img v-if="config.content.src && !imageError" :src="config.content.src" :alt="config.content.text || '头像'" @error="handleImageError" /><span v-else>{{ String(config.content.text || '?').slice(0, 1) }}</span></div>
  <div v-else-if="widget.type === 'icon'" class="render-icon" :style="{ color: config.style.accent || '#665cf6', opacity: config.style.opacity }" @click="handleClick"><AppIcon :name="config.content.iconName || 'sparkle'" :size="Math.min(42, Math.max(18, config.style.fontSize || 28))" /><span v-if="config.content.text">{{ config.content.text }}</span></div>
  <a v-else-if="widget.type === 'link'" class="render-link" :href="config.content.href || '#'" :target="config.content.target || '_self'" :style="{ color: config.style.accent || '#665cf6', fontSize: `${config.style.fontSize || 13}px`, opacity: config.style.opacity }" @click="handleLinkClick">{{ config.content.text || config.content.href }}</a>
  <div v-else-if="widget.type === 'tooltip'" ref="tooltipAnchor" :class="['render-tooltip', 'placement-' + (config.content.placement || 'top'), { 'is-design': !runtime }]" @mouseenter="showTooltip" @mouseleave="hideTooltip" @focusin="showTooltip" @focusout="hideTooltip" @click="handleClick"><span class="tooltip-trigger" tabindex="0">{{ config.content.text }}</span><Teleport to="body"><span ref="tooltipBubble" class="tooltip-bubble tooltip-bubble-portal" :class="{ 'is-visible': tooltipVisible }" :style="tooltipStyle" :data-tooltip-widget-id="widget.id" role="tooltip">{{ config.content.title }}</span></Teleport></div>
  <div v-else-if="widget.type === 'spacer'" class="render-spacer" :class="{ flex: config.content.flex }" :style="{ background: config.style.background || 'transparent', opacity: config.style.opacity }" aria-hidden="true"></div>
  <div v-else-if="widget.type === 'stat'" class="render-stat" :style="{ borderRadius: `${config.style.borderRadius || 12}px`, opacity: config.style.opacity }" @click="handleClick">
    <div><span>{{ config.content.text }}</span><i :style="{ background: `${config.style.accent || '#665cf6'}18`, color: config.style.accent || '#665cf6' }"><AppIcon name="chart" :size="17" /></i></div>
    <strong>{{ statValue }}</strong>
    <p><b :class="{ negative: config.content.trend?.startsWith('-') }">{{ config.content.trend }}</b><span v-if="config.content.trend">较上月</span><small v-if="runtimeLoading">正在更新…</small><small v-else-if="runtimeError">{{ runtimeError }}</small></p>
  </div>
  <div v-else-if="widget.type === 'table'" class="render-table" :style="{ borderRadius: `${config.style.borderRadius || 12}px`, opacity: config.style.opacity }" @click="handleClick">
    <div class="render-table-head" :style="tableGridStyle()"><span v-for="column in tableDisplayColumns" :key="column.key" :style="cellStyle(column)">{{ column.label }}</span></div>
    <template v-if="runtime && dataBindingEnabled">
      <div v-if="runtimeLoading" class="table-empty"><AppIcon name="database" :size="18" /><span>正在加载数据…</span></div>
      <div v-else-if="runtimeError" class="table-empty error"><AppIcon name="close" :size="18" /><span>{{ runtimeError }}</span></div>
      <div v-else-if="!runtimeRows.length" class="table-empty"><AppIcon name="database" :size="18" /><span>暂无数据</span></div>
      <div v-else v-for="(row, ri) in runtimeRows" :key="ri" :class="['render-table-row', { 'is-selected': isSelectedRow(row) }]" :style="tableGridStyle()" @click.stop="handleRowClick(row, ri)">
        <span v-for="(column, ci) in tableDisplayColumns" :key="column.key" :style="cellStyle(column)">
          <template v-if="column.key === '__index'">{{ ri + 1 }}</template>
          <template v-else-if="ci === 0 || (!config.content.showIndex && ci === 0)"><b class="table-avatar" :style="{ background: `${config.style.accent || '#665cf6'}18`, color: config.style.accent || '#665cf6' }">{{ String(cellValue(row, column, ci)).slice(0, 1) }}</b>{{ cellValue(row, column, ci) }}</template>
          <template v-else>{{ cellValue(row, column, ci) }}</template>
        </span>
      </div>
    </template>
    <template v-else>
      <div v-for="row in 4" :key="row" class="render-table-row" :style="tableGridStyle()">
        <span v-for="(column, col) in tableDisplayColumns" :key="column.key">
          <template v-if="column.key === '__index'">{{ row }}</template>
          <template v-else-if="col === 0 || (!config.content.showIndex && col === 0)"><b class="table-avatar" :style="{ background: `${config.style.accent || '#665cf6'}18`, color: config.style.accent || '#665cf6' }">{{ ['星', '云', '北', '原'][row - 1] }}</b>{{ ['星河科技', '云帆网络', '北辰贸易', '原野设计'][row - 1] }}</template>
          <template v-else-if="col === 1">{{ ['陈晨', '李想', '王楠', '赵晴'][row - 1] }}</template>
          <template v-else-if="col === 2"><i class="table-status" :class="row % 3 === 0 ? 'waiting' : 'done'">{{ row % 3 === 0 ? '跟进中' : '已成交' }}</i></template>
          <template v-else>{{ row % 2 ? '今天 10:24' : '昨天 16:08' }}</template>
        </span>
      </div>
    </template>
  </div>
  <div v-else-if="widget.type === 'modal'" v-show="!runtime || serviceIsVisible" class="render-modal" @click.self="handleServiceOverlay">
    <div class="render-modal-card" @click.stop>
      <header><strong>{{ config.content.title || config.content.text || '确认操作' }}</strong><button v-if="runtime" class="service-close" @click="emitEvent('close')"><AppIcon name="close" :size="14" /></button></header>
      <p v-if="config.content.description">{{ config.content.description }}</p>
      <div class="render-container-content"><slot name="children" /></div>
      <footer><button v-if="config.content.cancelText !== ''" class="modal-cancel" @click="emitEvent('cancel')">{{ config.content.cancelText || '取消' }}</button><button class="modal-confirm" :style="{ background: config.style.accent || '#665cf6' }" @click="emitEvent('confirm')">{{ config.content.confirmText || '确定' }}</button></footer>
    </div>
  </div>
  <div v-else-if="['card', 'frame', 'stack', 'grid'].includes(widget.type)" :class="['render-generic-container', `render-${widget.type}`]" :style="containerStyle()" @click="handleClick">
    <header v-if="config.content.title || config.content.description" class="render-container-header"><strong v-if="config.content.title">{{ config.content.title }}</strong><p v-if="config.content.description">{{ config.content.description }}</p></header>
    <div class="render-container-content"><slot name="children" /></div>
  </div>
  <div v-else-if="widget.type === 'drawer'" v-show="!runtime || serviceIsVisible" :class="['render-drawer', `placement-${config.content.placement || 'right'}`]" :style="containerStyle()" @click="handleClick">
    <header class="render-container-header"><strong>{{ config.content.title || '抽屉' }}</strong><button v-if="runtime" class="service-close" @click.stop="emitEvent('close')"><AppIcon name="close" :size="14" /></button></header>
    <p v-if="config.content.description" class="render-drawer-description">{{ config.content.description }}</p>
    <div class="render-container-content"><slot name="children" /></div>
  </div>
  <div v-else-if="widget.type === 'loading'" v-show="!runtime || serviceIsVisible" class="render-loading" :class="{ 'is-bar': config.content.loadingVariant === 'bar' }" :style="{ '--accent': config.style.accent || '#665cf6', borderRadius: `${config.style.borderRadius || 12}px` }">
    <span class="loading-spinner"></span><div class="render-loading-body"><strong>{{ config.content.text || '加载中…' }}</strong><div class="render-container-content"><slot name="children" /></div><i v-if="config.content.loadingVariant === 'bar'"></i></div>
  </div>
  <div v-else-if="widget.type === 'image'" class="render-image" :style="{ borderRadius: `${config.style.borderRadius || 12}px`, '--accent': config.style.accent || '#665cf6', opacity: config.style.opacity }" @click="handleClick">
    <img v-if="config.content.src && !imageError" :src="config.content.src" :alt="config.content.alt || config.content.text || '图片'" :style="{ objectFit: config.content.imageFit || config.style.objectFit || 'cover' }" @error="handleImageError" />
    <template v-else><span><AppIcon :name="imageError ? 'close' : 'image'" :size="24" /></span><strong>{{ imageError ? '图片加载失败' : config.content.text }}</strong><small>{{ imageError ? '请检查图片地址或本地资源权限' : config.content.description }}</small></template>
  </div>
  <div v-else-if="widget.type === 'divider'" class="render-divider" :style="{ background: config.style.accent || '#e7e8ef', height: `${config.style.borderWidth || 1}px` }" @click="handleClick"></div>
</template>
