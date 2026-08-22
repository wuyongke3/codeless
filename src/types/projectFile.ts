import type { LowCodeProject } from './lowcode'

export const CODELESS_FILE_FORMAT = 'codeless' as const
export const CODELESS_SCHEMA_VERSION = 1 as const

export interface CodelessProjectFile {
  format: typeof CODELESS_FILE_FORMAT
  schemaVersion: typeof CODELESS_SCHEMA_VERSION
  exportedAt: string
  project: LowCodeProject
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function assertProjectShape(value: unknown): asserts value is LowCodeProject {
  if (!isRecord(value)) throw new Error('项目文件缺少 project 对象')
  if (typeof value.id !== 'string' || !value.id.trim()) throw new Error('项目文件缺少有效的项目 ID')
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('项目文件缺少有效的项目名称')
  if (!isRecord(value.layout)) throw new Error('项目文件缺少 layout 布局')
  const layout = value.layout
  if (!isRecord(layout.canvas) || !Array.isArray(layout.widgets)) throw new Error('项目文件的布局结构无效')
  for (const widget of layout.widgets) {
    if (!isRecord(widget) || typeof widget.id !== 'string' || typeof widget.type !== 'string') {
      throw new Error('项目文件包含无效组件')
    }
  }
}

/**
 * 将当前项目封装为稳定的 .codeless 文档。文档只包含 JSON 数据，
 * 不携带数据库连接、绝对路径、网络地址或可执行代码。
 */
export function createCodelessDocument(project: LowCodeProject, exportedAt = new Date().toISOString()): CodelessProjectFile {
  assertProjectShape(project)
  return {
    format: CODELESS_FILE_FORMAT,
    schemaVersion: CODELESS_SCHEMA_VERSION,
    exportedAt,
    project: cloneJson(project),
  }
}

/**
 * 读取并迁移 .codeless 文档。
 *
 * v0 兼容两种历史形态：直接保存的 LowCodeProject，以及带 project 字段但
 * 没有 format/schemaVersion 的包裹对象。未来版本必须显式迁移后才能打开，
 * 避免静默丢失字段。
 */
export function migrateCodelessDocument(raw: unknown): CodelessProjectFile {
  if (!isRecord(raw)) throw new Error('项目文件必须是 JSON 对象')

  let project: unknown
  let exportedAt = new Date().toISOString()
  if (raw.format === CODELESS_FILE_FORMAT) {
    const version = raw.schemaVersion === undefined ? 0 : Number(raw.schemaVersion)
    if (!Number.isInteger(version) || version < 0) throw new Error('项目文件版本号无效')
    if (version > CODELESS_SCHEMA_VERSION) throw new Error(`项目文件版本 ${version} 高于当前支持版本 ${CODELESS_SCHEMA_VERSION}`)
    project = raw.project
    if (typeof raw.exportedAt === 'string' && raw.exportedAt.trim()) exportedAt = raw.exportedAt
  } else if (raw.id !== undefined && raw.layout !== undefined) {
    // 早期开发版本可能直接导出项目对象，读取时自动升级为 v1 包装格式。
    project = raw
  } else if (isRecord(raw.project) && raw.layout === undefined) {
    // 兼容未声明 format/schemaVersion 的包裹对象。
    project = raw.project
    if (typeof raw.exportedAt === 'string' && raw.exportedAt.trim()) exportedAt = raw.exportedAt
  } else {
    throw new Error('不是有效的 Codeless 项目文件')
  }

  assertProjectShape(project)
  return {
    format: CODELESS_FILE_FORMAT,
    schemaVersion: CODELESS_SCHEMA_VERSION,
    exportedAt,
    project: cloneJson(project),
  }
}

export function parseCodelessDocument(text: string): CodelessProjectFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('项目文件不是有效的 JSON')
  }
  return migrateCodelessDocument(raw)
}

export function serializeCodelessDocument(project: LowCodeProject): string {
  return `${JSON.stringify(createCodelessDocument(project), null, 2)}\n`
}
