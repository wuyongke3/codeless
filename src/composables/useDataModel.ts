import { computed, ref, watch, type ComputedRef } from 'vue'
import type { LowCodeProject, LowCodeWidget, QueryResult, TableMeta } from '../types/lowcode'
import { getWidgetConfig } from './widgetConfig'

export function useDataModel(
  currentProject: ComputedRef<LowCodeProject | undefined>,
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void,
) {
  const selectedTableId = ref('')
  const tables = ref<TableMeta[]>([])
  const tableRows = ref<Record<string, unknown>[]>([])
  const tableColumns = ref<string[]>([])
  const tableTotal = ref(0)
  const tableLoading = ref(false)
  const tablePage = ref(0)
  const showRowEditor = ref(false)
  const editingRow = ref<Record<string, unknown> | null>(null)
  const newRowData = ref<Record<string, unknown>>({})
  const tablePageSize = 20

  const selectedTable = computed(() => tables.value.find(table => table.name === selectedTableId.value) ?? tables.value[0])

  async function loadTables() {
    if (!window.lowcode?.listTables) {
      tables.value = []
      if (!selectedTableId.value) selectedTableId.value = tables.value[0]?.name || ''
      return
    }
    try {
      tables.value = await window.lowcode.listTables()
      if (tables.value.length && !selectedTableId.value) selectedTableId.value = tables.value[0].name
    } catch (error) {
      console.error('加载数据表列表失败:', error)
      tables.value = []
      if (!selectedTableId.value) selectedTableId.value = tables.value[0]?.name || ''
    }
  }

  async function loadTableRows(tableName?: string) {
    const table = tableName || selectedTableId.value
    if (!table || (!window.lowcode?.queryRows && !window.lowcode?.refreshTable)) {
      tableRows.value = []
      tableColumns.value = []
      tableTotal.value = 0
      return
    }
    tableLoading.value = true
    try {
      const options = { limit: tablePageSize, offset: tablePage.value * tablePageSize }
      const refreshed = window.lowcode.refreshTable
        ? await window.lowcode.refreshTable(table, options)
        : null
      if (refreshed) {
        tables.value = refreshed.tables
        const result = refreshed.result
        tableColumns.value = result.columns
        tableRows.value = result.rows
        tableTotal.value = result.total
      } else {
        const result = await window.lowcode.queryRows(table, options)
        tableColumns.value = result.columns
        tableRows.value = result.rows
        tableTotal.value = result.total
      }
    } catch (error) {
      console.error('加载数据失败：', error)
      notify('加载数据失败', 'danger')
    } finally {
      tableLoading.value = false
    }
  }

  async function insertTableRow(data: Record<string, unknown>) {
    if (!selectedTableId.value || !window.lowcode?.insertRow) return false
    try {
      await window.lowcode.insertRow({ table: selectedTableId.value, data })
      notify('记录已添加')
      await loadTableRows()
      return true
    } catch (error) {
      console.error(error)
      notify('添加失败', 'danger')
      return false
    }
  }

  async function updateTableRow(id: unknown, data: Record<string, unknown>) {
    if (!selectedTableId.value || !window.lowcode?.updateRow) return false
    try {
      await window.lowcode.updateRow({ table: selectedTableId.value, id, data })
      notify('记录已更新')
      await loadTableRows()
      return true
    } catch (error) {
      console.error(error)
      notify('更新失败', 'danger')
      return false
    }
  }

  async function deleteTableRow(id: unknown) {
    if (!selectedTableId.value || !window.lowcode?.deleteRow) return false
    try {
      await window.lowcode.deleteRow(selectedTableId.value, id)
      notify('记录已删除', 'info')
      await loadTableRows()
      return true
    } catch (error) {
      console.error(error)
      notify('删除失败', 'danger')
      return false
    }
  }

  async function loadWidgetData(widget: LowCodeWidget): Promise<QueryResult | null> {
    const dataSource = getWidgetConfig(widget).data
    if (dataSource.source !== 'table' || !dataSource.table || !window.lowcode?.queryRows) return null
    try {
      return await window.lowcode.queryRows(dataSource.table, {
        columns: Object.values(dataSource.fields || {}).filter(Boolean),
        where: dataSource.where,
        orderBy: dataSource.orderBy,
        limit: dataSource.limit || 10,
        mode: dataSource.mode,
        aggregate: dataSource.aggregate,
      })
    } catch {
      return null
    }
  }

  async function resolveTargetTable(targetTable: string) {
    let targetMeta = tables.value.find(table => table.name === targetTable)
    if (!targetMeta) {
      await loadTables()
      targetMeta = tables.value.find(table => table.name === targetTable)
    }
    return targetMeta
  }

  function buildTableRowData(targetMeta: TableMeta | undefined, values: Record<string, unknown>, mapping: Record<string, string> = {}) {
    if (!currentProject.value || !targetMeta) return {}
    const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '')
    const aliases: Record<string, string[]> = {
      name: ['姓名', '名称', '客户名称', '客户名'],
      contact: ['联系人', '联系人姓名'],
      phone: ['电话', '联系电话', '手机', '手机号', '手机号码'],
      title: ['标题', '工单标题', '问题标题'],
      priority: ['优先级'],
      assignee: ['处理人', '负责人', '经办人'],
      status: ['状态', '业务类型'],
      order_no: ['订单编号', '订单号'],
      amount: ['金额', '订单金额'],
      owner: ['负责人', '所属人'],
    }
    const data: Record<string, unknown> = {}
    for (const widget of currentProject.value.layout.widgets) {
      if (widget.type !== 'input' && widget.type !== 'select') continue
      const config = getWidgetConfig(widget)
      const label = String(config.content.label || config.content.text || widget.name || '')
      const normalizedLabel = normalize(label)
      const byDescription = targetMeta.fields.find(field => normalize(field.description) === normalizedLabel)
      const byName = targetMeta.fields.find(field => normalize(field.name) === normalizedLabel)
      const byAlias = targetMeta.fields.find(field => aliases[field.name]?.some(alias => normalize(alias) === normalizedLabel))
      const mappedName = mapping[widget.id] || config.data.field
      const fieldName = targetMeta.fields.find(field => field.name === mappedName)?.name || byDescription?.name || byName?.name || byAlias?.name
      if (fieldName) data[fieldName] = values[widget.id] ?? (config.data.field ? values[config.data.field] : undefined) ?? config.content.value ?? config.content.defaultValue ?? ''
    }
    return data
  }

  function primaryKeyValue(targetMeta: TableMeta, row: Record<string, unknown>) {
    const primaryKey = targetMeta.fields.find(field => field.isPrimaryKey)?.name
    const key = primaryKey || ['id', '_id', 'uuid'].find(candidate => row[candidate] !== undefined && row[candidate] !== null)
    return key ? { key, value: row[key] } : null
  }

  async function submitValuesToTable(targetTable: string, values: Record<string, unknown>, mapping: Record<string, string> = {}) {
    if (!targetTable || !currentProject.value || (!window.lowcode?.submitForm && !window.lowcode?.insertRow)) return false
    const targetMeta = await resolveTargetTable(targetTable)
    const data = buildTableRowData(targetMeta, values, mapping)
    if (!Object.keys(data).length) {
      notify('未找到可提交的表单字段', 'info')
      return false
    }
    try {
      if (window.lowcode.submitForm) await window.lowcode.submitForm({ table: targetTable, data })
      else await window.lowcode.insertRow({ table: targetTable, data })
      notify('表单数据已提交')
      return true
    } catch (error) {
      console.error(error)
      notify('提交失败', 'danger')
      return false
    }
  }

  async function executeWidgetTableMutation(
    operation: 'create' | 'update' | 'delete',
    tableName: string,
    values: Record<string, unknown>,
    selectedRow?: Record<string, unknown>,
    payload: Record<string, unknown> = {},
  ) {
    if (!tableName || !window.lowcode) return false
    const targetMeta = await resolveTargetTable(tableName)
    if (!targetMeta) {
      notify('未找到目标数据表', 'danger')
      return false
    }

    const primaryKey = targetMeta.fields.find(field => field.isPrimaryKey)?.name
    const formData = buildTableRowData(targetMeta, values)
    const data = { ...formData, ...payload }
    if (primaryKey) delete data[primaryKey]

    if (operation === 'create') {
      if (!window.lowcode.insertRow) return false
      if (!Object.keys(data).length) {
        notify('请先绑定表单字段，或在动作中填写 JSON 数据', 'info')
        return false
      }
      try {
        await window.lowcode.insertRow({ table: tableName, data })
        notify('记录已新增')
        return true
      } catch (error) {
        console.error(error)
        notify('新增失败', 'danger')
        return false
      }
    }

    if (!selectedRow) {
      notify('请先点击目标表格中的一条记录', 'info')
      return false
    }
    const rowIdentifier = primaryKeyValue(targetMeta, selectedRow)
    if (!rowIdentifier || rowIdentifier.value === undefined || rowIdentifier.value === null) {
      notify('当前记录缺少主键，无法执行此操作', 'danger')
      return false
    }

    if (operation === 'update') {
      if (!window.lowcode.updateRow) return false
      if (!Object.keys(data).length) {
        notify('请先绑定表单字段，或在动作中填写 JSON 数据', 'info')
        return false
      }
      try {
        await window.lowcode.updateRow({ table: tableName, id: rowIdentifier.value, data })
        notify('记录已更新')
        return true
      } catch (error) {
        console.error(error)
        notify('更新失败', 'danger')
        return false
      }
    }

    if (!window.lowcode.deleteRow) return false
    try {
      await window.lowcode.deleteRow(tableName, rowIdentifier.value)
      notify('记录已删除', 'info')
      return true
    } catch (error) {
      console.error(error)
      notify('删除失败', 'danger')
      return false
    }
  }

  async function submitFormToTable(buttonWidget: LowCodeWidget, runtimeValues: Record<string, unknown> = {}) {
    const target = getWidgetConfig(buttonWidget).submitTo
    if (!target?.table) return false
    return submitValuesToTable(target.table, runtimeValues, target.fieldMapping)
  }
  watch(selectedTableId, () => {
    tablePage.value = 0
    void loadTableRows()
  })

  return {
    selectedTableId, selectedTable, tables, tableRows, tableColumns, tableTotal, tableLoading, tablePage,
    showRowEditor, editingRow, newRowData, loadTables, loadTableRows, insertTableRow, updateTableRow,
    deleteTableRow, loadWidgetData, submitValuesToTable, executeWidgetTableMutation, submitFormToTable,
  }
}
