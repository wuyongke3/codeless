export type WidgetType =
  | 'heading'
  | 'text'
  | 'button'
  | 'input'
  | 'select'
  | 'table'
  | 'stat'
  | 'image'
  | 'divider'

export type DataSourceMode = 'list' | 'single' | 'count' | 'aggregate'

export interface DataSourceConfig {
  table: string
  mode: DataSourceMode
  columns?: string[]
  where?: string
  orderBy?: string
  limit?: number
}

export interface SubmitTargetConfig {
  table: string
  fieldMapping?: Record<string, string>
}

export interface WidgetProps {
  text?: string
  placeholder?: string
  description?: string
  options?: string
  accent?: string
  align?: 'left' | 'center' | 'right'
  variant?: 'primary' | 'secondary' | 'outline'
  fontSize?: number
  radius?: number
  required?: boolean
  columns?: string[]
  value?: string
  trend?: string
  dataSource?: DataSourceConfig
  submitTo?: SubmitTargetConfig
}

export interface LowCodeWidget {
  id: string
  type: WidgetType
  name: string
  x: number
  y: number
  w: number
  h: number
  props: WidgetProps
}

export interface PageLayout {
  version: number
  pageName: string
  canvas: {
    width: number
    height: number
    background: string
  }
  widgets: LowCodeWidget[]
}

export interface LowCodeProject {
  id: string
  name: string
  description: string
  status: 'draft' | 'published'
  category: string
  layout: PageLayout
  createdAt: string
  updatedAt: string
}

export interface ActivityItem {
  id: number
  projectId: string
  projectName: string
  action: string
  createdAt: string
}

export interface BootstrapData {
  projects: LowCodeProject[]
  activities: ActivityItem[]
  databasePath: string
}

export interface TableField {
  name: string
  type: string
  description: string
  isPrimaryKey: boolean
  isNotNull: boolean
}

export interface TableMeta {
  name: string
  title: string
  color: string
  fields: TableField[]
  rowCount: number
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  total: number
}

export interface RowInput {
  table: string
  data: Record<string, unknown>
}

export interface DataQueryOptions {
  columns?: string[]
  where?: string
  orderBy?: string
  limit?: number
  offset?: number
  mode?: DataSourceMode
}

export interface DataQuery extends DataQueryOptions {
  table: string
}

export interface LowCodeApi {
  bootstrap: () => Promise<BootstrapData>
  saveProject: (project: LowCodeProject) => Promise<LowCodeProject>
  duplicateProject: (projectId: string) => Promise<LowCodeProject>
  deleteProject: (projectId: string) => Promise<{ success: boolean }>
  listTables: () => Promise<TableMeta[]>
  describeTable: (tableName: string) => Promise<TableMeta>
  queryRows: (table: string, options?: DataQueryOptions) => Promise<QueryResult>
  insertRow: (input: RowInput) => Promise<{ success: boolean; id: unknown }>
  updateRow: (input: RowInput & { id: unknown }) => Promise<{ success: boolean }>
  deleteRow: (table: string, id: unknown) => Promise<{ success: boolean }>
  submitForm: (input: RowInput) => Promise<{ success: boolean; id: unknown }>
}
