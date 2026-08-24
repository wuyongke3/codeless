import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const {
  addProjectComment,
  createProjectReviewPackage,
  createProjectSnapshot,
  diffProjects,
  ensureReviewState,
  importProjectReviewPackage,
  normalizeReviewPackage,
  updateProjectComment,
} = await vite.ssrLoadModule('/src/composables/review.ts')

const createdAt = '2026-08-23T00:00:00.000Z'
const project = {
  id: 'review-source',
  name: 'Review source',
  description: '',
  status: 'draft',
  category: 'test',
  layout: { version: 2, pageName: 'Home', canvas: { width: 960, height: 720, background: '#fff' }, widgets: [] },
  createdAt,
  updatedAt: createdAt,
}

const snapshot = createProjectSnapshot(project, 'Pre-review')
project.name = 'Review source updated'
project.updatedAt = '2026-08-23T00:10:00.000Z'
const comment = addProjectComment(project, {
  text: 'Check the selected action',
  snapshotId: snapshot.id,
  pageId: 'page-home',
  widgetId: 'button-save',
  x: 120,
  y: 48,
  attachments: [{ id: 'screenshot-1', name: 'capture.png', mimeType: 'image/png', size: 2, dataUrl: 'data:image/png;base64,AA==', createdAt }],
})
assert(comment, 'comment should be created')
assert.equal(updateProjectComment(project, comment.id, { status: 'resolved' }), true)
assert.equal(ensureReviewState(project).activity.length, 3, 'snapshot, comment, and resolution must be auditable')

const diff = diffProjects(snapshot.project, project)
assert(diff.entries.some(entry => entry.path === 'name'), 'diff should identify changed project fields')
const reviewPackage = createProjectReviewPackage(project, snapshot.id)
assert.equal(reviewPackage.versionContext.snapshotName, 'Pre-review')
assert.equal(reviewPackage.comments[0].attachments?.[0].name, 'capture.png')
assert.equal(reviewPackage.activity.length, 3)
assert.equal(normalizeReviewPackage(reviewPackage).format, 'codeless-review')

const target = structuredClone(project)
target.id = 'review-target'
target.name = 'Review target'
delete target.review
const imported = importProjectReviewPackage(target, reviewPackage)
assert.equal(imported.snapshots, 1)
assert.equal(imported.comments, 1)
assert.equal(target.review.comments[0].projectId, 'review-target')
assert.equal(target.review.comments[0].snapshotId, target.review.snapshots[0].id)
assert.equal(target.review.comments[0].attachments?.[0].dataUrl, 'data:image/png;base64,AA==')
assert.equal(target.review.activity.length, 4, 'import should retain the source audit trail and record the import')
assert.equal(target.review.activity.at(-1)?.action, 'package-imported')
assert.throws(() => normalizeReviewPackage({ format: 'codeless-review', schemaVersion: 2, project: {} }), /unsupported/)

console.log('page-designer-review-fixture: PASS')
console.log(JSON.stringify({ diffEntries: diff.entries.length, importedSnapshots: imported.snapshots, importedComments: imported.comments, activityEntries: target.review.activity.length }, null, 2))
await vite.close()
