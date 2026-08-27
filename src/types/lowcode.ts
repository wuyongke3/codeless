import type { InstalledPlugin, PluginInstallResult } from './plugin'
import type { DesignExchangeDocument, DesignExchangeExportResult, DesignExchangeImportResult } from './designExchange'

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
  | 'modal'
  | 'loading'
  | 'badge'
  | 'tag'
  | 'alert'
  | 'progress'
  | 'switch'
  | 'checkbox'
  | 'radio'
  | 'datePicker'
  | 'pagination'
  | 'breadcrumb'
  | 'tabs'
  | 'collapse'
  | 'avatar'
  | 'icon'
  | 'link'
  | 'tooltip'
  | 'card'
  | 'frame'
  | 'stack'
  | 'grid'
  | 'spacer'
  | 'drawer'

export type DataSourceMode = 'list' | 'single' | 'count' | 'aggregate'
export type WidgetEventType = 'click' | 'change' | 'submit' | 'rowClick' | 'open' | 'close' | 'confirm' | 'cancel'
export type WidgetEventActionType = 'navigate' | 'navigateBack' | 'setRouteState' | 'emitPageEvent' | 'setValue' | 'submitData' | 'tableQuery' | 'tableCreate' | 'tableUpdate' | 'tableDelete' | 'showToast' | 'showModal' | 'hideModal' | 'showLoading' | 'hideLoading'
export type WidgetValueType = 'text' | 'number' | 'email' | 'phone' | 'date' | 'datetime' | 'boolean'
export type WidgetImageFit = 'cover' | 'contain' | 'fill' | 'none'
export type WidgetAggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max'
export type DesignTokenPrimitive = string | number
export type DesignTokenValue = DesignTokenPrimitive | boolean
export type DesignThemeMode = 'light' | 'dark'

export interface DesignTokenSet {
  /** Existing buckets kept stable for Builder/WidgetConfig compatibility. */
  colors: Record<string, string>
  typography: Record<string, DesignTokenPrimitive>
  spacing: Record<string, number>
  radii: Record<string, number>
  shadows: Record<string, string>
  /** Semantic text and boolean buckets introduced by the token domain API. */
  texts?: Record<string, string>
  booleans?: Record<string, boolean>
  /** Escape hatch for project-local token kinds that are still JSON values. */
  custom?: Record<string, DesignTokenValue>
}

export interface DesignTheme {
  id: string
  name: string
  mode: DesignThemeMode
  tokens: DesignTokenSet
  /** Canonical token reference -> canonical token reference, e.g. color.brand -> color.primary. */
  aliases?: Record<string, string>
  /** Canonical references intentionally removed from the built-in fallback set. */
  removedTokens?: Record<string, boolean>
}

/** Local project-level themes and design tokens persisted in .codeless / SQLite JSON. */
export interface DesignSystem {
  activeThemeId: string
  themes: DesignTheme[]
}

export type ReviewCommentStatus = 'open' | 'resolved'
export type ReviewActivityAction = 'snapshot-created' | 'snapshot-deleted' | 'comment-created' | 'comment-updated' | 'comment-resolved' | 'comment-reopened' | 'package-imported'

export interface ReviewAttachment {
  id: string
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  size: number
  dataUrl: string
  createdAt: string
}

export interface ReviewActivity {
  id: string
  action: ReviewActivityAction
  message: string
  createdAt: string
  snapshotId?: string
  commentId?: string
}

export interface ReviewVersionContext {
  projectId: string
  projectName: string
  projectUpdatedAt: string
  snapshotId?: string
  snapshotName?: string
  snapshotSourceUpdatedAt?: string
}

export interface ProjectSnapshot {
  id: string
  projectId: string
  name: string
  createdAt: string
  sourceUpdatedAt: string
  project: Omit<LowCodeProject, 'review'>
}

export interface ReviewComment {
  id: string
  projectId: string
  snapshotId?: string
  pageId?: string
  widgetId?: string
  x?: number
  y?: number
  text: string
  attachments?: ReviewAttachment[]
  status: ReviewCommentStatus
  createdAt: string
  updatedAt: string
}

