import assert from 'node:assert/strict'
import {
  buildDesignTokenReferenceIndex,
  createDesignTokenStore,
  getDesignToken,
  importDesignTokensJson,
  removeDesignToken,
  resolveDesignTokenValue,
  switchDesignThemeMode,
} from '../src/composables/designTokens.ts'
import { normalizeDesignSystem, resolveDesignToken } from '../src/composables/designSystem.ts'

const system = normalizeDesignSystem()
const store = createDesignTokenStore(system)

const brand = store.create({ reference: 'color.brand', aliasOf: '$color.primary' })
assert.equal(brand.aliasOf, 'color.primary')
assert.equal(store.resolve('color.brand')?.resolvedValue, '#665cf6')

store.create({ reference: 'text.buttonLabel', type: 'text', value: 'Submit' })
store.create({ reference: 'boolean.compact', type: 'boolean', value: false })
store.create({ reference: 'number.panelWidth', type: 'number', value: 320 })
assert.equal(store.getToken('text.buttonLabel')?.value, 'Submit')
assert.equal(store.getToken('boolean.compact')?.value, false)
assert.equal(store.getToken('number.panelWidth')?.value, 320)

store.update('color.brand', { aliasOf: 'color.secondary' })
assert.equal(resolveDesignTokenValue(system, 'color.brand'), '#687084')
assert.equal(resolveDesignToken(system, 'color.brand'), '#687084')

const sources = [{
  id: 'widget:home:button',
  kind: 'widget',
  tokenRefs: { accent: 'color.brand' },
}]
const index = buildDesignTokenReferenceIndex(system, sources)
assert.ok(index.byToken['light:color.brand']?.some(item => item.sourceId === 'widget:home:button'))
assert.ok(index.byToken['light:color.secondary']?.some(item => item.sourceId === 'widget:home:button'))

const blocked = removeDesignToken(system, 'color.secondary', { sources })
assert.equal(blocked.deleted, false)
assert.equal(blocked.blocked, true)

const replaced = removeDesignToken(system, 'color.secondary', {
  onReferenced: 'replace',
  replaceReferencesWith: 'color.primary',
  sources,
})
assert.equal(replaced.deleted, true)
assert.equal(store.resolve('color.brand')?.resolvedValue, '#665cf6')
assert.equal(sources[0].tokenRefs.accent, 'color.brand')

const aliasExported = store.exportJson()
const aliasImported = importDesignTokensJson(aliasExported)
assert.equal(aliasImported.system?.themes.find(theme => theme.id === 'light')?.aliases?.['color.brand'], 'color.primary')

const aliasRemoved = store.remove('color.brand')
assert.equal(aliasRemoved.deleted, true)
assert.equal(store.getToken('color.brand'), undefined)

assert.equal(switchDesignThemeMode(system, 'dark').activeThemeId, 'dark')
assert.equal(resolveDesignTokenValue(system, 'color.primary'), '#8c84ff')
assert.equal(store.setActiveTheme('light').activeThemeId, 'light')

const exported = store.exportJson()
const imported = importDesignTokensJson(exported)
assert.equal(imported.ok, true)
assert.equal(imported.system?.activeThemeId, 'light')
assert.equal(imported.system?.themes.find(theme => theme.id === 'light')?.tokens.custom?.panelWidth, 320)
assert.equal(getDesignToken(imported.system, 'boolean.compact')?.value, false)

const legacyImported = importDesignTokensJson(JSON.stringify(system))
assert.equal(legacyImported.ok, true)
assert.ok(legacyImported.diagnostics.some(item => item.code === 'unsupported-format'))

const deletionSystem = normalizeDesignSystem()
const deletionStore = createDesignTokenStore(deletionSystem)
assert.equal(deletionStore.remove('color.primary', { onReferenced: 'force' }).deleted, true)
assert.equal(deletionStore.getToken('color.primary'), undefined)
assert.equal(resolveDesignToken(deletionSystem, 'color.primary'), undefined)
const recreated = deletionStore.create({ reference: 'color.primary', value: '#123456' })
assert.equal(recreated.value, '#123456')

console.log('design-token fixture: PASS')
