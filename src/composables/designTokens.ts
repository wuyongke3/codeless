import type {
  DesignSystem,
  DesignTheme,
  DesignTokenSet,
  DesignTokenValue,
  LowCodeProject,
} from '../types/lowcode'
import { getActiveDesignTheme, normalizeDesignSystem } from './designSystem'
import type {
  DesignTokenBucket,
  DesignTokenCreateInput,
  DesignTokenDeleteOptions,
  DesignTokenDeleteResult,
  DesignTokenDiagnostic,
  DesignTokenImportOptions,
  DesignTokenImportResult,
  DesignTokenKind,
  DesignTokenRecord,
  DesignTokenReferenceIndex,
  DesignTokenReferenceParts,
  DesignTokenReferenceSource,
  DesignTokenReferenceUsage,
  DesignTokenStore,
  DesignTokenThemeSwitchResult,
  DesignTokenUpdateInput,
  DesignTokensDocument,
} from '../types/designTokens'
import {
  DESIGN_TOKENS_FORMAT,
  DESIGN_TOKENS_SCHEMA_VERSION,
} from '../types/designTokens'

interface CategoryDefinition {
  bucket: DesignTokenBucket
  canonical: string
  kind: DesignTokenKind
}

const categoryDefinitions: Record<string, CategoryDefinition> = {
  color: { bucket: 'colors', canonical: 'color', kind: 'color' },
  colors: { bucket: 'colors', canonical: 'color', kind: 'color' },
  type: { bucket: 'typography', canonical: 'type', kind: 'number' },
  typography: { bucket: 'typography', canonical: 'type', kind: 'number' },
  space: { bucket: 'spacing', canonical: 'space', kind: 'number' },
  spacing: { bucket: 'spacing', canonical: 'space', kind: 'number' },
  radius: { bucket: 'radii', canonical: 'radius', kind: 'number' },
  radii: { bucket: 'radii', canonical: 'radius', kind: 'number' },
  shadow: { bucket: 'shadows', canonical: 'shadow', kind: 'shadow' },
  shadows: { bucket: 'shadows', canonical: 'shadow', kind: 'shadow' },
  text: { bucket: 'texts', canonical: 'text', kind: 'text' },
  texts: { bucket: 'texts', canonical: 'text', kind: 'text' },
  boolean: { bucket: 'booleans', canonical: 'boolean', kind: 'boolean' },
  booleans: { bucket: 'booleans', canonical: 'boolean', kind: 'boolean' },
  number: { bucket: 'custom', canonical: 'number', kind: 'number' },
  custom: { bucket: 'custom', canonical: 'custom', kind: 'text' },
}

const bucketCanonical: Record<DesignTokenBucket, string> = {
  colors: 'color',
  typography: 'type',
  spacing: 'space',
  radii: 'radius',
  shadows: 'shadow',
  texts: 'text',
  booleans: 'boolean',
  custom: 'custom',
}

const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireTheme(system: DesignSystem, themeId?: string): DesignTheme {
  const id = themeId || system.activeThemeId
  const theme = system.themes.find(item => item.id === id)
  if (!theme) throw new DesignTokenError('theme-not-found', `Theme not found: ${id}`)
  return theme
}

function ensureTokenSet(theme: DesignTheme): DesignTokenSet {
  const tokens = theme.tokens as DesignTokenSet
  tokens.texts ||= {}
  tokens.booleans ||= {}
  tokens.custom ||= {}
  theme.aliases ||= {}
  theme.removedTokens ||= {}
  return tokens
}

function markTokenRemoved(theme: DesignTheme, parts: DesignTokenReferenceParts) {
  ensureTokenSet(theme)
  theme.removedTokens![parts.canonical] = true
}

function clearTokenRemoved(theme: DesignTheme, parts: DesignTokenReferenceParts) {
  if (!theme.removedTokens) return
  delete theme.removedTokens[parts.canonical]
}

