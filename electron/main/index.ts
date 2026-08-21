import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import type { DataQuery, DataQueryOptions, RowInput, TableField, TableMeta } from '../../src/types/lowcode'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

if (process.platform === 'win32' && os.release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let database: DatabaseSync | null = null
let databasePath = ''

const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
const appIcon = path.join(process.env.VITE_PUBLIC, 'logo.png')
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const now = () => new Date().toISOString()
const isSmokeTest = process.env.CODELESS_SMOKE_TEST === '1'

const TABLE_PRESENTATION: Record<string, { title: string; color: string; descriptions: Record<string, string> }> = {
  customers: {
    title: '客户', color: '#665cf6', descriptions: {
      id: '主键，自增', name: '客户名称', contact: '联系人', phone: '联系电话', status: '客户状态', owner: '负责人', created_at: '创建时间',
    },
  },
  orders: {
    title: '订单', color: '#20b486', descriptions: {
      id: '主键，自增', order_no: '订单编号', customer_id: '关联客户', amount: '订单金额', status: '订单状态', created_at: '创建时间',
    },
  },
  tickets: {
    title: '售后工单', color: '#f59e0b', descriptions: {
      id: '主键，自增', title: '工单标题', priority: '优先级', assignee: '处理人', status: '处理状态', updated_at: '更新时间',
    },
  },
}
const BUSINESS_TABLES = new Set(Object.keys(TABLE_PRESENTATION))

function starterLayout(kind: 'crm' | 'orders' | 'blank' = 'blank') {
  const base = {
    version: 1,
    pageName: kind === 'orders' ? '订单概览' : kind === 'crm' ? '客户列表' : '未命名页面',
    canvas: { width: 960, height: 720, background: '#f7f8fb' },
    widgets: [] as Array<Record<string, unknown>>,
  }

  if (kind === 'blank') return base

  base.widgets = [
    {
      id: makeId('widget'), type: 'heading', name: '页面标题', x: 48, y: 42, w: 500, h: 52,
      props: { text: kind === 'crm' ? '客户管理' : '订单中心', description: kind === 'crm' ? '维护客户资料与跟进状态' : '查看和处理全部客户订单', fontSize: 28, align: 'left' },
    },
    {
      id: makeId('widget'), type: 'button', name: '主要按钮', x: 758, y: 46, w: 154, h: 42,
      props: { text: kind === 'crm' ? '+ 新建客户' : '+ 创建订单', variant: 'primary', accent: '#665cf6', radius: 10 },
    },
    {
      id: makeId('widget'), type: 'stat', name: '数据指标', x: 48, y: 126, w: 260, h: 122,
      props: { text: kind === 'crm' ? '客户总数' : '本月订单', value: kind === 'crm' ? '1,284' : '2,408', trend: '+12.8%', accent: '#665cf6' },
    },
    {
      id: makeId('widget'), type: 'stat', name: '数据指标', x: 326, y: 126, w: 260, h: 122,
      props: { text: kind === 'crm' ? '本月新增' : '待处理', value: kind === 'crm' ? '86' : '126', trend: '+8.4%', accent: '#20b486' },
    },
    {
      id: makeId('widget'), type: 'stat', name: '数据指标', x: 604, y: 126, w: 308, h: 122,
      props: { text: kind === 'crm' ? '转化率' : '成交金额', value: kind === 'crm' ? '32.6%' : '¥ 486,920', trend: '+5.1%', accent: '#f59e0b' },
    },
    {
      id: makeId('widget'), type: 'input', name: '搜索框', x: 48, y: 280, w: 330, h: 44,
      props: { text: kind === 'crm' ? '搜索客户' : '搜索订单', placeholder: kind === 'crm' ? '输入客户名称或联系人' : '输入订单号或客户名称', radius: 9 },
    },
    {
      id: makeId('widget'), type: 'select', name: '筛选器', x: 396, y: 280, w: 180, h: 44,
      props: { text: '全部状态', options: '全部状态,跟进中,已成交,已流失', radius: 9 },
    },
    {
      id: makeId('widget'), type: 'table', name: '数据表格', x: 48, y: 348, w: 864, h: 300,
      props: { columns: kind === 'crm' ? ['客户名称', '联系人', '状态', '最后跟进', '负责人'] : ['订单编号', '客户名称', '金额', '状态', '创建时间'], accent: '#665cf6', radius: 12 },
    },
  ]

  return base
}

function getDatabase() {
  if (!database) throw new Error('数据库尚未初始化')
  return database
}

function assertValidIdentifier(value: string, label = '字段名') {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`非法${label}`)
  return value
}

