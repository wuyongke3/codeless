<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElButton, ElInput, ElInputNumber, ElOption, ElRadioButton, ElRadioGroup, ElSelect, ElTag } from 'element-plus/dist/index.full.js'
import type { LowCodeWidget, TableMeta, WidgetColumn, WidgetDataBinding, DataSourceMode } from '../../types/lowcode'
import { getWidgetConfig } from '../../composables/widgetConfig'

const props = defineProps<{
  widget: LowCodeWidget
  tables: TableMeta[]
}>()

const emit = defineEmits<{
  update: [binding: WidgetDataBinding]
}>()

const config = computed(() => getWidgetConfig(props.widget))
const binding = computed(() => config.value.data)
const selectedTable = computed(() => props.tables.find(table => table.name === binding.value.table))
const fields = computed(() => selectedTable.value?.fields || [])
const selectedFieldNames = computed(() => Object.values(binding.value.fields || {}).filter(Boolean))
const supportsAggregate = computed(() => props.widget.type === 'stat')
const isTable = computed(() => props.widget.type === 'table')
const isSelect = computed(() => props.widget.type === 'select')
const isBound = computed(() => binding.value.source === 'table' && Boolean(binding.value.table))
const modes = computed(() => {
  if (isTable.value) return [{ label: '多行列表', value: 'list' as DataSourceMode }]
  const options: Array<{ label: string; value: DataSourceMode }> = [
    { label: '多行列表', value: 'list' },
    { label: '单行数据', value: 'single' },
  ]
  if (supportsAggregate.value) options.push({ label: '记录计数', value: 'count' }, { label: '聚合计算', value: 'aggregate' })
  return options
})
const selectedTableName = computed(() => binding.value.table || '')
const selectedField = computed(() => binding.value.field || selectedFieldNames.value[0] || '')
const selectedColumns = computed(() => selectedFieldNames.value)

function update(patch: Partial<WidgetDataBinding>) {
  const next: WidgetDataBinding = { ...binding.value, ...patch }
  emit('update', next)
}

function fieldLabel(name: string, table = selectedTable.value) {
  const field = table?.fields.find(item => item.name === name)
  return field?.description || name
}

function fieldMap(names: string[]) {
  return Object.fromEntries(names.map((field, index) => [String(index), field]))
}

function syncTableColumns(names: string[], table = selectedTable.value) {
  if (!isTable.value) return
  const existing = new Map((config.value.content.columns || []).map(column => [column.key, column]))
  config.value.content.columns = names.map(name => {
    const current = existing.get(name)
    return {
      ...(current || {}),
      key: name,
      label: current?.label || fieldLabel(name, table),
    } as WidgetColumn
  })
}

function updateTable(value: string) {
  if (!value) {
    emit('update', { source: 'static' })
    return
  }
  const table = props.tables.find(item => item.name === value)
  const firstField = table?.fields[0]?.name
  const availableNames = new Set(table?.fields.map(field => field.name) || [])
  const existingNames = selectedFieldNames.value.filter(name => availableNames.has(name))
  const defaultColumns = (existingNames.length ? existingNames : (table?.fields.slice(0, 6).map(field => field.name) || []))
  const next: WidgetDataBinding = {
    source: 'table',
    table: value,
    // A data table always renders a list. Other components retain their own modes.
    mode: isTable.value ? 'list' : (binding.value.mode || (supportsAggregate.value ? 'count' : 'list')),
    field: isTable.value ? defaultColumns[0] : (binding.value.field || firstField),
    fields: isTable.value ? fieldMap(defaultColumns) : (binding.value.fields || (firstField ? { 0: firstField } : undefined)),
    labelField: binding.value.labelField || firstField,
    valueField: binding.value.valueField || firstField,
    limit: binding.value.limit || 20,
  }
  if (isTable.value) syncTableColumns(defaultColumns, table)
  emit('update', next)
}

function updateMode(value: DataSourceMode) {
  update({ mode: value, aggregate: value === 'aggregate' ? (binding.value.aggregate || { function: 'count' }) : undefined })
}

function updateSingleField(value: string) {
  update({ field: value, fields: { 0: value } })
}

function updateColumns(value: string[]) {
  syncTableColumns(value)
  update({ fields: fieldMap(value), field: value[0] || undefined, mode: 'list' })
}

function clearBinding() {
  emit('update', { source: 'static' })
}
</script>