function normalizeAliasReference(reference: string): string {
  const parsed = parseDesignTokenReference(reference)
  if (!parsed) throw new DesignTokenError('invalid-reference', `Invalid token reference: ${reference}`)
  return parsed.canonical
}

function parsedAlias(theme: DesignTheme, parts: DesignTokenReferenceParts): string | undefined {
  const aliases = theme.aliases || {}
  const candidates = [
    parts.canonical,
    `${parts.bucket}.${parts.key}`,
    `$${parts.canonical}`,
  ]
  for (const candidate of candidates) {
    const value = aliases[candidate]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function readRawToken(theme: DesignTheme, parts: DesignTokenReferenceParts) {
  const tokens = ensureTokenSet(theme)
  const bucket = tokens[parts.bucket] as Record<string, DesignTokenValue> | undefined
  return {
    exists: Boolean(bucket && own(bucket, parts.key)) || Boolean(parsedAlias(theme, parts)),
    value: bucket && own(bucket, parts.key) ? bucket[parts.key] : undefined,
    aliasOf: parsedAlias(theme, parts),
  }
}

function inferKind(parts: DesignTokenReferenceParts, value?: DesignTokenValue): DesignTokenKind {
  if (parts.bucket === 'typography' && typeof value === 'string') return 'text'
  if (parts.bucket === 'custom') {
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'number') return 'number'
    return 'text'
  }
  return parts.kind
}

function isValidValue(value: DesignTokenValue, kind: DesignTokenKind, bucket: DesignTokenBucket): boolean {
  if (bucket === 'typography' && (typeof value === 'string' || typeof value === 'number')) return true
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (kind === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string'
}

function assertValue(value: DesignTokenValue, kind: DesignTokenKind, bucket: DesignTokenBucket) {
  if (!isValidValue(value, kind, bucket)) {
    throw new DesignTokenError('invalid-value', `Value does not match token type ${kind}`)
  }
}

function resolveInTheme(
  theme: DesignTheme,
  reference: string,
  visited = new Set<string>(),
  chain: string[] = [],
): { status: 'resolved' | 'missing' | 'cycle'; value?: DesignTokenValue; resolvedReference?: string; chain: string[] } {
  const parts = parseDesignTokenReference(reference)
  if (!parts) return { status: 'missing', chain }
  const identity = `${theme.id}:${parts.canonical}`
  if (visited.has(identity)) return { status: 'cycle', chain: [...chain, parts.canonical] }
  visited.add(identity)
  const nextChain = [...chain, parts.canonical]
  const alias = parsedAlias(theme, parts)
  if (alias) {
    const result = resolveInTheme(theme, alias, visited, nextChain)
    return { ...result, chain: result.chain }
  }
  const raw = readRawToken(theme, parts)
  if (!raw.exists || raw.value === undefined) return { status: 'missing', chain: nextChain }
  return {
    status: 'resolved',
    value: raw.value,
    resolvedReference: parts.canonical,
    chain: nextChain,
  }
}

function tokenRecord(system: DesignSystem, reference: string, themeId?: string): DesignTokenRecord | undefined {
  const theme = requireTheme(system, themeId)
  const parts = parseDesignTokenReference(reference)
  if (!parts) return undefined
  const raw = readRawToken(theme, parts)
  if (!raw.exists) return undefined
  const resolution = resolveInTheme(theme, parts.canonical)
  const rawKind = inferKind(parts, raw.value)
  const target = resolution.resolvedReference ? parseDesignTokenReference(resolution.resolvedReference) : undefined
  const kind = target && resolution.value !== undefined ? inferKind(target, resolution.value) : rawKind
  return {
    themeId: theme.id,
    reference: parts.canonical,
    bucket: parts.bucket,
    key: parts.key,
    kind,
    exists: true,
    value: raw.aliasOf ? undefined : raw.value,
    aliasOf: raw.aliasOf ? normalizeAliasReference(raw.aliasOf) : undefined,
    resolvedValue: resolution.status === 'resolved' ? resolution.value : undefined,
    resolvedReference: resolution.resolvedReference,
  }
}

function setAlias(theme: DesignTheme, parts: DesignTokenReferenceParts, target: string) {
  ensureTokenSet(theme)
  clearTokenRemoved(theme, parts)
  theme.aliases![parts.canonical] = normalizeAliasReference(target)
  const bucket = theme.tokens[parts.bucket] as Record<string, DesignTokenValue>
  delete bucket[parts.key]
}

function removeAlias(theme: DesignTheme, parts: DesignTokenReferenceParts) {
  const aliases = theme.aliases || {}
  for (const key of Object.keys(aliases)) {
    const parsed = parseDesignTokenReference(key)
    if (parsed?.canonical === parts.canonical) delete aliases[key]
  }
}

function assertAliasTarget(
  system: DesignSystem,
  theme: DesignTheme,
  parts: DesignTokenReferenceParts,
  target: string,
  type: DesignTokenKind | undefined,
  allowDanglingAlias = false,
) {
  const normalizedTarget = normalizeAliasReference(target)
  if (normalizedTarget === parts.canonical) throw new DesignTokenError('alias-cycle', `Token cannot alias itself: ${parts.canonical}`)
  const resolution = resolveInTheme(theme, normalizedTarget)
  if (resolution.status !== 'resolved') {
    if (!allowDanglingAlias) throw new DesignTokenError('missing-alias-target', `Alias target does not resolve: ${target}`)
    return normalizedTarget
  }
  const targetParts = parseDesignTokenReference(normalizedTarget)
  if (type && targetParts && type !== inferKind(targetParts, resolution.value)) {
    throw new DesignTokenError('alias-type-mismatch', `Alias target type does not match ${type}`)
  }
  void system
  return normalizedTarget
}

function tokenKindForInput(parts: DesignTokenReferenceParts, value: DesignTokenValue | undefined, type?: DesignTokenKind) {
  return type || (value === undefined ? parts.kind : inferKind(parts, value))
}

export class DesignTokenError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'DesignTokenError'
    this.code = code
  }
}

