<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import type { LowCodeWidget, TableField, WidgetColumn } from '../../types/lowcode'
import { getWidgetConfig } from '../../composables/widgetConfig'

const props = defineProps<{
  widget: LowCodeWidget
  fields?: TableField[]
}>()

const emit = defineEmits<{
  update: [columns: WidgetColumn[]]
}>()

const columns = computed<WidgetColumn[]>(() => getWidgetConfig(props.widget).content.columns || [])
const fieldByName = computed(() => new Map((props.fields || []).map(field => [field.name, field])))
const availableFields = computed(() => props.fields || [])

function columnTitle(key: string) {
  return fieldByName.value.get(key)?.description || key || '未命名列'
}

function cleanWidth(value: number | string) {
  const width = Number(value)
  return Number.isFinite(width) && width > 0 ? Math.min(2000, Math.round(width)) : undefined
}

function emitColumns(next: WidgetColumn[]) {
  emit('update', next.map(column => ({
    key: String(column.key || '').trim(),
    label: String(column.label || column.key || '').trim(),
    ...(cleanWidth(column.width || 0) ? { width: cleanWidth(column.width || 0) } : {}),
    ...(column.align ? { align: column.align } : {}),
  })).filter(column => column.key))
}

function updateColumn(index: number, patch: Partial<WidgetColumn>) {
  emitColumns(columns.value.map((column, currentIndex) => currentIndex === index
    ? { ...column, ...patch, ...(patch.key !== undefined && !patch.label ? { label: columnTitle(String(patch.key)) } : {}) }
    : column))
}

function addColumn() {
  const usedKeys = new Set(columns.value.map(column => column.key))
  const field = availableFields.value.find(item => !usedKeys.has(item.name))
  const key = field?.name || `field_${columns.value.length + 1}`
  emitColumns([...columns.value, { key, label: field?.description || key }])
}

function removeColumn(index: number) {
  emitColumns(columns.value.filter((_, currentIndex) => currentIndex !== index))
}

function moveColumn(index: number, direction: -1 | 1) {
  const destination = index + direction
  if (destination < 0 || destination >= columns.value.length) return
  const next = [...columns.value]
  const [column] = next.splice(index, 1)
  next.splice(destination, 0, column)
  emitColumns(next)
}

function syncFields() {
  if (!availableFields.value.length) return
  const existing = new Map(columns.value.map(column => [column.key, column]))
  emitColumns(availableFields.value.map(field => ({
    ...existing.get(field.name),
    key: field.name,
    label: existing.get(field.name)?.label || field.description || field.name,
  })))
}
</script>

<template>
  <div class="table-columns-editor">
    <div class="table-columns-heading">
      <div><strong>显示列</strong><small>按顺序配置字段、标题和对齐方式</small></div>
      <span class="table-column-count">{{ columns.length }} 列</span>
    </div>

    <div v-if="!columns.length" class="table-columns-empty">
      <AppIcon name="table" :size="16" />
      <span>还没有显示列</span>
      <button type="button" class="text-button compact" @click="addColumn">添加第一列</button>
    </div>

    <div v-else class="table-column-list">
      <article v-for="(column, index) in columns" :key="`${column.key}-${index}`" class="table-column-card">
        <header>
          <span>{{ index + 1 }}</span>
          <strong>{{ column.label || columnTitle(column.key) }}</strong>
          <div class="table-column-actions">
            <button type="button" title="上移" :disabled="index === 0" @click="moveColumn(index, -1)"><AppIcon name="arrow-up" :size="13" /></button>
            <button type="button" title="下移" :disabled="index === columns.length - 1" @click="moveColumn(index, 1)"><AppIcon name="arrow-down" :size="13" /></button>
            <button type="button" title="删除列" class="danger" @click="removeColumn(index)"><AppIcon name="trash" :size="13" /></button>
          </div>
        </header>
        <div class="table-column-fields">
          <label>
            <span>字段</span>
            <select v-if="availableFields.length" :value="column.key" @change="updateColumn(index, { key: ($event.target as HTMLSelectElement).value })">
              <option v-for="field in availableFields" :key="field.name" :value="field.name">{{ field.description || field.name }}（{{ field.name }}）</option>
            </select>
            <input v-else :value="column.key" placeholder="字段名" @input="updateColumn(index, { key: ($event.target as HTMLInputElement).value })" />
          </label>
          <label>
            <span>表头</span>
            <input :value="column.label" placeholder="显示名称" @input="updateColumn(index, { label: ($event.target as HTMLInputElement).value })" />
          </label>
          <label>
            <span>宽度</span>
            <input :value="column.width || ''" type="number" min="40" max="2000" step="1" placeholder="自动" @input="updateColumn(index, { width: cleanWidth(($event.target as HTMLInputElement).value) })" />
          </label>
          <label>
            <span>对齐</span>
            <select :value="column.align || 'left'" @change="updateColumn(index, { align: ($event.target as HTMLSelectElement).value as WidgetColumn['align'] })">
              <option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option>
            </select>
          </label>
        </div>
      </article>
    </div>

    <div class="table-columns-footer">
      <button type="button" class="ghost-button compact" @click="addColumn"><AppIcon name="plus" :size="13" />添加列</button>
      <button v-if="availableFields.length" type="button" class="text-button compact" @click="syncFields"><AppIcon name="database" :size="13" />同步全部字段</button>
    </div>
    <small class="field-help">绑定数据表后，先选择查询字段，再在这里调整展示顺序和表头文案。</small>
  </div>
