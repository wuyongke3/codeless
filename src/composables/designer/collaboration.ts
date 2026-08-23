import type { LayoutPatch } from '../layoutHistory'

export interface DesignerHistoryOptions {
  nextSequence?: () => number
  onUndo?: () => void
  onRedo?: () => void
  onHistoryCommitted?: (patch: LayoutPatch) => void
  onHistoryPruned?: (patch: LayoutPatch) => void
  onLayoutHistoryReset?: () => void
  onHistoryReset?: () => void
  onHistoryBranchReset?: () => void
}

export interface DesignerCollaborationBridge {
  nextSequence: () => number
  onHistoryCommitted: (patch: LayoutPatch) => void
  onHistoryPruned: (patch: LayoutPatch) => void
  onLayoutHistoryReset: () => void
  onHistoryReset: () => void
  onHistoryBranchReset: () => void
}

export function createDesignerCollaborationBridge(
  options: DesignerHistoryOptions = {},
): DesignerCollaborationBridge {
  return {
    nextSequence: options.nextSequence || (() => Date.now()),
    onHistoryCommitted: patch => options.onHistoryCommitted?.(patch),
    onHistoryPruned: patch => options.onHistoryPruned?.(patch),
    onLayoutHistoryReset: () => options.onLayoutHistoryReset?.(),
    onHistoryReset: () => options.onHistoryReset?.(),
    onHistoryBranchReset: () => options.onHistoryBranchReset?.(),
  }
}