/** Parse legacy and extended references into one canonical representation. */
export function parseDesignTokenReference(reference: string): DesignTokenReferenceParts | undefined {
  const raw = String(reference || '').trim()
  const normalized = raw.replace(/^\$/, '')
  if (!normalized) return undefined
  const [categoryName, ...keyParts] = normalized.split('.')
  const definition = categoryDefinitions[categoryName.toLowerCase()]
  const key = keyParts.join('.').trim()
  if (!definition || !key) return undefined
  return {
    raw,
    canonical: `${definition.canonical}.${key}`,
    bucket: definition.bucket,
    key,
    kind: definition.kind,
  }
}

export function getDesignToken(system: DesignSystem, reference: string, themeId?: string) {
  const normalized = normalizeDesignSystem(system)
  const record = tokenRecord(normalized, reference, themeId)
  if (!record) return undefined
  const index = buildDesignTokenReferenceIndexNormalized(normalized)
  return { ...record, references: index.byToken[tokenReferenceKey(record.themeId, record.reference)] || [] }
}

export function resolveDesignTokenReference(system: DesignSystem, reference: string, themeId?: string) {
  const record = tokenRecord(normalizeDesignSystem(system), reference, themeId)
  if (!record) return undefined
  return record.resolvedValue === undefined ? undefined : {
    value: record.resolvedValue,
    reference: record.reference,
    resolvedReference: record.resolvedReference || record.reference,
    kind: record.kind,
  }
}

export function resolveDesignTokenValue(system: DesignSystem, reference: string, themeId?: string): DesignTokenValue | undefined {
  return resolveDesignTokenReference(system, reference, themeId)?.value
}

