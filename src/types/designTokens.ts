import type { DesignSystem, DesignTheme, DesignTokenSet, DesignTokenValue, LowCodeProject } from './lowcode'

/** Stable JSON format for local design-token exchange. */
export const DESIGN_TOKENS_FORMAT = 'codeless-design-tokens' as const
export const DESIGN_TOKENS_SCHEMA_VERSION = 1 as const

export type DesignTokenKind = 'color' | 'number' | 'text' | 'boolean' | 'shadow'
export type DesignTokenBucket = keyof DesignTokenSet

export interface DesignTokenReferenceParts {
  raw: string
  canonical: string
  bucket: DesignTokenBucket
  key: string
  kind: DesignTokenKind
}

export interface DesignTokenRecord {
  themeId: string
  reference: string
  bucket: DesignTokenBucket
  key: string
  kind: DesignTokenKind
  exists: boolean
  value?: DesignTokenValue
  aliasOf?: string
  resolvedValue?: DesignTokenValue
  resolvedReference?: string
  /** Optional usage snapshot populated by list/get helpers when an index is available. */
  references?: readonly DesignTokenReferenceUsage[]
}

export interface DesignTokenCreateInput {
  /** Accepted forms include color.primary, $spacing.md and plural buckets. */
  reference: string
  themeId?: string
  type?: DesignTokenKind
  value?: DesignTokenValue
  aliasOf?: string
  /** Useful for staged imports; normal CRUD rejects dangling aliases by default. */
  allowDanglingAlias?: boolean
  overwrite?: boolean
}

export interface DesignTokenUpdateInput {
  value?: DesignTokenValue
  /** Set to null to remove an existing alias and write a concrete value. */
  aliasOf?: string | null
  type?: DesignTokenKind
  allowDanglingAlias?: boolean
}

export interface DesignTokenReferenceSource {
  id: string
  themeId?: string
  kind?: 'widget' | 'external'
  tokenRefs: Record<string, string | undefined>
}

export interface DesignTokenReferenceUsage {
  sourceType: 'alias' | 'widget' | 'external'
  sourceId: string
  themeId: string
  property?: string
  reference: string
  canonicalReference: string
  resolvedReference?: string
}

export interface DesignTokenReferenceIndex {
  entries: readonly DesignTokenReferenceUsage[]
  byToken: Readonly<Record<string, readonly DesignTokenReferenceUsage[]>>
}

export interface DesignTokenDeleteOptions {
  themeId?: string
  /** Defaults to reject: callers must explicitly opt into replacement/force. */
  onReferenced?: 'reject' | 'replace' | 'force'
  replaceReferencesWith?: string
  sources?: readonly DesignTokenReferenceSource[]
}

export interface DesignTokenDeleteResult {
  deleted: boolean
  blocked: boolean
  themeId: string
  reference: string
  references: readonly DesignTokenReferenceUsage[]
  danglingReferences: readonly DesignTokenReferenceUsage[]
}

export interface DesignTokensDocument {
  format: typeof DESIGN_TOKENS_FORMAT
  schemaVersion: typeof DESIGN_TOKENS_SCHEMA_VERSION
  exportedAt: string
  designSystem: DesignSystem
}

export interface DesignTokenDiagnostic {
  severity: 'warning' | 'error'
  code: 'invalid-json' | 'invalid-document' | 'unsupported-format' | 'unsupported-version' | 'missing-design-system'
  path: string
  message: string
}

export interface DesignTokenImportOptions {
  mode?: 'replace' | 'merge'
  base?: DesignSystem
}

export interface DesignTokenImportResult {
  ok: boolean
  system?: DesignSystem
  document?: DesignTokensDocument
  diagnostics: readonly DesignTokenDiagnostic[]
}

export interface DesignTokenThemeSwitchResult {
  changed: boolean
  theme?: DesignTheme
  previousThemeId: string
  activeThemeId: string
}

export interface DesignTokenStore {
  readonly system: DesignSystem
  listTokens: (themeId?: string) => DesignTokenRecord[]
  getToken: (reference: string, themeId?: string) => DesignTokenRecord | undefined
  resolve: (reference: string, themeId?: string) => DesignTokenRecord | undefined
  create: (input: DesignTokenCreateInput) => DesignTokenRecord
  update: (reference: string, patch: DesignTokenUpdateInput, themeId?: string) => DesignTokenRecord
  upsert: (input: DesignTokenCreateInput) => DesignTokenRecord
  remove: (reference: string, options?: DesignTokenDeleteOptions) => DesignTokenDeleteResult
  references: (reference: string, themeId?: string, sources?: readonly DesignTokenReferenceSource[]) => readonly DesignTokenReferenceUsage[]
  referenceIndex: (sources?: readonly DesignTokenReferenceSource[]) => DesignTokenReferenceIndex
  setActiveTheme: (themeId: string) => DesignTokenThemeSwitchResult
  switchMode: (mode: 'light' | 'dark') => DesignTokenThemeSwitchResult
  exportJson: (pretty?: boolean) => string
  importJson: (input: string | unknown, options?: Omit<DesignTokenImportOptions, 'base'>) => DesignTokenImportResult
}

export type DesignTokenSystem = DesignSystem
export type DesignTokenSetSnapshot = DesignTokenSet
export type { DesignSystem, DesignTheme, DesignTokenSet, DesignTokenValue, LowCodeProject }
