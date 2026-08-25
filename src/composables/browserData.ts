import type { BootstrapData, DataQueryOptions, LowCodeApi, LowCodeProject, ProjectFileExportResult, ProjectFileImportResult, LocalAssetImportResult, QueryResult, ReviewPackage, ReviewPackageExportResult, ReviewPackageImportResult, RowInput, TableField, TableMeta, TableRefreshResult } from '../types/lowcode'
import type { DesignExchangeDocument, DesignExchangeExportResult, DesignExchangeImportResult } from '../types/designExchange'
import { parsePluginManifest, type InstalledPlugin, type PluginInstallResult } from '../types/plugin'
import { clone, fallbackBootstrap, makeId } from './utils'
import { normalizeProject } from './widgetConfig'
import { parseCodelessDocument, serializeCodelessDocument } from '../types/projectFile'
import { parseDesignExchangeDocument, serializeDesignExchangeDocument } from '../types/designExchange'

/**
 * 浏览器端降级模式的数据访问层。
 * Electron 模式使用 SQLite；当应用通过 Vite 直接打开或运行在不带 preload 的浏览器环境时，仍提供行为一致的 CRUD / 查询能力。为避免任意执行 SQL 带来的安全风险，这里仅实现受限的查询语法。
 */

export interface BrowserDataApi {
  listTables: () => Promise<TableMeta[]>
  describeTable: (tableName: string) => Promise<TableMeta>
  queryRows: (table: string, options?: DataQueryOptions) => Promise<QueryResult>
  refreshTable: (table: string, options?: DataQueryOptions) => Promise<TableRefreshResult>
  insertRow: (input: RowInput) => Promise<{ success: boolean; id: unknown }>
  updateRow: (input: RowInput & { id: unknown }) => Promise<{ success: boolean }>
  deleteRow: (table: string, id: unknown) => Promise<{ success: boolean }>
  submitForm: (input: RowInput) => Promise<{ success: boolean; id: unknown }>
}

interface BrowserTableDefinition {
  title: string
  color: string
  fields: TableField[]
  rows: Record<string, unknown>[]
}

interface StoredData {
  version: 1
  tables: Record<string, Record<string, unknown>[]>
}

const STORAGE_KEY = 'codeless-browser-data-v1'
const PLUGIN_STORAGE_KEY = 'codeless-browser-plugins-v1'
let memoryStore: StoredData | null = null

function browserPlugins(): InstalledPlugin[] {
  try {
    const raw = localStorage.getItem(PLUGIN_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed as InstalledPlugin[] : []
  } catch {
    return []
  }
}

function saveBrowserPlugins(plugins: InstalledPlugin[]) {
  try {
    localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(plugins))
  } catch {
    // 浏览器隐私模式下保持内存回退
  }
}

function browserPluginFile(): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => resolve(input.files?.[0] || null)
    input.click()
  })
}

async function browserInstallPlugin(): Promise<PluginInstallResult> {
  const file = await browserPluginFile()
  if (!file) return { canceled: true }
  const raw = JSON.parse(await file.text()) as unknown
  const manifest = parsePluginManifest(raw)
  const plugin: InstalledPlugin = {
    manifest,
    status: 'ready',
    installedAt: new Date().toISOString(),
    hasMain: false,
    hasUi: false,
  }
  const plugins = browserPlugins().filter(item => item.manifest.id !== manifest.id)
  plugins.push(plugin)
  saveBrowserPlugins(plugins)
  return { canceled: false, plugin }
}

function field(name: string, type: string, description: string, options: Partial<TableField> = {}): TableField {
  return {
    name,
    type,
    description,
    isPrimaryKey: false,
    isNotNull: false,
    ...options,
  }
}

