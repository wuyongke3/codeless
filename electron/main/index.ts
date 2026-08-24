import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, webContents, type IpcMainInvokeEvent } from 'electron'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import type { LocalAssetImportResult, LowCodeProject, ReviewPackage } from '../../src/types/lowcode'
import type { DesignExchangeDocument } from '../../src/types/designExchange'
import { createCodelessDocument, parseCodelessDocument, serializeCodelessDocument } from '../../src/types/projectFile'
import { parseDesignExchangeDocument, serializeDesignExchangeDocument } from '../../src/types/designExchange'
import { DatabaseClient } from '../database/client'
import { PluginRegistry } from '../plugins/registry'
import { CollaborationHub } from '../collaboration/hub'
import type { CollaborationCreateInput, CollaborationJoinInput } from '../../src/types/collaboration'

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
const windows = new Set<BrowserWindow>()
let collaborationHub: CollaborationHub | null = null
let databaseClient: DatabaseClient | null = null
let pluginRegistry: PluginRegistry | null = null
let databasePath = ''
let isQuitting = false

const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
const appIcon = path.join(process.env.VITE_PUBLIC, 'logo.png')
const databaseWorkerPath = path.join(MAIN_DIST, 'database/worker.js')
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const now = () => new Date().toISOString()
const isSmokeTest = process.env.CODELESS_SMOKE_TEST === '1'
const devServerOrigin = VITE_DEV_SERVER_URL ? new URL(VITE_DEV_SERVER_URL).origin : ''
const appFileUrl = pathToFileURL(indexHtml).href

const MAX_CODELESS_FILE_BYTES = 50 * 1024 * 1024
const MAX_LOCAL_ASSET_BYTES = 10 * 1024 * 1024
const MAX_DESIGN_EXCHANGE_BYTES = 25 * 1024 * 1024
const LOCAL_ASSET_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

function safeFileStem(value: string) {
  const stem = String(value || 'codeless-project').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '')
  return stem || 'codeless-project'
}

async function writeTextAtomically(filePath: string, contents: string) {
  const directory = path.dirname(filePath)
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await mkdir(directory, { recursive: true })
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temporaryPath, 'w')
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    try {
      // Rename within the same directory so the normal path is atomic.
      await rename(temporaryPath, filePath)
    } catch (firstError) {
      // Windows may reject replacing an existing target; use a recoverable backup.
      const backupPath = `${filePath}.backup-${process.pid}-${Date.now()}`
      let movedExisting = false
      try {
        await rename(filePath, backupPath)
        movedExisting = true
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') throw firstError
      }
      try {
        await rename(temporaryPath, filePath)
      } catch (replaceError) {
        if (movedExisting) {
          try { await rename(backupPath, filePath) } catch { /* Keep the backup for manual recovery. */ }
        }
        throw replaceError
      }
      if (movedExisting) await rm(backupPath, { force: true })
    }
  } finally {
    if (handle) await handle.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function writeRecoverySnapshot(project: LowCodeProject) {
  const recoveryDirectory = path.join(app.getPath('userData'), 'recovery')
  const recoveryPath = path.join(recoveryDirectory, `${safeFileStem(project.id)}.codeless.recovery`)
  await writeTextAtomically(recoveryPath, serializeCodelessDocument(project))
}

async function initializeDatabase() {
  databasePath = path.join(app.getPath('userData'), 'codeless.sqlite')
  databaseClient = new DatabaseClient()
  await databaseClient.start(databaseWorkerPath, databasePath)
}

function getDatabaseClient() {
  if (!databaseClient) throw new Error('SQLite database utility process is not initialized')
  return databaseClient
}

function getCollaborationHub() {
  if (!collaborationHub) throw new Error('Collaboration module is not initialized')
  return collaborationHub
}

function getPluginRegistry() {
  if (!pluginRegistry) throw new Error('Plugin registry is not initialized')
  return pluginRegistry
}

function isDevServerRequest(url: string) {
  if (!devServerOrigin) return false
  try {
    const expected = new URL(devServerOrigin)
    const actual = new URL(url)
    return actual.hostname === expected.hostname && actual.port === expected.port
  } catch {
    return false
  }
}

function configureOfflineSession() {
  const pluginRoot = path.join(app.getPath('userData'), 'plugins')
  const pluginRootUrl = pathToFileURL(pluginRoot + path.sep).href
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    // Vite's local development origin is the only HTTP exception. Production
    // and plugin frames remain offline by default; external links use shell.openExternal.
    callback({ cancel: !isDevServerRequest(details.url) })
  })
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['file://*/*'] }, (details, callback) => {
    if (!details.url.startsWith(pluginRootUrl)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    const responseHeaders = { ...details.responseHeaders }
    responseHeaders['Content-Security-Policy'] = [
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'",
    ]
    callback({ responseHeaders })
  })
}

