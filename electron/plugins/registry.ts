import { cp, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parsePluginManifest, type CodelessPluginManifest, type InstalledPlugin } from '../../src/types/plugin'

interface PersistedPluginState {
  enabled?: boolean
  installedAt?: string
}

type PluginStateFile = Record<string, PersistedPluginState>

const PLUGIN_DIRECTORY_NAME = 'plugins'
const PLUGIN_STATE_FILE = '.registry.json'
const MAX_PLUGIN_BYTES = 25 * 1024 * 1024
const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

function pluginIdIsValid(id: string) {
  return PLUGIN_ID_PATTERN.test(id) && id.length <= 128
}

function isPathInside(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function entryPath(pluginDirectory: string, entry: string) {
  const resolved = path.resolve(pluginDirectory, entry)
  if (!isPathInside(pluginDirectory, resolved)) throw new Error(`插件入口超出插件目录：${entry}`)
  return resolved
}

async function fileExists(filePath: string) {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function assertNoSymlinks(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    const metadata = await lstat(target)
    if (metadata.isSymbolicLink()) throw new Error(`插件目录不允许包含符号链接：${entry.name}`)
    if (metadata.isDirectory()) await assertNoSymlinks(target)
  }
}

async function directorySize(directory: string, current = 0): Promise<number> {
  if (current > MAX_PLUGIN_BYTES) return current
  const entries = await readdir(directory, { withFileTypes: true })
  let total = current
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) total = await directorySize(target, total)
    else if (entry.isFile()) total += (await stat(target)).size
    if (total > MAX_PLUGIN_BYTES) return total
  }
  return total
}