function assertValidTableName(table: string) {
  const safeTable = assertValidIdentifier(String(table || ''), '数据表名')
  if (!BUSINESS_TABLES.has(safeTable)) throw new Error('不允许操作该数据表')
  return safeTable
}

function quoteIdentifier(value: string) { return `"${assertValidIdentifier(value)}"` }

function getTableFields(table: string): TableField[] {
  const safeTable = assertValidTableName(table)
  const presentation = TABLE_PRESENTATION[safeTable]
  const rows = getDatabase().prepare(`PRAGMA table_info(${quoteIdentifier(safeTable)})`).all() as Array<Record<string, unknown>>
  if (!rows.length) throw new Error('数据表不存在')
  return rows.map(row => ({
    name: String(row.name),
    type: String(row.type || 'TEXT').toUpperCase(),
    description: presentation.descriptions[String(row.name)] || '',
    isPrimaryKey: Number(row.pk) > 0,
    isNotNull: Number(row.notnull) > 0,
  }))
}

function getPrimaryKey(table: string) {
  const primaryKey = getTableFields(table).find(field => field.isPrimaryKey)
  if (!primaryKey) throw new Error('数据表缺少主键，无法执行写操作')
  return primaryKey.name
}

function seedTable(table: string, rows: Array<Record<string, unknown>>) {
  const safeTable = assertValidTableName(table)
  const count = getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(safeTable)}`).get() as { count: number }
  if (Number(count.count) > 0) return
  for (const row of rows) insertBusinessRow({ table: safeTable, data: row })
}

function initializeDatabase() {
  databasePath = path.join(app.getPath('userData'), 'codeless.sqlite')
  database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      category TEXT NOT NULL DEFAULT '业务应用',
      layout_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      status TEXT,
      owner TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL,
      customer_id INTEGER,
      amount REAL,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      priority TEXT,
      assignee TEXT,
      status TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const row = getDatabase().prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number }
  if (Number(row.count) === 0) seedDatabase()
  seedBusinessData()
}

function seedDatabase() {
  const createdAt = now()
  const insert = getDatabase().prepare(`
    INSERT INTO projects (id, name, description, status, category, layout_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const seeds = [
    ['project_crm', '客户管理系统', '统一管理客户资料、跟进记录与销售机会', 'published', '客户运营', starterLayout('crm')],
    ['project_orders', '订单协同中心', '订单审核、履约跟踪与异常处理', 'draft', '订单管理', starterLayout('orders')],
    ['project_blank', '售后工单台', '售后问题登记与流转处理', 'draft', '服务支持', starterLayout('blank')],
  ] as const

  for (const [id, name, description, status, category, layout] of seeds) {
    insert.run(id, name, description, status, category, JSON.stringify(layout), createdAt, createdAt)
  }
  getDatabase().prepare(`INSERT INTO activities (project_id, project_name, action, created_at) VALUES (?, ?, ?, ?)`)
    .run('project_crm', '客户管理系统', '已发布新版本', createdAt)
}

