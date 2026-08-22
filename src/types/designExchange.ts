import type { LowCodeWidget, PageLayout } from './lowcode'

export const DESIGN_EXCHANGE_FORMAT = 'codeless-design' as const
export const DESIGN_EXCHANGE_SCHEMA_VERSION = 1 as const
export const DESIGN_EXCHANGE_MAX_BYTES = 25 * 1024 * 1024
export const DESIGN_EXCHANGE_MAX_NODES = 5000
export const DESIGN_EXCHANGE_MAX_DEPTH = 40

export type DesignExchangeNodeType =
  | 'frame'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'component'
  | 'instance'
  | 'group'
  | 'section'
  | 'unknown'

export interface DesignExchangeText {
  characters: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
  textAlign?: 'left' | 'center' | 'right'
}

export interface DesignExchangeNode {
  id: string
  name: string
  type: DesignExchangeNodeType
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  visible?: boolean
  locked?: boolean
  opacity?: number
  fills?: string[]
  strokes?: string[]
  cornerRadius?: number
  text?: DesignExchangeText
  codelessType?: string
  children?: DesignExchangeNode[]
}

export interface DesignExchangeDocument {
  format: typeof DESIGN_EXCHANGE_FORMAT
  schemaVersion: typeof DESIGN_EXCHANGE_SCHEMA_VERSION
  source: {
    kind: 'figma-plugin' | 'codeless' | 'unknown'
    name: string
    version: string
  }
  exportedAt: string
  name: string
  canvas: {
    width: number
    height: number
    background: string
  }
  nodes: DesignExchangeNode[]
}

export interface DesignExchangeExportResult {
  canceled: boolean
  filePath?: string
}

export interface DesignExchangeImportResult {
  canceled: boolean
  filePath?: string
  document?: DesignExchangeDocument
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function boundedString(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\u0000/g, '').trim()
  return normalized.slice(0, maxLength) || fallback
}

function safeColor(value: unknown, fallback?: string) {
  if (typeof value !== 'string') return fallback
  const color = value.trim()
  if (color === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(color)) return color
  return fallback
}

function safeNodeType(value: unknown): DesignExchangeNodeType {
  const allowed: DesignExchangeNodeType[] = ['frame', 'text', 'rectangle', 'ellipse', 'line', 'image', 'component', 'instance', 'group', 'section', 'unknown']
  return typeof value === 'string' && allowed.includes(value as DesignExchangeNodeType)
    ? value as DesignExchangeNodeType
    : 'unknown'
}

function parseText(value: unknown): DesignExchangeText | undefined {
  if (!isRecord(value)) return undefined
  const characters = boundedString(value.characters, '', 20000)
  if (!characters) return undefined
  const result: DesignExchangeText = { characters }
  if (value.fontSize !== undefined) result.fontSize = finiteNumber(value.fontSize, 14, 1, 256)
  if (typeof value.fontFamily === 'string') result.fontFamily = boundedString(value.fontFamily, 'Inter', 200)
  if (value.fontWeight !== undefined) result.fontWeight = Math.round(finiteNumber(value.fontWeight, 400, 100, 900))
  if (value.textAlign === 'left' || value.textAlign === 'center' || value.textAlign === 'right') result.textAlign = value.textAlign
  return result
}

function parseColors(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const colors = value.map(item => safeColor(item)).filter((item): item is string => Boolean(item)).slice(0, 8)
  return colors.length ? colors : undefined
}

function parseNode(value: unknown, depth: number, state: { count: number }): DesignExchangeNode {
  if (!isRecord(value)) throw new Error('设计交换文件包含无效节点')
  if (depth > DESIGN_EXCHANGE_MAX_DEPTH) throw new Error(`设计交换文件嵌套层级超过 ${DESIGN_EXCHANGE_MAX_DEPTH} 层`)
  state.count += 1
  if (state.count > DESIGN_EXCHANGE_MAX_NODES) throw new Error(`设计交换文件节点超过 ${DESIGN_EXCHANGE_MAX_NODES} 个`)
  if (typeof value.id !== 'string' || !value.id.trim()) throw new Error('设计交换文件节点缺少有效 ID')
  const node: DesignExchangeNode = {
    id: boundedString(value.id, `node-${state.count}`, 240),
    name: boundedString(value.name, '未命名节点', 240),
    type: safeNodeType(value.type),
    x: finiteNumber(value.x, 0, -100000, 100000),
    y: finiteNumber(value.y, 0, -100000, 100000),
    width: finiteNumber(value.width, 120, 1, 100000),
    height: finiteNumber(value.height, 60, 1, 100000),
  }
  if (value.rotation !== undefined) node.rotation = finiteNumber(value.rotation, 0, -3600, 3600)
  if (value.visible !== undefined) node.visible = Boolean(value.visible)
  if (value.locked !== undefined) node.locked = Boolean(value.locked)
  if (value.opacity !== undefined) node.opacity = finiteNumber(value.opacity, 1, 0, 1)
  node.fills = parseColors(value.fills)
  node.strokes = parseColors(value.strokes)
  if (value.cornerRadius !== undefined) node.cornerRadius = finiteNumber(value.cornerRadius, 0, 0, 10000)
  node.text = parseText(value.text)
  if (typeof value.codelessType === 'string') node.codelessType = boundedString(value.codelessType, '', 80) || undefined
  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) throw new Error(`节点“${node.name}”的 children 必须是数组`)
    if (value.children.length > DESIGN_EXCHANGE_MAX_NODES) throw new Error('单个节点的子节点数量过多')
    node.children = value.children.map(child => parseNode(child, depth + 1, state))
  }
  return node
}