export function listDesignTokens(system: DesignSystem, themeId?: string): DesignTokenRecord[] {
  const normalized = normalizeDesignSystem(system)
  const themes = themeId ? [requireTheme(normalized, themeId)] : normalized.themes
  const records: DesignTokenRecord[] = []
  for (const theme of themes) {
    const tokens = ensureTokenSet(theme)
    for (const bucket of Object.keys(bucketCanonical) as DesignTokenBucket[]) {
      const values = tokens[bucket] as Record<string, DesignTokenValue> | undefined
      if (!values) continue
      for (const key of Object.keys(values)) {
        const record = tokenRecord(normalized, `${bucketCanonical[bucket]}.${key}`, theme.id)
        if (record) records.push(record)
      }
    }
    for (const alias of Object.keys(theme.aliases || {})) {
      const parts = parseDesignTokenReference(alias)
      if (!parts || records.some(record => record.themeId === theme.id && record.reference === parts.canonical)) continue
      const record = tokenRecord(normalized, parts.canonical, theme.id)
      if (record) records.push(record)
    }
  }
  const index = buildDesignTokenReferenceIndexNormalized(normalized)
  return records
    .map(record => ({ ...record, references: index.byToken[tokenReferenceKey(record.themeId, record.reference)] || [] }))
    .sort((a, b) => a.themeId.localeCompare(b.themeId) || a.reference.localeCompare(b.reference))
}

export function createDesignToken(system: DesignSystem, input: DesignTokenCreateInput): DesignTokenRecord {
  const normalized = normalizeDesignSystem(system)
  const theme = requireTheme(normalized, input.themeId)
  const parts = parseDesignTokenReference(input.reference)
  if (!parts) throw new DesignTokenError('invalid-reference', `Invalid token reference: ${input.reference}`)
  const existing = tokenRecord(normalized, parts.canonical, theme.id)
  if (existing && !input.overwrite) throw new DesignTokenError('token-exists', `Token already exists: ${parts.canonical}`)

  const hasAlias = typeof input.aliasOf === 'string' && input.aliasOf.trim().length > 0
  const hasValue = input.value !== undefined
  if (!hasAlias && !hasValue) throw new DesignTokenError('invalid-input', 'A token must provide value or aliasOf')

  if (hasAlias) {
    const type = input.type || parts.kind
    assertAliasTarget(normalized, theme, parts, input.aliasOf!, type, input.allowDanglingAlias)
    setAlias(theme, parts, input.aliasOf!)
  } else {
    const type = tokenKindForInput(parts, input.value, input.type)
    assertValue(input.value!, type, parts.bucket)
    removeAlias(theme, parts)
    clearTokenRemoved(theme, parts)
    const bucket = ensureTokenSet(theme)[parts.bucket] as Record<string, DesignTokenValue>
    bucket[parts.key] = input.value!
  }
  return tokenRecord(normalized, parts.canonical, theme.id)!
}

export function updateDesignToken(system: DesignSystem, reference: string, patch: DesignTokenUpdateInput, themeId?: string): DesignTokenRecord {
  const normalized = normalizeDesignSystem(system)
  const theme = requireTheme(normalized, themeId)
  const parts = parseDesignTokenReference(reference)
  if (!parts) throw new DesignTokenError('invalid-reference', `Invalid token reference: ${reference}`)
  const current = tokenRecord(normalized, parts.canonical, theme.id)
  if (!current) throw new DesignTokenError('token-not-found', `Token not found: ${parts.canonical}`)

  const aliasProvided = own(patch, 'aliasOf')
  if (aliasProvided && patch.aliasOf !== null) {
    const type = patch.type || current.kind
    assertAliasTarget(normalized, theme, parts, patch.aliasOf!, type, patch.allowDanglingAlias)
    setAlias(theme, parts, patch.aliasOf!)
  } else if (patch.value !== undefined || (aliasProvided && patch.aliasOf === null)) {
    if (patch.value === undefined) throw new DesignTokenError('invalid-input', 'Concrete token update requires value')
    const type = tokenKindForInput(parts, patch.value, patch.type)
    assertValue(patch.value, type, parts.bucket)
    removeAlias(theme, parts)
    clearTokenRemoved(theme, parts)
    const bucket = ensureTokenSet(theme)[parts.bucket] as Record<string, DesignTokenValue>
    bucket[parts.key] = patch.value
  } else if (patch.type && current.resolvedValue !== undefined) {
    assertValue(current.resolvedValue, patch.type, parts.bucket)
  }
  return tokenRecord(normalized, parts.canonical, theme.id)!
}