function seedBusinessData() {
  seedTable('customers', [
    { name: '星河科技', contact: '陈晨', phone: '138****1201', status: '已成交', owner: '林晓', created_at: '2026-08-18 09:20:00' },
    { name: '云帆网络', contact: '李想', phone: '139****2816', status: '跟进中', owner: '周航', created_at: '2026-08-19 14:05:00' },
    { name: '北辰贸易', contact: '王楠', phone: '136****8302', status: '已成交', owner: '林晓', created_at: '2026-08-20 10:32:00' },
    { name: '原野设计', contact: '赵晴', phone: '135****6118', status: '待联系', owner: '许言', created_at: '2026-08-21 08:48:00' },
  ])
  seedTable('orders', [
    { order_no: 'SO-20260818-001', customer_id: 1, amount: 12800, status: '已完成', created_at: '2026-08-18 10:10:00' },
    { order_no: 'SO-20260819-002', customer_id: 2, amount: 7600, status: '处理中', created_at: '2026-08-19 15:30:00' },
    { order_no: 'SO-20260820-003', customer_id: 3, amount: 23500, status: '待付款', created_at: '2026-08-20 11:15:00' },
  ])
  seedTable('tickets', [
    { title: '发票信息需要修改', priority: '普通', assignee: '许言', status: '处理中', updated_at: '2026-08-20 16:20:00' },
    { title: '订单到货数量异常', priority: '紧急', assignee: '周航', status: '待处理', updated_at: '2026-08-21 09:05:00' },
    { title: '申请补充产品说明', priority: '低', assignee: '林晓', status: '已解决', updated_at: '2026-08-21 10:40:00' },
  ])
}

