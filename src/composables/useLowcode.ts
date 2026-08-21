import { computed, onMounted, reactive, ref } from 'vue'
import type { ActivityItem, LowCodeProject } from '../types/lowcode'
import { type Area } from './utils'
import { useDataModel } from './useDataModel'
import { useDesigner } from './useDesigner'
import { useProjectManager } from './useProjectManager'

export function useLowcode() {
  const loading = ref(true)
  const projects = ref<LowCodeProject[]>([])
  const activities = ref<ActivityItem[]>([])
  const databasePath = ref('')
  const activeArea = ref<Area>('builder')
  const currentProjectId = ref('')
  const showPreview = ref(false)
  const toast = reactive({ show: false, message: '', tone: 'success' as 'success' | 'info' | 'danger' })

  const currentProject = computed(() => projects.value.find(project => project.id === currentProjectId.value))
  const pageTitle = computed(() => {
    if (activeArea.value === 'workspace') return '应用工作台'
    if (activeArea.value === 'data') return '数据模型'
    if (activeArea.value === 'flows') return '自动化流程'
    if (activeArea.value === 'activity') return '运行日志'
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

  const dataModel = useDataModel(currentProject, notify)
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

  function navigate(area: Area) {
    activeArea.value = area
  }

  onMounted(() => { void manager.bootstrap() })

  return {
    loading, projects, activities, databasePath, activeArea, currentProjectId, currentProject, pageTitle,
    publishedCount, totalWidgets, showPreview, toast, navigate, notify,
    ...designer,
    ...manager,
    ...dataModel,
  }
}