export function upsertDesignToken(system: DesignSystem, input: DesignTokenCreateInput): DesignTokenRecord {
  const current = getDesignToken(normalizeDesignSystem(system), input.reference, input.themeId)
  if (!current) return createDesignToken(system, input)
  const patch: DesignTokenUpdateInput = input.aliasOf !== undefined
    ? { aliasOf: input.aliasOf, type: input.type, allowDanglingAlias: input.allowDanglingAlias }
    : { value: input.value, type: input.type }
  return updateDesignToken(system, current.reference, patch, input.themeId)
}

function tokenReferenceKey(themeId: string, reference: string) {
  const parts = parseDesignTokenReference(reference)
  return `${themeId}:${parts?.canonical || reference.replace(/^\$/, '')}`
}

function addUsage(map: Map<string, DesignTokenReferenceUsage[]>, usage: DesignTokenReferenceUsage, chain: readonly string[]) {
  const references = new Set(chain)
  references.add(usage.canonicalReference)
  if (usage.resolvedReference) references.add(usage.resolvedReference)
  for (const reference of references) {
    const key = tokenReferenceKey(usage.themeId, reference)
    const bucket = map.get(key) || []
    if (!bucket.some(item => item.sourceId === usage.sourceId && item.property === usage.property && item.reference === usage.reference)) {
      bucket.push(usage)
    }
    map.set(key, bucket)
  }
}

function buildDesignTokenReferenceIndexNormalized(
  normalized: DesignSystem,
  sources: readonly DesignTokenReferenceSource[] = [],
): DesignTokenReferenceIndex {
  const map = new Map<string, DesignTokenReferenceUsage[]>()
  const entries: DesignTokenReferenceUsage[] = []

  for (const theme of normalized.themes) {
    for (const [aliasKey, aliasTarget] of Object.entries(theme.aliases || {})) {
      const parts = parseDesignTokenReference(aliasKey)
      if (!parts || typeof aliasTarget !== 'string') continue
      const resolution = resolveInTheme(theme, parts.canonical)
      const usage: DesignTokenReferenceUsage = {
        sourceType: 'alias',
        sourceId: `theme:${theme.id}:${parts.canonical}`,
        themeId: theme.id,
        reference: aliasTarget,
        canonicalReference: parts.canonical,
        resolvedReference: resolution.resolvedReference,
      }
      entries.push(usage)
      addUsage(map, usage, resolution.chain)
    }
  }

  for (const source of sources) {
    const theme = requireTheme(normalized, source.themeId)
    for (const [property, reference] of Object.entries(source.tokenRefs)) {
      if (!reference || !parseDesignTokenReference(reference)) continue
      const parts = parseDesignTokenReference(reference)!
      const resolution = resolveInTheme(theme, parts.canonical)
      const usage: DesignTokenReferenceUsage = {
        sourceType: source.kind || 'external',
        sourceId: source.id,
        themeId: theme.id,
        property,
        reference,
        canonicalReference: parts.canonical,
        resolvedReference: resolution.resolvedReference,
      }
      entries.push(usage)
      addUsage(map, usage, resolution.chain)
    }
  }

  return {
    entries,
    byToken: Object.fromEntries([...map.entries()].map(([key, value]) => [key, value])) as Readonly<Record<string, readonly DesignTokenReferenceUsage[]>>,
  }
}

export function buildDesignTokenReferenceIndex(
  system: DesignSystem,
  sources: readonly DesignTokenReferenceSource[] = [],
): DesignTokenReferenceIndex {
  return buildDesignTokenReferenceIndexNormalized(normalizeDesignSystem(system), sources)
}

