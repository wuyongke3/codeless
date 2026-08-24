import type {
  LowCodeProject,
  ProjectDiff,
  ProjectReviewState,
  ProjectSnapshot,
  ReviewActivity,
  ReviewActivityAction,
  ReviewAttachment,
  ReviewComment,
  ReviewCommentStatus,
  ReviewDiffEntry,
  ReviewPackage,
} from '../types/lowcode'

const MAX_SNAPSHOTS = 12
const MAX_COMMENTS = 500
const MAX_DIFF_ENTRIES = 500
const MAX_ACTIVITY_ITEMS = 200
export const MAX_REVIEW_ATTACHMENT_BYTES = 3 * 1024 * 1024
export const MAX_REVIEW_ATTACHMENTS_PER_COMMENT = 8
const IMAGE_MIME_TYPES = new Set<ReviewAttachment['mimeType']>(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

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

function normalizeAttachment(value: unknown): ReviewAttachment | undefined {
  if (!isRecord(value) || typeof value.dataUrl !== 'string' || typeof value.name !== 'string') return undefined
  const mimeType = value.mimeType
  const size = value.size
  if (typeof mimeType !== 'string' || !IMAGE_MIME_TYPES.has(mimeType as ReviewAttachment['mimeType'])) return undefined
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0 || size > MAX_REVIEW_ATTACHMENT_BYTES) return undefined
  if (!value.dataUrl.startsWith(`data:${mimeType};base64,`) || value.dataUrl.length > MAX_REVIEW_ATTACHMENT_BYTES * 1.5) return undefined
  return {
    id: typeof value.id === 'string' ? value.id : makeId('attachment'),
    name: value.name.trim().slice(0, 160) || 'review-screenshot',
    mimeType: mimeType as ReviewAttachment['mimeType'],
    size,
    dataUrl: value.dataUrl,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now(),
  }
}

