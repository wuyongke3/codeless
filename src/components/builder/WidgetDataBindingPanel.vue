<script setup lang="ts">
import { computed } from 'vue'
import { CAlert, CButton, CInput, CInputNumber, CSegmented, CSelect, CTag } from '@codeless/components'
import type { DataSourceMode, LowCodeWidget, TableMeta, WidgetAggregateFunction, WidgetColumn, WidgetDataBinding } from '../../types/lowcode'
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
const tableOptions = computed(() => props.tables.map(table => ({ label: `${table.title}（${table.name}）`, value: table.name })))
const fieldOptions = computed(() => fields.value.map(field => ({ label: `${field.description || field.name}（${field.name}）`, value: field.name })))
const simpleFieldOptions = computed(() => fields.value.map(field => ({ label: field.description || field.name, value: field.name })))
const aggregateOptions = [
  { label: '计数', value: 'count' },
  { label: '求和', value: 'sum' },
  { label: '平均', value: 'avg' },
  { label: '最小值', value: 'min' },
  { label: '最大值', value: 'max' },
]
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
  emit('update', { ...binding.value, ...patch })
}

function fieldLabel(name: string, table = selectedTable.value) {
  return table?.fields.find(item => item.name === name)?.description || name
}

function fieldMap(names: string[]) {
  return Object.fromEntries(names.map((field, index) => [String(index), field]))
}

function syncTableColumns(names: string[], table = selectedTable.value) {
  if (!isTable.value) return
  const existing = new Map((config.value.content.columns || []).map(column => [column.key, column]))
  config.value.content.columns = names.map(name => {
    const current = existing.get(name)
    return { ...(current || {}), key: name, label: current?.label || fieldLabel(name, table) } as WidgetColumn
  })
}

function selectValue(value: string | string[]) {
  return Array.isArray(value) ? value[0] || '' : value
}

function updateTable(value: string | string[]) {
  value = selectValue(value)
  if (!value) {
    emit('update', { source: 'static' })
    return
  }
  const table = props.tables.find(item => item.name === value)
  const firstField = table?.fields[0]?.name
  const availableNames = new Set(table?.fields.map(field => field.name) || [])
  const existingNames = selectedFieldNames.value.filter(name => availableNames.has(name))
  const defaultColumns = existingNames.length ? existingNames : (table?.fields.slice(0, 6).map(field => field.name) || [])
  const next: WidgetDataBinding = {
    source: 'table',
    table: value,
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

function updateMode(value: string) {
  const mode = value as DataSourceMode
  update({ mode, aggregate: mode === 'aggregate' ? (binding.value.aggregate || { function: 'count' }) : undefined })
}

function updateSingleField(value: string | string[]) {
  const field = selectValue(value)
  update({ field, fields: { 0: field } })
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
    <div class="property-title"><span>数据来源</span><CTag v-if="isBound" type="success">已关联</CTag></div>
    <CAlert v-if="!tables.length" title="暂无数据结构" description="请先在数据模型中创建或导入数据表。" type="info" />
    <label class="binding-field"><span>数据表</span><CSelect :model-value="selectedTableName" :options="tableOptions" class="binding-control" clearable placeholder="选择数据表" @update:model-value="updateTable" /></label>

    <template v-if="isBound">
      <div class="binding-table-meta"><strong>{{ selectedTable?.title || binding.table }}</strong><span>{{ fields.length }} 个字段</span></div>
      <CSegmented v-if="!isTable && modes.length > 1" :model-value="binding.mode || 'list'" :options="modes" class="binding-mode" aria-label="数据展示模式" @update:model-value="updateMode" />

      <label v-if="isTable" class="binding-field"><span>查询字段</span><CSelect :model-value="selectedColumns" :options="fieldOptions" class="binding-control" multiple placeholder="选择要展示的字段" @update:model-value="updateColumns($event as string[])" /><small>字段顺序会同步到下方「显示列」，可继续修改表头、宽度和对齐方式。</small></label>
      <label v-else-if="!isSelect && binding.mode !== 'count' && binding.mode !== 'aggregate'" class="binding-field"><span>显示字段</span><CSelect :model-value="selectedField" :options="fieldOptions" class="binding-control" placeholder="选择显示字段" @update:model-value="updateSingleField" /></label>

      <div v-if="isSelect" class="binding-two-columns"><label class="binding-field"><span>显示字段</span><CSelect :model-value="binding.labelField || ''" :options="simpleFieldOptions" placeholder="显示字段" @update:model-value="update({ labelField: selectValue($event) })" /></label><label class="binding-field"><span>值字段</span><CSelect :model-value="binding.valueField || ''" :options="simpleFieldOptions" placeholder="值字段" @update:model-value="update({ valueField: selectValue($event) })" /></label></div>

      <div v-if="binding.mode === 'aggregate'" class="binding-two-columns"><label class="binding-field"><span>聚合函数</span><CSelect :model-value="binding.aggregate?.function || 'count'" :options="aggregateOptions" @update:model-value="update({ aggregate: { function: selectValue($event) as WidgetAggregateFunction, field: binding.aggregate?.field } })" /></label><label class="binding-field"><span>聚合字段</span><CSelect :model-value="binding.aggregate?.field || ''" :options="simpleFieldOptions" clearable placeholder="计数时可留空" @update:model-value="update({ aggregate: { function: binding.aggregate?.function || 'count', field: selectValue($event) || undefined } })" /></label></div>

      <details v-if="binding.mode !== 'count' && binding.mode !== 'aggregate'" class="binding-advanced"><summary>查询设置<span v-if="binding.where || binding.orderBy">已配置</span></summary><div class="binding-query-fields"><label class="binding-field"><span>过滤条件</span><CInput :model-value="binding.where || ''" class="binding-control" placeholder="例如 status = 'active'" @update:model-value="update({ where: $event || undefined })" /></label><label class="binding-field"><span>排序规则</span><CInput :model-value="binding.orderBy || ''" class="binding-control" placeholder="例如 created_at DESC" @update:model-value="update({ orderBy: $event || undefined })" /></label><label v-if="binding.mode === 'list'" class="binding-field binding-limit"><span>最多显示</span><CInputNumber :model-value="binding.limit || 20" class="binding-number" :min="1" :max="200" @update:model-value="update({ limit: $event || 20 })" /><em>行</em></label></div></details>
      <CButton class="binding-clear" text type="danger" @click="clearBinding">改为静态示例数据</CButton>
    </template>
    <small class="field-help">绑定后，表格会使用真实字段查询；展示样式在「显示列」中单独配置。</small>
  </section>
</template>