function isTrustedAppUrl(url: string) {
  if (url === appFileUrl) return true
  return Boolean(devServerOrigin && (url === devServerOrigin || url.startsWith(`${devServerOrigin}/`)))
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url || event.sender.getURL()
  if (!isTrustedAppUrl(senderUrl)) {
    throw new Error('Blocked IPC request from an untrusted frame')
  }
}

function registerCollaborationHandlers() {
  ipcMain.handle('lowcode:collaboration-create', (event, input: CollaborationCreateInput) => {
    assertTrustedSender(event)
    return getCollaborationHub().createSession(event.sender, input)
  })
  ipcMain.handle('lowcode:collaboration-join', (event, input: CollaborationJoinInput) => {
    assertTrustedSender(event)
    return getCollaborationHub().joinSession(event.sender, input)
  })
  ipcMain.handle('lowcode:collaboration-get', (event) => {
    assertTrustedSender(event)
    return getCollaborationHub().getSession(event.sender)
  })
  ipcMain.handle('lowcode:collaboration-publish', async (event, project: LowCodeProject) => {
    assertTrustedSender(event)
    await getCollaborationHub().publishProject(event.sender, project)
    return { success: true }
  })
  ipcMain.handle('lowcode:collaboration-leave', async (event) => {
    assertTrustedSender(event)
    await getCollaborationHub().leave(event.sender)
    return { success: true }
  })
  ipcMain.handle('lowcode:collaboration-open-window', async (event) => {
    assertTrustedSender(event)
    const session = getCollaborationHub().getSession(event.sender)
    if (!session || session.mode !== 'same-device') throw new Error('The current session does not support same-device windows')
    await createWindow(session.id)
    return { success: true }
  })
}

function getWindowForEvent(event: IpcMainInvokeEvent) {
  const target = BrowserWindow.fromWebContents(event.sender)
  if (!target || target.isDestroyed()) throw new Error('Window is no longer available')
  return target
}

function registerWindowHandlers() {
  ipcMain.handle('window:minimize', event => {
    assertTrustedSender(event)
    getWindowForEvent(event).minimize()
    return { success: true }
  })
  ipcMain.handle('window:toggle-maximize', event => {
    assertTrustedSender(event)
    const target = getWindowForEvent(event)
    if (target.isMaximized()) target.unmaximize()
    else target.maximize()
    const maximized = target.isMaximized()
    target.webContents.send('window:state', { maximized })
    return { maximized }
  })
  ipcMain.handle('window:close', event => {
    assertTrustedSender(event)
    getWindowForEvent(event).close()
    return { success: true }
  })
  ipcMain.handle('window:get-state', event => {
    assertTrustedSender(event)
    return { maximized: getWindowForEvent(event).isMaximized() }
  })
}