</template>

<style scoped>
.table-columns-editor { display: grid; gap: 9px; padding: 10px; border: 1px solid var(--line, #e8eaf0); border-radius: 10px; background: color-mix(in srgb, var(--panel, #fff) 88%, var(--surface, #f7f8fb)); }
.table-columns-heading, .table-column-card > header, .table-columns-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.table-columns-heading strong { display: block; color: var(--text-primary, #343849); font-size: 12px; }
.table-columns-heading small { display: block; margin-top: 2px; color: var(--text-muted, #8b90a0); font-size: 10px; }
.table-column-count { padding: 2px 6px; border-radius: 999px; background: #eeeefe; color: #655ee9; font-size: 10px; font-weight: 700; white-space: nowrap; }
.table-column-list { display: grid; gap: 7px; }
.table-column-card { padding: 8px; border: 1px solid var(--line, #e8eaf0); border-radius: 8px; background: var(--panel, #fff); }
.table-column-card > header > span { display: inline-grid; width: 18px; height: 18px; place-items: center; border-radius: 5px; background: #f0f1f7; color: var(--text-muted, #8b90a0); font-size: 10px; font-weight: 700; }
.table-column-card > header > strong { flex: 1; min-width: 0; overflow: hidden; color: var(--text-primary, #343849); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.table-column-actions { display: flex; gap: 2px; }
.table-column-actions button { display: inline-grid; width: 22px; height: 22px; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted, #8b90a0); cursor: pointer; }
.table-column-actions button:hover:not(:disabled) { background: #f0efff; color: #655ee9; }
.table-column-actions button.danger:hover:not(:disabled) { background: #fff0f2; color: #e34d6f; }
.table-column-actions button:disabled { cursor: not-allowed; opacity: .35; }
.table-column-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
.table-column-fields label { display: grid; gap: 3px; min-width: 0; }
.table-column-fields label > span { color: var(--text-muted, #8b90a0); font-size: 10px; }
.table-column-fields input, .table-column-fields select { width: 100%; min-width: 0; height: 27px; padding: 0 7px; border: 1px solid var(--line, #e8eaf0); border-radius: 6px; outline: none; background: var(--panel, #fff); color: var(--text-primary, #343849); font-size: 11px; }
.table-column-fields input:focus, .table-column-fields select:focus { border-color: #8d82ef; box-shadow: 0 0 0 2px #8d82ef1f; }
.table-columns-footer { justify-content: flex-start; }
.table-columns-empty { display: flex; align-items: center; gap: 6px; min-height: 42px; padding: 8px; border: 1px dashed var(--line, #e8eaf0); border-radius: 8px; color: var(--text-muted, #8b90a0); font-size: 11px; }
.table-columns-empty .text-button { margin-left: auto; }
@media (max-width: 360px) { .table-column-fields { grid-template-columns: 1fr; } }
</style>
