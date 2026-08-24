import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { ActivityItem, LocalAssetImportResult, LowCodePage, LowCodeProject, PageGuardConfig, PageLayout } from '../types/lowcode'
import type { DesignExchangeDocument } from '../types/designExchange'
import { addProjectPage, activateProjectPage, clone, makeId, syncProjectPages, type Area } from './utils'
import { useAppRouter } from './useAppRouter'
import { useDataModel } from './useDataModel'
import { useDesigner } from './useDesigner'
import { useProjectManager } from './useProjectManager'
import { useRuntime } from './useRuntime'
import { useReview } from './useReview'
import { browserApi } from './browserData'
import { usePlugins } from './usePlugins'
import { useCollaboration } from './useCollaboration'
import { exportDesignExchangeFromProject, importDesignExchangeDocument } from './designExchange'
import { createAppShellRouter } from '../router/appRouter'
import type { LayoutPatch } from './layoutHistory'
import { applyProjectHistoryPatch, createProjectHistoryPatch, type ProjectHistoryPatch } from './projectHistory'

export function useLowcode() {
  const loading = ref(true)
  const projects = ref<LowCodeProject[]>([])
  const activities = ref<ActivityItem[]>([])
  const databasePath = ref('')
  const activeArea = ref<Area>('builder')
  const currentProjectId = ref('')
  const showPreview = ref(false)
  const showInspectPanel = ref(false)
  const toast = reactive({ show: false, message: '', tone: 'success' as 'success' | 'info' | 'danger' })
  let isWorkspaceDirty = () => false
  const shellRouter = createAppShellRouter({
    activeArea,
    currentProjectId,
    projects,
    notify,
    isDirty: () => isWorkspaceDirty(),
  })
  const appModule = shellRouter.module
  let routeNavigate: (target: string) => void | Promise<boolean> = async target => {
    notify(`导航目标“${target}”暂未配置页面`, 'info')
    return false
  }

  const currentProject = computed(() => projects.value.find(project => project.id === currentProjectId.value))
  const pages = computed(() => currentProject.value?.pages || [])
  const currentPage = computed(() => pages.value.find(page => page.id === currentProject.value?.currentPageId) || pages.value[0])
  const pageTitle = computed(() => {
    if (activeArea.value === 'workspace') return '应用工作台'
    if (activeArea.value === 'data') return '数据模型'
    if (activeArea.value === 'flows') return '自动化流程'
    if (activeArea.value === 'activity') return '运行日志'
    if (activeArea.value === 'plugins') return '本地插件'
    return currentProject.value?.name || '页面设计'
  })
  const publishedCount = computed(() => projects.value.filter(project => project.status === 'published').length)
  const totalWidgets = computed(() => projects.value.reduce((sum, project) => sum + project.layout.widgets.length, 0))

  function notify(message: string, tone: 'success' | 'info' | 'danger' = 'success') {
    toast.message = message
    toast.tone = tone
    toast.show = true
    window.setTimeout(() => { toast.show = false }, 2600)
  }

  function toggleInspectPanel() {
    showInspectPanel.value = !showInspectPanel.value
  }

  async function importAsset(): Promise<LocalAssetImportResult> {
    const api = window.lowcode || browserApi
    return api.importAsset()
  }

  if (!window.lowcode) window.lowcode = browserApi

  const plugins = usePlugins(notify)
  const dataModel = useDataModel(currentProject, notify)
  let historyClock = 0
  const projectHistoryStack = ref<ProjectHistoryPatch[]>([])
  const projectFutureStack = ref<ProjectHistoryPatch[]>([])
  const historyTimeline = ref<Array<{ kind: 'layout' | 'project'; sequence: number }>>([])
  const redoTimeline = ref<Array<{ kind: 'layout' | 'project'; sequence: number }>>([])
  let pendingProjectHistoryBefore: LowCodeProject | null = null
  let projectHistoryTimer: number | null = null
  let undoHistory: () => void = () => undefined
  let redoHistory: () => void = () => undefined
  const MAX_HISTORY_ENTRIES = 40

  function pruneProjectHistory() {
    while (projectHistoryStack.value.length > MAX_HISTORY_ENTRIES) {
      const pruned = projectHistoryStack.value.shift()
      if (!pruned) continue
      historyTimeline.value = historyTimeline.value.filter(entry => !(entry.kind === 'project' && entry.sequence === pruned.sequence))
      redoTimeline.value = redoTimeline.value.filter(entry => !(entry.kind === 'project' && entry.sequence === pruned.sequence))
    }
  }

  function pushProjectHistory(patch: ProjectHistoryPatch) {
    projectHistoryStack.value.push(patch)
    pruneProjectHistory()
  }

  async function selectPage(pageId: string) {
    const project = currentProject.value
    if (!project) return false
    syncProjectPages(project)
    if (!project.pages?.some(page => page.id === pageId)) return false
    if (project.currentPageId === pageId) return true

    // Switching pages must never discard the final edit that is still inside the
    // autosave debounce window. The manager resolves only after the latest live
    // snapshot has reached persistence.
    await designer.flushAutoSave()
    if (currentProject.value !== project) return false
    if (!activateProjectPage(project, pageId)) return false

    designer.resetDesigner()
    runtime.resetRuntimeValues()
    return true
  }

  function createPage(input: { name: string; path: string }) {
    const project = currentProject.value
    if (!project) return false
    const name = input.name.trim()
    if (!name) return false
    const pathValue = input.path.trim() || name
    const path = (pathValue.startsWith('/') ? pathValue : `/${pathValue}`).replace(/\/+/g, '/')
    const usedPaths = new Set((project.pages || []).map(page => page.path))
    if (usedPaths.has(path)) {
      notify('A page already uses this path.', 'danger')
      return false
    }
    const sourceLayout = project.layout
    const layout: PageLayout = {
      version: sourceLayout.version,
      pageName: name,
      canvas: { ...sourceLayout.canvas, x: 0, y: 0 },
      widgets: [],
    }
    const page: LowCodePage = { id: makeId('page'), name, path, layout, guards: [] }
    beginProjectHistory()
    addProjectPage(project, page)
    commitProjectHistory()
    designer.resetDesigner({ preserveProjectHistory: true })
    runtime.resetRuntimeValues()
    designer.markDirty()
    notify(`Created page "${name}".`)
    return true
  }

  function duplicatePage(pageId = currentProject.value?.currentPageId || '') {
    const project = currentProject.value
    const source = project?.pages?.find(page => page.id === pageId)
    if (!project || !source) return false
    const copy = clone(source)
    const widgetIdMap = new Map<string, string>()
    copy.id = makeId('page')
    copy.name = `${source.name} 副本`
    copy.path = `${source.path}-copy`
    while (project.pages?.some(page => page.path === copy.path)) copy.path = `${copy.path}-${Date.now().toString().slice(-3)}`
    copy.layout.pageName = copy.name
    copy.layout.widgets.forEach(widget => {
      widgetIdMap.set(widget.id, makeId('widget'))
    })
    copy.layout.widgets.forEach(widget => {
      const oldId = widget.id
      widget.id = widgetIdMap.get(oldId) || makeId('widget')
      widget.config?.interaction.events.forEach(event => event.actions.forEach(action => {
        if (action.target && widgetIdMap.has(action.target)) action.target = widgetIdMap.get(action.target)
      }))
    })
    beginProjectHistory()
    addProjectPage(project, copy)
    commitProjectHistory()
    designer.resetDesigner({ preserveProjectHistory: true })
    runtime.resetRuntimeValues()
    designer.markDirty()
    notify(`已复制页面“${source.name}”`)
    return true
  }

  function renamePage(pageId = currentProject.value?.currentPageId || '') {
    const project = currentProject.value
    const page = project?.pages?.find(item => item.id === pageId)
    if (!project || !page) return false
    const name = window.prompt('请输入页面名称', page.name)?.trim()
    if (!name) return false
    const pathInput = window.prompt('请输入页面路径', page.path)?.trim()
    beginProjectHistory()
    page.name = name
    page.layout.pageName = name
    if (pathInput) page.path = pathInput.startsWith('/') ? pathInput : `/${pathInput}`
    const route = project.routes?.find(item => item.pageId === page.id)
    if (route) { route.path = page.path; route.title = page.name }
    if (project.currentPageId === page.id) project.layout.pageName = name
    commitProjectHistory()
    designer.markDirty()
    notify(`页面“${name}”已更新`)
    return true
  }

  function deletePage(pageId = currentProject.value?.currentPageId || '') {
    const project = currentProject.value
    if (!project?.pages || project.pages.length <= 1) {
      notify('至少保留一个页面', 'info')
      return false
    }
    const page = project.pages.find(item => item.id === pageId)
    if (!page || !window.confirm(`确定删除页面“${page.name}”吗？`)) return false
    const next = project.pages.find(item => item.id !== page.id)!
    beginProjectHistory()
    project.pages = project.pages.filter(item => item.id !== page.id)
    project.routes = (project.routes || []).filter(route => route.pageId !== page.id)
    activateProjectPage(project, next.id)
    commitProjectHistory()
    designer.resetDesigner({ preserveProjectHistory: true })
    runtime.resetRuntimeValues()
    designer.markDirty()
    notify(`页面“${page.name}”已删除`, 'info')
    return true
  }

  function updateCurrentPageProperties(patch: {
    name?: string
    canvas?: Partial<PageLayout['canvas']>
  }) {
    const project = currentProject.value
    const page = currentPage.value
    if (!project || !page) return false
    const nextName = patch.name?.trim()
    const canvasPatch = patch.canvas || {}
    const hasNameChange = nextName !== undefined && nextName !== '' && nextName !== page.name
    const numberInRange = (value: unknown, fallback: number, min: number, max: number) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? Math.round(Math.max(min, Math.min(max, parsed))) : fallback
    }
    const background = typeof canvasPatch.background === 'string' && /^#[0-9a-f]{6}$/i.test(canvasPatch.background.trim())
      ? canvasPatch.background.trim()
      : page.layout.canvas.background
    const nextCanvas = {
      ...page.layout.canvas,
      width: numberInRange(canvasPatch.width, page.layout.canvas.width, 160, 10000),
      height: numberInRange(canvasPatch.height, page.layout.canvas.height, 160, 10000),
      x: numberInRange(canvasPatch.x, page.layout.canvas.x || 0, -100000, 100000),
      y: numberInRange(canvasPatch.y, page.layout.canvas.y || 0, -100000, 100000),
      background,
    }
    const canvasChanged = Object.entries(nextCanvas).some(([key, value]) => page.layout.canvas[key as keyof PageLayout['canvas']] !== value)
    if (!hasNameChange && !canvasChanged) return false

    beginProjectHistory()
    if (hasNameChange && nextName) {
      page.name = nextName
      page.layout.pageName = nextName
      const route = project.routes?.find(item => item.pageId === page.id)
      if (route) route.title = nextName
    }
    Object.assign(page.layout.canvas, nextCanvas)
    if (project.currentPageId === page.id) project.layout = page.layout
    commitProjectHistory()
    designer.markDirty()
    return true
  }

  function updatePagePath(pageId: string, value: string) {
    const project = currentProject.value
    const page = project?.pages?.find(item => item.id === pageId)
    if (!project || !page) return false
    const nextPath = value.trim() ? (value.trim().startsWith('/') ? value.trim() : '/' + value.trim()) : '/index'
    const duplicate = project.pages?.some(item => item.id !== page.id && item.path === nextPath) ?? false
    if (duplicate) return false
    beginProjectHistory()
    page.path = nextPath
    const route = project.routes?.find(item => item.pageId === page.id)
    if (route) route.path = nextPath
    commitProjectHistory()
    designer.markDirty()
    return true
  }

  function setEntryPage(pageId: string) {
    const project = currentProject.value
    if (!project?.pages?.some(page => page.id === pageId)) return false
    beginProjectHistory()
    project.entryPageId = pageId
    commitProjectHistory()
    designer.markDirty()
    return true
  }

  function addPageGuard(pageId = currentProject.value?.currentPageId || '', type: PageGuardConfig['type'] = 'auth') {
    const page = currentProject.value?.pages?.find(item => item.id === pageId)
    if (!page) return false
    beginProjectHistory()
    page.guards ||= []
    page.guards.push({ id: makeId('guard'), type, enabled: true })
    commitProjectHistory()
    designer.markDirty()
    return true
  }

  function updatePageGuard(pageId: string, guardId: string, patch: Partial<PageGuardConfig>) {
    const guard = currentProject.value?.pages?.find(item => item.id === pageId)?.guards?.find(item => item.id === guardId)
    if (!guard) return false
    beginProjectHistory()
    Object.assign(guard, patch)
    scheduleProjectHistoryCommit()
    designer.markDirty()
    return true
  }

  function removePageGuard(pageId: string, guardId: string) {
    const page = currentProject.value?.pages?.find(item => item.id === pageId)
    if (!page?.guards?.some(guard => guard.id === guardId)) return false
    beginProjectHistory()
    page.guards = page.guards.filter(guard => guard.id !== guardId)
    commitProjectHistory()
    designer.markDirty()
    return true
  }

  function navigate(target: string) {
    if (target === 'workspace' || target === 'home' || target === '/') return shellRouter.navigate('home')
    const areas: Area[] = ['builder', 'data', 'flows', 'activity', 'plugins']
    if (areas.includes(target as Area)) return shellRouter.navigate(target as Area)
    if (shellRouter.isShellPath(target)) return shellRouter.navigate(target)
    return routeNavigate(target)
  }

  const runtime = useRuntime({
    currentProject,
    notify,
    submitData: (table, values) => dataModel.submitValuesToTable(table, values),
    navigate,
    navigateBack: () => appRouter?.navigateBack(),
    setRouteState: (target, value) => appRouter?.setRouteState(target, value),
    emitPageEvent: (event, payload) => appRouter?.emitPageEvent(event, payload),
  })

  watch(currentProjectId, () => runtime.resetRuntimeValues())
  let saveProject: (message?: string) => Promise<void> = async () => undefined
  let publishCollaborationProject: (project: LowCodeProject) => Promise<void> = async () => undefined
  const designer = useDesigner(currentProject, notify, message => saveProject(message), activeArea, {
    nextSequence: () => ++historyClock,
    onUndo: () => undoHistory(),
    onRedo: () => redoHistory(),
    onHistoryCommitted: (patch: LayoutPatch) => {
      if (typeof patch.sequence !== 'number') return
      historyTimeline.value.push({ kind: 'layout', sequence: patch.sequence })
      redoTimeline.value = []
    },
    onHistoryPruned: (patch: LayoutPatch) => {
      if (typeof patch.sequence !== 'number') return
      historyTimeline.value = historyTimeline.value.filter(entry => !(entry.kind === 'layout' && entry.sequence === patch.sequence))
      redoTimeline.value = redoTimeline.value.filter(entry => !(entry.kind === 'layout' && entry.sequence === patch.sequence))
    },
    onLayoutHistoryReset: () => {
      historyTimeline.value = historyTimeline.value.filter(entry => entry.kind === 'project')
      redoTimeline.value = redoTimeline.value.filter(entry => entry.kind === 'project')
    },
    onHistoryReset: () => {
      historyTimeline.value = []
      redoTimeline.value = []
      projectHistoryStack.value = []
      projectFutureStack.value = []
      pendingProjectHistoryBefore = null
      if (projectHistoryTimer !== null) window.clearTimeout(projectHistoryTimer)
      projectHistoryTimer = null
    },
    onHistoryBranchReset: () => {
      redoTimeline.value = []
      projectFutureStack.value = []
    },
  })
  isWorkspaceDirty = () => designer.dirty.value

  function beginProjectHistory() {
    const project = currentProject.value
    if (!project) return
    designer.flushHistory()
    if (!pendingProjectHistoryBefore) pendingProjectHistoryBefore = clone(project)
    projectFutureStack.value = []
    designer.clearFutureHistory()
    redoTimeline.value = []
  }

  function commitProjectHistory() {
    if (projectHistoryTimer !== null) window.clearTimeout(projectHistoryTimer)
    projectHistoryTimer = null
    const project = currentProject.value
    const before = pendingProjectHistoryBefore
    pendingProjectHistoryBefore = null
    if (!project || !before) return
    const patch = createProjectHistoryPatch(before, project, ++historyClock)
    if (!patch) return
    pushProjectHistory(patch)
    historyTimeline.value.push({ kind: 'project', sequence: patch.sequence })
    redoTimeline.value = []
  }

  function scheduleProjectHistoryCommit() {
    if (projectHistoryTimer !== null) window.clearTimeout(projectHistoryTimer)
    projectHistoryTimer = window.setTimeout(() => commitProjectHistory(), 450)
  }

  function undo() {
    designer.flushHistory()
    const entry = historyTimeline.value.pop()
    if (!entry) return
    if (entry.kind === 'layout') {
      designer.undo()
    } else {
      const patch = projectHistoryStack.value.pop()
      const project = currentProject.value
      if (!patch || !project) return
      projectFutureStack.value.push(patch)
      applyProjectHistoryPatch(project, patch, 'undo')
      designer.syncHistoryBaseline()
      designer.clearSelection()
      designer.markDirty()
    }
    redoTimeline.value.push(entry)
  }

  function redo() {
    const entry = redoTimeline.value.pop()
    if (!entry) return
    if (entry.kind === 'layout') {
      designer.redo()
    } else {
      const patch = projectFutureStack.value.pop()
      const project = currentProject.value
      if (!patch || !project) return
      pushProjectHistory(patch)
      applyProjectHistoryPatch(project, patch, 'redo')
      designer.syncHistoryBaseline()
      designer.clearSelection()
      designer.markDirty()
    }
    historyTimeline.value.push(entry)
  }
  undoHistory = undo
  redoHistory = redo

  const manager = useProjectManager({
    loading,
    projects,
    activities,
    databasePath,
    activeArea,
    currentProjectId,
    currentProject,
    dirty: designer.dirty,
    dirtyRevision: designer.dirtyRevision,
    selectedWidgetId: designer.selectedWidgetId,
    notify,
    loadTables: dataModel.loadTables,
    resetDesigner: designer.resetDesigner,
    publishCollaborationProject: project => publishCollaborationProject(project),
    navigateToArea: (area, projectId) => {
      if (area === 'workspace') return shellRouter.navigate('home')
      if (projectId) return shellRouter.openWorkspace(projectId, area as 'builder' | 'data' | 'flows' | 'activity' | 'plugins')
      return shellRouter.navigate(area as 'builder' | 'data' | 'flows' | 'activity' | 'plugins')
    },
  })
  saveProject = manager.saveProject

  const collaboration = useCollaboration({
    currentProject,
    projects,
    currentProjectId,
    notify,
    applyProjectUpdate: project => {
      designer.resetDesigner()
      runtime.resetRuntimeValues()
      designer.dirty.value = false
      if (project.id === currentProjectId.value) selectPage(project.currentPageId || project.pages?.[0]?.id || '')
    },
  })
  publishCollaborationProject = collaboration.publishProject

  async function exportDesignExchange() {
    const project = currentProject.value
    if (!project) return
    try {
      const documentFile = exportDesignExchangeFromProject(project, designer.selectedWidgetIds.value)
      const api = window.lowcode || browserApi
      const result = await api.exportDesignExchange(documentFile)
      if (!result.canceled) notify('????????????')
    } catch (error) {
      console.error(error)
      notify('??????????????????', 'danger')
    }
  }

  async function importDesignExchange() {
    try {
      const api = window.lowcode || browserApi
      const result = await api.importDesignExchange()
      if (result.canceled || !result.document) return
      const conversion = importDesignExchangeDocument(result.document as DesignExchangeDocument, 0, 0)
      const inserted = designer.insertWidgets(conversion.widgets)
      if (!inserted.length) {
        notify('??????????????', 'info')
        return
      }
      notify(`???${conversion.sourceName}??? ${conversion.nodeCount} ?????`)
    } catch (error) {
      console.error(error)
      notify('???????????????????', 'danger')
    }
  }

  const review = useReview(currentProject, designer.selectedWidgetId, designer.markDirty, notify)

  const appRouter = useAppRouter({
    currentProject,
    selectPage,
    notify,
    isDirty: () => designer.dirty.value,
  })
  const { navigate: pageNavigate, currentPage: routePage, ...routerApi } = appRouter
  routeNavigate = pageNavigate

  onMounted(() => { void manager.bootstrap() })

  return {
    loading, projects, activities, databasePath, activeArea, currentProjectId, currentProject, pages, currentPage, pageTitle,
    appModule, appRoute: shellRouter.currentRoute, isHome: shellRouter.isHome, isWorkspace: shellRouter.isWorkspace,
    publishedCount, totalWidgets, showPreview, showInspectPanel, toast, navigate, notify, toggleInspectPanel, importAsset,
    selectPage, createPage, duplicatePage, renamePage, deletePage, updateCurrentPageProperties, updatePagePath, setEntryPage, addPageGuard, updatePageGuard, removePageGuard,
    exportDesignExchange, importDesignExchange,
    ...collaboration,
    ...designer,
    historyStack: computed(() => historyTimeline.value.map(entry => entry.sequence)),
    futureStack: computed(() => redoTimeline.value.map(entry => entry.sequence)),
    undo, redo, beginProjectHistory,
    ...manager,
    ...dataModel,
    ...runtime,
    ...review,
    ...plugins,
    ...routerApi,
    routePage,
  }
}
