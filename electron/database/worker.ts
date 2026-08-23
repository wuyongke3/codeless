import { DatabaseSync } from 'node:sqlite'
import type { DataQuery, LowCodeProject, RowInput, TableField, TableMeta } from '../../src/types/lowcode'

const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const now = () => new Date().toISOString()
let database: DatabaseSync | null = null
let databasePath = ''

type DatabaseBatchOperation = { method: string; args?: unknown[] }
type ParentPort = {
  on: (event: 'message', listener: (message: unknown) => void) => void
  postMessage: (message: unknown) => void
}
type DatabaseRequest = { id: number; method: string; args?: unknown[] }
type DatabaseResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string; stack?: string } }

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort
if (!parentPort) throw new Error('SQLite utility process parentPort is unavailable')

const TABLE_PRESENTATION: Record<string, { title: string; color: string; descriptions: Record<string, string> }> = {
  customers: {
    title: 'Customers', color: '#665cf6', descriptions: {
      id: 'Primary key', name: 'Customer name', contact: 'Contact person', phone: 'Phone', status: 'Status', owner: 'Owner', created_at: 'Created at',
    },
  },
  orders: {
    title: 'Orders', color: '#20b486', descriptions: {
      id: 'Primary key', order_no: 'Order number', customer_id: 'Customer id', amount: 'Amount', status: 'Status', created_at: 'Created at',
    },
  },
  tickets: {
    title: 'Tickets', color: '#f59e0b', descriptions: {
      id: 'Primary key', title: 'Title', priority: 'Priority', assignee: 'Assignee', status: 'Status', updated_at: 'Updated at',
    },
  },
}
const BUSINESS_TABLES = new Set(Object.keys(TABLE_PRESENTATION))

function getDatabase() {
  if (!database) throw new Error('SQLite database is not initialized')
  return database
}

function assertValidIdentifier(value: string, label = 'field name') {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid ${label}`)
  return value
}

function assertValidTableName(table: string) {
  const safeTable = assertValidIdentifier(String(table || ''), 'table name')
  if (!BUSINESS_TABLES.has(safeTable)) throw new Error('Table is not available')
  return safeTable
}

function quoteIdentifier(value: string) {
  return `"${assertValidIdentifier(value)}"`
}

function starterLayout(kind: 'crm' | 'orders' | 'blank' = 'blank') {
  const base = {
    version: 1,
    pageName: kind === 'orders' ? 'Orders overview' : kind === 'crm' ? 'Customer list' : 'Untitled page',
    canvas: { width: 960, height: 720, background: '#f7f8fb' },
    widgets: [] as Array<Record<string, unknown>>,
  }
  if (kind === 'blank') return base
  base.widgets = [
    {
      id: makeId('widget'), type: 'heading', name: kind === 'crm' ? 'Customer heading' : 'Orders heading', x: 48, y: 42, w: 500, h: 52,
      props: { text: kind === 'crm' ? 'Customer management' : 'Order center', description: kind === 'crm' ? 'Manage customer records' : 'Review and process orders', fontSize: 28, align: 'left' },
    },
    {
      id: makeId('widget'), type: 'button', name: 'Primary action', x: 758, y: 46, w: 154, h: 42,
      props: { text: kind === 'crm' ? '+ New customer' : '+ Create order', variant: 'primary', accent: '#665cf6', radius: 10 },
    },
  ]
  return base
}

function getTableFields(table: string): TableField[] {
  const safeTable = assertValidTableName(table)
  const rows = getDatabase().prepare(`PRAGMA table_info(${quoteIdentifier(safeTable)})`).all() as Array<Record<string, unknown>>
  if (!rows.length) throw new Error('Table does not exist')
  const presentation = TABLE_PRESENTATION[safeTable]
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
  if (!primaryKey) throw new Error('Table has no primary key')
  return primaryKey.name
}

function seedTable(table: string, rows: Array<Record<string, unknown>>) {
  const safeTable = assertValidTableName(table)
  const count = getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(safeTable)}`).get() as { count: number }
  if (Number(count.count) > 0) return
  for (const row of rows) insertBusinessRow({ table: safeTable, data: row })
}

