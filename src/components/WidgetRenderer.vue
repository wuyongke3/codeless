<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import AppIcon from './AppIcon.vue'
import type { LowCodeWidget } from '../types/lowcode'

const props = defineProps<{
  widget: LowCodeWidget
  onSubmit?: (widget: LowCodeWidget) => void | Promise<void>
}>()

const runtimeRows = ref<Record<string, unknown>[]>([])
const runtimeColumns = ref<string[]>([])
const runtimeCount = ref(0)

watchEffect(async () => {
  const dataSource = props.widget.props.dataSource
  if (!dataSource?.table || !window.lowcode?.queryRows) {
    runtimeRows.value = []
    runtimeColumns.value = []
    runtimeCount.value = 0
    return
  }
  try {
    const result = await window.lowcode.queryRows(dataSource.table, {
      columns: dataSource.columns,
      where: dataSource.where,
      orderBy: dataSource.orderBy,
      mode: dataSource.mode,
      limit: dataSource.mode === 'count' ? 1 : (dataSource.limit || (props.widget.type === 'table' ? 10 : 20)),
    })
    runtimeRows.value = result.rows
    runtimeColumns.value = result.columns
    runtimeCount.value = dataSource.mode === 'count' ? result.total : result.rows.length
  } catch {
    // 数据源不可用时保留静态演示内容。
    runtimeRows.value = []
    runtimeColumns.value = []
    runtimeCount.value = 0
  }
})

function rowValue(row: Record<string, unknown>, index: number, label: string) {
  const column = props.widget.props.dataSource?.columns?.[index] || runtimeColumns.value[index] || label
  return row[column] ?? ''
}

function selectOption(row: Record<string, unknown>) {
  const column = props.widget.props.dataSource?.columns?.[0] || runtimeColumns.value[0] || ''
  return String(row[column] ?? '')
}
</script>

<template>
  <div v-if="widget.type === 'heading'" class="render-heading" :style="{ textAlign: widget.props.align, color: widget.props.accent || '#171a2b' }">
    <h2 :style="{ fontSize: `${widget.props.fontSize || 28}px` }">{{ widget.props.text }}</h2><p>{{ widget.props.description }}</p>
  </div>
  <p v-else-if="widget.type === 'text'" class="render-text" :style="{ textAlign: widget.props.align, fontSize: `${widget.props.fontSize || 14}px`, color: widget.props.accent || '#62677a' }">{{ widget.props.text }}</p>
  <button v-else-if="widget.type === 'button'" :class="['render-button', widget.props.variant || 'primary']" :style="{ '--accent': widget.props.accent || '#665cf6', borderRadius: `${widget.props.radius || 10}px` }" @click.stop="onSubmit?.(widget)">{{ widget.props.text }}</button>
  <label v-else-if="widget.type === 'input'" class="render-field">
    <span>{{ widget.props.text }} <i v-if="widget.props.required">*</i></span>
    <div :style="{ borderRadius: `${widget.props.radius || 9}px` }"><AppIcon name="input" :size="15" /><input v-model="widget.props.value" :placeholder="widget.props.placeholder" :required="widget.props.required" @pointerdown.stop /></div>
  </label>
  <label v-else-if="widget.type === 'select'" class="render-field">
    <span>{{ widget.props.text }} <i v-if="widget.props.required">*</i></span>
    <div :style="{ borderRadius: `${widget.props.radius || 9}px` }">
      <select v-model="widget.props.value" :required="widget.props.required" @pointerdown.stop>
        <option value="">{{ runtimeRows.length ? '请选择' : (widget.props.options?.split(',')[0] || '请选择') }}</option>
        <template v-if="runtimeRows.length">
          <option v-for="(row, index) in runtimeRows" :key="index" :value="selectOption(row)">{{ selectOption(row) }}</option>
        </template>
        <template v-else>
          <option v-for="option in (widget.props.options || '').split(',').slice(1)" :key="option" :value="option.trim()">{{ option.trim() }}</option>
        </template>
      </select>
      <AppIcon name="chevron-down" :size="14" />
    </div>
  </label>
  <div v-else-if="widget.type === 'stat'" class="render-stat" :style="{ borderRadius: `${widget.props.radius || 12}px` }">
    <div><span>{{ widget.props.text }}</span><i :style="{ background: `${widget.props.accent || '#665cf6'}18`, color: widget.props.accent || '#665cf6' }"><AppIcon name="chart" :size="17" /></i></div>
    <strong v-if="widget.props.dataSource?.mode === 'count'">{{ runtimeCount.toLocaleString() }}</strong><strong v-else>{{ widget.props.value }}</strong>
    <p><b :class="{ negative: widget.props.trend?.startsWith('-') }">{{ widget.props.trend }}</b> 较上月</p>
  </div>
  <div v-else-if="widget.type === 'table'" class="render-table" :style="{ borderRadius: `${widget.props.radius || 12}px` }">
    <div class="render-table-head"><span v-for="column in widget.props.columns" :key="column">{{ column }}</span></div>
    <template v-if="runtimeRows.length">
      <div v-for="(row, ri) in runtimeRows" :key="ri" class="render-table-row">
        <span v-for="(column, ci) in widget.props.columns" :key="column">
          <template v-if="ci === 0"><b class="table-avatar" :style="{ background: `${widget.props.accent || '#665cf6'}18`, color: widget.props.accent || '#665cf6' }">{{ String(rowValue(row, ci, column)).slice(0, 1) }}</b>{{ rowValue(row, ci, column) }}</template>
          <template v-else>{{ rowValue(row, ci, column) }}</template>
        </span>
      </div>
    </template>
    <template v-else>
      <div v-for="row in 4" :key="row" class="render-table-row">
        <span v-for="(column, col) in widget.props.columns" :key="column">
          <template v-if="col === 0"><b class="table-avatar" :style="{ background: `${widget.props.accent || '#665cf6'}18`, color: widget.props.accent || '#665cf6' }">{{ ['星', '云', '北', '原'][row - 1] }}</b>{{ ['星河科技', '云帆网络', '北辰贸易', '原野设计'][row - 1] }}</template>
          <template v-else-if="col === 1">{{ ['陈晨', '李想', '王楠', '赵晴'][row - 1] }}</template>
          <template v-else-if="col === 2"><i class="table-status" :class="row % 3 === 0 ? 'waiting' : 'done'">{{ row % 3 === 0 ? '跟进中' : '已成交' }}</i></template>
          <template v-else>{{ row % 2 ? '今天 10:24' : '昨天 16:08' }}</template>
        </span>
      </div>
    </template>
  </div>
  <div v-else-if="widget.type === 'image'" class="render-image" :style="{ borderRadius: `${widget.props.radius || 12}px`, '--accent': widget.props.accent || '#665cf6' }"><span><AppIcon name="image" :size="24" /></span><strong>{{ widget.props.text }}</strong><small>{{ widget.props.description }}</small></div>
  <div v-else-if="widget.type === 'divider'" class="render-divider" :style="{ background: widget.props.accent || '#e7e8ef' }"></div>
</template>