function registerIpcHandlers() {
  ipcMain.handle('lowcode:bootstrap', (event) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('bootstrap')
  })

  ipcMain.handle('lowcode:export-project', async (event, project: LowCodeProject) => {
    assertTrustedSender(event)
    const document = createCodelessDocument(project)
    const result = await dialog.showSaveDialog(win || undefined, {
      title: '\u5bfc\u51fa Codeless \u672c\u5730\u9879\u76ee',
      defaultPath: path.join(app.getPath('documents'), `${safeFileStem(document.project.name)}.codeless`),
      filters: [{ name: 'Codeless \u9879\u76ee', extensions: ['codeless'] }, { name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    await writeTextAtomically(result.filePath, JSON.stringify(document, null, 2) + '\n')
    return { canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('lowcode:export-design-exchange', async (event, documentFile: DesignExchangeDocument) => {
    assertTrustedSender(event)
    const content = serializeDesignExchangeDocument(documentFile)
    if (Buffer.byteLength(content, 'utf8') > MAX_DESIGN_EXCHANGE_BYTES) throw new Error('Design exchange exceeds 25 MB and was rejected')
    const result = await dialog.showSaveDialog(win || undefined, {
      title: 'Export Codeless design exchange',
      defaultPath: path.join(app.getPath('documents'), `${safeFileStem(documentFile?.name || 'codeless-design')}.codeless-design.json`),
      filters: [{ name: 'Codeless design exchange', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    await writeTextAtomically(result.filePath, content)
    return { canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('lowcode:export-review-package', async (event, reviewPackage: ReviewPackage) => {
    assertTrustedSender(event)
    const content = JSON.stringify(reviewPackage, null, 2) + '\n'
    if (Buffer.byteLength(content, 'utf8') > MAX_CODELESS_FILE_BYTES) {
      throw new Error('\u5ba1\u9605\u5305\u8d85\u8fc7 50 MB\uff0c\u5df2\u62d2\u7edd\u5bfc\u51fa')
    }
    const projectName = reviewPackage?.project?.name || 'codeless-review'
    const result = await dialog.showSaveDialog(win || undefined, {
      title: '\u5bfc\u51fa Codeless \u672c\u5730\u5ba1\u9605\u5305',
      defaultPath: path.join(app.getPath('documents'), `${safeFileStem(projectName)}.codeless-review.json`),
      filters: [{ name: 'Codeless \u5ba1\u9605\u5305', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    await writeTextAtomically(result.filePath, content)
    return { canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('lowcode:import-review-package', async (event) => {
    assertTrustedSender(event)
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Import Codeless local review package',
      properties: ['openFile'],
      filters: [{ name: 'Codeless review package', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const filePath = result.filePaths[0]
    const fileInfo = await stat(filePath)
    if (fileInfo.size > MAX_CODELESS_FILE_BYTES) throw new Error('Review package exceeds 50 MB and was rejected')
    let reviewPackage: unknown
    try {
      reviewPackage = JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      throw new Error('Review package is not valid JSON')
    }
    return { canceled: false, filePath, reviewPackage }
  })

  ipcMain.handle('lowcode:import-asset', async (event): Promise<LocalAssetImportResult> => {
    assertTrustedSender(event)
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Import local asset',
      properties: ['openFile'],
      filters: [{ name: 'Images and SVG', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const filePath = result.filePaths[0]
    const extension = path.extname(filePath).toLowerCase()
    const mimeType = LOCAL_ASSET_MIME_TYPES[extension]
    if (!mimeType) throw new Error('Only PNG, JPG, WEBP, GIF, and SVG assets are supported')
    const fileInfo = await stat(filePath)
    if (fileInfo.size > MAX_LOCAL_ASSET_BYTES) throw new Error('Local asset exceeds 10 MB and was rejected')
    const buffer = await readFile(filePath)
    if (extension === '.svg') {
      const svg = buffer.toString('utf8')
      if (/<script\b|\bon[a-z]+\s*=|javascript:/i.test(svg)) throw new Error('SVG contains script or event attributes and was rejected')
    }
    return {
      canceled: false,
      fileName: path.basename(filePath),
      mimeType,
      size: fileInfo.size,
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
    }
  })

  ipcMain.handle('lowcode:import-design-exchange', async (event) => {
    assertTrustedSender(event)
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Import Codeless design exchange',
      properties: ['openFile'],
      filters: [{ name: 'Codeless design exchange', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const filePath = result.filePaths[0]
    const fileInfo = await stat(filePath)
    if (fileInfo.size > MAX_DESIGN_EXCHANGE_BYTES) throw new Error('Design exchange exceeds 25 MB and was rejected')
    const documentFile = parseDesignExchangeDocument(await readFile(filePath, 'utf8'))
    return { canceled: false, filePath, document: documentFile }
  })

  ipcMain.handle('lowcode:import-project', async (event) => {
    assertTrustedSender(event)
    const result = await dialog.showOpenDialog(win || undefined, {
      title: '\u5bfc\u5165 Codeless \u672c\u5730\u9879\u76ee',
      properties: ['openFile'],
      filters: [{ name: 'Codeless \u9879\u76ee', extensions: ['codeless', 'json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const filePath = result.filePaths[0]
    const fileInfo = await stat(filePath)
    if (fileInfo.size > MAX_CODELESS_FILE_BYTES) throw new Error('\u9879\u76ee\u6587\u4ef6\u8d85\u8fc7 50 MB\uff0c\u5df2\u62d2\u7edd\u8bfb\u53d6')
    const document = parseCodelessDocument(await readFile(filePath, 'utf8'))
    return { canceled: false, filePath, schemaVersion: document.schemaVersion, project: document.project }
  })

  ipcMain.handle('lowcode:save-project', async (event, project: Record<string, unknown>) => {
    assertTrustedSender(event)
    const saved = await getDatabaseClient().request<LowCodeProject>('saveProject', project)
    try {
      await writeRecoverySnapshot(saved)
    } catch (error) {
      // SQLite has already committed; a recovery snapshot failure must not block saving.
      console.warn('Failed to write local recovery snapshot', error)
    }
    return saved
  })

  ipcMain.handle('lowcode:duplicate-project', async (event, projectId: string) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('duplicateProject', projectId)
  })

  ipcMain.handle('lowcode:delete-project', async (event, projectId: string) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('deleteProject', projectId)
  })

  ipcMain.handle('lowcode:list-tables', (event) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('listTables')
  })
  ipcMain.handle('lowcode:describe-table', (event, tableName: string) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('describeTable', tableName)
  })
  ipcMain.handle('lowcode:query-rows', (event, table: string, options?: Record<string, unknown>) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('queryRows', table, options || {})
  })
  ipcMain.handle('lowcode:refresh-table', async (event, table: string, options?: Record<string, unknown>) => {
    assertTrustedSender(event)
    const [tables, result] = await getDatabaseClient().requestBatch([
      { method: 'listTables' },
      { method: 'queryRows', args: [table, options || {}] },
    ])
    return { tables, result }
  })
  ipcMain.handle('lowcode:insert-row', (event, input: Record<string, unknown>) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('insertRow', input)
  })
  ipcMain.handle('lowcode:update-row', (event, input: Record<string, unknown>) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('updateRow', input)
  })
  ipcMain.handle('lowcode:delete-row', (event, table: string, id: unknown) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('deleteRow', table, id)
  })
  ipcMain.handle('lowcode:submit-form', (event, input: Record<string, unknown>) => {
    assertTrustedSender(event)
    return getDatabaseClient().request('submitForm', input)
  })
  ipcMain.handle('lowcode:list-plugins', (event) => {
    assertTrustedSender(event)
    return getPluginRegistry().list()
  })
  ipcMain.handle('lowcode:install-plugin', async (event) => {
    assertTrustedSender(event)
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Install local plugin',
      properties: ['openFile'],
      filters: [{ name: 'Codeless plugin manifest', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const plugin = await getPluginRegistry().install(result.filePaths[0])
    return { canceled: false, plugin }
  })
  ipcMain.handle('lowcode:remove-plugin', async (event, id: string) => {
    assertTrustedSender(event)
    await getPluginRegistry().remove(id)
    return { success: true }
  })
  ipcMain.handle('lowcode:set-plugin-enabled', (event, id: string, enabled: boolean) => {
    assertTrustedSender(event)
    return getPluginRegistry().setEnabled(id, Boolean(enabled))
  })
  ipcMain.handle('lowcode:get-plugin-ui-url', async (event, id: string) => {
    assertTrustedSender(event)
    const uiPath = await getPluginRegistry().getUiPath(id)
    return uiPath ? pathToFileURL(uiPath).href : null
  })
}

async function createWindow(sessionId?: string) {
  const createdWindow = new BrowserWindow({
    title: 'Codeless - Local Prototyping Tool',
    icon: appIcon,
    width: 1520,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#f5f6fa',
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  const createdWebContents = createdWindow.webContents
  windows.add(createdWindow)
  if (!win) win = createdWindow
  const syncWindowState = () => createdWindow.webContents.send('window:state', { maximized: createdWindow.isMaximized() })
  createdWindow.on('maximize', syncWindowState)
  createdWindow.on('unmaximize', syncWindowState)
  createdWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppUrl(url)) return
    event.preventDefault()
    if (url.startsWith('https://')) void shell.openExternal(url)
  })

  createdWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  createdWindow.once('ready-to-show', () => {
    if (!isSmokeTest) createdWindow.show()
  })
  createdWindow.on('closed', () => {
    windows.delete(createdWindow)
    collaborationHub?.detachWindow(createdWebContents.id)
    if (win === createdWindow) win = windows.values().next().value || null
  })
  if (VITE_DEV_SERVER_URL) await createdWindow.loadURL(VITE_DEV_SERVER_URL)
  else await createdWindow.loadFile(indexHtml)
  if (sessionId) void getCollaborationHub().attachWindow(createdWebContents, sessionId)

  if (isSmokeTest) {
    console.log('CODELESS_SMOKE_OK')
    setTimeout(() => app.quit(), 1_500)
  }

}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  await initializeDatabase()
  pluginRegistry = new PluginRegistry(app.getPath('userData'))
  await pluginRegistry.ensureDirectory()
  configureOfflineSession()
  registerIpcHandlers()
  registerWindowHandlers()
  collaborationHub = new CollaborationHub((webContentsId, event) => {
    const contents = webContents.fromId(webContentsId)
    if (contents && !contents.isDestroyed()) contents.send('lowcode:collaboration-event', event)
  })
  registerCollaborationHandlers()
  await createWindow()
})

app.on('before-quit', event => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  const client = databaseClient
  const hub = collaborationHub
  databaseClient = null
  pluginRegistry = null
  collaborationHub = null
  void Promise.all([hub?.close(), client?.close()]).finally(() => {
    windows.clear()
    app.quit()
  })
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
