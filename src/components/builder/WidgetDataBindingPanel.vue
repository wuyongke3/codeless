<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElButton, ElInput, ElInputNumber, ElOption, ElRadioButton, ElRadioGroup, ElSelect, ElTag } from 'element-plus/dist/index.full.js'
import type { LowCodeWidget, TableMeta, WidgetDataBinding, DataSourceMode } from '../../types/lowcode'
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

function updateTable(value: string) {
  if (!value) {
    emit('update', { source: 'static' })
    return
  }
  const firstField = props.tables.find(table => table.name === value)?.fields[0]?.name
  const next: WidgetDataBinding = {
    source: 'table',
    table: value,
    mode: binding.value.mode || (supportsAggregate.value ? 'count' : 'list'),
    field: binding.value.field || firstField,
    fields: binding.value.fields || (firstField ? { 0: firstField } : undefined),
    labelField: binding.value.labelField || firstField,
    valueField: binding.value.valueField || firstField,
    limit: binding.value.limit || 20,
  }
  emit('update', next)
}

function updateMode(value: DataSourceMode) {
  update({ mode: value, aggregate: value === 'aggregate' ? (binding.value.aggregate || { function: 'count' }) : undefined })
}

function updateSingleField(value: string) {
  update({ field: value, fields: { 0: value } })
}

function updateColumns(value: string[]) {
  const fieldsMap = Object.fromEntries(value.map((field, index) => [String(index), field]))
  update({ fields: fieldsMap, field: value[0] || undefined })
}

function clearBinding() {
  emit('update', { source: 'static' })
}
</script>

<template>
  <section class="property-section widget-data-binding-panel" data-testid="widget-data-binding-panel">
    <div class="property-title"><span>数据绑定</span><ElTag v-if="isBound" size="small" type="success">已关联</ElTag></div>
    <ElAlert v-if="!tables.length" title="暂无数据结构" description="请先在数据模型中创建或导入数据表。" type="info" :closable="false" />
    <ElSelect
      :model-value="selectedTableName"
      class="binding-control"
      clearable
      filterable
      placeholder="选择数据表"
      @update:model-value="updateTable"
    >
      <ElOption v-for="table in tables" :key="table.name" :label="`${table.title}（${table.name}）`" :value="table.name" />
    </ElSelect>

    <template v-if="isBound">
      <div class="binding-table-meta"><strong>{{ selectedTable?.title || binding.table }}</strong><span>{{ fields.length }} 个字段</span></div>
      <ElRadioGroup v-if="modes.length > 1" :model-value="binding.mode || 'list'" class="binding-mode" @update:model-value="updateMode">
        <ElRadioButton v-for="mode in modes" :key="mode.value" :label="mode.value">{{ mode.label }}</ElRadioButton>
      </ElRadioGroup>

      <ElSelect v-if="isTable" :model-value="selectedColumns" class="binding-control" multiple collapse-tags filterable placeholder="选择表格列" @update:model-value="updateColumns">
        <ElOption v-for="field in fields" :key="field.name" :label="`${field.description || field.name}（${field.name}）`" :value="field.name" />
      </ElSelect>
      <ElSelect v-else-if="!isSelect && binding.mode !== 'count' && binding.mode !== 'aggregate'" :model-value="selectedField" class="binding-control" filterable placeholder="选择显示字段" @update:model-value="updateSingleField">
        <ElOption v-for="field in fields" :key="field.name" :label="`${field.description || field.name}（${field.name}）`" :value="field.name" />
      </ElSelect>

      <div v-if="isSelect" class="binding-two-columns">
        <ElSelect :model-value="binding.labelField || ''" filterable placeholder="显示字段" @update:model-value="update({ labelField: $event })">
          <ElOption v-for="field in fields" :key="`label-${field.name}`" :label="field.description || field.name" :value="field.name" />
        </ElSelect>
        <ElSelect :model-value="binding.valueField || ''" filterable placeholder="值字段" @update:model-value="update({ valueField: $event })">
          <ElOption v-for="field in fields" :key="`value-${field.name}`" :label="field.description || field.name" :value="field.name" />
        </ElSelect>
      </div>

      <div v-if="binding.mode === 'aggregate'" class="binding-two-columns">
        <ElSelect :model-value="binding.aggregate?.function || 'count'" placeholder="聚合函数" @update:model-value="update({ aggregate: { function: $event, field: binding.aggregate?.field } })">
          <ElOption label="计数" value="count" /><ElOption label="求和" value="sum" /><ElOption label="平均" value="avg" /><ElOption label="最小值" value="min" /><ElOption label="最大值" value="max" />
        </ElSelect>
        <ElSelect :model-value="binding.aggregate?.field || ''" filterable clearable placeholder="聚合字段" @update:model-value="update({ aggregate: { function: binding.aggregate?.function || 'count', field: $event || undefined } })">
          <ElOption v-for="field in fields" :key="`aggregate-${field.name}`" :label="field.description || field.name" :value="field.name" />
        </ElSelect>
      </div>

      <ElInput v-if="binding.mode !== 'count' && binding.mode !== 'aggregate'" :model-value="binding.where || ''" class="binding-control" placeholder="过滤条件，例如 status = 'active'" @update:model-value="update({ where: $event || undefined })" />
      <ElInput v-if="binding.mode !== 'count' && binding.mode !== 'aggregate'" :model-value="binding.orderBy || ''" class="binding-control" placeholder="排序，例如 created_at DESC" @update:model-value="update({ orderBy: $event || undefined })" />
      <ElInputNumber v-if="binding.mode === 'list'" :model-value="binding.limit || 20" class="binding-number" :min="1" :max="200" controls-position="right" @update:model-value="update({ limit: Number($event || 20) })" />
      <ElButton class="binding-clear" text type="danger" @click="clearBinding">清除绑定</ElButton>
    </template>
    <small class="field-help">发布后会按这里关联的真实字段查询数据；字段名不会再依赖组件文案猜测。</small>
  </section>
</template>

<style scoped>
.widget-data-binding-panel { display: grid; gap: 8px; }
.binding-control, .binding-number { width: 100%; }
.binding-mode { width: 100%; display: flex; }
.binding-mode :deep(.el-radio-button) { flex: 1; }
.binding-mode :deep(.el-radio-button__inner) { width: 100%; padding-inline: 6px; }
.binding-table-meta { display: flex; justify-content: space-between; color: var(--text-muted, #8b90a0); font-size: 11px; }
.binding-table-meta strong { color: var(--text-primary, #343849); }
.binding-two-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.binding-clear { justify-self: start; padding-inline: 0; }
</style>
