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
import { exportDesignExchangeFromProject, importDesignExchangeDocument } from './designExchange'

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

  function selectPage(pageId: string) {
    const project = currentProject.value
    if (!project) return false
    syncProjectPages(project)
    if (!activateProjectPage(project, pageId)) return false
    designer.resetDesigner()
    runtime.resetRuntimeValues()
    return true
  }

  function createPage() {
    const project = currentProject.value
    if (!project) return false
    const name = window.prompt('请输入页面名称', '新页面')?.trim()
    if (!name) return false
    const suggestedPath = `/${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || 'page'}`
    let path = window.prompt('请输入页面路径', suggestedPath)?.trim() || suggestedPath
    if (!path.startsWith('/')) path = `/${path}`
    const usedPaths = new Set((project.pages || []).map(page => page.path))
    if (usedPaths.has(path)) path = `${path}-${Date.now().toString().slice(-4)}`
    const sourceLayout = project.layout
    const layout: PageLayout = {
      version: sourceLayout.version,
      pageName: name,
      canvas: { ...sourceLayout.canvas },
      widgets: [],
    }
    const page: LowCodePage = { id: makeId('page'), name, path, layout, guards: [] }
    addProjectPage(project, page)
    designer.resetDesigner()
    runtime.resetRuntimeValues()
    designer.markDirty()
    notify(`已创建页面“${name}”`)
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
    addProjectPage(project, copy)
    designer.resetDesigner()
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
    page.name = name
    page.layout.pageName = name
    if (pathInput) page.path = pathInput.startsWith('/') ? pathInput : `/${pathInput}`
    const route = project.routes?.find(item => item.pageId === page.id)
    if (route) { route.path = page.path; route.title = page.name }
    if (project.currentPageId === page.id) project.layout.pageName = name
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
    project.pages = project.pages.filter(item => item.id !== page.id)
    project.routes = (project.routes || []).filter(route => route.pageId !== page.id)
    activateProjectPage(project, next.id)
    designer.resetDesigner()
    runtime.resetRuntimeValues()
    designer.markDirty()
    notify(`页面“${page.name}”已删除`, 'info')
    return true
  }

  function updatePagePath(pageId: string, value: string) {
    const project = currentProject.value
    const page = project?.pages?.find(item => item.id === pageId)
    if (!project || !page) return false
    const nextPath = value.trim() ? (value.trim().startsWith('/') ? value.trim() : '/' + value.trim()) : '/index'
    const duplicate = project.pages?.some(item => item.id !== page.id && item.path === nextPath) ?? false
    if (duplicate) return false
    page.path = nextPath
    const route = project.routes?.find(item => item.pageId === page.id)
    if (route) route.path = nextPath
    designer.markDirty()
    return true
  }

  function setEntryPage(pageId: string) {
    const project = currentProject.value
    if (!project?.pages?.some(page => page.id === pageId)) return false
    project.entryPageId = pageId
    designer.markDirty()
    return true
  }

  function addPageGuard(pageId = currentProject.value?.currentPageId || '', type: PageGuardConfig['type'] = 'auth') {
    const page = currentProject.value?.pages?.find(item => item.id === pageId)
    if (!page) return false
    page.guards ||= []
    page.guards.push({ id: makeId('guard'), type, enabled: true })
    designer.markDirty()
    return true
  }

  function updatePageGuard(pageId: string, guardId: string, patch: Partial<PageGuardConfig>) {
    const guard = currentProject.value?.pages?.find(item => item.id === pageId)?.guards?.find(item => item.id === guardId)
    if (!guard) return false
    Object.assign(guard, patch)
    designer.markDirty()
    return true
  }

  function removePageGuard(pageId: string, guardId: string) {
    const page = currentProject.value?.pages?.find(item => item.id === pageId)
    if (!page?.guards?.some(guard => guard.id === guardId)) return false
    page.guards = page.guards.filter(guard => guard.id !== guardId)
    designer.markDirty()
    return true
  }

  function navigate(target: string) {
    const areas: Area[] = ['workspace', 'builder', 'data', 'flows', 'activity', 'plugins']
    if (areas.includes(target as Area)) {
      activeArea.value = target as Area
      return true
    }
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
  const designer = useDesigner(currentProject, notify, message => saveProject(message), activeArea)
  const manager = useProjectManager({
    loading,
    projects,
    activities,
    databasePath,
    activeArea,
    currentProjectId,
    currentProject,
    dirty: designer.dirty,
    selectedWidgetId: designer.selectedWidgetId,
    notify,
    loadTables: dataModel.loadTables,
    resetDesigner: designer.resetDesigner,
  })
  saveProject = manager.saveProject

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
    publishedCount, totalWidgets, showPreview, showInspectPanel, toast, navigate, notify, toggleInspectPanel, importAsset,
    selectPage, createPage, duplicatePage, renamePage, deletePage, updatePagePath, setEntryPage, addPageGuard, updatePageGuard, removePageGuard,
    exportDesignExchange, importDesignExchange,
    ...designer,
    ...manager,
    ...dataModel,
    ...runtime,
    ...review,
    ...plugins,
    ...routerApi,
    routePage,
  }
}