function initializeDatabase(dbPath: string) {
  databasePath = dbPath
  database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      category TEXT NOT NULL DEFAULT 'Business app',
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
    ['project_crm', 'Customer management', 'Local customer records and follow-up workflow', 'published', 'CRM', starterLayout('crm')],
    ['project_orders', 'Order center', 'Local order review and processing workflow', 'draft', 'Orders', starterLayout('orders')],
    ['project_blank', 'Support workspace', 'Local support ticket workspace', 'draft', 'Support', starterLayout('blank')],
  ] as const
  for (const [id, name, description, status, category, layout] of seeds) {
    insert.run(id, name, description, status, category, JSON.stringify(layout), createdAt, createdAt)
  }
  recordActivity('project_crm', 'Customer management', 'Initial local project created')
}

function seedBusinessData() {
  seedTable('customers', [
    { name: 'Northwind Studio', contact: 'Alex', phone: '138****1201', status: 'Won', owner: 'Lin', created_at: '2026-08-18 09:20:00' },
    { name: 'Cloud Harbor', contact: 'Morgan', phone: '139****2816', status: 'In progress', owner: 'Zhou', created_at: '2026-08-19 14:05:00' },
    { name: 'Pine Trading', contact: 'Taylor', phone: '136****8302', status: 'Won', owner: 'Lin', created_at: '2026-08-20 10:32:00' },
  ])
  seedTable('orders', [
    { order_no: 'SO-20260818-001', customer_id: 1, amount: 12800, status: 'Complete', created_at: '2026-08-18 10:10:00' },
    { order_no: 'SO-20260819-002', customer_id: 2, amount: 7600, status: 'Processing', created_at: '2026-08-19 15:30:00' },
    { order_no: 'SO-20260820-003', customer_id: 3, amount: 23500, status: 'Pending', created_at: '2026-08-20 11:15:00' },
  ])
  seedTable('tickets', [
    { title: 'Invoice information needs revision', priority: 'Medium', assignee: 'Taylor', status: 'Processing', updated_at: '2026-08-20 16:20:00' },
    { title: 'Order quantity mismatch', priority: 'High', assignee: 'Morgan', status: 'Pending', updated_at: '2026-08-21 09:05:00' },
    { title: 'Add product description', priority: 'Low', assignee: 'Lin', status: 'Resolved', updated_at: '2026-08-21 10:40:00' },
  ])
}

function parseProjectStorage(raw: unknown) {
  let parsed: unknown
  try { parsed = JSON.parse(String(raw)) } catch { parsed = {} }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { activeLayout: parsed }
  const record = parsed as Record<string, unknown>
  if (record.activeLayout && typeof record.activeLayout === 'object') return record
  return { activeLayout: record }
}

function projectStoragePayload(project: {
  layout: unknown
  pages?: unknown
  entryPageId?: unknown
  currentPageId?: unknown
  routes?: unknown
  sharedState?: unknown
  designSystem?: unknown
  review?: unknown
}) {
  return {
    activeLayout: project.layout,
    pages: project.pages,
    entryPageId: project.entryPageId,
    currentPageId: project.currentPageId,
    routes: project.routes,
    sharedState: project.sharedState,
    designSystem: project.designSystem,
    review: project.review,
  }
}

function mapProject(row: Record<string, unknown>) {
  const persisted = parseProjectStorage(row.layout_json)
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    status: row.status === 'published' ? 'published' : 'draft',
    category: String(row.category),
    layout: persisted.activeLayout,
    pages: persisted.pages,
    entryPageId: persisted.entryPageId,
    currentPageId: persisted.currentPageId,
    routes: persisted.routes,
    sharedState: persisted.sharedState,
    designSystem: persisted.designSystem,
    review: persisted.review,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function getProject(projectId: string) {
  const row = getDatabase().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined
  if (!row) throw new Error('Project not found')
  return mapProject(row)
}

function recordActivity(projectId: string, projectName: string, action: string) {
  getDatabase().prepare('INSERT INTO activities (project_id, project_name, action, created_at) VALUES (?, ?, ?, ?)').run(projectId, projectName, action, now())
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
  if (!match) throw new Error('Only one simple field comparison is supported')
  const field = assertValidIdentifier(match[1])
  if (!fields.has(field)) throw new Error(`Unknown filter field: ${field}`)
  const operator = match[2] === '<>' ? '!=' : match[2]
  if (match[6]) {
    if (!['=', '!='].includes(operator)) throw new Error('NULL only supports = or !=')
    return { sql: `${quoteIdentifier(field)} IS ${operator === '!=' ? 'NOT ' : ''}NULL`, params: [] as Array<string | number | null> }
  }
  const parameter = match[5] === undefined ? match[4] : Number(match[5])
  return { sql: `${quoteIdentifier(field)} ${operator} ?`, params: [parameter] }
}

function parseOrderBy(orderBy: string | undefined, fields: Set<string>) {
  const value = orderBy?.trim()
  if (!value) return ''
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i)
  if (!match) throw new Error('Invalid orderBy format')
  const field = assertValidIdentifier(match[1])
  if (!fields.has(field)) throw new Error(`Unknown order field: ${field}`)
  return `${quoteIdentifier(field)} ${(match[2] || 'ASC').toUpperCase()}`
}

