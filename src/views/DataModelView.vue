<script setup lang="ts">
import { reactive } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import type { TableField } from '../types/lowcode'

type AppState = Record<string, any>
const props = defineProps<{ ui: AppState }>()
const state = reactive(props.ui)

function startNewRow() {
  const table = state.selectedTable
  if (!table) return
  state.editingRow = null
  state.newRowData = Object.fromEntries(table.fields.filter((field: TableField) => !field.isPrimaryKey).map((field: TableField) => [field.name, '']))
  state.showRowEditor = true
}

function startEditRow(row: Record<string, unknown>) {
  state.editingRow = { ...row }
  state.newRowData = {}
  state.showRowEditor = true
}

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

function rowId(row: Record<string, unknown>) {
  const table = state.selectedTable
  return row[table?.fields.find((field: TableField) => field.isPrimaryKey)?.name || 'id']
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function commitRowEditor() {
  const success = state.editingRow
    ? await state.updateTableRow(rowId(state.editingRow), state.editingRow)
    : await state.insertTableRow(state.newRowData)
  if (success) {
    state.showRowEditor = false
    state.editingRow = null
    state.newRowData = {}
  }
}

async function removeRow(row: Record<string, unknown>) {
  const id = rowId(row)
  if (id === undefined || id === null || id === '') {
    state.notify('记录缺少主键，无法删除', 'danger')
    return
  }
  if (window.confirm('确定要删除这条记录吗？删除后无法恢复。')) await state.deleteTableRow(id)
}
</script>

<template>
      <section class="module-view view-scroll">
        <div class="module-hero"><div><span class="section-kicker">LOCAL DATABASE</span><h2>可视化管理 SQLite 数据</h2><p>定义字段、查看记录并关联页面组件，所有数据仅保存在本机。</p></div><button class="primary-button" @click="state.notify('数据表创建向导已预留', 'info')"><AppIcon name="plus" :size="16" />新建数据表</button></div>
        <div class="database-banner"><span><AppIcon name="database" :size="24" /></span><div><strong>SQLite 本地数据库</strong><p>{{ state.databasePath }}</p></div><em><i></i>已连接</em><button @click="state.notify('数据库路径已复制')"><AppIcon name="copy" :size="16" /></button></div>
        <div class="data-layout">
          <aside class="model-list"><header><strong>数据表</strong><span>{{ state.tables.length }}</span><button @click="state.notify('数据表创建向导已预留', 'info')"><AppIcon name="plus" :size="15" /></button></header><label><AppIcon name="search" :size="15" /><input placeholder="搜索数据表" /></label><button v-for="table in state.tables" :key="table.name" :class="{ active: state.selectedTableId === table.name }" @click="state.selectedTableId = table.name"><span :style="{ background: table.color + '18', color: table.color }"><AppIcon name="table" :size="17" /></span><div><strong>{{ table.title }}</strong><small>{{ table.name }}</small></div><em>{{ table.rowCount.toLocaleString() }}</em></button><footer><AppIcon name="lock" :size="14" />本机 SQLite · 自动保存</footer></aside>
          <article v-if="state.selectedTable" class="schema-card"><header><div><span :style="{ background: state.selectedTable.color + '18', color: state.selectedTable.color }"><AppIcon name="table" :size="20" /></span><div><small>数据表</small><h3>{{ state.selectedTable.title }} <code>{{ state.selectedTable.name }}</code></h3></div></div><button class="subtle-button" @click="state.loadTableRows()"><AppIcon name="save" :size="15" />刷新数据</button></header><div class="schema-stats"><div><small>记录数量</small><strong>{{ state.selectedTable.rowCount.toLocaleString() }}</strong></div><div><small>字段数量</small><strong>{{ state.selectedTable.fields.length }}</strong></div><div><small>存储引擎</small><strong>SQLite 3</strong></div><div><small>当前页</small><strong>{{ state.tableLoading ? '加载中…' : state.tablePage + 1 }}</strong></div></div>
            <div class="schema-table"><div class="schema-row head" :style="{ gridTemplateColumns: 'repeat(' + Math.max(state.tableColumns.length, 1) + ', minmax(100px, 1fr)) 104px' }"><span v-for="column in state.tableColumns" :key="column">{{ column }}</span><span>操作</span></div><div v-if="state.tableLoading" class="schema-row" :style="{ gridTemplateColumns: '1fr' }"><span>正在加载数据…</span></div><div v-else-if="!state.tableRows.length" class="schema-row" :style="{ gridTemplateColumns: '1fr' }"><span>暂无记录，点击“新增记录”开始添加。</span></div><div v-for="row in state.tableRows" :key="String(rowId(row))" class="schema-row" :style="{ gridTemplateColumns: 'repeat(' + Math.max(state.tableColumns.length, 1) + ', minmax(100px, 1fr)) 104px' }"><span v-for="column in state.tableColumns" :key="column" :title="formatCell(row[column])">{{ formatCell(row[column]) }}</span><span><button class="icon-button" title="编辑" @click="startEditRow(row)"><AppIcon name="save" :size="14" /></button><button class="icon-button" title="删除" @click="removeRow(row)"><AppIcon name="trash" :size="14" /></button></span></div></div>
            <div class="add-field-row" style="justify-content: space-between; width: auto; margin-right: 15px"><button class="primary-button compact" @click="startNewRow"><AppIcon name="plus" :size="15" />新增记录</button><div style="display:flex;align-items:center;gap:8px;color:#969aaa;font-size:8px"><span>共 {{ state.tableTotal.toLocaleString() }} 条</span><button class="icon-button" :disabled="state.tablePage === 0" @click="state.tablePage--; state.loadTableRows()"><AppIcon name="chevron-right" :size="14" style="transform:rotate(180deg)" /></button><span>{{ state.tablePage + 1 }}</span><button class="icon-button" :disabled="(state.tablePage + 1) * 20 >= state.tableTotal" @click="state.tablePage++; state.loadTableRows()"><AppIcon name="chevron-right" :size="14" /></button></div></div>
            <div class="schema-table"><div class="schema-row head"><span>字段名称</span><span>数据类型</span><span>说明</span><span>约束</span></div><div v-for="field in state.selectedTable.fields" :key="field.name" class="schema-row"><span><i :class="{ primary: field.isPrimaryKey }">{{ field.isPrimaryKey ? 'PK' : '#' }}</i><strong>{{ field.name }}</strong></span><span><code>{{ field.type }}</code></span><span>{{ field.description }}</span><span><em>{{ field.isPrimaryKey ? 'PRIMARY KEY' : field.isNotNull ? 'NOT NULL' : '—' }}</em></span></div></div><button class="add-field-row" @click="state.notify('字段编辑器已预留', 'info')"><AppIcon name="plus" :size="15" />添加字段</button>
          </article>
          <article v-else class="schema-card" style="padding:30px;text-align:center">暂无可用数据表</article>
        </div>
      </section>
</template>