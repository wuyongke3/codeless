import { computed, nextTick, reactive, ref, type ComputedRef, type Ref } from 'vue'
import type { ActivityItem, BootstrapData, LowCodeProject } from '../types/lowcode'
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
    dirty, selectedWidgetId, notify, loadTables, resetDesigner, publishCollaborationProject, navigateToArea,
  } = options
  const saving = ref(false)
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

  async function saveProject(message = '页面已保存到本地 SQLite') {
    if (!currentProject.value || saving.value) return
    saving.value = true
    try {
      currentProject.value.updatedAt = new Date().toISOString()
      normalizeProject(currentProject.value)
      let saved = clone(currentProject.value)
      if (window.lowcode) saved = await window.lowcode.saveProject(saved)
      else localStorage.setItem('codeless-projects', JSON.stringify(projects.value))
      const index = projects.value.findIndex(project => project.id === saved.id)
      if (index >= 0) projects.value[index] = saved
      await publishCollaborationProject(saved)
      dirty.value = false
      notify(message)
    } catch (error) {
      console.error(error)
      notify('保存失败，请重试', 'danger')
    } finally {
      saving.value = false
    }
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
    if (!currentProject.value) return
    currentProject.value.status = 'published'
    dirty.value = true
    await saveProject('应用已发布，本机可立即使用')
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
    saving, showCreateModal, showDeleteConfirm, createForm, bootstrap, openBuilder, saveProject,
    exportProject, importProject, publishProject, duplicateProject, openCreateProject, createProject, confirmDeleteProject, formatRelative, formatDate,
  }
}
