import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import type { Area } from '../composables/utils'
import type { LowCodeProject } from '../types/lowcode'

export type AppModule = 'home' | 'workspace'
export type WorkspaceArea = Exclude<Area, 'workspace'>

export interface AppRouteRecord {
  name: string
  path: string
  module: AppModule
  area?: Area
  title: string
}

export interface AppRouteLocation {
  name: string
  path: string
  module: AppModule
  area: Area
  projectId?: string
  params: Record<string, string>
  query: Record<string, string>
}

export type AppNavigationTarget = 'home' | WorkspaceArea | string

export const appRoutes: AppRouteRecord[] = [
  { name: 'home', path: '/', module: 'home', area: 'workspace', title: '应用首页' },
  { name: 'home-alias', path: '/home', module: 'home', area: 'workspace', title: '应用首页' },
  { name: 'workspace', path: '/workspace/:projectId', module: 'workspace', area: 'builder', title: '页面设计' },
  { name: 'workspace-builder', path: '/workspace/:projectId/builder', module: 'workspace', area: 'builder', title: '页面设计' },
  { name: 'workspace-data', path: '/workspace/:projectId/data', module: 'workspace', area: 'data', title: '数据模型' },
  { name: 'workspace-flows', path: '/workspace/:projectId/flows', module: 'workspace', area: 'flows', title: '自动化流程' },
  { name: 'workspace-activity', path: '/workspace/:projectId/activity', module: 'workspace', area: 'activity', title: '运行日志' },
  { name: 'workspace-plugins', path: '/workspace/:projectId/plugins', module: 'workspace', area: 'plugins', title: '本地插件' },
]

interface AppShellRouterOptions {
  activeArea: Ref<Area>
  currentProjectId: Ref<string>
  projects: Ref<LowCodeProject[]>
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  isDirty: () => boolean
}

const workspaceAreas = new Set<WorkspaceArea>(['builder', 'data', 'flows', 'activity', 'plugins'])

function cleanPath(path: string) {
  const value = path.split('?')[0].replace(/\\/g, '/')
  if (!value || value === '/index.html' || value.endsWith('/index.html')) return '/'
  const normalized = value.replace(/\/+/g, '/').replace(/\/$/, '')
  return normalized || '/'
}

function queryFromPath(path: string) {
  const [, queryString = ''] = path.split('?')
  const query: Record<string, string> = {}
  new URLSearchParams(queryString).forEach((value, key) => { query[key] = value })
  return query
}

function pathWithoutQuery(path: string) {
  return cleanPath(path)
}

function queryStringFromRecord(query: Record<string, string>) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => params.set(key, value))
  const value = params.toString()
  return value ? `?${value}` : ''
}

function historyPath(location: AppRouteLocation) {
  return `${location.path}${queryStringFromRecord(location.query)}`
}

function encodeProjectId(projectId: string) {
  return encodeURIComponent(projectId)
}

function decodeProjectId(projectId: string) {
  try { return decodeURIComponent(projectId) } catch { return projectId }
}

function isLegacyWorkspacePath(path: string) {
  return /^\/(builder|data|flows|activity|plugins)$/.test(cleanPath(path))
}

function locationForHome(path = '/') : AppRouteLocation {
  const clean = path === '/home' ? '/home' : '/'
  return {
    name: clean === '/home' ? 'home-alias' : 'home',
    path: clean,
    module: 'home',
    area: 'workspace',
    params: {},
    query: queryFromPath(path),
  }
}

function locationForWorkspace(projectId: string, area: WorkspaceArea, sourcePath = ''): AppRouteLocation {
  return {
    name: `workspace-${area}`,
    path: `/workspace/${encodeProjectId(projectId)}/${area}`,
    module: 'workspace',
    area,
    projectId,
    params: { projectId },
    query: sourcePath ? queryFromPath(sourcePath) : {},
  }
}

function locationForPath(path: string, fallbackProjectId: string): AppRouteLocation | null {
  const clean = pathWithoutQuery(path)
  if (clean === '/' || clean === '/home') return locationForHome(clean)

  const workspaceMatch = clean.match(/^\/workspace\/([^/]+)(?:\/(builder|data|flows|activity|plugins))?$/)
  if (workspaceMatch) {
    return locationForWorkspace(decodeProjectId(workspaceMatch[1]), (workspaceMatch[2] as WorkspaceArea | undefined) || 'builder', path)
  }

  const legacyMatch = clean.match(/^\/(builder|data|flows|activity|plugins)$/)
  if (legacyMatch && fallbackProjectId) return locationForWorkspace(fallbackProjectId, legacyMatch[1] as WorkspaceArea, path)

  return null
}