function mapProject(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    status: row.status === 'published' ? 'published' : 'draft',
    category: String(row.category),
    layout: JSON.parse(String(row.layout_json)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function getProject(projectId: string) {
  const row = getDatabase().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined
  if (!row) throw new Error('未找到应用')
  return mapProject(row)
}

function recordActivity(projectId: string, projectName: string, action: string) {
  getDatabase().prepare(`INSERT INTO activities (project_id, project_name, action, created_at) VALUES (?, ?, ?, ?)`)
    .run(projectId, projectName, action, now())
}

function listBusinessTables(): TableMeta[] {
  return [...BUSINESS_TABLES].map(name => {
    const presentation = TABLE_PRESENTATION[name]
    const row = getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get() as { count: number }
    return { name, title: presentation.title, color: presentation.color, fields: getTableFields(name), rowCount: Number(row.count) }
  })
}

function describeBusinessTable(tableName: string): TableMeta {
  const table = assertValidTableName(tableName)
  const presentation = TABLE_PRESENTATION[table]
  const row = getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as { count: number }
  return { name: table, title: presentation.title, color: presentation.color, fields: getTableFields(table), rowCount: Number(row.count) }
}

function parseWhere(where: string | undefined, fields: Set<string>) {
  const value = where?.trim()
  if (!value) return { sql: '', params: [] as Array<string | number | null> }
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(=|!=|<>|>=|<=|>|<)\s*(?:(['"])([^'"]*)\3|(-?\d+(?:\.\d+)?)|(null))$/i)
  if (!match) throw new Error('过滤条件仅支持单个字段与 =、!=、>、>=、<、<= 比较')
  const field = assertValidIdentifier(match[1])
  if (!fields.has(field)) throw new Error(`过滤字段不存在：${field}`)
  const operator = match[2] === '<>' ? '!=' : match[2]
  if (match[6]) {
    if (!['=', '!='].includes(operator)) throw new Error('NULL 仅支持 = 或 != 比较')
    return { sql: `${quoteIdentifier(field)} IS ${operator === '!=' ? 'NOT ' : ''}NULL`, params: [] as Array<string | number | null> }
  }
  const parameter = match[5] === undefined ? match[4] : Number(match[5])
  return { sql: `${quoteIdentifier(field)} ${operator} ?`, params: [parameter] }
}

function parseOrderBy(orderBy: string | undefined, fields: Set<string>) {
  const value = orderBy?.trim()
  if (!value) return ''
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i)
  if (!match) throw new Error('排序格式应为“字段名”或“字段名 DESC”')
  const field = assertValidIdentifier(match[1])
  if (!fields.has(field)) throw new Error(`排序字段不存在：${field}`)
  return `${quoteIdentifier(field)} ${(match[2] || 'ASC').toUpperCase()}`
}

function queryBusinessData(query: DataQuery) {
  const table = assertValidTableName(query?.table)
  const tableFields = getTableFields(table)
  const fieldNames = new Set(tableFields.map(field => field.name))
  const selectedColumns = query.columns?.length ? query.columns.map(column => {
    const field = assertValidIdentifier(column)
    if (!fieldNames.has(field)) throw new Error(`查询字段不存在：${field}`)
    return field
  }) : tableFields.map(field => field.name)
  const where = parseWhere(query.where, fieldNames)
  const whereSql = where.sql ? ` WHERE ${where.sql}` : ''
  const totalRow = getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}${whereSql}`).get(...where.params) as { count: number }
  const total = Number(totalRow.count)
  const mode = query.mode || 'list'
  if (mode === 'count' || mode === 'aggregate') return { columns: ['count'], rows: [{ count: total }], total }
  const orderBy = parseOrderBy(query.orderBy, fieldNames)
  const limit = mode === 'single' ? 1 : Math.min(200, Math.max(1, Number.isFinite(query.limit) ? Math.floor(Number(query.limit)) : 50))
  const offset = Math.max(0, Number.isFinite(query.offset) ? Math.floor(Number(query.offset)) : 0)
  const sql = `SELECT ${selectedColumns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(table)}${whereSql}${orderBy ? ` ORDER BY ${orderBy}` : ''} LIMIT ? OFFSET ?`
  const rows = getDatabase().prepare(sql).all(...where.params, limit, offset) as Array<Record<string, unknown>>
  return { columns: selectedColumns, rows, total }
}

function sanitizeWriteData(table: string, data: Record<string, unknown>) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('写入数据格式不正确')
  const fields = getTableFields(table)
  const primaryKeys = new Set(fields.filter(field => field.isPrimaryKey).map(field => field.name))
  const allowedFields = new Set(fields.map(field => field.name))
  const entries = Object.entries(data).filter(([field, value]) => {
    const safeField = assertValidIdentifier(field)
    if (!allowedFields.has(safeField)) throw new Error(`写入字段不存在：${safeField}`)
    return !primaryKeys.has(safeField) && value !== undefined
  })
  if (!entries.length) throw new Error('没有可写入的数据')
  return entries
}

function normalizeInsertId(value: bigint | number) {
  return typeof value === 'bigint' && value > BigInt(Number.MAX_SAFE_INTEGER) ? value.toString() : Number(value)
}

function insertBusinessRow(input: RowInput) {
  const table = assertValidTableName(input?.table)
  const entries = sanitizeWriteData(table, input?.data)
  const columns = entries.map(([field]) => quoteIdentifier(field)).join(', ')
  const placeholders = entries.map(() => '?').join(', ')
  const result = getDatabase().prepare(`INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders})`).run(...entries.map(([, value]) => value as never))
  return { success: true, id: normalizeInsertId(result.lastInsertRowid) }
}

function updateBusinessRow(input: RowInput & { id: number | string }) {
  const table = assertValidTableName(input?.table)
  if (input?.id === undefined || input.id === null || input.id === '') throw new Error('缺少待更新记录主键')
  const entries = sanitizeWriteData(table, input?.data)
  const primaryKey = getPrimaryKey(table)
  const assignments = entries.map(([field]) => `${quoteIdentifier(field)} = ?`).join(', ')
  const result = getDatabase().prepare(`UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE ${quoteIdentifier(primaryKey)} = ?`).run(...entries.map(([, value]) => value as never), input.id)
  if (Number(result.changes) === 0) throw new Error('未找到待更新记录')
  return { success: true }
}

function deleteBusinessRow(input: { table: string; id: number | string }) {
  const table = assertValidTableName(input?.table)
  if (input?.id === undefined || input.id === null || input.id === '') throw new Error('缺少待删除记录主键')
  const primaryKey = getPrimaryKey(table)
  const result = getDatabase().prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(primaryKey)} = ?`).run(input.id)
  if (Number(result.changes) === 0) throw new Error('未找到待删除记录')
  return { success: true }
}