function queryBusinessData(query: DataQuery) {
  const table = assertValidTableName(query?.table)
  const tableFields = getTableFields(table)
  const fieldNames = new Set(tableFields.map(field => field.name))
  const selectedColumns = query.columns?.length ? query.columns.map(column => {
    const field = assertValidIdentifier(column)
    if (!fieldNames.has(field)) throw new Error(`Unknown query field: ${field}`)
    return field
  }) : tableFields.map(field => field.name)
  const where = parseWhere(query.where, fieldNames)
  const whereSql = where.sql ? ` WHERE ${where.sql}` : ''
  const totalRow = getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}${whereSql}`).get(...where.params) as { count: number }
  const total = Number(totalRow.count)
  const mode = query.mode || 'list'
  if (mode === 'count') return { columns: ['count'], rows: [{ count: total }], total }
  if (mode === 'aggregate') {
    const aggregateFunction = query.aggregate?.function || 'count'
    if (!['count', 'sum', 'avg', 'min', 'max'].includes(aggregateFunction)) throw new Error('Unsupported aggregate function')
    if (aggregateFunction === 'count') return { columns: ['value'], rows: [{ value: total }], total }
    const aggregateField = query.aggregate?.field || selectedColumns[0]
    if (!aggregateField || !fieldNames.has(aggregateField)) throw new Error('Aggregate field not found')
    const expression = `${aggregateFunction.toUpperCase()}(${quoteIdentifier(aggregateField)})`
    const result = getDatabase().prepare(`SELECT ${expression} AS value FROM ${quoteIdentifier(table)}${whereSql}`).get(...where.params) as { value: unknown }
    return { columns: ['value'], rows: [{ value: result.value ?? 0 }], total }
  }
  const orderBy = parseOrderBy(query.orderBy, fieldNames)
  const limit = mode === 'single' ? 1 : Math.min(200, Math.max(1, Number.isFinite(query.limit) ? Math.floor(Number(query.limit)) : 50))
  const offset = Math.max(0, Number.isFinite(query.offset) ? Math.floor(Number(query.offset)) : 0)
  const sql = `SELECT ${selectedColumns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(table)}${whereSql}${orderBy ? ` ORDER BY ${orderBy}` : ''} LIMIT ? OFFSET ?`
  const rows = getDatabase().prepare(sql).all(...where.params, limit, offset) as Array<Record<string, unknown>>
  return { columns: selectedColumns, rows, total }
}

function sanitizeWriteData(table: string, data: Record<string, unknown>) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid write data')
  const fields = getTableFields(table)
  const primaryKeys = new Set(fields.filter(field => field.isPrimaryKey).map(field => field.name))
  const allowedFields = new Set(fields.map(field => field.name))
  const entries = Object.entries(data).filter(([field, value]) => {
    const safeField = assertValidIdentifier(field)
    if (!allowedFields.has(safeField)) throw new Error(`Unknown write field: ${safeField}`)
    return !primaryKeys.has(safeField) && value !== undefined
  })
  if (!entries.length) throw new Error('No writable fields')
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
  if (input?.id === undefined || input.id === null || input.id === '') throw new Error('Record id is required')
  const entries = sanitizeWriteData(table, input?.data)
  const primaryKey = getPrimaryKey(table)
  const assignments = entries.map(([field]) => `${quoteIdentifier(field)} = ?`).join(', ')
  const result = getDatabase().prepare(`UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE ${quoteIdentifier(primaryKey)} = ?`).run(...entries.map(([, value]) => value as never), input.id)
  if (Number(result.changes) === 0) throw new Error('Record not found')
  return { success: true }
}

function deleteBusinessRow(input: { table: string; id: number | string }) {
  const table = assertValidTableName(input?.table)
  if (input?.id === undefined || input.id === null || input.id === '') throw new Error('Record id is required')
  const primaryKey = getPrimaryKey(table)
  const result = getDatabase().prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(primaryKey)} = ?`).run(input.id)
  if (Number(result.changes) === 0) throw new Error('Record not found')
  return { success: true }
}

