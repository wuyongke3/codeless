import { ipcRenderer, contextBridge } from 'electron'
import type { DataQueryOptions, LowCodeProject, RowInput } from '../../src/types/lowcode'

// Only expose the small, typed surface that the renderer needs.
contextBridge.exposeInMainWorld('lowcode', {
  bootstrap: () => ipcRenderer.invoke('lowcode:bootstrap'),
  saveProject: (project: LowCodeProject) => ipcRenderer.invoke('lowcode:save-project', project),
  duplicateProject: (projectId: string) => ipcRenderer.invoke('lowcode:duplicate-project', projectId),
  deleteProject: (projectId: string) => ipcRenderer.invoke('lowcode:delete-project', projectId),
  listTables: () => ipcRenderer.invoke('lowcode:list-tables'),
  describeTable: (tableName: string) => ipcRenderer.invoke('lowcode:describe-table', tableName),
  queryRows: (table: string, options?: DataQueryOptions) => ipcRenderer.invoke('lowcode:query-rows', table, options),
  insertRow: (input: RowInput) => ipcRenderer.invoke('lowcode:insert-row', input),
  updateRow: (input: RowInput & { id: unknown }) => ipcRenderer.invoke('lowcode:update-row', input),
  deleteRow: (table: string, id: unknown) => ipcRenderer.invoke('lowcode:delete-row', table, id),
  submitForm: (input: RowInput) => ipcRenderer.invoke('lowcode:submit-form', input),
})