export interface ProjectReviewState {
  snapshots: ProjectSnapshot[]
  comments: ReviewComment[]
  activity: ReviewActivity[]
  activeSnapshotId?: string
}

export type ReviewDiffKind = 'added' | 'removed' | 'changed'

export interface ReviewDiffEntry {
  path: string
  kind: ReviewDiffKind
  before?: unknown
  after?: unknown
}

export interface ReviewDiffSummary {
  added: number
  removed: number
  changed: number
  total: number
}

export interface ProjectDiff {
  baseSnapshotId?: string
  targetUpdatedAt: string
  entries: ReviewDiffEntry[]
  summary: ReviewDiffSummary
}

export interface ReviewPackage {
  format: 'codeless-review'
  schemaVersion: 1
  exportedAt: string
  versionContext: ReviewVersionContext
  project: Omit<LowCodeProject, 'review'>
  snapshot?: ProjectSnapshot
  comments: ReviewComment[]
  activity: ReviewActivity[]
  diff?: ProjectDiff
}

export interface WidgetEventAction {
  id: string
  type: WidgetEventActionType
  target?: string
  value?: string
  payload?: string
}

export interface WidgetEvent {
  id: string
  event: WidgetEventType
  actions: WidgetEventAction[]
  enabled?: boolean
}

export interface WidgetOption {
  label: string
  value: string
  disabled?: boolean
}

export interface WidgetColumn {
  key: string
  label: string
  width?: number
  align?: 'left' | 'center' | 'right'
  format?: string
  visible?: boolean
}

export interface WidgetValidation {
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  message?: string
}

export interface WidgetLayoutConfig {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  locked: boolean
  hidden: boolean
}

export interface WidgetContentConfig {
  text?: string
  description?: string
  label?: string
  placeholder?: string
  defaultValue?: string | number | boolean
  value?: string | number | boolean
  valueType?: WidgetValueType
  variant?: string
  options?: WidgetOption[]
  columns?: WidgetColumn[]
  trend?: string
  src?: string
  alt?: string
  imageFit?: WidgetImageFit
  valueFormat?: string
  format?: string
  title?: string
  visible?: boolean
  confirmText?: string
  cancelText?: string
  closeOnOverlay?: boolean
  loadingVariant?: 'spinner' | 'bar'
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'normal' | 'exception'
  showZero?: boolean
  max?: number
  percentage?: number
  status?: 'normal' | 'success' | 'warning' | 'exception'
  showText?: boolean
  activeText?: string
  inactiveText?: string
  checked?: boolean
  indeterminate?: boolean
  closable?: boolean
  iconName?: string
  href?: string
  target?: '_self' | '_blank'
  placement?: 'top' | 'bottom' | 'left' | 'right'
  separator?: string
  activeKey?: string
  items?: WidgetOption[]
  expanded?: boolean
  total?: number
  pageSize?: number
  currentPage?: number
  direction?: 'row' | 'column'
  layoutMode?: 'auto' | 'absolute'
  wrap?: boolean
  columnsCount?: number
  flex?: boolean
  shape?: 'circle' | 'square'
  disabled?: boolean
  readOnly?: boolean
  loading?: boolean
  emptyText?: string
  showIndex?: boolean
}

export interface WidgetStyleConfig {
  color?: string
  background?: string
  accent?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  fontSize?: number
  fontWeight?: number
  textAlign?: 'left' | 'center' | 'right'
  opacity?: number
  objectFit?: WidgetImageFit
  padding?: number
  gap?: number
  shadow?: boolean | string
  lineHeight?: number
  justifyContent?: 'start' | 'center' | 'end' | 'space-between'
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  /** Design token references, for example color.primary, spacing.md, or radius.lg. */
  tokenRefs?: WidgetStyleTokenRefs
}

export interface WidgetStyleTokenRefs {
  color?: string
  background?: string
  accent?: string
  borderColor?: string
  borderRadius?: string
  fontSize?: string
  padding?: string
  gap?: string
  shadow?: string
}

export interface WidgetVariantConfig {
  content?: Partial<WidgetContentConfig>
  style?: Partial<WidgetStyleConfig>
}

