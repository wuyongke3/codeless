import { computed, nextTick, reactive, ref, type ComputedRef, type Ref } from 'vue'
import type { ActivityItem, BootstrapData, LowCodeProject, PublishedServiceInfo } from '../types/lowcode'
import { clone, createTemplateLayout, fallbackBootstrap, makeId, type Area } from './utils'
import { normalizeProject } from './widgetConfig'
import { browserExportProject, browserImportProject, browserSaveProject } from './browserData'

interface ProjectManagerOptions {
  loading: Ref<boolean>
  projects: Ref<LowCodeProject[]>
  activities: Ref<ActivityItem[]>
  databasePath: Ref<string>
  activeArea: Ref<Area>
  currentProjectId: Ref<string>
  currentProject: ComputedRef<LowCodeProject | undefined>
  dirty: Ref<boolean>
  dirtyRevision: Ref<number>
  selectedWidgetId: Ref<string>
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  loadTables: () => Promise<void>
  resetDesigner: () => void
  publishCollaborationProject: (project: LowCodeProject) => Promise<void>
  navigateToArea?: (area: Area, projectId?: string) => boolean | Promise<boolean>
}

export function useProjectManager(options: ProjectManagerOptions) {
  const {
    loading, projects, activities, databasePath, activeArea, currentProjectId, currentProject,
    dirty, dirtyRevision, selectedWidgetId, notify, loadTables, resetDesigner, publishCollaborationProject, navigateToArea,
  } = options
  const saving = ref(false)
  const publishing = ref(false)
  const publishedService = ref<PublishedServiceInfo | null>(null)
  interface SaveRequest {
    snapshot: LowCodeProject
    message: string
    resolve: () => void
  }

  // At most one request for each project waits in the queue. New edits replace
  // that request's immutable snapshot and all callers resolve after its latest
  // snapshot has been persisted.
  const pendingSaves = new Map<string, SaveRequest>()
  let saveDrain: Promise<void> | null = null
  const showCreateModal = ref(false)
  const showDeleteConfirm = ref(false)
  const createForm = reactive({ name: '', description: '', category: '业务应用', template: 'dashboard' as 'dashboard' | 'form' | 'blank' })

  async function bootstrap() {
    loading.value = true
    try {
      const result: BootstrapData = window.lowcode ? await window.lowcode.bootstrap() : fallbackBootstrap()
      projects.value = result.projects.map(normalizeProject)
      activities.value = result.activities
      databasePath.value = result.databasePath
      const requestedProjectId = currentProjectId.value
      currentProjectId.value = result.projects.some(project => project.id === requestedProjectId) ? requestedProjectId : result.projects[0]?.id || ''
      await loadTables()
    } catch (error) {
      console.error(error)
      const result = fallbackBootstrap()
      projects.value = result.projects.map(normalizeProject)
      activities.value = result.activities
      databasePath.value = result.databasePath
      const requestedProjectId = currentProjectId.value
      currentProjectId.value = result.projects.some(project => project.id === requestedProjectId) ? requestedProjectId : result.projects[0]?.id || ''
      notify('数据库连接失败，已进入演示模式', 'danger')
    } finally {
      loading.value = false
    }
  }

  async function openBuilder(projectId: string) {
    if (!projectId) return false
    const navigated = await navigateToArea?.('builder', projectId)
    if (navigated === false) return false
    currentProjectId.value = projectId
    activeArea.value = 'builder'
    resetDesigner()
    return true
  }

  function snapshotProject(project: LowCodeProject) {
    project.updatedAt = new Date().toISOString()
    normalizeProject(project)
    return clone(project)
  }

  function matchesSnapshot(project: LowCodeProject | undefined, snapshot: LowCodeProject) {
    return Boolean(project && JSON.stringify(project) === JSON.stringify(snapshot))
  }

  function enqueueSave(project: LowCodeProject, message: string) {
    const snapshot = snapshotProject(project)
    return new Promise<void>(resolve => {
      const pending = pendingSaves.get(snapshot.id)
      if (pending) {
        // Coalesce debounce bursts while preserving every caller that needs to
        // wait for a durable save (for example a page switch).
        pending.snapshot = snapshot
        pending.message = message
        const previousResolve = pending.resolve
        pending.resolve = () => {
          previousResolve()
          resolve()
        }
      } else {
        pendingSaves.set(snapshot.id, { snapshot, message, resolve })
      }
      void drainSaveQueue()
    })
  }

  function requeueLatestProject(projectId: string, request: SaveRequest) {
    const latest = projects.value.find(project => project.id === projectId)
    if (!latest) {
      request.resolve()
      return
    }

    const latestSnapshot = snapshotProject(latest)
    const pending = pendingSaves.get(projectId)
    if (pending) {
      // A newer caller is already waiting. Make its snapshot match the current
      // live project and chain this in-flight caller behind the same write.
      pending.snapshot = latestSnapshot
      pending.message = request.message
      const previousResolve = pending.resolve
      pending.resolve = () => {
        previousResolve()
        request.resolve()
      }
      return
    }

    pendingSaves.set(projectId, {
      snapshot: latestSnapshot,
      message: request.message,
      resolve: request.resolve,
    })
  }

  async function drainSaveQueue() {
    if (saveDrain) return saveDrain
    saveDrain = (async () => {
      saving.value = true
      try {
        while (pendingSaves.size) {
          const [projectId, request] = pendingSaves.entries().next().value as [string, SaveRequest]
          pendingSaves.delete(projectId)
          try {
            const saved = window.lowcode
              ? await window.lowcode.saveProject(clone(request.snapshot))
              : browserSaveProject(request.snapshot)
            const current = projects.value.find(project => project.id === projectId)

            // IPC may complete after another component change, drag, resize or
            // page-property edit. Never write the stale IPC response into Vue
            // state; queue the newest live snapshot instead.
            if (!matchesSnapshot(current, request.snapshot)) {
              requeueLatestProject(projectId, request)
              continue
            }

            await publishCollaborationProject(saved)
            const latest = projects.value.find(project => project.id === projectId)
            if (!matchesSnapshot(latest, request.snapshot)) {
              requeueLatestProject(projectId, request)
              continue
            }

            if (currentProjectId.value === projectId) dirty.value = false
            notify(request.message)
            request.resolve()
          } catch (error) {
            console.error(error)
            // Leave dirty state intact so the next edit or manual save retries.
            notify('本地保存失败，请稍后重试', 'danger')
            request.resolve()
          }
        }
      } finally {
        saving.value = false
        saveDrain = null
        if (pendingSaves.size) void drainSaveQueue()
      }
    })()
    return saveDrain
  }

  function saveProject(message = '项目已保存到 SQLite') {
    const project = currentProject.value
    if (!project) return Promise.resolve()
    return enqueueSave(project, message)
  }

  async function exportProject() {
    if (!currentProject.value) return
    try {
      const result = window.lowcode
        ? await window.lowcode.exportProject(clone(currentProject.value))
        : await browserExportProject(clone(currentProject.value))
      if (!result.canceled) notify('\u9879\u76ee\u5df2\u5bfc\u51fa\u4e3a .codeless \u6587\u4ef6')
    } catch (error) {
      console.error(error)
      notify('\u5bfc\u51fa\u5931\u8d25\uff0c\u672a\u4fee\u6539\u5f53\u524d\u9879\u76ee', 'danger')
    }
  }

  async function importProject() {
    try {
      const result = window.lowcode ? await window.lowcode.importProject() : await browserImportProject()
      const importedProject = result.project
      if (result.canceled || !importedProject) return

      const imported = normalizeProject(clone(importedProject))
      const collision = projects.value.some(project => project.id === imported.id)
      if (collision) {
        const createdAt = new Date().toISOString()
        imported.id = makeId('project')
        imported.name = `${imported.name} \uFF08\u5BFC\u5165\u526F\u672C\uFF09`
        imported.status = 'draft'
        imported.createdAt = createdAt
        imported.updatedAt = createdAt
      }

      const saved = window.lowcode
        ? await window.lowcode.saveProject(clone(imported))
        : browserSaveProject(imported)
      const navigated = await navigateToArea?.('builder', saved.id)
      if (navigated === false) {
        projects.value = [saved, ...projects.value.filter(project => project.id !== saved.id)]
        notify('\u9879\u76ee\u5df2\u5bfc\u5165\uff0c\u5f53\u524d\u7f16\u8f91\u4ecd\u4fdd\u7559', 'info')
        return
      }
      projects.value = [saved, ...projects.value.filter(project => project.id !== saved.id)]
      currentProjectId.value = saved.id
      selectedWidgetId.value = ''
      activeArea.value = 'builder'
      dirty.value = false
      resetDesigner()
      notify(collision ? '\u5df2\u5bfc\u5165\u4e3a\u65b0\u5e94\u7528\uff08\u539f\u9879\u76ee\u672a\u88ab\u8986\u76d6\uff09' : '\u9879\u76ee\u5df2\u5bfc\u5165')
    } catch (error) {
      console.error(error)
      notify('\u5bfc\u5165\u5931\u8d25\uff0c\u539f\u6709\u9879\u76ee\u4fdd\u6301\u4e0d\u53d8', 'danger')
    }
  }

  async function publishProject() {
    const project = currentProject.value
    if (!project) return null
    publishing.value = true
    try {
      await saveProject('\u53d1\u5e03\u524d\u4fdd\u5b58')
      if (!window.lowcode?.publishService) {
        notify('\u5c40\u57df\u7f51\u53d1\u5e03\u4ec5\u5728\u684c\u9762\u5e94\u7528\u4e2d\u53ef\u7528\u3002', 'info')
        return null
      }
      const result = await window.lowcode.publishService(clone(project))
      if (!result.success || !result.service) throw new Error('\u53d1\u5e03\u670d\u52a1\u542f\u52a8\u5931\u8d25')
      project.status = 'published'
      dirty.value = true
      await saveProject('\u5e94\u7528\u5df2\u53d1\u5e03')
      publishedService.value = result.service
      notify('\u5e94\u7528\u5df2\u4f5c\u4e3a\u5c40\u57df\u7f51\u5b50\u670d\u52a1\u53d1\u5e03\u3002')
      return result.service
    } catch (error) {
      console.error(error)
      notify('\u53d1\u5e03\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7aef\u53e3\u548c\u6570\u636e\u670d\u52a1\u3002', 'danger')
      return null
    } finally {
      publishing.value = false
    }
  }

  async function stopPublishedService() {
    const project = currentProject.value
    if (!project || !window.lowcode?.stopPublishedService) return false
    try {
      await window.lowcode.stopPublishedService(project.id)
      publishedService.value = null
      notify('\u5c40\u57df\u7f51\u53d1\u5e03\u670d\u52a1\u5df2\u505c\u6b62\u3002', 'info')
      return true
    } catch (error) {
      console.error(error)
      notify('\u505c\u6b62\u53d1\u5e03\u670d\u52a1\u5931\u8d25\u3002', 'danger')
      return false
    }
  }

  async function duplicateProject(project: LowCodeProject) {
    try {
      let copy: LowCodeProject
      if (window.lowcode) copy = await window.lowcode.duplicateProject(project.id)
      else {
        copy = normalizeProject(clone(project))
        copy.id = makeId('project')
        copy.name += ' 副本'
        copy.status = 'draft'
        copy.updatedAt = new Date().toISOString()
        projects.value.unshift(copy)
        localStorage.setItem('codeless-projects', JSON.stringify(projects.value))
      }
      if (window.lowcode) projects.value.unshift(copy)
      openBuilder(copy.id)
      notify('已创建应用副本')
    } catch (error) {
      console.error(error)
      notify('复制失败', 'danger')
    }
  }

  function openCreateProject() {
    showCreateModal.value = true
    nextTick(() => document.querySelector<HTMLInputElement>('#project-name')?.focus())
  }

  async function createProject() {
    if (!createForm.name.trim()) {
      notify('请先填写应用名称', 'info')
      return
    }
    const createdAt = new Date().toISOString()
    const project: LowCodeProject = {
      id: makeId('project'),
      name: createForm.name.trim(),
      description: createForm.description.trim() || '一个全新的本地低代码应用',
      status: 'draft',
      category: createForm.category,
      layout: createTemplateLayout(createForm.template),
      createdAt,
      updatedAt: createdAt,
    }
    const navigated = await navigateToArea?.('builder', project.id)
    if (navigated === false) return
    projects.value.unshift(project)
    currentProjectId.value = project.id
    showCreateModal.value = false
    createForm.name = ''
    createForm.description = ''
    activeArea.value = 'builder'
    dirty.value = true
    resetDesigner()
    dirty.value = true
    await saveProject('\u65b0\u5e94\u7528\u5df2\u521b\u5efa\u5e76\u4fdd\u5b58')
  }

  async function confirmDeleteProject() {
    if (!currentProject.value) return
    try {
      const navigated = await navigateToArea?.('workspace')
      if (navigated === false) return
      const id = currentProject.value.id
      if (window.lowcode) await window.lowcode.deleteProject(id)
      projects.value = projects.value.filter(project => project.id !== id)
      if (!window.lowcode) localStorage.setItem('codeless-projects', JSON.stringify(projects.value))
      currentProjectId.value = projects.value[0]?.id || ''
      selectedWidgetId.value = ''
      showDeleteConfirm.value = false
      activeArea.value = 'workspace'
      dirty.value = false
      resetDesigner()
      notify('\u5e94\u7528\u5df2\u5220\u9664', 'info')
    } catch (error) {
      console.error(error)
      notify('删除失败', 'danger')
    }
  }

  function formatRelative(value: string) {
    const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
    if (minutes < 60) return `${minutes} 分钟前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小时前`
    const days = Math.floor(hours / 24)
    return days < 30 ? `${days} 天前` : new Date(value).toLocaleDateString('zh-CN')
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return {
    saving, publishing, publishedService, showCreateModal, showDeleteConfirm, createForm, bootstrap, openBuilder, saveProject,
    exportProject, importProject, publishProject, stopPublishedService, duplicateProject, openCreateProject, createProject, confirmDeleteProject, formatRelative, formatDate,
  }
}
