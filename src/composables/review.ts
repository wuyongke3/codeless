import type {
  LowCodeProject,
  ProjectDiff,
  ProjectReviewState,
  ProjectSnapshot,
  ReviewComment,
  ReviewCommentStatus,
  ReviewDiffEntry,
  ReviewPackage,
} from '../types/lowcode'

const MAX_SNAPSHOTS = 12
const MAX_COMMENTS = 500
const MAX_DIFF_ENTRIES = 500

const now = () => new Date().toISOString()
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function withoutReview(project: LowCodeProject): Omit<LowCodeProject, 'review'> {
  const copy = clone(project) as LowCodeProject
  delete copy.review
  return copy
}

function normalizeComment(value: unknown, projectId: string): ReviewComment | undefined {
  if (!isRecord(value) || typeof value.text !== 'string' || !value.text.trim()) return undefined
  const status: ReviewCommentStatus = value.status === 'resolved' ? 'resolved' : 'open'
  return {
    id: typeof value.id === 'string' ? value.id : makeId('comment'),
    projectId,
    snapshotId: typeof value.snapshotId === 'string' ? value.snapshotId : undefined,
    pageId: typeof value.pageId === 'string' ? value.pageId : undefined,
    widgetId: typeof value.widgetId === 'string' ? value.widgetId : undefined,
    x: typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : undefined,
    y: typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : undefined,
    text: value.text.trim().slice(0, 2000),
    status,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now(),
  }
}

function normalizeSnapshot(value: unknown, projectId: string): ProjectSnapshot | undefined {
  if (!isRecord(value) || !isRecord(value.project)) return undefined
  const project = clone(value.project) as Omit<LowCodeProject, 'review'>
  return {
    id: typeof value.id === 'string' ? value.id : makeId('snapshot'),
    projectId,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 120) : 'Local snapshot',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now(),
    sourceUpdatedAt: typeof value.sourceUpdatedAt === 'string' ? value.sourceUpdatedAt : String(project.updatedAt || now()),
    project,
  }
}

export function normalizeReviewState(value: unknown, projectId: string): ProjectReviewState {
  const source = isRecord(value) ? value : {}
  const snapshots = Array.isArray(source.snapshots)
    ? source.snapshots.map(item => normalizeSnapshot(item, projectId)).filter(Boolean).slice(0, MAX_SNAPSHOTS) as ProjectSnapshot[]
    : []
  const snapshotIds = new Set(snapshots.map(snapshot => snapshot.id))
  const comments = Array.isArray(source.comments)
    ? source.comments
      .map(item => normalizeComment(item, projectId))
      .filter((item): item is ReviewComment => Boolean(item))
      .filter(item => !item.snapshotId || snapshotIds.has(item.snapshotId))
      .slice(-MAX_COMMENTS)
    : []
  const activeSnapshotId = typeof source.activeSnapshotId === 'string' && snapshotIds.has(source.activeSnapshotId)
    ? source.activeSnapshotId
    : snapshots[0]?.id
  return { snapshots, comments, activeSnapshotId }
}

export function ensureReviewState(project: LowCodeProject): ProjectReviewState {
  const normalized = normalizeReviewState(project.review, project.id)
  project.review = normalized
  return normalized
}

export function createProjectSnapshot(project: LowCodeProject, name?: string): ProjectSnapshot {
  const review = ensureReviewState(project)
  const snapshot: ProjectSnapshot = {
    id: makeId('snapshot'),
    projectId: project.id,
    name: String(name || '').trim().slice(0, 120) || `Snapshot ${review.snapshots.length + 1}`,
    createdAt: now(),
    sourceUpdatedAt: project.updatedAt,
    project: withoutReview(project),
  }
  review.snapshots = [snapshot, ...review.snapshots.filter(item => item.id !== snapshot.id)].slice(0, MAX_SNAPSHOTS)
  review.activeSnapshotId = snapshot.id
  return snapshot
}

export function deleteProjectSnapshot(project: LowCodeProject, snapshotId: string) {
  const review = ensureReviewState(project)
  review.snapshots = review.snapshots.filter(snapshot => snapshot.id !== snapshotId)
  review.comments = review.comments.filter(comment => comment.snapshotId !== snapshotId)
  if (review.activeSnapshotId === snapshotId) review.activeSnapshotId = review.snapshots[0]?.id
}

