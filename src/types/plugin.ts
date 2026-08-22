export const CODELESS_PLUGIN_MANIFEST_VERSION = 1 as const

export const PLUGIN_PERMISSIONS = [
  'document.read',
  'document.write',
  'selection.read',
  'storage.plugin',
  'assets.read',
  'data.read',
] as const

export type PluginPermission = typeof PLUGIN_PERMISSIONS[number]
export type PluginNetworkPolicy = 'none' | 'local'

export interface PluginEngineRequirements {
  codeless: string
}

export interface CodelessPluginManifest {
  manifestVersion: typeof CODELESS_PLUGIN_MANIFEST_VERSION
  id: string
  name: string
  version: string
  description?: string
  author?: string
  license?: string
  main?: string
  ui?: string
  engines: PluginEngineRequirements
  permissions: PluginPermission[]
  network: PluginNetworkPolicy
}

export type PluginStatus = 'ready' | 'disabled' | 'invalid'

export interface InstalledPlugin {
  manifest: CodelessPluginManifest
  status: PluginStatus
  installedAt: string
  hasMain: boolean
  hasUi: boolean
  error?: string
}

export interface PluginInstallResult {
  canceled: boolean
  plugin?: InstalledPlugin
}

export interface PluginValidationResult {
  manifest?: CodelessPluginManifest
  errors: string[]
}

const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const RELATIVE_ENTRY_PATTERN = /^(?![\\/])(?:[^\\/:*?"<>|]+[\\/])*[^\\/:*?"<>|]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readText(value: unknown, field: string, errors: string[], options: { required?: boolean; max?: number } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    if (options.required !== false) errors.push(`${field} 必须是非空字符串`)
    return ''
  }
  const text = value.trim()
  if (options.max && text.length > options.max) errors.push(`${field} 不能超过 ${options.max} 个字符`)
  return text
}

function normalizeEntry(value: unknown, field: string, errors: string[]) {
  const entry = readText(value, field, errors, { required: false, max: 240 })
  if (!entry) return undefined
  if (entry.includes('://') || !RELATIVE_ENTRY_PATTERN.test(entry) || entry.split(/[\\/]/).some(part => part === '..')) {
    errors.push(`${field} 必须是插件目录内的相对路径`)
    return undefined
  }
  return entry.replaceAll('\\', '/')
}

export function validatePluginManifest(input: unknown): PluginValidationResult {
  const errors: string[] = []
  if (!isRecord(input)) return { errors: ['manifest 必须是 JSON 对象'] }

  if (input.manifestVersion !== CODELESS_PLUGIN_MANIFEST_VERSION) {
    errors.push(`manifestVersion 必须为 ${CODELESS_PLUGIN_MANIFEST_VERSION}`)
  }

  const id = readText(input.id, 'id', errors, { max: 128 })
  if (id && !PLUGIN_ID_PATTERN.test(id)) errors.push('id 只能包含小写字母、数字、点、短横线和下划线')
  const name = readText(input.name, 'name', errors, { max: 120 })
  const version = readText(input.version, 'version', errors, { max: 64 })
  const description = readText(input.description, 'description', errors, { required: false, max: 500 }) || undefined
  const author = readText(input.author, 'author', errors, { required: false, max: 120 }) || undefined
  const license = readText(input.license, 'license', errors, { required: false, max: 80 }) || undefined

  const engines = isRecord(input.engines) ? input.engines : {}
  const codeless = readText(engines.codeless, 'engines.codeless', errors, { max: 64 })
  const permissionsInput = Array.isArray(input.permissions) ? input.permissions : []
  if (!Array.isArray(input.permissions)) errors.push('permissions 必须是数组')
  const permissions = [...new Set(permissionsInput.filter((permission): permission is PluginPermission => {
    if (typeof permission !== 'string' || !PLUGIN_PERMISSIONS.includes(permission as PluginPermission)) {
      errors.push(`不支持的插件权限：${String(permission)}`)
      return false
    }
    return true
  }))]

  const network = input.network === undefined ? 'none' : input.network
  if (network !== 'none') errors.push('当前版本仅允许 network: "none"，插件不得访问网络')

  const main = normalizeEntry(input.main, 'main', errors)
  const ui = normalizeEntry(input.ui, 'ui', errors)
  if (!main && !ui) errors.push('main 和 ui 至少配置一个')

  if (errors.length) return { errors }
  return {
    errors: [],
    manifest: {
      manifestVersion: CODELESS_PLUGIN_MANIFEST_VERSION,
      id,
      name,
      version,
      ...(description ? { description } : {}),
      ...(author ? { author } : {}),
      ...(license ? { license } : {}),
      ...(main ? { main } : {}),
      ...(ui ? { ui } : {}),
      engines: { codeless },
      permissions,
      network: 'none',
    },
  }
}

export function parsePluginManifest(input: unknown): CodelessPluginManifest {
  const result = validatePluginManifest(input)
  if (!result.manifest) throw new Error(`插件 manifest 无效：${result.errors.join('；')}`)
  return result.manifest
}
