import { computed, reactive, ref, watch, type ComputedRef } from 'vue'
import type { LowCodePage, LowCodeProject, RouteConfig } from '../types/lowcode'

export interface AppRouteLocation {
  path: string
  pageId: string
  params: Record<string, string>
  state: Record<string, unknown>
}

type GuardResult = boolean | string | void | Promise<boolean | string | void>
type RouteHook = (to: AppRouteLocation, from: AppRouteLocation | null) => GuardResult
type PageEventHandler = (payload: unknown, context: { event: string; route: AppRouteLocation }) => void

interface AppRouterOptions {
  currentProject: ComputedRef<LowCodeProject | undefined>
  selectPage: (pageId: string) => boolean
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  isDirty?: () => boolean
}

const emptyRoute = (): AppRouteLocation => ({ path: '', pageId: '', params: {}, state: {} })

function parseTarget(target: string) {
  const value = String(target || '').trim()
  const [pathname, queryString = ''] = value.split('?')
  const params: Record<string, string> = {}
  new URLSearchParams(queryString).forEach((item, key) => { params[key] = item })
  return { pathname: pathname || '/', params }
}

function readPath(source: unknown, path: string): unknown {
  if (!path) return source
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, source)
}

function parseLiteral(value: string, context: Record<string, unknown>): unknown {
  const trimmed = value.trim()
  if (trimmed in context) return context[trimmed]
  const resolved = readPath(context, trimmed)
  if (resolved !== undefined) return resolved
  if (trimmed === 'null') return null
  if (trimmed === 'undefined') return undefined
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1)
  const number = Number(trimmed)
  return Number.isNaN(number) ? trimmed : number
}

function evaluateExpression(expression: string | undefined, context: Record<string, unknown>) {
  if (!expression?.trim()) return true
  const evaluate = (raw: string): boolean => {
    const item = raw.trim()
    if (item.includes('||')) return item.split('||').some(evaluate)
    if (item.includes('&&')) return item.split('&&').every(evaluate)
    if (item.startsWith('!')) return !evaluate(item.slice(1))
    const comparison = item.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/)
    if (!comparison) return Boolean(parseLiteral(item, context))
    const left = parseLiteral(comparison[1], context)
    const right = parseLiteral(comparison[3], context)
    switch (comparison[2]) {
      case '===': return left === right
      case '!==': return left !== right
      case '==': return left == right
      case '!=': return left != right
      case '>=': return Number(left) >= Number(right)
      case '<=': return Number(left) <= Number(right)
      case '>': return Number(left) > Number(right)
      case '<': return Number(left) < Number(right)
      default: return false
    }
  }
  try { return evaluate(expression) } catch { return false }
}

function guardList(page: LowCodePage, route?: RouteConfig) {
  const seen = new Set<string>()
  return [...(route?.guards || []), ...(page.guards || [])].filter(guard => {
    if (seen.has(guard.id)) return false
    seen.add(guard.id)
    return guard.enabled !== false
  })
}

