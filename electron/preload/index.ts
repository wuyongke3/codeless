import { contextBridge, ipcRenderer } from 'electron'
import type { CollaborationApi, CollaborationCreateInput, CollaborationEvent, CollaborationJoinInput } from '../../src/types/collaboration'
import type { DataQueryOptions, LocalAssetImportResult, LowCodeProject, ReviewPackage, RowInput } from '../../src/types/lowcode'
import type { DesignExchangeDocument } from '../../src/types/designExchange'
import type { PluginInstallResult, InstalledPlugin } from '../../src/types/plugin'

const collaboration: CollaborationApi = {
  createSession: (input: CollaborationCreateInput) => ipcRenderer.invoke('lowcode:collaboration-create', input),
  joinSession: (input: CollaborationJoinInput) => ipcRenderer.invoke('lowcode:collaboration-join', input),
  getSession: () => ipcRenderer.invoke('lowcode:collaboration-get'),
  publishProject: (project: LowCodeProject) => ipcRenderer.invoke('lowcode:collaboration-publish', project),
  leaveSession: () => ipcRenderer.invoke('lowcode:collaboration-leave'),
  openWindow: () => ipcRenderer.invoke('lowcode:collaboration-open-window'),
  onEvent: (listener: (event: CollaborationEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: CollaborationEvent) => listener(payload)
    ipcRenderer.on('lowcode:collaboration-event', handler)
    return () => ipcRenderer.removeListener('lowcode:collaboration-event', handler)
  },
}

const windowControls = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  getState: () => ipcRenderer.invoke('window:get-state'),
  onStateChange: (listener: (state: { maximized: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: { maximized: boolean }) => listener(state)
    ipcRenderer.on('window:state', handler)
    return () => ipcRenderer.removeListener('window:state', handler)
  },
}

// Only expose the small, typed surface that the renderer needs.
contextBridge.exposeInMainWorld('lowcode', {
  window: windowControls,
  bootstrap: () => ipcRenderer.invoke('lowcode:bootstrap'),
  saveProject: (project: LowCodeProject) => ipcRenderer.invoke('lowcode:save-project', project),
  exportProject: (project: LowCodeProject) => ipcRenderer.invoke('lowcode:export-project', project),
  exportReviewPackage: (reviewPackage: ReviewPackage) => ipcRenderer.invoke('lowcode:export-review-package', reviewPackage),
  importReviewPackage: () => ipcRenderer.invoke('lowcode:import-review-package'),
  exportDesignExchange: (document: DesignExchangeDocument) => ipcRenderer.invoke('lowcode:export-design-exchange', document),
  importAsset: (): Promise<LocalAssetImportResult> => ipcRenderer.invoke('lowcode:import-asset'),
  importProject: () => ipcRenderer.invoke('lowcode:import-project'),
  importDesignExchange: () => ipcRenderer.invoke('lowcode:import-design-exchange'),
  duplicateProject: (projectId: string) => ipcRenderer.invoke('lowcode:duplicate-project', projectId),
  deleteProject: (projectId: string) => ipcRenderer.invoke('lowcode:delete-project', projectId),
  listTables: () => ipcRenderer.invoke('lowcode:list-tables'),
  describeTable: (tableName: string) => ipcRenderer.invoke('lowcode:describe-table', tableName),
  queryRows: (table: string, options?: DataQueryOptions) => ipcRenderer.invoke('lowcode:query-rows', table, options),
  refreshTable: (table: string, options?: DataQueryOptions) => ipcRenderer.invoke('lowcode:refresh-table', table, options),
  insertRow: (input: RowInput) => ipcRenderer.invoke('lowcode:insert-row', input),
  updateRow: (input: RowInput & { id: unknown }) => ipcRenderer.invoke('lowcode:update-row', input),
  deleteRow: (table: string, id: unknown) => ipcRenderer.invoke('lowcode:delete-row', table, id),
  submitForm: (input: RowInput) => ipcRenderer.invoke('lowcode:submit-form', input),
  listPlugins: (): Promise<InstalledPlugin[]> => ipcRenderer.invoke('lowcode:list-plugins'),
  installPlugin: (): Promise<PluginInstallResult> => ipcRenderer.invoke('lowcode:install-plugin'),
  removePlugin: (id: string) => ipcRenderer.invoke('lowcode:remove-plugin', id),
  setPluginEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('lowcode:set-plugin-enabled', id, enabled),
  getPluginUiUrl: (id: string): Promise<string | null> => ipcRenderer.invoke('lowcode:get-plugin-ui-url', id),
  collaboration,
})