export function getDesignTokenReferences(
  system: DesignSystem,
  reference: string,
  themeId?: string,
  sources: readonly DesignTokenReferenceSource[] = [],
): readonly DesignTokenReferenceUsage[] {
  const normalized = normalizeDesignSystem(system)
  const theme = requireTheme(normalized, themeId)
  return buildDesignTokenReferenceIndexNormalized(normalized, sources).byToken[tokenReferenceKey(theme.id, reference)] || []
}

/** Convert LowCodeProject widget tokenRefs into reference-index sources without changing the project. */
export function collectProjectDesignTokenSources(project: LowCodeProject): DesignTokenReferenceSource[] {
  const pages = project.pages?.length
    ? project.pages
    : [{ id: 'layout', name: project.layout.pageName, path: '/', layout: project.layout }]
  const sources: DesignTokenReferenceSource[] = []
  for (const page of pages) {
    for (const widget of page.layout.widgets || []) {
      const tokenRefs = widget.config?.style?.tokenRefs
      if (!tokenRefs) continue
      const refs = Object.fromEntries(Object.entries(tokenRefs).filter(([, value]) => typeof value === 'string')) as Record<string, string>
      if (!Object.keys(refs).length) continue
      sources.push({ id: `widget:${page.id}:${widget.id}`, kind: 'widget', tokenRefs: refs })
    }
  }
  return sources
}

export function removeDesignToken(
  system: DesignSystem,
  reference: string,
  options: DesignTokenDeleteOptions = {},
): DesignTokenDeleteResult {
  const normalized = normalizeDesignSystem(system)
  const theme = requireTheme(normalized, options.themeId)
  const parts = parseDesignTokenReference(reference)
  if (!parts) throw new DesignTokenError('invalid-reference', `Invalid token reference: ${reference}`)
  const current = tokenRecord(normalized, parts.canonical, theme.id)
  if (!current) {
    return {
      deleted: false,
      blocked: false,
      themeId: theme.id,
      reference: parts.canonical,
      references: [],
      danglingReferences: [],
    }
  }

  const references = (buildDesignTokenReferenceIndexNormalized(normalized, options.sources).byToken[tokenReferenceKey(theme.id, parts.canonical)] || [])
    .filter(usage => !(usage.sourceType === 'alias' && usage.canonicalReference === parts.canonical))
  const policy = options.onReferenced || 'reject'
  if (references.length && policy === 'reject') {
    return { deleted: false, blocked: true, themeId: theme.id, reference: parts.canonical, references, danglingReferences: references }
  }

  if (references.length && policy === 'replace') {
    if (!options.replaceReferencesWith) {
      return { deleted: false, blocked: true, themeId: theme.id, reference: parts.canonical, references, danglingReferences: references }
    }
    const replacement = normalizeAliasReference(options.replaceReferencesWith)
    const replacementResolution = resolveInTheme(theme, replacement)
    if (replacementResolution.status !== 'resolved') throw new DesignTokenError('missing-replacement', `Replacement does not resolve: ${replacement}`)

    for (const [aliasKey, aliasTarget] of Object.entries(theme.aliases || {})) {
      const parsedTarget = parseDesignTokenReference(aliasTarget)
      if (parsedTarget?.canonical === parts.canonical) theme.aliases![aliasKey] = replacement
    }
    for (const source of options.sources || []) {
      if ((source.themeId || normalized.activeThemeId) !== theme.id) continue
      for (const [property, sourceReference] of Object.entries(source.tokenRefs)) {
        if (parseDesignTokenReference(sourceReference || '')?.canonical === parts.canonical) source.tokenRefs[property] = replacement
      }
    }
    const remaining = buildDesignTokenReferenceIndexNormalized(normalized, options.sources).byToken[tokenReferenceKey(theme.id, parts.canonical)] || []
    if (remaining.length) {
      return { deleted: false, blocked: true, themeId: theme.id, reference: parts.canonical, references, danglingReferences: remaining }
    }
  }

  const bucket = ensureTokenSet(theme)[parts.bucket] as Record<string, DesignTokenValue>
  delete bucket[parts.key]
  removeAlias(theme, parts)
  markTokenRemoved(theme, parts)
  const danglingReferences = policy === 'force'
    ? references
    : buildDesignTokenReferenceIndexNormalized(normalized, options.sources).byToken[tokenReferenceKey(theme.id, parts.canonical)] || []
  return {
    deleted: true,
    blocked: false,
    themeId: theme.id,
    reference: parts.canonical,
    references,
    danglingReferences,
  }
}

