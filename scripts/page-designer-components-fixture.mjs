import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const { createWidget } = await vite.ssrLoadModule('/src/composables/utils.ts')
const {
  componentInstanceCount,
  createComponentDefinition,
  createComponentInstance,
  detachComponentInstance,
  migrateLegacyVariantsToComponent,
  publishComponentDefinition,
  recordComponentInstanceOverrides,
  refreshComponentInstance,
} = await vite.ssrLoadModule('/src/composables/designer/components.ts')

const createdAt = '2026-08-23T00:00:00.000Z'
const master = createWidget('button', 40, 32, { name: 'Primary action', props: { text: 'Save' } })
const project = {
  id: 'component-fixture',
  name: 'Component fixture',
  description: '',
  status: 'draft',
  category: 'test',
  layout: {
    version: 2,
    pageName: 'Home',
    canvas: { width: 960, height: 720, background: '#fff' },
    widgets: [master],
  },
  createdAt,
  updatedAt: createdAt,
}

const definition = createComponentDefinition(project, master)
assert(definition, 'creating a definition should return its local source')
assert.equal(master.config.component?.role, 'definition')
assert.equal(project.componentDefinitions?.length, 1)

const instance = createComponentInstance(project, master)
assert(instance, 'a master component should create a linked instance')
assert.equal(instance.config.component?.role, 'instance')
assert.equal(componentInstanceCount(project, definition.id), 1)

instance.config.content.text = 'Save draft'
assert.equal(recordComponentInstanceOverrides(project, instance), 1)
assert.equal(instance.config.component?.overrides?.[0].path, 'content.text')

master.config.content.text = 'Publish'
const publication = publishComponentDefinition(project, master)
assert.equal(publication.updated, true)
assert.equal(publication.instances, 1)
assert.equal(publication.conflicts, 1, 'master and instance editing the same field should be explainable')
assert.equal(instance.config.content.text, 'Save draft', 'instance override should survive master publication')
assert.equal(instance.config.component?.conflicts?.[0].path, 'content.text')

assert.equal(refreshComponentInstance(project, instance), true)
assert.equal(instance.config.content.text, 'Save draft', 'acknowledging an update preserves local override')
assert.equal(instance.config.component?.conflicts?.length || 0, 0)
assert.equal(refreshComponentInstance(project, instance, 'reset-overrides'), true)
assert.equal(instance.config.content.text, 'Publish', 'reset should apply the latest master value')
assert.equal(instance.config.component?.overrides?.length || 0, 0)

assert.equal(detachComponentInstance(instance), true)
assert.equal(instance.config.component, undefined, 'detach should leave an editable independent node')

const legacy = createWidget('button', 200, 32, { name: 'Legacy action', props: { text: 'Legacy' } })
legacy.config.variants = { primary: { style: { background: '#665cf6' } }, secondary: { style: { background: '#ffffff' } } }
project.layout.widgets.push(legacy)
const migrated = migrateLegacyVariantsToComponent(project, legacy)
assert(migrated, 'legacy variants should have an explicit opt-in component migration')
assert.deepEqual(migrated.variantProperties?.variant, ['primary', 'secondary'])
assert.equal(legacy.config.component?.role, 'definition')

console.log('page-designer-components-fixture: PASS')
console.log(JSON.stringify({ definitionVersion: definition.version, definitionCount: project.componentDefinitions?.length, conflictCount: publication.conflicts }, null, 2))

await vite.close()
