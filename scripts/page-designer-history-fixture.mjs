import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createProjectHistoryPatch, applyProjectHistoryPatch } from '../src/composables/projectHistory.ts'
import { createLayoutPatch, applyLayoutPatch } from '../src/composables/layoutHistory.ts'

const project = {
  id: 'history-fixture-project',
  name: 'History fixture',
  layout: {
    version: 1,
    pageName: 'Home',
    canvas: { width: 800, height: 600, background: '#ffffff' },
    widgets: [
      { id: 'widget-a', type: 'text', name: 'A', x: 0, y: 0, w: 120, h: 40, props: {} },
      { id: 'widget-b', type: 'button', name: 'B', x: 160, y: 0, w: 120, h: 40, props: {} },
    ],
  },
  pages: [],
  designSystem: { tokens: {}, themes: {} },
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
}

const projectTarget = structuredClone(project)
const projectAfter = structuredClone(project)
projectAfter.name = 'History fixture updated'
projectAfter.layout.pageName = 'Updated home'
const projectPatch = createProjectHistoryPatch(project, projectAfter, 1)
assert(projectPatch, 'project history patch should be created')
assert.equal(applyProjectHistoryPatch(projectTarget, projectPatch, 'redo'), projectTarget, 'project redo should preserve object identity')
assert.equal(projectTarget.name, 'History fixture updated')
assert.equal(projectTarget.layout.pageName, 'Updated home')
applyProjectHistoryPatch(projectTarget, projectPatch, 'undo')
assert.equal(projectTarget.name, project.name)
assert.equal(projectTarget.layout.pageName, project.layout.pageName)

const beforeLayout = structuredClone(project.layout)
const afterLayout = structuredClone(beforeLayout)
afterLayout.pageName = 'Reordered home'
afterLayout.widgets[0].x = 24
afterLayout.widgets.reverse()
afterLayout.widgets.push({ id: 'widget-c', type: 'card', name: 'C', x: 320, y: 0, w: 180, h: 80, props: {} })
const layoutPatch = createLayoutPatch(beforeLayout, afterLayout)
assert(layoutPatch, 'layout history patch should be created')
const restoredLayout = applyLayoutPatch(afterLayout, layoutPatch, 'undo')
assert.deepEqual(restoredLayout, beforeLayout, 'layout undo should restore metadata, widget changes and order')
assert.deepEqual(applyLayoutPatch(restoredLayout, layoutPatch, 'redo'), afterLayout, 'layout redo should replay the patch')

const [designerSource, lowcodeSource] = await Promise.all([
  readFile(new URL('../src/composables/useDesigner.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/composables/useLowcode.ts', import.meta.url), 'utf8'),
])
for (const marker of ['onHistoryPruned', 'onLayoutHistoryReset', 'preserveProjectHistory']) {
  assert(designerSource.includes(marker), `useDesigner.ts missing ${marker}`)
}
for (const marker of ['pruneProjectHistory', 'pushProjectHistory', 'beginProjectHistory']) {
  assert(lowcodeSource.includes(marker), `useLowcode.ts missing ${marker}`)
}

console.log('page-designer-history-fixture: PASS')
console.log(JSON.stringify({ projectSequence: projectPatch.sequence, layoutChanges: layoutPatch.widgetChanges.length, layoutOrderTracked: Boolean(layoutPatch.orderBefore) }, null, 2))