<template>
  <section class="property-section widget-data-binding-panel" data-testid="widget-data-binding-panel">
    <div class="property-title"><span>数据来源</span><ElTag v-if="isBound" size="small" type="success">已关联</ElTag></div>
    <ElAlert v-if="!tables.length" title="暂无数据结构" description="请先在数据模型中创建或导入数据表。" type="info" :closable="false" />
    <label class="binding-field"><span>数据表</span><ElSelect :model-value="selectedTableName" class="binding-control" clearable filterable placeholder="选择数据表" @update:model-value="updateTable"><ElOption v-for="table in tables" :key="table.name" :label="`${table.title}（${table.name}）`" :value="table.name" /></ElSelect></label>

    <template v-if="isBound">
      <div class="binding-table-meta"><strong>{{ selectedTable?.title || binding.table }}</strong><span>{{ fields.length }} 个字段</span></div>
      <ElRadioGroup v-if="!isTable && modes.length > 1" :model-value="binding.mode || 'list'" class="binding-mode" @update:model-value="updateMode"><ElRadioButton v-for="mode in modes" :key="mode.value" :label="mode.value">{{ mode.label }}</ElRadioButton></ElRadioGroup>

      <label v-if="isTable" class="binding-field"><span>查询字段</span><ElSelect :model-value="selectedColumns" class="binding-control" multiple collapse-tags filterable placeholder="选择要展示的字段" @update:model-value="updateColumns"><ElOption v-for="field in fields" :key="field.name" :label="`${field.description || field.name}（${field.name}）`" :value="field.name" /></ElSelect><small>字段顺序会同步到下方「显示列」，可继续修改表头、宽度和对齐方式。</small></label>
      <label v-else-if="!isSelect && binding.mode !== 'count' && binding.mode !== 'aggregate'" class="binding-field"><span>显示字段</span><ElSelect :model-value="selectedField" class="binding-control" filterable placeholder="选择显示字段" @update:model-value="updateSingleField"><ElOption v-for="field in fields" :key="field.name" :label="`${field.description || field.name}（${field.name}）`" :value="field.name" /></ElSelect></label>

      <div v-if="isSelect" class="binding-two-columns"><label class="binding-field"><span>显示字段</span><ElSelect :model-value="binding.labelField || ''" filterable placeholder="显示字段" @update:model-value="update({ labelField: $event })"><ElOption v-for="field in fields" :key="`label-${field.name}`" :label="field.description || field.name" :value="field.name" /></ElSelect></label><label class="binding-field"><span>值字段</span><ElSelect :model-value="binding.valueField || ''" filterable placeholder="值字段" @update:model-value="update({ valueField: $event })"><ElOption v-for="field in fields" :key="`value-${field.name}`" :label="field.description || field.name" :value="field.name" /></ElSelect></label></div>

      <div v-if="binding.mode === 'aggregate'" class="binding-two-columns"><label class="binding-field"><span>聚合函数</span><ElSelect :model-value="binding.aggregate?.function || 'count'" @update:model-value="update({ aggregate: { function: $event, field: binding.aggregate?.field } })"><ElOption label="计数" value="count" /><ElOption label="求和" value="sum" /><ElOption label="平均" value="avg" /><ElOption label="最小值" value="min" /><ElOption label="最大值" value="max" /></ElSelect></label><label class="binding-field"><span>聚合字段</span><ElSelect :model-value="binding.aggregate?.field || ''" filterable clearable placeholder="计数时可留空" @update:model-value="update({ aggregate: { function: binding.aggregate?.function || 'count', field: $event || undefined } })"><ElOption v-for="field in fields" :key="`aggregate-${field.name}`" :label="field.description || field.name" :value="field.name" /></ElSelect></label></div>

      <details v-if="binding.mode !== 'count' && binding.mode !== 'aggregate'" class="binding-advanced"><summary>查询设置<span v-if="binding.where || binding.orderBy">已配置</span></summary><div class="binding-query-fields"><label class="binding-field"><span>过滤条件</span><ElInput :model-value="binding.where || ''" class="binding-control" placeholder="例如 status = 'active'" @update:model-value="update({ where: $event || undefined })" /></label><label class="binding-field"><span>排序规则</span><ElInput :model-value="binding.orderBy || ''" class="binding-control" placeholder="例如 created_at DESC" @update:model-value="update({ orderBy: $event || undefined })" /></label><label v-if="binding.mode === 'list'" class="binding-field binding-limit"><span>最多显示</span><ElInputNumber :model-value="binding.limit || 20" class="binding-number" :min="1" :max="200" controls-position="right" @update:model-value="update({ limit: Number($event || 20) })" /><em>行</em></label></div></details>
      <ElButton class="binding-clear" text type="danger" @click="clearBinding">改为静态示例数据</ElButton>
    </template>
    <small class="field-help">绑定后，表格会使用真实字段查询；展示样式在「显示列」中单独配置。</small>
  </section>
</template>

<style scoped>
.widget-data-binding-panel { display: grid; gap: 9px; }
.binding-control, .binding-number { width: 100%; }
.binding-field { display: grid; gap: 4px; min-width: 0; }
.binding-field > span { color: var(--text-muted, #8b90a0); font-size: 11px; }
.binding-field > small { color: var(--text-muted, #8b90a0); font-size: 10px; line-height: 1.45; }
.binding-mode { width: 100%; display: flex; }
.binding-mode :deep(.el-radio-button) { flex: 1; }
.binding-mode :deep(.el-radio-button__inner) { width: 100%; padding-inline: 6px; }
.binding-table-meta { display: flex; justify-content: space-between; color: var(--text-muted, #8b90a0); font-size: 11px; }
.binding-table-meta strong { color: var(--text-primary, #343849); }
.binding-two-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.binding-advanced { border: 1px solid var(--line, #e8eaf0); border-radius: 8px; background: color-mix(in srgb, var(--panel, #fff) 90%, var(--surface, #f7f8fb)); }
.binding-advanced summary { display: flex; align-items: center; justify-content: space-between; padding: 8px; color: var(--text-primary, #343849); cursor: pointer; font-size: 11px; font-weight: 600; }
.binding-advanced summary span { color: #655ee9; font-size: 10px; font-weight: 500; }
.binding-query-fields { display: grid; gap: 8px; padding: 0 8px 8px; }
.binding-limit { grid-template-columns: 1fr auto; align-items: center; }
.binding-limit > span { grid-column: 1 / -1; }
.binding-limit em { color: var(--text-muted, #8b90a0); font-size: 11px; font-style: normal; }
.binding-clear { justify-self: start; padding-inline: 0; }
</style>