export function setActiveDesignTheme(system: DesignSystem, themeId: string): DesignTokenThemeSwitchResult {
  const normalized = normalizeDesignSystem(system)
  const previousThemeId = normalized.activeThemeId
  const theme = normalized.themes.find(item => item.id === themeId)
  if (!theme) throw new DesignTokenError('theme-not-found', `Theme not found: ${themeId}`)
  normalized.activeThemeId = theme.id
  return { changed: previousThemeId !== theme.id, theme, previousThemeId, activeThemeId: theme.id }
}

export function switchDesignThemeMode(system: DesignSystem, mode: 'light' | 'dark'): DesignTokenThemeSwitchResult {
  const normalized = normalizeDesignSystem(system)
  const previousThemeId = normalized.activeThemeId
  const current = getActiveDesignTheme(normalized)
  const theme = normalized.themes.find(item => item.mode === mode) || current
  normalized.activeThemeId = theme.id
  return { changed: previousThemeId !== theme.id, theme, previousThemeId, activeThemeId: theme.id }
}

function mergeDesignSystems(base: DesignSystem, incoming: DesignSystem): DesignSystem {
  const result = clone(normalizeDesignSystem(base))
  const source = clone(normalizeDesignSystem(incoming))
  for (const importedTheme of source.themes) {
    const existing = result.themes.find(theme => theme.id === importedTheme.id)
    if (!existing) {
      result.themes.push(importedTheme)
      continue
    }
    existing.name = importedTheme.name
    existing.mode = importedTheme.mode
    existing.tokens = {
      ...existing.tokens,
      ...importedTheme.tokens,
      colors: { ...existing.tokens.colors, ...importedTheme.tokens.colors },
      typography: { ...existing.tokens.typography, ...importedTheme.tokens.typography },
      spacing: { ...existing.tokens.spacing, ...importedTheme.tokens.spacing },
      radii: { ...existing.tokens.radii, ...importedTheme.tokens.radii },
      shadows: { ...existing.tokens.shadows, ...importedTheme.tokens.shadows },
      texts: { ...(existing.tokens.texts || {}), ...(importedTheme.tokens.texts || {}) },
      booleans: { ...(existing.tokens.booleans || {}), ...(importedTheme.tokens.booleans || {}) },
      custom: { ...(existing.tokens.custom || {}), ...(importedTheme.tokens.custom || {}) },
    }
    existing.aliases = { ...(existing.aliases || {}), ...(importedTheme.aliases || {}) }
  }
  if (result.themes.some(theme => theme.id === source.activeThemeId)) result.activeThemeId = source.activeThemeId
  return normalizeDesignSystem(result)
}

export function exportDesignTokensJson(system: DesignSystem, pretty = true): string {
  const document: DesignTokensDocument = {
    format: DESIGN_TOKENS_FORMAT,
    schemaVersion: DESIGN_TOKENS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    designSystem: clone(normalizeDesignSystem(system)),
  }
  return JSON.stringify(document, null, pretty ? 2 : 0)
}