const TABLE_DEFINITIONS: Record<string, Omit<BrowserTableDefinition, 'rows'>> = {
  customers: {
    title: '客户',
    color: '#665cf6',
    fields: [
      field('id', 'INTEGER', '唯一标识', { isPrimaryKey: true, isNotNull: true }),
      field('name', 'TEXT', '客户名称', { isNotNull: true }),
      field('contact', 'TEXT', '联系人'),
      field('phone', 'TEXT', '联系电话'),
      field('status', 'TEXT', '客户状态'),
      field('owner', 'TEXT', '负责人'),
      field('created_at', 'DATETIME', '创建时间'),
    ],
  },
  orders: {
    title: '订单',
    color: '#20b486',
    fields: [
      field('id', 'INTEGER', '唯一标识', { isPrimaryKey: true, isNotNull: true }),
      field('order_no', 'TEXT', '订单编号', { isNotNull: true }),
      field('customer_id', 'INTEGER', '关联客户'),
      field('amount', 'REAL', '订单金额'),
      field('status', 'TEXT', '订单状态'),
      field('created_at', 'DATETIME', '创建时间'),
    ],
  },
  tickets: {
    title: '售后工单',
    color: '#f59e0b',
    fields: [
      field('id', 'INTEGER', '唯一标识', { isPrimaryKey: true, isNotNull: true }),
      field('title', 'TEXT', '工单标题', { isNotNull: true }),
      field('priority', 'TEXT', '优先级'),
      field('assignee', 'TEXT', '处理人'),
      field('status', 'TEXT', '处理状态'),
      field('updated_at', 'DATETIME', '更新时间'),
    ],
  },
}

const SEED_ROWS: Record<string, Record<string, unknown>[]> = {
  customers: [
    { id: 1, name: '星河科技', contact: '陈晨', phone: '138****1201', status: '已成交', owner: '林晓', created_at: '2026-08-18 09:20:00' },
    { id: 2, name: '云帆网络', contact: '李想', phone: '139****2816', status: '跟进中', owner: '周航', created_at: '2026-08-19 14:05:00' },
    { id: 3, name: '北辰贸易', contact: '王楠', phone: '136****8302', status: '已成交', owner: '林晓', created_at: '2026-08-20 10:32:00' },
    { id: 4, name: '原野设计', contact: '赵晴', phone: '135****6118', status: '待联系', owner: '许言', created_at: '2026-08-21 08:48:00' },
  ],
  orders: [
    { id: 1, order_no: 'SO-20260818-001', customer_id: 1, amount: 12800, status: '已完成', created_at: '2026-08-18 10:10:00' },
    { id: 2, order_no: 'SO-20260819-002', customer_id: 2, amount: 7600, status: '处理中', created_at: '2026-08-19 15:30:00' },
    { id: 3, order_no: 'SO-20260820-003', customer_id: 3, amount: 23500, status: '待付款', created_at: '2026-08-20 11:15:00' },
  ],
  tickets: [
    { id: 1, title: '发票信息需要修正', priority: '普通', assignee: '许言', status: '处理中', updated_at: '2026-08-20 16:20:00' },
    { id: 2, title: '订单到货数量异常', priority: '紧急', assignee: '周航', status: '待处理', updated_at: '2026-08-21 09:05:00' },
    { id: 3, title: '申请补充产品说明', priority: '低', assignee: '林晓', status: '已解决', updated_at: '2026-08-21 10:40:00' },
  ],
}

function canUseStorage() {
  return typeof localStorage !== 'undefined'
}

function readStore(): StoredData {
  if (memoryStore) return memoryStore
  try {
    const stored = canUseStorage() ? localStorage.getItem(STORAGE_KEY) : null
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<StoredData>
      if (parsed.version === 1 && parsed.tables && typeof parsed.tables === 'object') {
        memoryStore = { version: 1, tables: parsed.tables }
        return memoryStore
      }
    }
  } catch {
    // localStorage 可能被隐私模式或浏览器安全策略禁用，降级为内存存储即可。
    }
  memoryStore = {
    version: 1,
    tables: Object.fromEntries(Object.keys(TABLE_DEFINITIONS).map(table => [table, SEED_ROWS[table].map(row => ({ ...row }))])),
  }
  writeStore()
  return memoryStore
}

function writeStore() {
  if (!memoryStore || !canUseStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryStore))
  } catch {
    // 写入失败不影响当前页面继续使用内存数据。
    }
}

function assertTable(tableName: string) {
  if (!TABLE_DEFINITIONS[tableName]) throw new Error(`数据表不存在：${tableName}`)
  return tableName
}

function definition(tableName: string) {
  return TABLE_DEFINITIONS[assertTable(tableName)]
}

function rowsFor(tableName: string) {
  const store = readStore()
  const table = assertTable(tableName)
  if (!Array.isArray(store.tables[table])) store.tables[table] = []
  return store.tables[table]
}

function fieldNames(tableName: string) {
  return new Set(definition(tableName).fields.map(item => item.name))
}

