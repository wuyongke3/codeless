import { computed, ref, type Ref } from 'vue'

export interface DesignerCommandContext {
  [key: string]: any
}

export interface DesignerCommand {
  id: string
  label: string
  description?: string
  keywords?: string[]
  shortcut?: string
  group: '画布' | '编辑' | '交付'
  enabled?: (context: DesignerCommandContext) => boolean
  run: (context: DesignerCommandContext) => void | Promise<void>
}

function invoke(context: DesignerCommandContext, method: string, ...args: unknown[]) {
  const handler = context?.[method]
  if (typeof handler === 'function') handler(...args)
}

export function createDesignerCommands(context: DesignerCommandContext): DesignerCommand[] {
  return [
    { id: 'undo', label: '撤销', description: '撤销最近一次编辑', keywords: ['undo', '回退'], shortcut: 'Ctrl/Cmd+Z', group: '编辑', enabled: () => Boolean(context.historyStack?.length), run: () => invoke(context, 'undo') },
    { id: 'redo', label: '重做', description: '重放已撤销的编辑', keywords: ['redo'], shortcut: 'Ctrl/Cmd+Shift+Z', group: '编辑', enabled: () => Boolean(context.futureStack?.length), run: () => invoke(context, 'redo') },
    { id: 'select-all', label: '选择全部组件', description: '选中当前页面的所有组件', keywords: ['select all', '全选'], shortcut: 'Ctrl/Cmd+A', group: '编辑', run: () => invoke(context, 'selectAllWidgets') },
    { id: 'copy', label: '复制选中组件', keywords: ['copy'], shortcut: 'Ctrl/Cmd+C', group: '编辑', enabled: () => Boolean(context.selectedWidgetIds?.length), run: () => invoke(context, 'copySelectedWidgets') },
    { id: 'paste', label: '粘贴组件', keywords: ['paste'], shortcut: 'Ctrl/Cmd+V', group: '编辑', enabled: () => Boolean(context.canPaste), run: () => invoke(context, 'pasteWidgets') },
    { id: 'duplicate', label: '复制并粘贴选中组件', keywords: ['duplicate', '复制'], shortcut: 'Ctrl/Cmd+D', group: '编辑', enabled: () => Boolean(context.selectedWidgetIds?.length), run: () => invoke(context, 'duplicateSelectedWidget') },
    { id: 'delete', label: '删除选中组件', keywords: ['delete', 'remove'], shortcut: 'Delete', group: '编辑', enabled: () => Boolean(context.selectedWidgetIds?.length), run: () => invoke(context, 'removeSelectedWidget') },
    { id: 'bring-front', label: '置于顶层', keywords: ['z-index', 'front'], group: '画布', enabled: () => Boolean(context.selectedWidgetIds?.length), run: () => invoke(context, 'bringToFront') },
    { id: 'send-back', label: '置于底层', keywords: ['z-index', 'back'], group: '画布', enabled: () => Boolean(context.selectedWidgetIds?.length), run: () => invoke(context, 'sendToBack') },
    { id: 'fit-page', label: '适配页面', description: '将当前页面完整放入画布视口', keywords: ['fit', 'page', '适配'], shortcut: 'Shift+1', group: '画布', run: () => invoke(context, 'fitCanvas', 'page') },
    { id: 'fit-selection', label: '适配选区', description: '将选中组件放入画布视口', keywords: ['fit', 'selection', '选区'], shortcut: 'Shift+2', group: '画布', enabled: () => Boolean(context.selectedWidgetIds?.length), run: () => invoke(context, 'fitCanvas', 'selection') },
    { id: 'zoom-in', label: '放大画布', keywords: ['zoom in', '放大'], shortcut: 'Ctrl/Cmd++', group: '画布', run: () => invoke(context, 'zoomBy', 1.1) },
    { id: 'zoom-out', label: '缩小画布', keywords: ['zoom out', '缩小'], shortcut: 'Ctrl/Cmd+-', group: '画布', run: () => invoke(context, 'zoomBy', 0.9) },
    { id: 'save', label: '保存项目', description: '立即写入本地项目文件', keywords: ['save', '保存'], shortcut: 'Ctrl/Cmd+S', group: '交付', run: () => invoke(context, 'saveProject') },
    { id: 'preview', label: '打开运行预览', keywords: ['preview', '预览'], group: '交付', run: () => { invoke(context, 'resetRuntimeValues'); context.showPreview = true } },
    { id: 'review', label: '打开 Review', keywords: ['review', '审阅'], group: '交付', run: () => invoke(context, 'toggleReviewPanel') },
    { id: 'inspect', label: '打开 Inspect', keywords: ['inspect', 'codegen'], group: '交付', enabled: () => Boolean(context.selectedWidget), run: () => invoke(context, 'toggleInspectPanel') },
  ]
}

export function useDesignerCommandSearch(context: DesignerCommandContext, open: Ref<boolean>) {
  const query = refString('')
  const commands = computed(() => createDesignerCommands(context))
  const availableCommands = computed(() => commands.value.filter(command => !command.enabled || command.enabled(context)))
  const filteredCommands = computed(() => {
    const normalized = query.value.trim().toLowerCase()
    if (!normalized) return availableCommands.value
    return availableCommands.value.filter(command => [command.label, command.description, ...(command.keywords || [])].filter(Boolean).join(' ').toLowerCase().includes(normalized))
  })
  function close() { open.value = false; query.value = '' }
  return { query, commands, availableCommands, filteredCommands, close }
}

function refString(initial: string) {
  return ref(initial) as Ref<string>
}
