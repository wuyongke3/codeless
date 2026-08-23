import type { LowCodeProject } from '../types/lowcode'

export interface ProjectHistoryPatch {
  sequence: number
  before: LowCodeProject
  after: LowCodeProject
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function serialize(value: unknown) {
  return JSON.stringify(value)
}

export function createProjectHistoryPatch(
  before: LowCodeProject,
  after: LowCodeProject,
  sequence: number,
): ProjectHistoryPatch | null {
  if (serialize(before) === serialize(after)) return null
  return { sequence, before: clone(before), after: clone(after) }
}

export function applyProjectHistoryPatch(
  target: LowCodeProject,
  patch: ProjectHistoryPatch,
  direction: 'undo' | 'redo',
): LowCodeProject {
  const snapshot = direction === 'undo' ? patch.before : patch.after
  const restored = clone(snapshot)
  Object.keys(target).forEach(key => {
    if (!(key in restored)) delete (target as unknown as Record<string, unknown>)[key]
  })
  Object.assign(target, restored)
  return target
}
