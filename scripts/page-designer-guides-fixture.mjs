import assert from 'node:assert/strict'
import {
  alignFrames,
  distributeFrames,
  getCanvasGuideBounds,
  smartSnapFrame,
  snapValueToGrid,
} from '../src/composables/designer/canvasGuides.ts'

const frames = [
  { id: 'a', x: 10, y: 10, width: 100, height: 40 },
  { id: 'b', x: 160, y: 24, width: 60, height: 30 },
  { id: 'c', x: 280, y: 48, width: 80, height: 20 },
]
assert.equal(snapValueToGrid(13, 8), 16)
assert.deepEqual(getCanvasGuideBounds(frames), { x: 10, y: 10, width: 350, height: 58 })
const left = alignFrames(frames, 'left')
assert.deepEqual(left.map(frame => frame.x), [10, 10, 10])
const middle = alignFrames(frames, 'middle')
assert.deepEqual(middle.map(frame => frame.y), [19, 24, 29])
const distributed = distributeFrames(frames, 'x')
assert.deepEqual(distributed.map(frame => frame.x), [10, 165, 280])
const snapped = smartSnapFrame(
  { id: 'moving', x: 116, y: 204, width: 80, height: 40 },
  [{ id: 'peer', x: 200, y: 200, width: 80, height: 40 }],
  { threshold: 4 },
)
assert.equal(snapped.frame.x, 120, 'moving right edge should align to peer left edge')
assert.equal(snapped.frame.y, 200, 'moving top should align to peer top')
assert.equal(snapped.snapped, true)
assert.ok(snapped.guides.length >= 1)
console.log('page-designer-guides-fixture: PASS')
console.log(JSON.stringify({ align: left.map(frame => frame.x), distributed: distributed.map(frame => frame.x), snap: snapped.delta }, null, 2))