function parseLiteral(value: string) {
  const trimmed = value.trim()
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1).replace(/\\(['"])/g, '$1')
  }
  if (trimmed.toLowerCase() === 'null') return null
  if (trimmed.toLowerCase() === 'true') return true
  if (trimmed.toLowerCase() === 'false') return false
  const number = Number(trimmed)
  return Number.isNaN(number) ? trimmed : number
}

function compare(left: unknown, operator: string, right: unknown) {
  if (operator.toUpperCase() === 'LIKE') {
    const pattern = String(right).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
    return new RegExp(`^${pattern}$`, 'i').test(String(left ?? ''))
  }
  if (left == null || right == null) return operator === '=' ? left == null && right == null : operator === '!=' || operator === '<>' ? left != null || right != null : false
  const numericLeft = typeof left === 'number' ? left : Number(left)
  const numericRight = typeof right === 'number' ? right : Number(right)
  const useNumber = Number.isFinite(numericLeft) && Number.isFinite(numericRight) && String(left).trim() !== '' && String(right).trim() !== ''
  const a = useNumber ? numericLeft : String(left)
  const b = useNumber ? numericRight : String(right)
  if (operator === '=') return a === b
  if (operator === '!=' || operator === '<>') return a !== b
  if (operator === '>') return a > b
  if (operator === '<') return a < b
  if (operator === '>=') return a >= b
  if (operator === '<=') return a <= b
  return false
}

function applyWhere(source: Record<string, unknown>[], tableName: string, where?: string) {
  if (!where?.trim()) return source
  const names = fieldNames(tableName)
  const expressions = where.split(/\s+AND\s+/i).map(item => item.trim()).filter(Boolean)
  const predicates = expressions.map(expression => {
    const match = expression.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(LIKE|!=|<>|>=|<=|=|>|<)\s*(.+)$/i)
    if (!match || !names.has(match[1])) throw new Error(`暂不支持该查询表达式：${expression}`)
    return { field: match[1], operator: match[2].toUpperCase(), value: parseLiteral(match[3]) }
  })
  return source.filter(row => predicates.every(item => compare(row[item.field], item.operator, item.value)))
}

function applyOrder(source: Record<string, unknown>[], tableName: string, orderBy?: string) {
  if (!orderBy?.trim()) return source
  const match = orderBy.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i)
  if (!match || !fieldNames(tableName).has(match[1])) throw new Error(`排序字段不存在：${orderBy}`)
  const direction = (match[2] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1
  return [...source].sort((left, right) => {
    const a = left[match[1]]
    const b = right[match[1]]
    if (a === b) return 0
    if (a == null) return -1 * direction
    if (b == null) return 1 * direction
    return (a < b ? -1 : 1) * direction
  })
}

function tableMeta(tableName: string): TableMeta {
  const item = definition(tableName)
  return { name: tableName, title: item.title, color: item.color, fields: item.fields.map(field => ({ ...field })), rowCount: rowsFor(tableName).length }
}

function queryRows(tableName: string, options: DataQueryOptions = {}): QueryResult {
  const table = assertTable(tableName)
  const source = applyOrder(applyWhere(rowsFor(table).map(row => ({ ...row })), table, options.where), table, options.orderBy)
  const total = source.length
  const mode = options.mode || 'list'
  if (mode === 'count') return { columns: ['count'], rows: [{ count: total }], total }
  if (mode === 'aggregate') {
    const aggregate = options.aggregate?.function || 'count'
    if (aggregate === 'count') return { columns: ['value'], rows: [{ value: total }], total }
    const aggregateField = options.aggregate?.field
    if (!aggregateField || !fieldNames(table).has(aggregateField)) throw new Error(`聚合字段不存在：${aggregateField || ''}`)
    const numbers = source.map(row => Number(row[aggregateField])).filter(value => Number.isFinite(value))
    const value = aggregate === 'sum'
      ? numbers.reduce((sum, current) => sum + current, 0)
      : aggregate === 'avg'
        ? (numbers.length ? numbers.reduce((sum, current) => sum + current, 0) / numbers.length : 0)
        : aggregate === 'min'
          ? (numbers.length ? Math.min(...numbers) : 0)
          : numbers.length ? Math.max(...numbers) : 0
    return { columns: ['value'], rows: [{ value }], total }
  }
  const columns = (options.columns?.length ? options.columns : definition(table).fields.map(item => item.name)).filter(column => fieldNames(table).has(column))
  const selected = mode === 'single' ? source.slice(0, 1) : source.slice(Math.max(0, options.offset || 0), Math.max(0, options.offset || 0) + Math.min(200, Math.max(1, options.limit || 50)))
  return { columns, rows: selected.map(row => Object.fromEntries(columns.map(column => [column, row[column]]))), total }
}