export interface WidgetDataBinding {
  source: 'static' | 'table' | 'runtime'
  table?: string
  mode?: DataSourceMode
  field?: string
  fields?: Record<string, string>
  labelField?: string
  valueField?: string
  where?: string
  orderBy?: string
  limit?: number
  offset?: number
  aggregate?: {
    function: WidgetAggregateFunction
    field?: string
  }
}

export interface WidgetInteractionConfig {
  events: WidgetEvent[]
  rowEvents?: WidgetEvent[]
}

export interface WidgetMetaConfig {
  version: 1
  createdAt: string
  updatedAt: string
}

/**
 * 组件统一配置协议。props 仅作为旧版兼容层，新组件和运行时优先使用 config。
 */
/** A reusable, project-local component definition. */
export interface ComponentDefinition {
  id: string
  name: string
  type: WidgetType
  version: number
  createdAt: string
  updatedAt: string
  /** A layout-free template. Instance placement remains local to each node. */
  template: {
    name: string
    config: WidgetConfig
  }
  variantProperties?: Record<string, string[]>
}

export interface ComponentOverride {
  /** Dot path rooted at WidgetConfig, such as content.text or style.color. */
  path: string
  value: unknown
}

export interface ComponentConflict {
  path: string
  message: string
}

export interface WidgetComponentLink {
  role: 'definition' | 'instance'
  definitionId: string
  sourceVersion: number
  overrides?: ComponentOverride[]
  conflicts?: ComponentConflict[]
}

export interface WidgetConfig {
  version: 1
  layout: WidgetLayoutConfig
  content: WidgetContentConfig
  style: WidgetStyleConfig
  /** 当前激活的组件变体，例如 button.content.variant。 */
  variant?: string
  variants?: Record<string, WidgetVariantConfig>
  /** Optional link to a project-local reusable component definition. */
  component?: WidgetComponentLink
  data: WidgetDataBinding
  validation: WidgetValidation
  interaction: WidgetInteractionConfig
  submitTo?: SubmitTargetConfig
  meta: WidgetMetaConfig
}

/** 旧版数据源协议，保留用于迁移已有项目。 */
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

/**
 * 旧版扁平 props。不要再为新组件添加字段；加载时会迁移到 WidgetConfig。
 */
export interface WidgetProps {
  text?: string
  placeholder?: string
  description?: string
  options?: string
  accent?: string
  align?: 'left' | 'center' | 'right'
  variant?: string
  fontSize?: number
  radius?: number
  required?: boolean
  columns?: string[]
  value?: string
  trend?: string
  src?: string
  alt?: string
  dataSource?: DataSourceConfig
  submitTo?: SubmitTargetConfig
  events?: WidgetEvent[]
}

export interface LowCodeWidget {
  id: string
  type: WidgetType
  /** 父容器组件 ID；为空表示页面根层。支持指向可嵌套容器组件，例如 modal、loading、card、frame、stack、grid、drawer。 */
  parentId?: string
  name: string
  /** @deprecated Read-only legacy layout projection; import/normalize may
   * read them to create WidgetConfig v1, but editor mutations must target config.layout.
   */
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  /** @deprecated Read-only legacy props projection; new component
   * properties belong in WidgetConfig.content/style/data/validation/interaction.
   */
  readonly props: WidgetProps
  config?: WidgetConfig
}

export interface PageLayout {
  version: number
  pageName: string
  canvas: {
    /** Editor-only logical placement of this page inside the design viewport. */
    x?: number
    y?: number
    width: number
    height: number
    background: string
  }
  widgets: LowCodeWidget[]
}

export interface PageGuardConfig {
  id: string
  type: 'condition' | 'auth' | 'unsaved'
  expression?: string
  redirect?: string
  message?: string
  enabled?: boolean
}

export interface LowCodePage {
  id: string
  name: string
  path: string
  layout: PageLayout
  guards?: PageGuardConfig[]
}

export interface RouteConfig {
  id: string
  path: string
  pageId: string
  title?: string
  guards?: PageGuardConfig[]
}

