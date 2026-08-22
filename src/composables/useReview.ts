import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  LowCodeProject,
  ProjectDiff,
  ProjectReviewState,
  ProjectSnapshot,
  ReviewComment,
  ReviewCommentStatus,
  ReviewPackageExportResult,
} from '../types/lowcode'
import {
  addProjectComment,
  createProjectReviewPackage,
  createProjectSnapshot,
  deleteProjectSnapshot,
  diffProjects,
  ensureReviewState,
  updateProjectComment,
} from './review'

type ProjectSource = ComputedRef<LowCodeProject | undefined>
type Notify = (message: string, tone?: 'success' | 'info' | 'danger') => void

const EMPTY_REVIEW_STATE: ProjectReviewState = { snapshots: [], comments: [] }

export function useReview(
  currentProject: ProjectSource,
  selectedWidgetId: Ref<string>,
  markDirty: () => void,
  notify: Notify,
) {
  const showReviewPanel = ref(false)

  const reviewState = computed<ProjectReviewState>(() => {
    const project = currentProject.value
    return project ? ensureReviewState(project) : EMPTY_REVIEW_STATE
  })

  const activeSnapshot = computed<ProjectSnapshot | undefined>(() => {
    const state = reviewState.value
    return state.snapshots.find(snapshot => snapshot.id === state.activeSnapshotId) || state.snapshots[0]
  })

  const currentDiff = computed<ProjectDiff | undefined>(() => {
    const project = currentProject.value
    return project ? diffProjects(activeSnapshot.value?.project, project) : undefined
  })

  const openComments = computed(() => reviewState.value.comments.filter(comment => comment.status === 'open'))

  function markReviewDirty(message?: string, tone: 'success' | 'info' | 'danger' = 'success') {
    markDirty()
    if (message) notify(message, tone)
  }

  function createSnapshot(name?: string) {
    const project = currentProject.value
    if (!project) return undefined
    const snapshot = createProjectSnapshot(project, name)
    markReviewDirty(`Local snapshot created: ${snapshot.name}`)
    return snapshot
  }

  function chooseSnapshot(snapshotId: string) {
    const state = reviewState.value
    if (!state.snapshots.some(snapshot => snapshot.id === snapshotId)) return false
    state.activeSnapshotId = snapshotId
    markReviewDirty(undefined)
    return true
  }

  function removeSnapshot(snapshotId: string) {
    const project = currentProject.value
    if (!project) return false
    deleteProjectSnapshot(project, snapshotId)
    markReviewDirty('Snapshot and linked comments removed', 'info')
    return true
  }

  function addComment(text: string, coordinates?: { x?: number; y?: number }) {
    const project = currentProject.value
    if (!project) return undefined
    const comment = addProjectComment(project, {
      text,
      snapshotId: reviewState.value.activeSnapshotId,
      pageId: project.currentPageId,
      widgetId: selectedWidgetId.value || undefined,
      x: coordinates?.x,
      y: coordinates?.y,
    })
    if (comment) markReviewDirty('Local comment added')
    return comment
  }

  function updateComment(commentId: string, patch: Partial<Pick<ReviewComment, 'text' | 'status'>>) {
    const project = currentProject.value
    if (!project) return false
    const updated = updateProjectComment(project, commentId, patch)
    if (updated) markReviewDirty(undefined)
    return updated
  }

  function setCommentStatus(commentId: string, status: ReviewCommentStatus) {
    return updateComment(commentId, { status })
  }

  async function exportReviewPackage(snapshotId?: string): Promise<ReviewPackageExportResult | undefined> {
    const project = currentProject.value
    if (!project || !window.lowcode?.exportReviewPackage) return undefined
    const reviewPackage = createProjectReviewPackage(project, snapshotId)
    const result = await window.lowcode.exportReviewPackage(reviewPackage)
    if (!result.canceled) notify('Review package exported to a local file')
    return result
  }

  function toggleReviewPanel() {
    showReviewPanel.value = !showReviewPanel.value
  }

  return {
    showReviewPanel,
    reviewState,
    activeSnapshot,
    currentDiff,
    openComments,
    createSnapshot,
    chooseSnapshot,
    removeSnapshot,
    addComment,
    updateComment,
    setCommentStatus,
    exportReviewPackage,
    toggleReviewPanel,
  }
}