function writableData(tableName: string, data: Record<string, unknown>) {
  const fields = definition(tableName).fields
  const allowed = new Set(fields.map(item => item.name))
  const primaryKeys = new Set(fields.filter(item => item.isPrimaryKey).map(item => item.name))
  const entries = Object.entries(data || {}).filter(([key, value]) => {
    if (!allowed.has(key)) throw new Error(`写入字段不存在：${key}`)
    return !primaryKeys.has(key) && value !== undefined
  })
  if (!entries.length) throw new Error('没有可写入的数据')
  return entries
}

export const browserDataApi: BrowserDataApi = {
  async listTables() {
    return Object.keys(TABLE_DEFINITIONS).map(tableMeta)
  },
  async describeTable(tableName) {
    return tableMeta(tableName)
  },
  async queryRows(table, options) {
    return queryRows(table, options)
  },
  async refreshTable(table, options) {
    return { tables: Object.keys(TABLE_DEFINITIONS).map(tableMeta), result: queryRows(table, options) }
  },
  async insertRow(input) {
    const rows = rowsFor(input.table)
    const entries = writableData(input.table, input.data)
    const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
    const record: Record<string, unknown> = { id }
    entries.forEach(([key, value]) => { record[key] = value })
    const fields = definition(input.table).fields.map(item => item.name)
    const timestampField = fields.includes('created_at') ? 'created_at' : fields.includes('updated_at') ? 'updated_at' : ''
    if (timestampField && record[timestampField] == null) record[timestampField] = new Date().toISOString().slice(0, 19).replace('T', ' ')
    rows.push(record)
    writeStore()
    return { success: true, id }
  },
  async updateRow(input) {
    const rows = rowsFor(input.table)
    const target = rows.find(row => String(row.id) === String(input.id))
    if (!target) throw new Error('未找到待更新记录')
    writableData(input.table, input.data).forEach(([key, value]) => { target[key] = value })
    writeStore()
    return { success: true }
  },
  async deleteRow(table, id) {
    const rows = rowsFor(table)
    const index = rows.findIndex(row => String(row.id) === String(id))
    if (index < 0) throw new Error('未找到待删除记录')
    rows.splice(index, 1)
    writeStore()
    return { success: true }
  },
  async submitForm(input) {
    return browserDataApi.insertRow(input)
  },
}

const PROJECT_STORAGE_KEY = 'codeless-projects'
let memoryProjects: LowCodeProject[] | null = null

function readBrowserProjects() {
  if (memoryProjects) return memoryProjects.map(clone)
  if (typeof localStorage === 'undefined') return [] as LowCodeProject[]
  try {
    const stored = localStorage.getItem(PROJECT_STORAGE_KEY)
    memoryProjects = stored ? (JSON.parse(stored) as LowCodeProject[]).map(normalizeProject) : []
  } catch {
    memoryProjects = []
  }
  return memoryProjects.map(clone)
}

function writeBrowserProjects(projects: LowCodeProject[]) {
  memoryProjects = projects.map(project => normalizeProject(clone(project)))
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(memoryProjects))
  } catch {
    // 浏览器端存储失败时，保留当前会话内的内存数据。
    }
}

function browserBootstrap(): BootstrapData {
  const projects = readBrowserProjects()
  if (projects.length) return { projects, activities: [], databasePath: '浏览器演示模式 · localStorage' }
  const fallback = fallbackBootstrap()
  const normalized = fallback.projects.map(normalizeProject)
  writeBrowserProjects(normalized)
  return { ...fallback, projects: normalized, databasePath: '浏览器演示模式 · localStorage' }
}

export function browserSaveProject(project: LowCodeProject) {
  if (!project?.id || !project?.name || !project?.layout) throw new Error('应用数据不完整')
  const projects = readBrowserProjects()
  const normalized = normalizeProject(clone(project))
  const index = projects.findIndex(item => item.id === normalized.id)
  if (index >= 0) projects[index] = normalized
  else projects.unshift(normalized)
  writeBrowserProjects(projects)
  return normalized
}

