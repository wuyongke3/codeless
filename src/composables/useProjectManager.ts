import { computed, nextTick, reactive, ref, type ComputedRef, type Ref } from 'vue'
import type { ActivityItem, BootstrapData, LowCodeProject } from '../types/lowcode'
import { clone, createTemplateLayout, fallbackBootstrap, makeId, type Area } from './utils'

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
}

export function useProjectManager(options: ProjectManagerOptions) {
  const {
    loading, projects, activities, databasePath, activeArea, currentProjectId, currentProject,
    dirty, selectedWidgetId, notify, loadTables, resetDesigner,
  } = options
  const saving = ref(false)
  const showCreateModal = ref(false)
  const showDeleteConfirm = ref(false)
  const createForm = reactive({ name: '', description: '', category: '业务应用', template: 'dashboard' as 'dashboard' | 'form' | 'blank' })

  async function bootstrap() {
    loading.value = true
    try {
      const result: BootstrapData = window.lowcode ? await window.lowcode.bootstrap() : fallbackBootstrap()
      projects.value = result.projects
      activities.value = result.activities
      databasePath.value = result.databasePath
      currentProjectId.value = result.projects[0]?.id || ''
      await loadTables()
    } catch (error) {
      console.error(error)
      const result = fallbackBootstrap()
      projects.value = result.projects
      activities.value = result.activities
      databasePath.value = result.databasePath
      currentProjectId.value = result.projects[0]?.id || ''
      notify('数据库连接失败，已进入演示模式', 'danger')
    } finally {
      loading.value = false
    }
  }

  function openBuilder(projectId: string) {
    currentProjectId.value = projectId
    activeArea.value = 'builder'
    resetDesigner()
  }

  async function saveProject(message = '页面已保存到本地 SQLite') {
    if (!currentProject.value || saving.value) return
    saving.value = true
    try {
      currentProject.value.updatedAt = new Date().toISOString()
      let saved = clone(currentProject.value)
      if (window.lowcode) saved = await window.lowcode.saveProject(saved)
      else localStorage.setItem('codeless-projects', JSON.stringify(projects.value))
      const index = projects.value.findIndex(project => project.id === saved.id)
      if (index >= 0) projects.value[index] = saved
      dirty.value = false
      notify(message)
    } catch (error) {
      console.error(error)
      notify('保存失败，请重试', 'danger')
    } finally {
      saving.value = false
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
        copy = clone(project)
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
    projects.value.unshift(project)
    currentProjectId.value = project.id
    showCreateModal.value = false
    createForm.name = ''
    createForm.description = ''
    activeArea.value = 'builder'
    dirty.value = true
    resetDesigner()
    dirty.value = true
    await saveProject('新应用已创建并保存')
  }

  async function confirmDeleteProject() {
    if (!currentProject.value) return
    try {
      const id = currentProject.value.id
      if (window.lowcode) await window.lowcode.deleteProject(id)
      projects.value = projects.value.filter(project => project.id !== id)
      if (!window.lowcode) localStorage.setItem('codeless-projects', JSON.stringify(projects.value))
      currentProjectId.value = projects.value[0]?.id || ''
      selectedWidgetId.value = ''
      showDeleteConfirm.value = false
      activeArea.value = 'workspace'
      resetDesigner()
      notify('应用已删除', 'info')
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
    publishProject, duplicateProject, openCreateProject, createProject, confirmDeleteProject, formatRelative, formatDate,
  }
}