function registerIpcHandlers() {
  ipcMain.handle('lowcode:bootstrap', () => {
    const projects = (getDatabase().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Record<string, unknown>[]).map(mapProject)
    const activities = (getDatabase().prepare('SELECT * FROM activities ORDER BY id DESC LIMIT 8').all() as Record<string, unknown>[]).map(row => ({
      id: Number(row.id),
      projectId: String(row.project_id),
      projectName: String(row.project_name),
      action: String(row.action),
      createdAt: String(row.created_at),
    }))
    return { projects, activities, databasePath }
  })

  ipcMain.handle('lowcode:save-project', (_event, project: Record<string, unknown>) => {
    if (!project?.id || !project?.name || !project?.layout) throw new Error('应用数据不完整')
    const updatedAt = now()
    const existing = getDatabase().prepare('SELECT id FROM projects WHERE id = ?').get(String(project.id))
    const createdAt = String(project.createdAt || updatedAt)
    getDatabase().prepare(`
      INSERT INTO projects (id, name, description, status, category, layout_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        category = excluded.category,
        layout_json = excluded.layout_json,
        updated_at = excluded.updated_at
    `).run(
      String(project.id), String(project.name), String(project.description || ''),
      String(project.status || 'draft'), String(project.category || '业务应用'),
      JSON.stringify(project.layout), createdAt, updatedAt,
    )
    recordActivity(String(project.id), String(project.name), existing ? '保存了页面设计' : '创建了应用')
    return getProject(String(project.id))
  })

  ipcMain.handle('lowcode:duplicate-project', (_event, projectId: string) => {
    const source = getProject(projectId)
    const id = makeId('project')
    const createdAt = now()
    const name = `${source.name} 副本`
    getDatabase().prepare(`
      INSERT INTO projects (id, name, description, status, category, layout_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, source.description, 'draft', source.category, JSON.stringify(source.layout), createdAt, createdAt)
    recordActivity(id, name, '复制了应用')
    return getProject(id)
  })

  ipcMain.handle('lowcode:delete-project', (_event, projectId: string) => {
    const project = getProject(projectId)
    getDatabase().prepare('DELETE FROM projects WHERE id = ?').run(projectId)
    recordActivity(projectId, project.name, '删除了应用')
    return { success: true }
  })

  ipcMain.handle('lowcode:list-tables', () => listBusinessTables())
  ipcMain.handle('lowcode:describe-table', (_event, tableName: string) => describeBusinessTable(tableName))
  ipcMain.handle('lowcode:query-rows', (_event, table: string, options?: DataQueryOptions) => queryBusinessData({ table, ...(options || {}) }))
  ipcMain.handle('lowcode:insert-row', (_event, input: RowInput) => insertBusinessRow(input))
  ipcMain.handle('lowcode:update-row', (_event, input: RowInput & { id: unknown }) => updateBusinessRow(input as RowInput & { id: number | string }))
  ipcMain.handle('lowcode:delete-row', (_event, table: string, id: unknown) => deleteBusinessRow({ table, id: id as number | string }))
  ipcMain.handle('lowcode:submit-form', (_event, input: RowInput) => insertBusinessRow(input))
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'Codeless — 快速原型工具',
    icon: appIcon,
    width: 1520,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#f5f6fa',
    show: false,
    webPreferences: { preload },
  })

  win.once('ready-to-show', () => {
    if (!isSmokeTest) win?.show()
  })
  if (VITE_DEV_SERVER_URL) await win.loadURL(VITE_DEV_SERVER_URL)
  else await win.loadFile(indexHtml)

  if (isSmokeTest) {
    console.log('CODELESS_SMOKE_OK')
    setTimeout(() => app.quit(), 800)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  initializeDatabase()
  registerIpcHandlers()
  await createWindow()
})

app.on('before-quit', () => {
  database?.close()
  database = null
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) allWindows[0].focus()
  else createWindow()
})