async function readState(statePath: string): Promise<PluginStateFile> {
  try {
    const parsed = JSON.parse(await readFile(statePath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as PluginStateFile
  } catch {
    return {}
  }
}

async function writeState(statePath: string, state: PluginStateFile) {
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

async function readManifest(pluginDirectory: string): Promise<CodelessPluginManifest> {
  const manifestPath = path.join(pluginDirectory, 'manifest.json')
  return parsePluginManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
}

export class PluginRegistry {
  readonly rootDirectory: string
  readonly statePath: string

  constructor(userDataDirectory: string) {
    this.rootDirectory = path.join(userDataDirectory, PLUGIN_DIRECTORY_NAME)
    this.statePath = path.join(this.rootDirectory, PLUGIN_STATE_FILE)
  }

  async ensureDirectory() {
    await mkdir(this.rootDirectory, { recursive: true })
  }

  async list(): Promise<InstalledPlugin[]> {
    await this.ensureDirectory()
    const state = await readState(this.statePath)
    const entries = await readdir(this.rootDirectory, { withFileTypes: true })
    const plugins: InstalledPlugin[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !pluginIdIsValid(entry.name)) continue
      const pluginDirectory = path.join(this.rootDirectory, entry.name)
      const pluginState = state[entry.name] || {}
      try {
        const manifest = await readManifest(pluginDirectory)
        const mainPath = manifest.main ? entryPath(pluginDirectory, manifest.main) : ''
        const uiPath = manifest.ui ? entryPath(pluginDirectory, manifest.ui) : ''
        const hasMain = mainPath ? await fileExists(mainPath) : false
        const hasUi = uiPath ? await fileExists(uiPath) : false
        const missing: string[] = []
        if (manifest.main && !hasMain) missing.push(`main 不存在：${manifest.main}`)
        if (manifest.ui && !hasUi) missing.push(`ui 不存在：${manifest.ui}`)
        const installedAt = pluginState.installedAt || (await stat(path.join(pluginDirectory, 'manifest.json'))).birthtime.toISOString()
        plugins.push({
          manifest,
          status: missing.length ? 'invalid' : pluginState.enabled === false ? 'disabled' : 'ready',
          installedAt,
          hasMain,
          hasUi,
          ...(missing.length ? { error: missing.join('；') } : {}),
        })
      } catch (error) {
        plugins.push({
          manifest: {
            manifestVersion: 1,
            id: entry.name,
            name: entry.name,
            version: 'unknown',
            engines: { codeless: '*' },
            permissions: [],
            network: 'none',
          },
          status: 'invalid',
          installedAt: pluginState.installedAt || new Date(0).toISOString(),
          hasMain: false,
          hasUi: false,
          error: error instanceof Error ? error.message : '插件 manifest 无法读取',
        })
      }
    }
    return plugins.sort((left, right) => left.manifest.name.localeCompare(right.manifest.name, 'zh-CN'))
  }

  async install(manifestFilePath: string): Promise<InstalledPlugin> {
    const sourceManifestPath = path.resolve(manifestFilePath)
    if (path.basename(sourceManifestPath).toLowerCase() !== 'manifest.json') throw new Error('请选择插件目录中的 manifest.json')
    const sourceDirectory = path.dirname(sourceManifestPath)
    const sourceInfo = await stat(sourceDirectory)
    if (!sourceInfo.isDirectory()) throw new Error('插件来源必须是本地目录')
    await assertNoSymlinks(sourceDirectory)
    const size = await directorySize(sourceDirectory)
    if (size > MAX_PLUGIN_BYTES) throw new Error('插件目录超过 25 MB，已拒绝安装')

    const manifest = await readManifest(sourceDirectory)
    const sourceMain = manifest.main ? entryPath(sourceDirectory, manifest.main) : ''
    const sourceUi = manifest.ui ? entryPath(sourceDirectory, manifest.ui) : ''
    if (manifest.main && !(await fileExists(sourceMain))) throw new Error(`插件 main 不存在：${manifest.main}`)
    if (manifest.ui && !(await fileExists(sourceUi))) throw new Error(`插件 ui 不存在：${manifest.ui}`)

    await this.ensureDirectory()
    const destination = path.join(this.rootDirectory, manifest.id)
    const temporary = path.join(this.rootDirectory, `.${manifest.id}.install-${process.pid}-${Date.now()}`)
    await rm(temporary, { recursive: true, force: true })
    try {
      await cp(sourceDirectory, temporary, { recursive: true, force: false, errorOnExist: true })
      await rm(destination, { recursive: true, force: true })
      await rename(temporary, destination)
    } finally {
      await rm(temporary, { recursive: true, force: true }).catch(() => undefined)
    }

    const state = await readState(this.statePath)
    state[manifest.id] = { enabled: true, installedAt: new Date().toISOString() }
    await writeState(this.statePath, state)
    const installed = (await this.list()).find(plugin => plugin.manifest.id === manifest.id)
    if (!installed) throw new Error('插件安装后无法读取 manifest')
    return installed
  }

  async remove(id: string) {
    if (!pluginIdIsValid(id)) throw new Error('插件 ID 无效')
    await rm(path.join(this.rootDirectory, id), { recursive: true, force: true })
    const state = await readState(this.statePath)
    delete state[id]
    await writeState(this.statePath, state)
  }

  async setEnabled(id: string, enabled: boolean) {
    if (!pluginIdIsValid(id)) throw new Error('插件 ID 无效')
    const installed = (await this.list()).find(plugin => plugin.manifest.id === id)
    if (!installed) throw new Error('插件不存在')
    if (installed.status === 'invalid') throw new Error('manifest 或插件入口无效，不能启用')
    const state = await readState(this.statePath)
    state[id] = { ...(state[id] || {}), enabled }
    await writeState(this.statePath, state)
    return (await this.list()).find(plugin => plugin.manifest.id === id) as InstalledPlugin
  }

  async getUiPath(id: string) {
    if (!pluginIdIsValid(id)) throw new Error('插件 ID 无效')
    const installed = (await this.list()).find(plugin => plugin.manifest.id === id)
    if (!installed || installed.status !== 'ready' || !installed.manifest.ui || !installed.hasUi) return null
    return entryPath(path.join(this.rootDirectory, id), installed.manifest.ui)
  }
}

