import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import type { CollaborationEvent, CollaborationMode, CollaborationSession } from '../types/collaboration'
import type { LowCodeProject } from '../types/lowcode'
import { browserApi } from './browserData'
import { clone } from './utils'

interface CollaborationOptions {
  currentProject: ComputedRef<LowCodeProject | undefined>
  projects: Ref<LowCodeProject[]>
  currentProjectId: Ref<string>
  notify: (message: string, tone?: 'success' | 'info' | 'danger') => void
  applyProjectUpdate: (project: LowCodeProject) => void
}

export function useCollaboration(options: CollaborationOptions) {
  const session = ref<CollaborationSession | null>(null)
  const showCollaborationPanel = ref(false)
  const collaborationMode = ref<CollaborationMode>('same-device')
  const displayName = ref('本机协作者')
  const joinSessionId = ref('')
  const joinToken = ref('')
  const joinHost = ref('')
  const joinPort = ref<number | undefined>(undefined)
  const working = ref(false)
  let unsubscribe: (() => void) | undefined

  const api = computed(() => (window.lowcode || browserApi).collaboration)
  const isHost = computed(() => session.value?.role === 'host')
  const participantCount = computed(() => session.value?.participants.length || 0)
  const sessionHint = computed(() => {
    if (!session.value) return ''
    if (session.value.mode === 'same-device') return `同机窗口 · 会话 ${session.value.id}`
    return `${session.value.host}:${session.value.port || ''} · 口令 ${session.value.token}`
  })

  function handleEvent(event: CollaborationEvent) {
    if (event.type === 'session-state') {
      session.value = event.session
      return
    }
    if (event.type === 'project-update') {
      if (event.project.id !== options.currentProjectId.value) return
      const current = options.currentProject.value
      if (current && new Date(event.updatedAt).getTime() <= new Date(current.updatedAt).getTime()) return
      const index = options.projects.value.findIndex(project => project.id === event.project.id)
      if (index < 0) return
      options.projects.value[index] = clone(event.project)
      options.applyProjectUpdate(options.projects.value[index])
      options.notify('已接收协作窗口的本地更新', 'info')
      return
    }
    if (event.type === 'left') {
      session.value = null
      options.notify(event.reason || '已离开协作会话', 'info')
      return
    }
    options.notify(event.message, 'danger')
  }

  async function refreshSession() {
    session.value = await api.value.getSession()
  }

  async function createSession() {
    const project = options.currentProject.value
    if (!project) return
    working.value = true
    try {
      session.value = await api.value.createSession({ project: clone(project), mode: collaborationMode.value, displayName: displayName.value })
      showCollaborationPanel.value = true
      options.notify(collaborationMode.value === 'lan' ? '局域网临时会话已开启（仅本次运行有效）' : '同机协作会话已开启')
    } catch (error) {
      options.notify(error instanceof Error ? error.message : '创建协作会话失败', 'danger')
    } finally {
      working.value = false
    }
  }

  async function joinSession() {
    const project = options.currentProject.value
    if (!project || !joinSessionId.value.trim() || !joinToken.value.trim()) {
      options.notify('请填写会话 ID 和协作口令', 'info')
      return
    }
    working.value = true
    try {
      session.value = await api.value.joinSession({
        sessionId: joinSessionId.value.trim(),
        projectId: project.id,
        token: joinToken.value.trim(),
        host: joinHost.value.trim() || undefined,
        port: joinPort.value,
        displayName: displayName.value,
      })
      showCollaborationPanel.value = true
      options.notify('已加入本地协作会话')
    } catch (error) {
      options.notify(error instanceof Error ? error.message : '加入协作会话失败', 'danger')
    } finally {
      working.value = false
    }
  }

  async function openCollaborationWindow() {
    if (!session.value || session.value.mode !== 'same-device') return
    try {
      await api.value.openWindow()
      options.notify('已打开新的同机协作窗口')
    } catch (error) {
      options.notify(error instanceof Error ? error.message : '打开协作窗口失败', 'danger')
    }
  }

  async function leaveSession() {
    working.value = true
    try {
      await api.value.leaveSession()
      session.value = null
      options.notify('已结束本地协作会话', 'info')
    } catch (error) {
      options.notify(error instanceof Error ? error.message : '退出协作会话失败', 'danger')
    } finally {
      working.value = false
    }
  }

  async function publishProject(project: LowCodeProject) {
    if (!session.value) return
    try {
      await api.value.publishProject(clone(project))
    } catch (error) {
      options.notify(error instanceof Error ? error.message : '协作同步失败', 'danger')
    }
  }

  async function copySessionInfo() {
    if (!session.value) return
    const value = JSON.stringify({
      sessionId: session.value.id,
      projectId: session.value.projectId,
      token: session.value.token,
      host: session.value.mode === 'lan' ? session.value.host : undefined,
      port: session.value.mode === 'lan' ? session.value.port : undefined,
    }, null, 2)
    try {
      await navigator.clipboard?.writeText(value)
      options.notify('协作会话信息已复制')
    } catch {
      options.notify(value, 'info')
    }
  }

  function toggleCollaborationPanel() {
    showCollaborationPanel.value = !showCollaborationPanel.value
    if (showCollaborationPanel.value) void refreshSession()
  }

  onMounted(() => {
    unsubscribe = api.value.onEvent(handleEvent)
    void refreshSession()
  })
  onBeforeUnmount(() => unsubscribe?.())

  return {
    session, showCollaborationPanel, collaborationMode, displayName, joinSessionId, joinToken, joinHost, joinPort,
    working, isHost, participantCount, sessionHint, createSession, joinSession, openCollaborationWindow, leaveSession,
    publishProject, copySessionInfo, toggleCollaborationPanel,
  }
}
