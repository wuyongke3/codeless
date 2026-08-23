import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { LowCodeProject, LowCodeWidget, PageLayout } from '../../types/lowcode'
import { applyLayoutPatch, createLayoutPatch, type LayoutPatch } from '../layoutHistory'
import { normalizeWidget } from '../widgetConfig'
import { createDesignerCollaborationBridge, type DesignerHistoryOptions } from './collaboration'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export interface DesignerResetHistoryOptions {
  preserveProjectHistory?: boolean
}

export interface DesignerHistoryController {
  historyStack: Ref<LayoutPatch[]>
  futureStack: Ref<LayoutPatch[]>
  recordDirty: (options?: { preserveHistory?: boolean }) => void
  pushHistory: () => void
  flushHistory: () => void
  discardPendingHistory: () => void
  beginExternalHistory: () => void
  clearFutureHistory: () => void
  syncHistoryBaseline: () => void
  undo: () => boolean
  redo: () => boolean
  reset: (options?: DesignerResetHistoryOptions) => void
  dispose: () => void
}

export function createDesignerHistoryController(
  currentProject: ComputedRef<LowCodeProject | undefined>,
  options: DesignerHistoryOptions = {},
  deps: { onSelectionClear?: () => void; debounceMs?: number } = {},
): DesignerHistoryController {
  const historyStack = ref<LayoutPatch[]>([])
  const futureStack = ref<LayoutPatch[]>([])
  const collaboration = createDesignerCollaborationBridge(options)
  const debounceMs = deps.debounceMs ?? 450
  let pendingHistoryBefore: PageLayout | null = null
  let stableLayoutSnapshot: PageLayout | null = null
  let externalHistoryTimer: ReturnType<typeof setTimeout> | null = null

  function clearExternalHistoryTimer() {
    if (externalHistoryTimer === null) return
    clearTimeout(externalHistoryTimer)
    externalHistoryTimer = null
  }

  function finalizePendingHistory() {
    clearExternalHistoryTimer()
    if (!currentProject.value) return
    const before = pendingHistoryBefore
    pendingHistoryBefore = null
    const currentLayout = currentProject.value.layout
    stableLayoutSnapshot = clone(currentLayout)
    if (!before) return
    const patch = createLayoutPatch(before, currentLayout)
    if (!patch) return
    patch.sequence = collaboration.nextSequence()
    historyStack.value.push(patch)
    while (historyStack.value.length > 40) {
      const pruned = historyStack.value.shift()
      if (pruned) collaboration.onHistoryPruned(pruned)
    }
    collaboration.onHistoryCommitted(patch)
  }

  function discardPendingHistory() {
    clearExternalHistoryTimer()
    pendingHistoryBefore = null
    stableLayoutSnapshot = currentProject.value ? clone(currentProject.value.layout) : null
  }

  function beginExternalHistory() {
    if (!currentProject.value) return
    if (!pendingHistoryBefore) {
      pendingHistoryBefore = clone(stableLayoutSnapshot || currentProject.value.layout)
      futureStack.value = []
      collaboration.onHistoryBranchReset()
    }
  }

  function scheduleExternalHistoryCommit() {
    clearExternalHistoryTimer()
    externalHistoryTimer = setTimeout(() => {
      externalHistoryTimer = null
      finalizePendingHistory()
    }, debounceMs)
  }

  function recordDirty(options: { preserveHistory?: boolean } = {}) {
    if (options.preserveHistory) scheduleExternalHistoryCommit()
    else finalizePendingHistory()
  }

  function flushHistory() {
    finalizePendingHistory()
  }

  function syncHistoryBaseline() {
    pendingHistoryBefore = null
    stableLayoutSnapshot = currentProject.value ? clone(currentProject.value.layout) : null
    clearExternalHistoryTimer()
  }

  function pushHistory() {
    if (!currentProject.value) return
    if (pendingHistoryBefore) finalizePendingHistory()
    pendingHistoryBefore = clone(currentProject.value.layout)
    stableLayoutSnapshot = clone(currentProject.value.layout)
    futureStack.value = []
    collaboration.onHistoryBranchReset()
  }

  function undo() {
    flushHistory()
    if (!currentProject.value || !historyStack.value.length) return false
    const patch = historyStack.value.pop()!
    futureStack.value.push(patch)
    currentProject.value.layout = applyLayoutPatch(currentProject.value.layout, patch, 'undo')
    currentProject.value.layout.widgets.forEach(normalizeWidget)
    stableLayoutSnapshot = clone(currentProject.value.layout)
    deps.onSelectionClear?.()
    return true
  }

  function redo() {
    flushHistory()
    if (!currentProject.value || !futureStack.value.length) return false
    const patch = futureStack.value.pop()!
    historyStack.value.push(patch)
    currentProject.value.layout = applyLayoutPatch(currentProject.value.layout, patch, 'redo')
    currentProject.value.layout.widgets.forEach(normalizeWidget)
    stableLayoutSnapshot = clone(currentProject.value.layout)
    deps.onSelectionClear?.()
    return true
  }

  function reset(resetOptions: DesignerResetHistoryOptions = {}) {
    clearExternalHistoryTimer()
    pendingHistoryBefore = null
    stableLayoutSnapshot = currentProject.value ? clone(currentProject.value.layout) : null
    historyStack.value = []
    futureStack.value = []
    collaboration.onLayoutHistoryReset()
    if (!resetOptions.preserveProjectHistory) collaboration.onHistoryReset()
  }

  return {
    historyStack,
    futureStack,
    recordDirty,
    pushHistory,
    flushHistory,
    discardPendingHistory,
    beginExternalHistory,
    clearFutureHistory: () => { futureStack.value = [] },
    syncHistoryBaseline,
    undo,
    redo,
    reset,
    dispose: clearExternalHistoryTimer,
  }
}