export interface LowCodeProject {
  id: string
  name: string
  description: string
  status: 'draft' | 'published'
  category: string
  layout: PageLayout
  /** 项目级设计系统，用于统一管理颜色、间距、圆角和字体 Token。 */
  designSystem?: DesignSystem
  /** 项目级评审状态，用于保存评审记录和 Diff 结果。 */
  review?: ProjectReviewState
  /** 多页面扩展；旧项目仅有 layout 时由 normalizeProject 自动补齐。 */
  /** Project-local reusable components; no network library is required. */
  componentDefinitions?: ComponentDefinition[]
  pages?: LowCodePage[]
  entryPageId?: string
  currentPageId?: string
  routes?: RouteConfig[]
  /** 页面间共享运行时状态的初始值。 */
  sharedState?: Record<string, unknown>
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

export interface ProjectFileExportResult {
  canceled: boolean
  filePath?: string
}

export interface ProjectFileImportResult {
  canceled: boolean
  filePath?: string
  schemaVersion?: number
  project?: LowCodeProject
}

export interface ReviewPackageExportResult {
  canceled: boolean
  filePath?: string
}

export interface ReviewPackageImportResult {
  canceled: boolean
  filePath?: string
  reviewPackage?: unknown
}

export interface LocalAssetImportResult {
  canceled: boolean
  fileName?: string
  mimeType?: string
  size?: number
  dataUrl?: string
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

export interface TableRefreshResult {
  tables: TableMeta[]
  result: QueryResult
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
  aggregate?: {
    function: WidgetAggregateFunction
    field?: string
  }
}

export interface DataQuery extends DataQueryOptions {
  table: string
}

export interface WindowControlsApi {
  minimize: () => Promise<{ success: boolean }>
  toggleMaximize: () => Promise<{ maximized: boolean }>
  close: () => Promise<{ success: boolean }>
  getState: () => Promise<{ maximized: boolean }>
  onStateChange: (listener: (state: { maximized: boolean }) => void) => () => void
}

export interface PublishedServiceInfo {
  projectId: string
  projectName: string
  status: 'running' | 'stopped'
  port: number
  host: string
  localUrl: string
  lanUrls: string[]
  token: string
  publishedAt: string
}

export interface PublishedServiceResult {
  success: boolean
  service?: PublishedServiceInfo
}

export interface LowCodeApi {
  window: WindowControlsApi
  bootstrap: () => Promise<BootstrapData>
  saveProject: (project: LowCodeProject) => Promise<LowCodeProject>
  exportProject: (project: LowCodeProject) => Promise<ProjectFileExportResult>
  exportReviewPackage: (reviewPackage: ReviewPackage) => Promise<ReviewPackageExportResult>
  importReviewPackage: () => Promise<ReviewPackageImportResult>
  exportDesignExchange: (document: DesignExchangeDocument) => Promise<DesignExchangeExportResult>
  importAsset: () => Promise<LocalAssetImportResult>
  importProject: () => Promise<ProjectFileImportResult>
  importDesignExchange: () => Promise<DesignExchangeImportResult>
  duplicateProject: (projectId: string) => Promise<LowCodeProject>
  deleteProject: (projectId: string) => Promise<{ success: boolean }>
  publishService: (project: LowCodeProject) => Promise<PublishedServiceResult>
  stopPublishedService: (projectId: string) => Promise<{ success: boolean }>
  getPublishedServices: () => Promise<PublishedServiceInfo[]>
  listTables: () => Promise<TableMeta[]>
  describeTable: (tableName: string) => Promise<TableMeta>
  queryRows: (table: string, options?: DataQueryOptions) => Promise<QueryResult>
  refreshTable: (table: string, options?: DataQueryOptions) => Promise<TableRefreshResult>
  insertRow: (input: RowInput) => Promise<{ success: boolean; id: unknown }>
  updateRow: (input: RowInput & { id: unknown }) => Promise<{ success: boolean }>
  deleteRow: (table: string, id: unknown) => Promise<{ success: boolean }>
  submitForm: (input: RowInput) => Promise<{ success: boolean; id: unknown }>
  listPlugins: () => Promise<InstalledPlugin[]>
  installPlugin: () => Promise<PluginInstallResult>
  removePlugin: (id: string) => Promise<{ success: boolean }>
  setPluginEnabled: (id: string, enabled: boolean) => Promise<InstalledPlugin>
  getPluginUiUrl: (id: string) => Promise<string | null>
  collaboration: import('./collaboration').CollaborationApi
}