export function addProjectComment(project: LowCodeProject, input: {
  text: string
  snapshotId?: string
  pageId?: string
  widgetId?: string
  x?: number
  y?: number
}): ReviewComment | undefined {
  const text = String(input.text || '').trim()
  if (!text) return undefined
  const review = ensureReviewState(project)
  const timestamp = now()
  const comment: ReviewComment = {
    id: makeId('comment'),
    projectId: project.id,
    snapshotId: input.snapshotId,
    pageId: input.pageId,
    widgetId: input.widgetId,
    x: typeof input.x === 'number' ? input.x : undefined,
    y: typeof input.y === 'number' ? input.y : undefined,
    text: text.slice(0, 2000),
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  review.comments = [...review.comments, comment].slice(-MAX_COMMENTS)
  return comment
}

export function updateProjectComment(project: LowCodeProject, commentId: string, patch: Partial<Pick<ReviewComment, 'text' | 'status'>>) {
  const review = ensureReviewState(project)
  const comment = review.comments.find(item => item.id === commentId)
  if (!comment) return false
  if (typeof patch.text === 'string' && patch.text.trim()) comment.text = patch.text.trim().slice(0, 2000)
  if (patch.status === 'open' || patch.status === 'resolved') comment.status = patch.status
  comment.updatedAt = now()
  return true
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function diffPath(parent: string, key: string | number) {
  if (!parent) return String(key)
  return typeof key === 'number' ? `${parent}[${key}]` : `${parent}.${key}`
}

function pushDiff(entries: ReviewDiffEntry[], entry: ReviewDiffEntry) {
  if (entries.length < MAX_DIFF_ENTRIES) entries.push(entry)
}

function diffValues(before: unknown, after: unknown, path: string, entries: ReviewDiffEntry[]) {
  if (entries.length >= MAX_DIFF_ENTRIES) return
  if (stableValue(before) === stableValue(after)) return
  if (before === undefined) {
    pushDiff(entries, { path, kind: 'added', after })
    return
  }
  if (after === undefined) {
    pushDiff(entries, { path, kind: 'removed', before })
    return
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = [...before, ...after].every(item => isRecord(item) && typeof item.id === 'string')
    if (keyed) {
      const beforeMap = new Map(before.map(item => [String((item as Record<string, unknown>).id), item]))
      const afterMap = new Map(after.map(item => [String((item as Record<string, unknown>).id), item]))
      const ids = new Set([...beforeMap.keys(), ...afterMap.keys()])
      ids.forEach(id => diffValues(beforeMap.get(id), afterMap.get(id), `${path}[${id}]`, entries))
      return
    }
    const length = Math.max(before.length, after.length)
    for (let index = 0; index < length; index += 1) diffValues(before[index], after[index], diffPath(path, index), entries)
    return
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of keys) {
      if (key === 'review' || key === 'updatedAt') continue
      diffValues(before[key], after[key], diffPath(path, key), entries)
      if (entries.length >= MAX_DIFF_ENTRIES) return
    }
    return
  }
  pushDiff(entries, { path: path || '$', kind: 'changed', before, after })
}

export function diffProjects(before: Omit<LowCodeProject, 'review'> | undefined, after: LowCodeProject): ProjectDiff {
  const entries: ReviewDiffEntry[] = []
  diffValues(before, withoutReview(after), '', entries)
  const summary = entries.reduce((result, entry) => {
    result[entry.kind] += 1
    result.total += 1
    return result
  }, { added: 0, removed: 0, changed: 0, total: 0 })
  return { targetUpdatedAt: after.updatedAt, entries, summary }
}

export function createProjectReviewPackage(project: LowCodeProject, snapshotId?: string): ReviewPackage {
  const review = ensureReviewState(project)
  const snapshot = review.snapshots.find(item => item.id === snapshotId || item.id === review.activeSnapshotId)
  const diff = snapshot ? diffProjects(snapshot.project, project) : undefined
  if (diff && snapshot) diff.baseSnapshotId = snapshot.id
  return {
    format: 'codeless-review',
    schemaVersion: 1,
    exportedAt: now(),
    project: withoutReview(project),
    snapshot: snapshot ? clone(snapshot) : undefined,
    comments: clone(review.comments),
    diff,
  }
}

