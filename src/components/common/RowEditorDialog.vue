<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../AppIcon.vue'
import type { TableField } from '../../types/lowcode'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)

function rowEditorValue(field: TableField) {
  const source = state.editingRow || state.newRowData
  return source[field.name] == null ? '' : String(source[field.name])
}

function setRowEditorValue(field: TableField, value: string) {
  const target = state.editingRow || state.newRowData
  if (field.type.toUpperCase().includes('INT') || field.type.toUpperCase().includes('REAL') || field.type.toUpperCase().includes('NUM')) {
    target[field.name] = value.trim() === '' ? null : Number(value)
  } else {
    target[field.name] = value
  }
}

async function commitRowEditor() {
  const table = state.selectedTable
  if (!table) return
  const primaryKey = table.fields.find((field: TableField) => field.isPrimaryKey)?.name || 'id'
  const id = state.editingRow?.[primaryKey]
  const success = state.editingRow
    ? await state.updateTableRow(id, state.editingRow)
    : await state.insertTableRow(state.newRowData)
  if (success) {
    state.showRowEditor = false
    state.editingRow = null
    state.newRowData = {}
  }
}
</script>

<template>
    <Transition name="fade"><div v-if="state.showRowEditor && state.selectedTable" class="modal-backdrop" @click.self="state.showRowEditor = false"><div class="dialog" style="width:min(570px, calc(100vw - 40px))"><header class="create-dialog" style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #ececf1"><div><strong>{{ state.editingRow ? '编辑记录' : '新增记录' }}</strong><p style="margin:3px 0 0;color:#969aaa;font-size:8px">{{ state.selectedTable.title }} · {{ state.selectedTable.name }}</p></div><button @click="state.showRowEditor = false"><AppIcon name="close" :size="18" /></button></header><div class="dialog-body"><label v-for="field in state.selectedTable.fields" v-show="!field.isPrimaryKey || state.editingRow" :key="field.name"><span>{{ field.description || field.name }} <code style="margin-left:4px;color:#969aaa">{{ field.name }}</code></span><input :value="rowEditorValue(field)" :type="field.type.toUpperCase().includes('INT') || field.type.toUpperCase().includes('REAL') || field.type.toUpperCase().includes('NUM') ? 'number' : 'text'" :disabled="field.isPrimaryKey" @input="setRowEditorValue(field, ($event.target as HTMLInputElement).value)" /></label></div><footer style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #ececf1;background:#fafafd"><button class="ghost-button" @click="state.showRowEditor = false">取消</button><button class="primary-button" @click="commitRowEditor">保存记录</button></footer></div></div></Transition>
</template>