function sameLocation(left: AppRouteLocation, right: AppRouteLocation) {
  return left.path === right.path
    && left.module === right.module
    && left.area === right.area
    && left.projectId === right.projectId
    && queryStringFromRecord(left.query) === queryStringFromRecord(right.query)
}

export function createAppShellRouter(options: AppShellRouterOptions) {
  const initialPath = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search
  const initialLocation = locationForPath(initialPath, options.currentProjectId.value) || locationForHome()
  const currentRoute = ref<AppRouteLocation>(initialLocation)
  const navigating = ref(false)
  let pendingLegacyPath = isLegacyWorkspacePath(initialPath) ? initialPath : ''

  function applyLocation(location: AppRouteLocation) {
    options.activeArea.value = location.area
    if (location.projectId) options.currentProjectId.value = location.projectId
    currentRoute.value = location
  }

  function confirmLeave(next: AppRouteLocation) {
    const current = currentRoute.value
    if (!options.isDirty() || current.module !== 'workspace') return true
    if (next.module === 'workspace' && next.projectId === current.projectId && next.area === current.area) return true
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
    return window.confirm('当前页面存在未保存更改，是否继续离开？')
  }

  function writeHistory(location: AppRouteLocation, replace = false) {
    if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') return
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', historyPath(location))
  }

  function resolveTarget(target: AppNavigationTarget): AppRouteLocation | null {
    if (target === 'home' || target === 'workspace' || target === '/') return locationForHome('/')
    if (workspaceAreas.has(target as WorkspaceArea)) {
      const projectId = options.currentProjectId.value || options.projects.value[0]?.id
      return projectId ? locationForWorkspace(projectId, target as WorkspaceArea) : null
    }
    return locationForPath(target, options.currentProjectId.value || options.projects.value[0]?.id || '')
  }

  function navigate(target: AppNavigationTarget, config: { replace?: boolean; silent?: boolean } = {}) {
    const next = resolveTarget(target)
    if (!next) {
      if (!config.silent) options.notify('请先创建或打开一个应用，再进入工作区', 'info')
      return false
    }
    if (!confirmLeave(next)) return false
    const from = currentRoute.value
    if (sameLocation(from, next)) return true
    applyLocation(next)
    writeHistory(next, Boolean(config.replace))
    return true
  }

  function openWorkspace(projectId: string, area: WorkspaceArea = 'builder') {
    if (!projectId) return navigate('home')
    return navigate(`/workspace/${encodeProjectId(projectId)}/${area}`)
  }

  function handlePopState() {
    const next = locationForPath(window.location.pathname + window.location.search, options.currentProjectId.value) || locationForHome()
    if (!confirmLeave(next)) {
      writeHistory(currentRoute.value, true)
      return
    }
    applyLocation(next)
  }

  watch(options.projects, () => {
    const firstProject = options.projects.value[0]

    if (!firstProject) {
      if (currentRoute.value.module === 'workspace') {
        const next = locationForHome('/')
        applyLocation(next)
        writeHistory(next, true)
      }
      return
    }

    if (currentRoute.value.module === 'home' && pendingLegacyPath) {
      const legacyLocation = locationForPath(pendingLegacyPath, firstProject.id)
      pendingLegacyPath = ''
      if (legacyLocation?.module === 'workspace') {
        applyLocation(legacyLocation)
        writeHistory(legacyLocation, true)
        return
      }
    }

    if (currentRoute.value.module !== 'workspace') return
    const currentId = currentRoute.value.projectId
    const exists = currentId && options.projects.value.some(project => project.id === currentId)
    if (!exists && workspaceAreas.has(currentRoute.value.area as WorkspaceArea)) {
      const next = locationForWorkspace(firstProject.id, currentRoute.value.area as WorkspaceArea)
      applyLocation(next)
      writeHistory(next, true)
    }
  }, { deep: true })

  onMounted(() => {
    applyLocation(initialLocation)
    window.addEventListener('popstate', handlePopState)
  })
  onUnmounted(() => window.removeEventListener('popstate', handlePopState))

  const module = computed<AppModule>(() => currentRoute.value.module)
  const isHome = computed(() => module.value === 'home')
  const isWorkspace = computed(() => module.value === 'workspace')

  return {
    currentRoute,
    module,
    isHome,
    isWorkspace,
    navigating,
    navigate,
    openWorkspace,
    resolveTarget,
    isShellPath: (target: string) => Boolean(locationForPath(target, options.currentProjectId.value || options.projects.value[0]?.id || '')),
  }
}