export function importDesignTokensJson(input: string | unknown, options: DesignTokenImportOptions = {}): DesignTokenImportResult {
  const diagnostics: DesignTokenDiagnostic[] = []
  let parsed: unknown = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as unknown
    } catch {
      return {
        ok: false,
        diagnostics: [{ severity: 'error', code: 'invalid-json', path: '$', message: 'Invalid JSON' }],
      }
    }
  }
  if (!isRecord(parsed)) {
    return { ok: false, diagnostics: [{ severity: 'error', code: 'invalid-document', path: '$', message: 'Token document must be an object' }] }
  }

  let rawSystem: unknown = parsed
  let document: DesignTokensDocument | undefined
  if (own(parsed, 'format') || own(parsed, 'schemaVersion') || own(parsed, 'designSystem')) {
    if (parsed.format !== DESIGN_TOKENS_FORMAT) {
      return { ok: false, diagnostics: [{ severity: 'error', code: 'unsupported-format', path: '$.format', message: `Expected ${DESIGN_TOKENS_FORMAT}` }] }
    }
    if (parsed.schemaVersion !== DESIGN_TOKENS_SCHEMA_VERSION) {
      return { ok: false, diagnostics: [{ severity: 'error', code: 'unsupported-version', path: '$.schemaVersion', message: `Expected schema version ${DESIGN_TOKENS_SCHEMA_VERSION}` }] }
    }
    rawSystem = parsed.designSystem
  } else {
    diagnostics.push({ severity: 'warning', code: 'unsupported-format', path: '$', message: 'Accepted legacy raw DesignSystem JSON' })
  }

  if (!isRecord(rawSystem) || !Array.isArray(rawSystem.themes)) {
    return { ok: false, diagnostics: [...diagnostics, { severity: 'error', code: 'missing-design-system', path: '$.designSystem', message: 'DesignSystem.themes must be an array' }] }
  }

  const imported = normalizeDesignSystem(clone(rawSystem as unknown as DesignSystem))
  const base = options.base ? normalizeDesignSystem(clone(options.base)) : undefined
  const system = options.mode === 'merge' && base ? mergeDesignSystems(base, imported) : imported
  document = {
    format: DESIGN_TOKENS_FORMAT,
    schemaVersion: DESIGN_TOKENS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    designSystem: clone(system),
  }
  return { ok: true, system, document, diagnostics }
}

export function createDesignTokenStore(system?: DesignSystem): DesignTokenStore {
  const target = normalizeDesignSystem(system)
  const store: DesignTokenStore = {
    system: target,
    listTokens: themeId => listDesignTokens(target, themeId),
    getToken: (reference, themeId) => getDesignToken(target, reference, themeId),
    resolve: (reference, themeId) => getDesignToken(target, reference, themeId),
    create: input => createDesignToken(target, input),
    update: (reference, patch, themeId) => updateDesignToken(target, reference, patch, themeId),
    upsert: input => upsertDesignToken(target, input),
    remove: (reference, options) => removeDesignToken(target, reference, options),
    references: (reference, themeId, sources) => getDesignTokenReferences(target, reference, themeId, sources),
    referenceIndex: sources => buildDesignTokenReferenceIndex(target, sources),
    setActiveTheme: themeId => setActiveDesignTheme(target, themeId),
    switchMode: mode => switchDesignThemeMode(target, mode),
    exportJson: pretty => exportDesignTokensJson(target, pretty),
    importJson: (input, options) => {
      const result = importDesignTokensJson(input, { ...options, base: target })
      if (result.ok && result.system) {
        target.activeThemeId = result.system.activeThemeId
        target.themes = result.system.themes
        return { ...result, system: target }
      }
      return result
    },
  }
  return store
}

// Short aliases keep the API discoverable for callers that prefer verb-first names.
export const getToken = getDesignToken
export const listTokens = listDesignTokens
export const createToken = createDesignToken
export const updateToken = updateDesignToken
export const deleteToken = removeDesignToken
export const resolveToken = resolveDesignTokenValue
export const resolveTokenReference = resolveDesignTokenReference
export const trackDesignTokenReferences = buildDesignTokenReferenceIndex
export const setActiveTheme = setActiveDesignTheme
export const switchThemeMode = switchDesignThemeMode
export const exportDesignTokens = exportDesignTokensJson
export const importDesignTokens = importDesignTokensJson
export const exportDesignSystemJson = exportDesignTokensJson
export const importDesignSystemJson = importDesignTokensJson
export const getDesignTokenReferenceIndex = buildDesignTokenReferenceIndex
export const useDesignTokens = createDesignTokenStore



