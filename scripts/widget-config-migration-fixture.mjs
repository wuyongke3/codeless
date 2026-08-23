import assert from 'node:assert/strict'

const {
  detectLegacyWidgetDrift,
  diagnoseWidgetStorage,
  parseColumns,
  parseOptions,
  projectWidgetConfigToLegacy,
  serializeColumns,
  serializeOptions,
  validateWidgetConfig,
} = await import(new URL('../src/composables/widgetConfigMigration.ts', import.meta.url))

const config = {
  version: 1,
  layout: { x: 48, y: 72, width: 320, height: 88, rotation: 0, zIndex: 2, locked: false, hidden: false },
  content: {
    text: 'Legacy migration fixture',
    description: 'canonical config is the editor source of truth',
    options: parseOptions('One|one\nTwo|two'),
    columns: parseColumns(['name|Name|120', 'status|Status']),
  },
  style: { accent: '#665cf6', textAlign: 'left', borderRadius: 8 },
  data: { source: 'static' },
  validation: { required: true },
  interaction: { events: [] },
  meta: { version: 1, createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z' },
}

const validation = validateWidgetConfig(config)
assert.equal(validation.valid, true)
assert.equal(validation.diagnostics.length, 0)
const invalidConfig = validateWidgetConfig({ ...config, version: 2, interaction: { events: 'not-an-array' } })
assert.equal(invalidConfig.valid, false)
assert.ok(invalidConfig.diagnostics.some(item => item.code === 'unsupported-config-version'))
assert.ok(invalidConfig.diagnostics.some(item => item.code === 'invalid-interaction'))
assert.equal(serializeOptions(config.content.options), 'One|one\nTwo|two')
assert.equal(serializeColumns(config.content.columns), 'name|Name|120\nstatus|Status')

const legacy = {
  id: 'fixture_widget',
  type: 'text',
  name: 'Fixture widget',
  x: 48,
  y: 72,
  w: 320,
  h: 88,
  props: projectWidgetConfigToLegacy(config).props,
  config,
}

const aligned = detectLegacyWidgetDrift(legacy)
assert.equal(aligned.status, 'aligned')
assert.equal(aligned.drifted, false)

const edited = structuredClone(legacy)
edited.config.layout.x = 96
edited.config.content.text = 'Changed canonical value'
const drift = detectLegacyWidgetDrift(edited)
assert.equal(drift.status, 'drifted')
assert.ok(drift.fields.includes('x'))
assert.ok(drift.fields.includes('props.text'))
assert.equal(diagnoseWidgetStorage(edited).legacyDrift.drifted, true)

const legacyOnly = structuredClone(legacy)
delete legacyOnly.config
const legacyDiagnosis = diagnoseWidgetStorage(legacyOnly)
assert.equal(legacyDiagnosis.source, 'legacy')
assert.equal(legacyDiagnosis.migrationRequired, true)
assert.ok(legacyDiagnosis.diagnostics.some(item => item.code === 'legacy-migration-required'))

const configOnly = structuredClone(legacy)
delete configOnly.x
delete configOnly.y
delete configOnly.w
delete configOnly.h
delete configOnly.props
const configDiagnosis = diagnoseWidgetStorage(configOnly)
assert.equal(configDiagnosis.source, 'config')
assert.equal(configDiagnosis.legacyPresent, false)
assert.equal(configDiagnosis.legacyDrift.status, 'absent')

console.log('widget-config-migration-fixture: PASS')
console.log(JSON.stringify({
  validation: validation.valid,
  aligned: aligned.status,
  driftFields: drift.fields,
  legacySource: legacyDiagnosis.source,
  configSource: configDiagnosis.source,
}, null, 2))