export async function browserExportProject(project: LowCodeProject): Promise<ProjectFileExportResult> {
  const content = serializeCodelessDocument(project)
  if (typeof document === 'undefined') throw new Error('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u672c\u5730\u6587\u4ef6\u4e0b\u8f7d')
  const safeName = project.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '') || 'codeless-project'
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeName}.codeless`
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return { canceled: false }
}

export async function browserExportDesignExchange(documentFile: DesignExchangeDocument): Promise<DesignExchangeExportResult> {
  if (typeof document === 'undefined') throw new Error('当前环境不支持导出设计交换文件')
  const safeName = documentFile.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '') || 'codeless-design'
  const content = serializeDesignExchangeDocument(documentFile)
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeName}.codeless-design.json`
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return { canceled: false }
}

export async function browserImportDesignExchange(): Promise<DesignExchangeImportResult> {
  if (typeof document === 'undefined') throw new Error('当前环境不支持导出设计交换文件??')
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    let settled = false
    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
    }
    const finish = (result: DesignExchangeImportResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const onWindowFocus = () => window.setTimeout(() => finish({ canceled: true }), 350)
    input.type = 'file'
    input.accept = '.json,.codeless-design.json,application/json'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) {
        finish({ canceled: true })
        return
      }
      if (file.size > 25 * 1024 * 1024) {
        cleanup()
        reject(new Error('设计交换文件不能超过 25 MB'))
        return
      }
      try {
        const designDocument = parseDesignExchangeDocument(await file.text())
        finish({ canceled: false, filePath: file.name, document: designDocument })
      } catch (error) {
        cleanup()
        reject(error)
      }
    }, { once: true })
    window.addEventListener('focus', onWindowFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

export async function browserExportReviewPackage(reviewPackage: ReviewPackage): Promise<ReviewPackageExportResult> {
  if (typeof document === 'undefined') throw new Error('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u5ba1\u9605\u5305\u4e0b\u8f7d')
  const safeName = reviewPackage.project.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '') || 'codeless-review'
  const content = JSON.stringify(reviewPackage, null, 2) + '\n'
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeName}.codeless-review.json`
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return { canceled: false }
}
export async function browserImportReviewPackage(): Promise<ReviewPackageImportResult> {
  if (typeof document === 'undefined') throw new Error('Current environment does not support local review package import')
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    let settled = false
    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
    }
    const finish = (result: ReviewPackageImportResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const onWindowFocus = () => window.setTimeout(() => finish({ canceled: true }), 350)
    input.type = 'file'
    input.accept = '.json,application/json'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return finish({ canceled: true })
      if (file.size > 50 * 1024 * 1024) {
        cleanup()
        reject(new Error('Review package exceeds 50 MB and was rejected'))
        return
      }
      try {
        finish({ canceled: false, filePath: file.name, reviewPackage: JSON.parse(await file.text()) })
      } catch {
        cleanup()
        reject(new Error('Review package is not valid JSON'))
      }
    }, { once: true })
    window.addEventListener('focus', onWindowFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

export async function browserImportAsset(): Promise<LocalAssetImportResult> {
  if (typeof document === 'undefined') throw new Error('当前环境不支持本地素材导入')
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      input.remove()
      if (!file) {
        resolve({ canceled: true })
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error('本地素材超过 10 MB，已拒绝读取'))
        return
      }
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error || new Error('读取本地素材失败'))
      reader.onload = () => resolve({
        canceled: false,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
      })
      reader.readAsDataURL(file)
    }, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

export async function browserImportProject(): Promise<ProjectFileImportResult> {
  if (typeof document === 'undefined') throw new Error('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u672c\u5730\u6587\u4ef6\u5bfc\u5165')
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    let settled = false
    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
    }
    const finish = (result: ProjectFileImportResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const onWindowFocus = () => {
      // A canceled chooser normally emits focus without input change.
      window.setTimeout(() => finish({ canceled: true }), 350)
    }
    input.type = 'file'
    input.accept = '.codeless,.json,application/json'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) {
        finish({ canceled: true })
        return
      }
      try {
        const documentFile = parseCodelessDocument(await file.text())
        finish({ canceled: false, filePath: file.name, schemaVersion: documentFile.schemaVersion, project: documentFile.project })
      } catch (error) {
        cleanup()
        reject(error)
      }
    })
    window.addEventListener('focus', onWindowFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

function browserDuplicateProject(projectId: string) {
  const source = readBrowserProjects().find(project => project.id === projectId)
  if (!source) throw new Error('应用不存在')
  const createdAt = new Date().toISOString()
  const copy = normalizeProject({
    ...clone(source),
    id: makeId('project'),
    name: `${source.name} 副本`,
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
  })
  const projects = readBrowserProjects()
  projects.unshift(copy)
  writeBrowserProjects(projects)
  return copy
}

function browserDeleteProject(projectId: string) {
  const projects = readBrowserProjects()
  if (!projects.some(project => project.id === projectId)) throw new Error('应用不存在')
  writeBrowserProjects(projects.filter(project => project.id !== projectId))
  return { success: true }
}

let browserCollaborationSession: import('../types/collaboration').CollaborationSession | null = null
const browserCollaborationListeners = new Set<(event: import('../types/collaboration').CollaborationEvent) => void>()
const browserCollaborationChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('codeless-collaboration-v1') : null
browserCollaborationChannel?.addEventListener('message', event => {
  const message = event.data as { sessionId?: string; event?: import('../types/collaboration').CollaborationEvent }
  if (!browserCollaborationSession || message.sessionId !== browserCollaborationSession.id || !message.event) return
  for (const listener of browserCollaborationListeners) listener(message.event)
})

const browserCollaboration: import('../types/collaboration').CollaborationApi = {
  async createSession(input) {
    browserCollaborationSession = {
      id: makeId('session'), projectId: input.project.id, mode: input.mode, role: 'host', host: '本机浏览器',
      token: makeId('token'), createdAt: new Date().toISOString(), participants: [],
    }
    return browserCollaborationSession
  },
  async joinSession(input) {
    if (input.token !== browserCollaborationSession?.token || input.sessionId !== browserCollaborationSession?.id) throw new Error('协作会话凭证无效')
    if (!browserCollaborationSession) throw new Error('当前没有活动协作会话')
    browserCollaborationSession = { ...browserCollaborationSession, role: 'guest' }
    return browserCollaborationSession
  },
  async getSession() { return browserCollaborationSession },
  async publishProject(project) {
    if (!browserCollaborationSession) throw new Error('协作会话尚未建立')
    browserCollaborationChannel?.postMessage({ sessionId: browserCollaborationSession.id, event: { type: 'project-update', project, originId: 'browser', updatedAt: project.updatedAt } })
    return { success: true }
  },
  async leaveSession() { browserCollaborationSession = null; return { success: true } },
  async openWindow() { throw new Error('浏览器回退模式不支持打开协作窗口') },
  onEvent(listener) { browserCollaborationListeners.add(listener); return () => browserCollaborationListeners.delete(listener) },
}

const browserWindowControls = {
  minimize: async () => ({ success: false }),
  toggleMaximize: async () => ({ maximized: false }),
  close: async () => ({ success: false }),
  getState: async () => ({ maximized: false }),
  onStateChange: (_listener: (state: { maximized: boolean }) => void) => () => undefined,
}

export const browserApi: LowCodeApi = {
  window: browserWindowControls,
  bootstrap: async () => browserBootstrap(),
  saveProject: async project => browserSaveProject(project),
  exportProject: browserExportProject,
  exportReviewPackage: browserExportReviewPackage,
  importReviewPackage: browserImportReviewPackage,
  exportDesignExchange: browserExportDesignExchange,
  importAsset: browserImportAsset,
  importProject: browserImportProject,
  importDesignExchange: browserImportDesignExchange,
  duplicateProject: async projectId => browserDuplicateProject(projectId),
  deleteProject: async projectId => browserDeleteProject(projectId),
  publishService: async () => ({ success: false }),
  stopPublishedService: async () => ({ success: false }),
  getPublishedServices: async () => [],
  ...browserDataApi,
  listPlugins: async () => browserPlugins(),
  installPlugin: browserInstallPlugin,
  removePlugin: async id => {
    saveBrowserPlugins(browserPlugins().filter(plugin => plugin.manifest.id !== id))
    return { success: true }
  },
  setPluginEnabled: async (id, enabled) => {
    const plugins = browserPlugins()
    const plugin = plugins.find(item => item.manifest.id === id)
    if (!plugin) throw new Error('插件不存在')
    plugin.status = enabled ? 'ready' : 'disabled'
    saveBrowserPlugins(plugins)
    return plugin
  },
  getPluginUiUrl: async () => null,
  collaboration: browserCollaboration,
}