function bootstrap() {
  const projects = (getDatabase().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Record<string, unknown>[]).map(mapProject)
  const activities = (getDatabase().prepare('SELECT * FROM activities ORDER BY id DESC LIMIT 8').all() as Record<string, unknown>[]).map(row => ({
    id: Number(row.id), projectId: String(row.project_id), projectName: String(row.project_name), action: String(row.action), createdAt: String(row.created_at),
  }))
  return { projects, activities, databasePath }
}

function saveProject(project: Record<string, unknown>) {
  if (!project?.id || !project?.name || !project?.layout) throw new Error('Project data is incomplete')
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
    String(project.status || 'draft'), String(project.category || 'Business app'),
    JSON.stringify(projectStoragePayload(project)), createdAt, updatedAt,
  )
  recordActivity(String(project.id), String(project.name), existing ? 'Project saved locally' : 'Project created locally')
  return getProject(String(project.id)) as LowCodeProject
}

function duplicateProject(projectId: string) {
  const source = getProject(projectId)
  const id = makeId('project')
  const createdAt = now()
  const name = `${source.name} copy`
  getDatabase().prepare('INSERT INTO projects (id, name, description, status, category, layout_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, source.description, 'draft', source.category, JSON.stringify(projectStoragePayload(source)), createdAt, createdAt)
  recordActivity(id, name, 'Project duplicated locally')
  return getProject(id)
}

function deleteProject(projectId: string) {
  const project = getProject(projectId)
  getDatabase().prepare('DELETE FROM projects WHERE id = ?').run(projectId)
  recordActivity(projectId, project.name, 'Project deleted locally')
  return { success: true }
}

function executeBatch(operations: DatabaseBatchOperation[]) {
  if (!Array.isArray(operations) || !operations.length) return []
  const db = getDatabase()
  db.exec('BEGIN IMMEDIATE')
  try {
    const results = operations.map(operation => {
      if (!operation || typeof operation.method !== 'string' || operation.method === 'batch') throw new Error('Nested database batches are not supported')
      return dispatch(operation.method, Array.isArray(operation.args) ? operation.args : [])
    })
    db.exec('COMMIT')
    return results
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* preserve original error */ }
    throw error
  }
}

function dispatch(method: string, args: unknown[]) {
  switch (method) {
    case 'batch': return executeBatch(args[0] as DatabaseBatchOperation[])
    case 'bootstrap': return bootstrap()
    case 'saveProject': return saveProject(args[0] as Record<string, unknown>)
    case 'duplicateProject': return duplicateProject(String(args[0] || ''))
    case 'deleteProject': return deleteProject(String(args[0] || ''))
    case 'listTables': return listBusinessTables()
    case 'describeTable': return describeBusinessTable(String(args[0] || ''))
    case 'queryRows': return queryBusinessData({ table: String(args[0] || ''), ...((args[1] || {}) as Record<string, unknown>) } as DataQuery)
    case 'insertRow': return insertBusinessRow(args[0] as RowInput)
    case 'updateRow': return updateBusinessRow(args[0] as RowInput & { id: number | string })
    case 'deleteRow': return deleteBusinessRow({ table: String(args[0] || ''), id: args[1] as number | string })
    case 'submitForm': return insertBusinessRow(args[0] as RowInput)
    default: throw new Error(`Unknown database method: ${method}`)
  }
}

function send(response: DatabaseResponse) {
  parentPort.postMessage(response)
}

parentPort.on('message', (message: unknown) => {
  const event = message as { data?: unknown }
  const request = (event && typeof event === 'object' && 'data' in event ? event.data : message) as DatabaseRequest
  if (!request || typeof request.id !== 'number' || typeof request.method !== 'string') return
  try {
    const result = dispatch(request.method, Array.isArray(request.args) ? request.args : [])
    send({ id: request.id, ok: true, result })
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    send({ id: request.id, ok: false, error: { message: normalized.message, stack: normalized.stack } })
  }
})

try {
  const dbPath = process.argv[2]
  if (!dbPath) throw new Error('SQLite database path is required')
  initializeDatabase(dbPath)
  parentPort.postMessage({ type: 'ready', databasePath })
} catch (error) {
  const normalized = error instanceof Error ? error : new Error(String(error))
  parentPort.postMessage({ type: 'init-error', error: { message: normalized.message, stack: normalized.stack } })
  throw normalized
}