function normalizeComment(value: unknown, projectId: string): ReviewComment | undefined {
  if (!isRecord(value) || typeof value.text !== 'string' || !value.text.trim()) return undefined
  const status: ReviewCommentStatus = value.status === 'resolved' ? 'resolved' : 'open'
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(normalizeAttachment).filter((item): item is ReviewAttachment => Boolean(item)).slice(0, MAX_REVIEW_ATTACHMENTS_PER_COMMENT)
    : []
  return {
    id: typeof value.id === 'string' ? value.id : makeId('comment'),
    projectId,
    snapshotId: typeof value.snapshotId === 'string' ? value.snapshotId : undefined,
    pageId: typeof value.pageId === 'string' ? value.pageId : undefined,
    widgetId: typeof value.widgetId === 'string' ? value.widgetId : undefined,
    x: typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : undefined,
    y: typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : undefined,
    text: value.text.trim().slice(0, 2000),
    attachments: attachments.length ? attachments : undefined,
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

function normalizeActivity(value: unknown): ReviewActivity | undefined {
  if (!isRecord(value) || typeof value.message !== 'string' || !value.message.trim()) return undefined
  const validActions: ReviewActivityAction[] = ['snapshot-created', 'snapshot-deleted', 'comment-created', 'comment-updated', 'comment-resolved', 'comment-reopened', 'package-imported']
  if (!validActions.includes(value.action as ReviewActivityAction)) return undefined
  return {
    id: typeof value.id === 'string' ? value.id : makeId('review-activity'),
    action: value.action as ReviewActivityAction,
    message: value.message.trim().slice(0, 240),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now(),
    snapshotId: typeof value.snapshotId === 'string' ? value.snapshotId : undefined,
    commentId: typeof value.commentId === 'string' ? value.commentId : undefined,
  }
}

function recordActivity(review: ProjectReviewState, action: ReviewActivityAction, message: string, references: Pick<ReviewActivity, 'snapshotId' | 'commentId'> = {}) {
  review.activity = [...review.activity, { id: makeId('review-activity'), action, message, createdAt: now(), ...references }].slice(-MAX_ACTIVITY_ITEMS)
}

export function normalizeReviewState(value: unknown, projectId: string): ProjectReviewState {
  const source = isRecord(value) ? value : {}
  const snapshots = Array.isArray(source.snapshots)
    ? source.snapshots.map(item => normalizeSnapshot(item, projectId)).filter((item): item is ProjectSnapshot => Boolean(item)).slice(0, MAX_SNAPSHOTS)
    : []
  const snapshotIds = new Set(snapshots.map(snapshot => snapshot.id))
  const comments = Array.isArray(source.comments)
    ? source.comments.map(item => normalizeComment(item, projectId)).filter((item): item is ReviewComment => Boolean(item)).filter(item => !item.snapshotId || snapshotIds.has(item.snapshotId)).slice(-MAX_COMMENTS)
    : []
  const activity = Array.isArray(source.activity)
    ? source.activity.map(normalizeActivity).filter((item): item is ReviewActivity => Boolean(item)).slice(-MAX_ACTIVITY_ITEMS)
    : []
  const activeSnapshotId = typeof source.activeSnapshotId === 'string' && snapshotIds.has(source.activeSnapshotId) ? source.activeSnapshotId : snapshots[0]?.id
  return { snapshots, comments, activity, activeSnapshotId }
}

export function ensureReviewState(project: LowCodeProject): ProjectReviewState {
  const normalized = normalizeReviewState(project.review, project.id)
  project.review = normalized
  return normalized
}

export function createProjectSnapshot(project: LowCodeProject, name?: string): ProjectSnapshot {
  const review = ensureReviewState(project)
  const snapshot: ProjectSnapshot = {
    id: makeId('snapshot'), projectId: project.id,
    name: String(name || '').trim().slice(0, 120) || `Snapshot ${review.snapshots.length + 1}`,
    createdAt: now(), sourceUpdatedAt: project.updatedAt, project: withoutReview(project),
  }
  review.snapshots = [snapshot, ...review.snapshots].slice(0, MAX_SNAPSHOTS)
  review.activeSnapshotId = snapshot.id
  recordActivity(review, 'snapshot-created', `Created snapshot “${snapshot.name}”`, { snapshotId: snapshot.id })
  return snapshot
}

export function deleteProjectSnapshot(project: LowCodeProject, snapshotId: string) {
  const review = ensureReviewState(project)
  const snapshot = review.snapshots.find(item => item.id === snapshotId)
  review.snapshots = review.snapshots.filter(snapshot => snapshot.id !== snapshotId)
  review.comments = review.comments.filter(comment => comment.snapshotId !== snapshotId)
  if (review.activeSnapshotId === snapshotId) review.activeSnapshotId = review.snapshots[0]?.id
  if (snapshot) recordActivity(review, 'snapshot-deleted', `Deleted snapshot “${snapshot.name}”`, { snapshotId })
}

export function addProjectComment(project: LowCodeProject, input: {
  text: string
  snapshotId?: string
  pageId?: string
  widgetId?: string
  x?: number
  y?: number
  attachments?: ReviewAttachment[]
}): ReviewComment | undefined {
  const text = input.text.trim()
  if (!text) return undefined
  const review = ensureReviewState(project)
  const timestamp = now()
  const attachments = (input.attachments || []).map(normalizeAttachment).filter((item): item is ReviewAttachment => Boolean(item)).slice(0, MAX_REVIEW_ATTACHMENTS_PER_COMMENT)
  const comment: ReviewComment = {
    id: makeId('comment'), projectId: project.id, snapshotId: input.snapshotId, pageId: input.pageId, widgetId: input.widgetId,
    x: typeof input.x === 'number' ? input.x : undefined, y: typeof input.y === 'number' ? input.y : undefined,
    text: text.slice(0, 2000), attachments: attachments.length ? attachments : undefined, status: 'open', createdAt: timestamp, updatedAt: timestamp,
  }
  review.comments = [...review.comments, comment].slice(-MAX_COMMENTS)
  recordActivity(review, 'comment-created', `Added comment${comment.widgetId ? ` on ${comment.widgetId}` : ''}`, { snapshotId: comment.snapshotId, commentId: comment.id })
  return comment
}

export function updateProjectComment(project: LowCodeProject, commentId: string, patch: Partial<Pick<ReviewComment, 'text' | 'status'>>) {
  const review = ensureReviewState(project)
  const comment = review.comments.find(item => item.id === commentId)
  if (!comment) return false
  let action: ReviewActivityAction | undefined
  if (typeof patch.text === 'string' && patch.text.trim() && patch.text.trim() !== comment.text) {
    comment.text = patch.text.trim().slice(0, 2000)
    action = 'comment-updated'
  }
  if ((patch.status === 'open' || patch.status === 'resolved') && patch.status !== comment.status) {
    comment.status = patch.status
    action = patch.status === 'resolved' ? 'comment-resolved' : 'comment-reopened'
  }
  if (!action) return false
  comment.updatedAt = now()
  recordActivity(review, action, action === 'comment-resolved' ? 'Resolved comment' : action === 'comment-reopened' ? 'Reopened comment' : 'Updated comment', { snapshotId: comment.snapshotId, commentId })
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
  if (entries.length >= MAX_DIFF_ENTRIES || stableValue(before) === stableValue(after)) return
  if (before === undefined) return pushDiff(entries, { path, kind: 'added', after })
  if (after === undefined) return pushDiff(entries, { path, kind: 'removed', before })
  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = [...before, ...after].every(item => isRecord(item) && typeof item.id === 'string')
    if (keyed) {
      const beforeMap = new Map(before.map(item => [String((item as Record<string, unknown>).id), item]))
      const afterMap = new Map(after.map(item => [String((item as Record<string, unknown>).id), item]))
      for (const id of new Set([...beforeMap.keys(), ...afterMap.keys()])) diffValues(beforeMap.get(id), afterMap.get(id), `${path}[${id}]`, entries)
      return
    }
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) diffValues(before[index], after[index], diffPath(path, index), entries)
    return
  }
  if (isRecord(before) && isRecord(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
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
  const summary = entries.reduce((result, entry) => { result[entry.kind] += 1; result.total += 1; return result }, { added: 0, removed: 0, changed: 0, total: 0 })
  return { targetUpdatedAt: after.updatedAt, entries, summary }
}

export function createProjectReviewPackage(project: LowCodeProject, snapshotId?: string): ReviewPackage {
  const review = ensureReviewState(project)
  const snapshot = review.snapshots.find(item => item.id === snapshotId || item.id === review.activeSnapshotId)
  const diff = snapshot ? diffProjects(snapshot.project, project) : undefined
  if (diff && snapshot) diff.baseSnapshotId = snapshot.id
  return {
    format: 'codeless-review', schemaVersion: 1, exportedAt: now(),
    versionContext: { projectId: project.id, projectName: project.name, projectUpdatedAt: project.updatedAt, snapshotId: snapshot?.id, snapshotName: snapshot?.name, snapshotSourceUpdatedAt: snapshot?.sourceUpdatedAt },
    project: withoutReview(project), snapshot: snapshot ? clone(snapshot) : undefined, comments: clone(review.comments), activity: clone(review.activity), diff,
  }
}

export function normalizeReviewPackage(value: unknown): ReviewPackage {
  if (!isRecord(value) || value.format !== 'codeless-review' || value.schemaVersion !== 1 || !isRecord(value.project)) throw new Error('Review package format or schema version is unsupported')
  const project = clone(value.project) as Omit<LowCodeProject, 'review'>
  if (typeof project.id !== 'string' || typeof project.name !== 'string') throw new Error('Review package is missing its project context')
  const snapshot = normalizeSnapshot(value.snapshot, project.id)
  const comments = Array.isArray(value.comments) ? value.comments.map(item => normalizeComment(item, project.id)).filter((item): item is ReviewComment => Boolean(item)).slice(-MAX_COMMENTS) : []
  const activity = Array.isArray(value.activity) ? value.activity.map(normalizeActivity).filter((item): item is ReviewActivity => Boolean(item)).slice(-MAX_ACTIVITY_ITEMS) : []
  return {
    format: 'codeless-review', schemaVersion: 1, exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : now(),
    versionContext: isRecord(value.versionContext) ? {
      projectId: typeof value.versionContext.projectId === 'string' ? value.versionContext.projectId : project.id,
      projectName: typeof value.versionContext.projectName === 'string' ? value.versionContext.projectName : project.name,
      projectUpdatedAt: typeof value.versionContext.projectUpdatedAt === 'string' ? value.versionContext.projectUpdatedAt : String(project.updatedAt || now()),
      snapshotId: typeof value.versionContext.snapshotId === 'string' ? value.versionContext.snapshotId : snapshot?.id,
      snapshotName: typeof value.versionContext.snapshotName === 'string' ? value.versionContext.snapshotName : snapshot?.name,
      snapshotSourceUpdatedAt: typeof value.versionContext.snapshotSourceUpdatedAt === 'string' ? value.versionContext.snapshotSourceUpdatedAt : snapshot?.sourceUpdatedAt,
    } : { projectId: project.id, projectName: project.name, projectUpdatedAt: String(project.updatedAt || now()), snapshotId: snapshot?.id, snapshotName: snapshot?.name, snapshotSourceUpdatedAt: snapshot?.sourceUpdatedAt },
    project, snapshot: snapshot || undefined, comments, activity,
  }
}

export function importProjectReviewPackage(project: LowCodeProject, value: unknown) {
  const imported = normalizeReviewPackage(value)
  const review = ensureReviewState(project)
  const snapshotIds = new Set(review.snapshots.map(item => item.id))
  const commentIds = new Set(review.comments.map(item => item.id))
  const snapshotMap = new Map<string, string>()
  const commentMap = new Map<string, string>()
  let snapshots = 0
  let comments = 0
  if (imported.snapshot && review.snapshots.length < MAX_SNAPSHOTS) {
    const snapshot = clone(imported.snapshot)
    const originalId = snapshot.id
    snapshot.id = snapshotIds.has(snapshot.id) ? makeId('snapshot') : snapshot.id
    snapshot.projectId = project.id
    review.snapshots = [...review.snapshots, snapshot].slice(0, MAX_SNAPSHOTS)
    snapshotMap.set(originalId, snapshot.id)
    snapshots += 1
  }
  for (const source of imported.comments) {
    if (review.comments.length >= MAX_COMMENTS) break
    const comment = clone(source)
    if (commentIds.has(comment.id)) continue
    comment.projectId = project.id
    comment.snapshotId = comment.snapshotId ? snapshotMap.get(comment.snapshotId) : undefined
    review.comments.push(comment)
    commentIds.add(comment.id)
    commentMap.set(source.id, comment.id)
    comments += 1
  }
  for (const source of imported.activity) {
    if (review.activity.length >= MAX_ACTIVITY_ITEMS) break
    review.activity.push({
      ...clone(source),
      id: makeId('review-activity'),
      snapshotId: source.snapshotId ? snapshotMap.get(source.snapshotId) : undefined,
      commentId: source.commentId ? commentMap.get(source.commentId) : undefined,
    })
  }
  recordActivity(review, 'package-imported', `Imported review package from “${imported.versionContext.projectName}” (${snapshots} snapshot, ${comments} comments)`)
  return { snapshots, comments, sourceProjectName: imported.versionContext.projectName }
}