export function useAppRouter(options: AppRouterOptions) {
  const currentRoute = ref<AppRouteLocation>(emptyRoute())
  const routeState = reactive<Record<string, unknown>>({})
  const history = ref<AppRouteLocation[]>([])
  const beforeHooks = new Set<RouteHook>()
  const afterHooks = new Set<(to: AppRouteLocation, from: AppRouteLocation | null) => void>()
  const pageEvents = new Map<string, Set<PageEventHandler>>()
  let syncing = false

  const currentPage = computed(() => {
    const project = options.currentProject.value
    return project?.pages?.find(page => page.id === currentRoute.value.pageId) || project?.pages?.find(page => page.id === project.currentPageId)
  })

  function routeForPage(page: LowCodePage, params: Record<string, string> = {}, state: Record<string, unknown> = {}): AppRouteLocation {
    return { path: page.path || '/index', pageId: page.id, params, state: { ...state } }
  }

  function resolveTarget(target: string, state: Record<string, unknown> = {}) {
    const project = options.currentProject.value
    if (!project?.pages?.length) return null
    const { pathname, params } = parseTarget(target)
    const route = project.routes?.find(item => item.path === pathname || item.id === target || item.pageId === target)
    const page = route ? project.pages.find(item => item.id === route.pageId) : project.pages.find(item => item.id === target || item.path === pathname)
    if (!page) return null
    return { page, route, location: routeForPage(page, params, state) }
  }

  function syncFromProject() {
    const project = options.currentProject.value
    if (!project?.pages?.length || syncing) return
    const page = project.pages.find(item => item.id === project.currentPageId) || project.pages[0]
    if (!page) return
    const current = currentRoute.value
    if (current.pageId === page.id && current.path === page.path) return
    syncing = true
    currentRoute.value = routeForPage(page, current.params, current.state)
    Object.keys(routeState).forEach(key => delete routeState[key])
    Object.assign(routeState, current.state)
    syncing = false
  }

  watch(() => options.currentProject.value?.id, syncFromProject, { immediate: true })
  watch(() => options.currentProject.value?.currentPageId, syncFromProject)

  async function runGuards(to: AppRouteLocation, from: AppRouteLocation | null, route: RouteConfig | undefined, page: LowCodePage | undefined, redirectDepth = 0): Promise<boolean> {
    const project = options.currentProject.value
    if (!project || !page) return false
    for (const hook of beforeHooks) {
      const result = await hook(to, from)
      if (result === false) return false
      if (typeof result === 'string') {
        if (redirectDepth >= 3) return false
        return navigate(result, {}, redirectDepth + 1)
      }
    }
    const context: Record<string, unknown> = {
      ...routeState,
      routeState,
      sharedState: project.sharedState || {},
      params: to.params,
      isLoggedIn: Boolean((project.sharedState || {}).isLoggedIn || routeState.isLoggedIn),
    }
    for (const guard of guardList(page, route)) {
      let allowed = true
      if (guard.type === 'auth') allowed = Boolean(context.isLoggedIn)
      else if (guard.type === 'condition') allowed = evaluateExpression(guard.expression, context)
      else if (guard.type === 'unsaved' && options.isDirty?.()) {
        allowed = typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(guard.message || '当前页面存在未保存更改，是否继续离开？')
          : false
      }
      if (allowed) continue
      options.notify(guard.message || '导航被页面守卫拦截', 'info')
      if (guard.redirect && redirectDepth < 3) return navigate(guard.redirect, {}, redirectDepth + 1)
      return false
    }
    return true
  }

  async function navigate(target: string, state: Record<string, unknown> = {}, redirectDepth = 0, skipHistory = false): Promise<boolean> {
    const resolved = resolveTarget(target, state)
    if (!resolved) {
      options.notify(`导航目标“${target}”暂未配置页面`, 'info')
      return false
    }
    const from = currentRoute.value.pageId ? currentRoute.value : null
    const to = resolved.location
    const allowed = await runGuards(to, from, resolved.route, resolved.page, redirectDepth)
    if (!allowed) return false
    if (!options.selectPage(resolved.page.id)) return false
    if (!skipHistory && from && (from.pageId !== to.pageId || from.path !== to.path)) history.value.push({ ...from, params: { ...from.params }, state: { ...from.state } })
    currentRoute.value = to
    Object.keys(routeState).forEach(key => delete routeState[key])
    Object.assign(routeState, to.state)
    for (const hook of afterHooks) hook(to, from)
    return true
  }

  async function navigateBack() {
    const previous = history.value[history.value.length - 1]
    if (!previous) return false
    const query = Object.keys(previous.params).length ? `?${new URLSearchParams(previous.params).toString()}` : ''
    const result = await navigate(`${previous.path}${query}`, previous.state, 0, true)
    if (result) history.value.pop()
    return result
  }

  function beforeEach(hook: RouteHook) {
    beforeHooks.add(hook)
    return () => beforeHooks.delete(hook)
  }

  function afterEach(hook: (to: AppRouteLocation, from: AppRouteLocation | null) => void) {
    afterHooks.add(hook)
    return () => afterHooks.delete(hook)
  }

  function setRouteState(target: string | Record<string, unknown>, value?: unknown) {
    if (typeof target === 'string') {
      if (target.trim().startsWith('{')) {
        try { Object.assign(routeState, JSON.parse(target)) } catch { options.notify('路由状态必须是有效 JSON', 'danger') }
      } else if (target.startsWith('shared.')) {
        const project = options.currentProject.value
        if (!project) return
        project.sharedState ||= {}
        project.sharedState[target.slice(7)] = value
      } else routeState[target] = value
    } else Object.assign(routeState, target)
    if (currentRoute.value.pageId) currentRoute.value.state = { ...routeState }
  }

  function onPageEvent(event: string, handler: PageEventHandler) {
    const handlers = pageEvents.get(event) || new Set<PageEventHandler>()
    handlers.add(handler)
    pageEvents.set(event, handlers)
    return () => offPageEvent(event, handler)
  }

  function offPageEvent(event: string, handler: PageEventHandler) {
    const handlers = pageEvents.get(event)
    handlers?.delete(handler)
    if (handlers && !handlers.size) pageEvents.delete(event)
  }

  function emitPageEvent(event: string, payload?: unknown) {
    const context = { event, route: currentRoute.value }
    for (const handler of [...(pageEvents.get(event) || []), ...(pageEvents.get('*') || [])]) handler(payload, context)
  }

  function clearHistory() { history.value = [] }

  return {
    currentRoute, currentPage, routeState, history,
    navigate, navigateBack, beforeEach, afterEach,
    setRouteState, emitPageEvent, onPageEvent, offPageEvent, clearHistory,
  }
}