function textByteLength(value: string) {
  try { return new TextEncoder().encode(value).byteLength } catch { return value.length * 2 }
}

export function migrateDesignExchangeDocument(raw: unknown): DesignExchangeDocument {
  if (!isRecord(raw)) throw new Error('设计交换文件必须是 JSON 对象')
  if (raw.format !== DESIGN_EXCHANGE_FORMAT) throw new Error('不是有效的 codeless-design 设计交换文件')
  const version = Number(raw.schemaVersion)
  if (!Number.isInteger(version) || version < 1) throw new Error('设计交换文件版本号无效')
  if (version > DESIGN_EXCHANGE_SCHEMA_VERSION) throw new Error(`设计交换文件版本 ${version} 高于当前支持版本 ${DESIGN_EXCHANGE_SCHEMA_VERSION}`)
  if (!isRecord(raw.canvas) || !Array.isArray(raw.nodes)) throw new Error('设计交换文件缺少 canvas 或 nodes')
  const sourceRecord = isRecord(raw.source) ? raw.source : {}
  const state = { count: 0 }
  return {
    format: DESIGN_EXCHANGE_FORMAT,
    schemaVersion: DESIGN_EXCHANGE_SCHEMA_VERSION,
    source: {
      kind: sourceRecord.kind === 'figma-plugin' || sourceRecord.kind === 'codeless' ? sourceRecord.kind : 'unknown',
      name: boundedString(sourceRecord.name, '本地设计交换', 160),
      version: boundedString(sourceRecord.version, '1.0.0', 40),
    },
    exportedAt: boundedString(raw.exportedAt, new Date().toISOString(), 80),
    name: boundedString(raw.name, '未命名画板', 240),
    canvas: {
      width: finiteNumber(raw.canvas.width, 960, 1, 100000),
      height: finiteNumber(raw.canvas.height, 720, 1, 100000),
      background: safeColor(raw.canvas.background, '#f7f8fb') || '#f7f8fb',
    },
    nodes: raw.nodes.map(node => parseNode(node, 0, state)),
  }
}

export function parseDesignExchangeDocument(text: string): DesignExchangeDocument {
  if (typeof text !== 'string' || textByteLength(text) > DESIGN_EXCHANGE_MAX_BYTES) throw new Error('设计交换文件超过 25 MB，已拒绝读取')
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('设计交换文件不是有效的 JSON') }
  return migrateDesignExchangeDocument(raw)
}

export function createDesignExchangeDocument(document: DesignExchangeDocument): DesignExchangeDocument {
  return migrateDesignExchangeDocument(JSON.parse(JSON.stringify(document)) as unknown)
}

export function serializeDesignExchangeDocument(document: DesignExchangeDocument) {
  const normalized = createDesignExchangeDocument(document)
  const content = `${JSON.stringify(normalized, null, 2)}\n`
  if (textByteLength(content) > DESIGN_EXCHANGE_MAX_BYTES) throw new Error('设计交换文件超过 25 MB，已拒绝导出')
  return content
}

export function designExchangeDocumentFromLayout(layout: PageLayout, nodes: DesignExchangeNode[], source: DesignExchangeDocument['source'], name = layout.pageName): DesignExchangeDocument {
  return createDesignExchangeDocument({
    format: DESIGN_EXCHANGE_FORMAT,
    schemaVersion: DESIGN_EXCHANGE_SCHEMA_VERSION,
    source,
    exportedAt: new Date().toISOString(),
    name: name || '未命名画板',
    canvas: { ...layout.canvas },
    nodes,
  })
}

export type DesignExchangeNodeLike = DesignExchangeNode | LowCodeWidget
