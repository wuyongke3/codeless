import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  LowCodeProject,
  ProjectDiff,
  ProjectReviewState,
  ProjectSnapshot,
  ReviewAttachment,
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
  importProjectReviewPackage,
  MAX_REVIEW_ATTACHMENT_BYTES,
  updateProjectComment,
} from './review'

type ProjectSource = ComputedRef<LowCodeProject | undefined>
type Notify = (message: string, tone?: 'success' | 'info' | 'danger') => void

const EMPTY_REVIEW_STATE: ProjectReviewState = { snapshots: [], comments: [], activity: [] }
const IMAGE_MIME_TYPES = new Set<ReviewAttachment['mimeType']>(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Unable to read the review attachment'))
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read the review attachment'))
    reader.readAsDataURL(file)
  })
}

export function useReview(
  currentProject: ProjectSource,
  selectedWidgetId: Ref<string>,
  markDirty: () => void,
  notify: Notify,
) {
  const showReviewPanel = ref(false)
  // Persisted projects can originate outside Vue reactivity; keep review mutations observable.
  const reviewRevision = ref(0)

  function refreshReviewState() {
    reviewRevision.value += 1
  }

  const reviewState = computed<ProjectReviewState>(() => {
    reviewRevision.value
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
    refreshReviewState()
    markReviewDirty(`Local snapshot created: ${snapshot.name}`)
    return snapshot
  }

  function chooseSnapshot(snapshotId: string) {
    const state = reviewState.value
    if (!state.snapshots.some(snapshot => snapshot.id === snapshotId)) return false
    state.activeSnapshotId = snapshotId
    refreshReviewState()
    markReviewDirty(undefined)
    return true
  }

  function removeSnapshot(snapshotId: string) {
    const project = currentProject.value
    if (!project) return false
    deleteProjectSnapshot(project, snapshotId)
    refreshReviewState()
    markReviewDirty('Snapshot and linked comments removed', 'info')
    return true
  }

  function addComment(text: string, coordinates?: { x?: number; y?: number }, attachments?: ReviewAttachment[]) {
    const project = currentProject.value
    if (!project) return undefined
    const comment = addProjectComment(project, {
      text,
      snapshotId: reviewState.value.activeSnapshotId,
      pageId: project.currentPageId,
      widgetId: selectedWidgetId.value || undefined,
      x: coordinates?.x,
      y: coordinates?.y,
      attachments,
    })
    if (comment) {
      refreshReviewState()
      markReviewDirty('Local comment added')
    }
    return comment
  }

  function updateComment(commentId: string, patch: Partial<Pick<ReviewComment, 'text' | 'status'>>) {
    const project = currentProject.value
    if (!project) return false
    const updated = updateProjectComment(project, commentId, patch)
    if (updated) {
      refreshReviewState()
      markReviewDirty(undefined)
    }
    return updated
  }

  function setCommentStatus(commentId: string, status: ReviewCommentStatus) {
    return updateComment(commentId, { status })
  }

  async function createReviewImageAttachment(file: File): Promise<ReviewAttachment> {
    const mimeType = file.type as ReviewAttachment['mimeType']
    if (!IMAGE_MIME_TYPES.has(mimeType)) throw new Error('Only PNG, JPEG, WEBP, and GIF screenshots can be attached')
    if (file.size > MAX_REVIEW_ATTACHMENT_BYTES) throw new Error('Each screenshot attachment must be 3 MB or smaller')
    return {
      id: `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: file.name.slice(0, 160) || 'review-screenshot',
      mimeType,
      size: file.size,
      dataUrl: await readFileAsDataUrl(file),
      createdAt: new Date().toISOString(),
    }
  }

  async function exportReviewPackage(snapshotId?: string): Promise<ReviewPackageExportResult | undefined> {
    const project = currentProject.value
    if (!project || !window.lowcode?.exportReviewPackage) return undefined
    const reviewPackage = createProjectReviewPackage(project, snapshotId)
    const result = await window.lowcode.exportReviewPackage(reviewPackage)
    if (!result.canceled) notify('Review package exported to a local file')
    return result
  }

  async function importReviewPackage() {
    const project = currentProject.value
    if (!project || !window.lowcode?.importReviewPackage) return undefined
    const result = await window.lowcode.importReviewPackage()
    if (result.canceled || !result.reviewPackage) return result
    const imported = importProjectReviewPackage(project, result.reviewPackage)
    refreshReviewState()
    markReviewDirty(`Imported ${imported.comments} comments from ${imported.sourceProjectName}`)
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
    createReviewImageAttachment,
    exportReviewPackage,
    importReviewPackage,
    toggleReviewPanel,
  }
}
