/**
 * Stable, business-model-independent protocol for page-designer edits.
 *
 * This module intentionally does not import LowCodeProject/LowCodeWidget. The
 * editor, persistence and collaboration layers can adapt their own models to
 * this DTO without making the protocol depend on a volatile implementation.
 */

export const DESIGNER_PROTOCOL_NAME = 'codeless.page-designer' as const
export const DESIGNER_PROTOCOL_VERSION = 1 as const
export const DESIGNER_REVISION_START = 0 as const

export type DesignerProtocolVersion = typeof DESIGNER_PROTOCOL_VERSION
export type DesignerId = string

export type DesignerJsonPrimitive = string | number | boolean | null
export type DesignerJsonValue =
  | DesignerJsonPrimitive
  | readonly DesignerJsonValue[]
  | { readonly [key: string]: DesignerJsonValue }
export type DesignerJsonObject = { readonly [key: string]: DesignerJsonValue }

export type DesignerCommandKind =
  | 'node.create'
  | 'node.delete'
  | 'node.update'
  | 'node.reparent'
  | 'page.update'
  | 'style.update'
  | 'transaction'

export type DesignerCommandOrigin =
  | 'canvas'
  | 'inspector'
  | 'library'
  | 'import'
  | 'migration'
  | 'system'

export interface DesignerCommandBase<K extends DesignerCommandKind> {
  kind: K
  commandId: DesignerId
  actorId: DesignerId
  issuedAt: string
  origin?: DesignerCommandOrigin
  label?: string
  metadata?: DesignerJsonObject
}

/**
 * Adapter-owned node DTO. `data` can contain layout, content, binding and
 * component information, but the protocol does not prescribe those fields.
 */
export interface DesignerNodeSnapshot {
  id: DesignerId
  type: string
  parentId: DesignerId | null
  data: DesignerJsonObject
}

/**
 * `path` is a JSON Pointer (RFC 6901). The empty string addresses the target
 * object itself; `/layout/width` addresses a nested property.
 */
export type DesignerPropertyChange =
  | {
      operation: 'set'
      path: string
      next: DesignerJsonValue
      previous?: DesignerJsonValue
    }
  | {
      operation: 'remove'
      path: string
      previous?: DesignerJsonValue
    }

export interface DesignerCreateNodeCommand extends DesignerCommandBase<'node.create'> {
  parentId: DesignerId | null
  index: number
  node: DesignerNodeSnapshot
}

export interface DesignerDeleteNodeCommand extends DesignerCommandBase<'node.delete'> {
  nodeIds: readonly DesignerId[]
  /** Optional inverse data. Required only when the caller needs local undo. */
  snapshots?: readonly DesignerNodeSnapshot[]
}

export interface DesignerUpdateNodeCommand extends DesignerCommandBase<'node.update'> {
  nodeId: DesignerId
  changes: readonly DesignerPropertyChange[]
}

export interface DesignerReparentNodeCommand extends DesignerCommandBase<'node.reparent'> {
  nodeId: DesignerId
  fromParentId: DesignerId | null
  fromIndex: number
  toParentId: DesignerId | null
  toIndex: number
}

export interface DesignerUpdatePageCommand extends DesignerCommandBase<'page.update'> {
  pageId: DesignerId
  changes: readonly DesignerPropertyChange[]
}

export interface DesignerUpdateStyleCommand extends DesignerCommandBase<'style.update'> {
  styleId: DesignerId
  changes: readonly DesignerPropertyChange[]
}

export type DesignerAtomicCommand =
  | DesignerCreateNodeCommand
  | DesignerDeleteNodeCommand
  | DesignerUpdateNodeCommand
  | DesignerReparentNodeCommand
  | DesignerUpdatePageCommand
  | DesignerUpdateStyleCommand

/**
 * A transaction is deliberately non-recursive in v1. Nested transactions can
 * be represented by multiple transaction envelopes without changing replay
 * semantics.
 */
export interface DesignerTransactionCommand extends DesignerCommandBase<'transaction'> {
  commands: readonly DesignerAtomicCommand[]
}

export type DesignerEditCommand = DesignerAtomicCommand | DesignerTransactionCommand

/**
 * One optimistic edit batch. `revision` is the proposed/assigned revision and
 * must equal `baseRevision + 1` for the v1 compare-and-swap protocol.
 */
export interface DesignerRevisionEnvelope {
  protocol: typeof DESIGNER_PROTOCOL_NAME
  protocolVersion: DesignerProtocolVersion
  documentId: DesignerId
  baseRevision: number
  revision: number
  operationId: DesignerId
  actorId: DesignerId
  issuedAt: string
  commands: readonly DesignerEditCommand[]
}

export interface CreateDesignerRevisionEnvelopeInput {
  documentId: DesignerId
  baseRevision: number
  operationId: DesignerId
  actorId: DesignerId
  issuedAt: string
  commands: readonly DesignerEditCommand[]
  revision?: number
}

export type DesignerMigrationDiagnosticSeverity = 'info' | 'warning' | 'error'

export type DesignerMigrationDiagnosticCode =
  | 'invalid-envelope'
  | 'missing-field'
  | 'invalid-field'
  | 'unsupported-protocol'
  | 'unsupported-version'
  | 'no-migrator'
  | 'invalid-command'

export interface DesignerMigrationDiagnostic {
  severity: DesignerMigrationDiagnosticSeverity
  code: DesignerMigrationDiagnosticCode
  path: string
  message: string
  sourceVersion: number | null
  targetVersion: DesignerProtocolVersion
}

export interface DesignerMigrationSuccess<T> {
  ok: true
  protocol: typeof DESIGNER_PROTOCOL_NAME
  sourceVersion: number
  targetVersion: DesignerProtocolVersion
  value: T
  diagnostics: readonly DesignerMigrationDiagnostic[]
}

export interface DesignerMigrationFailure {
  ok: false
  protocol?: string
  sourceVersion: number | null
  targetVersion: DesignerProtocolVersion
  diagnostics: readonly DesignerMigrationDiagnostic[]
}

export type DesignerMigrationResult<T> = DesignerMigrationSuccess<T> | DesignerMigrationFailure

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value))
}

function isJsonPointer(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || (value.startsWith('/') && !/~(?![01])/.test(value)))
}

function isJsonValueInternal(value: unknown, ancestors: WeakSet<object>): value is DesignerJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (!Array.isArray(value) && !isRecord(value)) return false
  if (ancestors.has(value)) return false

  ancestors.add(value)
  const valid = Array.isArray(value)
    ? value.every(item => isJsonValueInternal(item, ancestors))
    : Object.values(value).every(item => isJsonValueInternal(item, ancestors))
  ancestors.delete(value)
  return valid
}

export function isDesignerJsonValue(value: unknown): value is DesignerJsonValue {
  return isJsonValueInternal(value, new WeakSet<object>())
}

function isDesignerJsonObject(value: unknown): value is DesignerJsonObject {
  return isRecord(value) && isJsonValueInternal(value, new WeakSet<object>())
}

function isDesignerId(value: unknown): value is DesignerId {
  return isNonEmptyString(value)
}

function isNullableDesignerId(value: unknown): value is DesignerId | null {
  return value === null || isDesignerId(value)
}

function isCommandBase<K extends DesignerCommandKind>(value: unknown, kind: K): value is DesignerCommandBase<K> {
  return isRecord(value)
    && value.kind === kind
    && isDesignerId(value.commandId)
    && isDesignerId(value.actorId)
    && isIsoTimestamp(value.issuedAt)
    && (value.origin === undefined || ['canvas', 'inspector', 'library', 'import', 'migration', 'system'].includes(String(value.origin)))
    && (value.label === undefined || typeof value.label === 'string')
    && (value.metadata === undefined || isDesignerJsonObject(value.metadata))
}

function isDesignerNodeSnapshot(value: unknown): value is DesignerNodeSnapshot {
  return isRecord(value)
    && isDesignerId(value.id)
    && isNonEmptyString(value.type)
    && isNullableDesignerId(value.parentId)
    && isDesignerJsonObject(value.data)
}

function isDesignerPropertyChange(value: unknown): value is DesignerPropertyChange {
  if (!isRecord(value) || !isJsonPointer(value.path) || !isJsonValueOptional(value.previous)) return false
  if (value.operation === 'set') return isDesignerJsonValue(value.next)
  return value.operation === 'remove' && value.next === undefined
}

function isJsonValueOptional(value: unknown): value is DesignerJsonValue | undefined {
  return value === undefined || isDesignerJsonValue(value)
}

function isPropertyChangeList(value: unknown): value is readonly DesignerPropertyChange[] {
  return Array.isArray(value) && value.length > 0 && value.every(isDesignerPropertyChange)
}

function isUniqueIdList(value: unknown): value is readonly DesignerId[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isDesignerId)) return false
  return new Set(value).size === value.length
}

function isAtomicCommand(value: unknown): value is DesignerAtomicCommand {
  if (!isRecord(value) || typeof value.kind !== 'string') return false

  switch (value.kind) {
    case 'node.create':
      return isCommandBase(value, 'node.create')
        && isNullableDesignerId(value.parentId)
        && isNonNegativeInteger(value.index)
        && isDesignerNodeSnapshot(value.node)
    case 'node.delete':
      return isCommandBase(value, 'node.delete')
        && isUniqueIdList(value.nodeIds)
        && (value.snapshots === undefined || (Array.isArray(value.snapshots) && value.snapshots.length === value.nodeIds.length && value.snapshots.every(isDesignerNodeSnapshot)))
    case 'node.update':
      return isCommandBase(value, 'node.update')
        && isDesignerId(value.nodeId)
        && isPropertyChangeList(value.changes)
    case 'node.reparent':
      return isCommandBase(value, 'node.reparent')
        && isDesignerId(value.nodeId)
        && isNullableDesignerId(value.fromParentId)
        && isNonNegativeInteger(value.fromIndex)
        && isNullableDesignerId(value.toParentId)
        && isNonNegativeInteger(value.toIndex)
    case 'page.update':
      return isCommandBase(value, 'page.update')
        && isDesignerId(value.pageId)
        && isPropertyChangeList(value.changes)
    case 'style.update':
      return isCommandBase(value, 'style.update')
        && isDesignerId(value.styleId)
        && isPropertyChangeList(value.changes)
    default:
      return false
  }
}

function isTransactionCommand(value: unknown): value is DesignerTransactionCommand {
  return isRecord(value)
    && isCommandBase(value, 'transaction')
    && Array.isArray(value.commands)
    && value.commands.length > 0
    && value.commands.every(isAtomicCommand)
}
export function isDesignerEditCommand(value: unknown): value is DesignerEditCommand {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'transaction') {
    return isCommandBase(value, 'transaction')
      && Array.isArray(value.commands)
      && value.commands.length > 0
      && value.commands.every(isAtomicCommand)
  }
  return isAtomicCommand(value)
}

function hasUniqueCommandIds(commands: readonly DesignerEditCommand[]): boolean {
  const ids = commands.flatMap(command => command.kind === 'transaction'
    ? [command.commandId, ...command.commands.map(child => child.commandId)]
    : [command.commandId])
  return new Set(ids).size === ids.length
}

function areCommandsFromActor(commands: readonly DesignerEditCommand[], actorId: string): boolean {
  return commands.every(command => {
    if (command.actorId !== actorId) return false
    return command.kind !== 'transaction' || command.commands.every(child => child.actorId === actorId)
  })
}

function isRevisionEnvelopeShape(value: unknown): value is DesignerRevisionEnvelope {
  if (!isRecord(value)) return false
  if (value.protocol !== DESIGNER_PROTOCOL_NAME || value.protocolVersion !== DESIGNER_PROTOCOL_VERSION) return false
  if (!isDesignerId(value.documentId) || !isNonNegativeInteger(value.baseRevision) || !isNonNegativeInteger(value.revision)) return false
  if (value.revision !== value.baseRevision + 1) return false
  if (!isDesignerId(value.operationId) || !isDesignerId(value.actorId) || !isIsoTimestamp(value.issuedAt)) return false
  if (!Array.isArray(value.commands) || value.commands.length === 0 || !value.commands.every(isDesignerEditCommand)) return false
  return hasUniqueCommandIds(value.commands) && areCommandsFromActor(value.commands, value.actorId)
}

export function isDesignerRevisionEnvelope(value: unknown): value is DesignerRevisionEnvelope {
  return isRevisionEnvelopeShape(value)
}

export function createDesignerRevisionEnvelope(input: CreateDesignerRevisionEnvelopeInput): DesignerRevisionEnvelope {
  const envelope: DesignerRevisionEnvelope = {
    protocol: DESIGNER_PROTOCOL_NAME,
    protocolVersion: DESIGNER_PROTOCOL_VERSION,
    documentId: input.documentId,
    baseRevision: input.baseRevision,
    revision: input.revision ?? input.baseRevision + 1,
    operationId: input.operationId,
    actorId: input.actorId,
    issuedAt: input.issuedAt,
    commands: input.commands,
  }
  if (!isDesignerRevisionEnvelope(envelope)) throw new Error('Invalid designer revision envelope')
  return envelope
}

function diagnostic(
  severity: DesignerMigrationDiagnosticSeverity,
  code: DesignerMigrationDiagnosticCode,
  path: string,
  message: string,
  sourceVersion: number | null,
): DesignerMigrationDiagnostic {
  return { severity, code, path, message, sourceVersion, targetVersion: DESIGNER_PROTOCOL_VERSION }
}

function readSourceVersion(value: Record<string, unknown>): number | null {
  return typeof value.protocolVersion === 'number' && Number.isInteger(value.protocolVersion)
    ? value.protocolVersion
    : null
}

function collectEnvelopeDiagnostics(value: Record<string, unknown>, sourceVersion: number | null): DesignerMigrationDiagnostic[] {
  const diagnostics: DesignerMigrationDiagnostic[] = []
  const requiredStrings: readonly (keyof DesignerRevisionEnvelope)[] = ['protocol', 'documentId', 'operationId', 'actorId', 'issuedAt']
  for (const field of requiredStrings) {
    if (value[field] === undefined) {
      diagnostics.push(diagnostic('error', 'missing-field', `/${String(field)}`, `Missing required field: ${String(field)}`, sourceVersion))
    }
  }
  if (value.protocol !== DESIGNER_PROTOCOL_NAME) {
    diagnostics.push(diagnostic('error', 'unsupported-protocol', '/protocol', 'Protocol name is not supported', sourceVersion))
  }
  if (value.protocolVersion !== DESIGNER_PROTOCOL_VERSION) {
    diagnostics.push(diagnostic('error', 'unsupported-version', '/protocolVersion', `Only protocol version ${DESIGNER_PROTOCOL_VERSION} is supported`, sourceVersion))
  }
  if (!isDesignerId(value.documentId)) diagnostics.push(diagnostic('error', 'invalid-field', '/documentId', 'documentId must be a non-empty string', sourceVersion))
  if (!isNonNegativeInteger(value.baseRevision)) diagnostics.push(diagnostic('error', 'invalid-field', '/baseRevision', 'baseRevision must be a non-negative integer', sourceVersion))
  if (!isNonNegativeInteger(value.revision) || (isNonNegativeInteger(value.baseRevision) && value.revision !== value.baseRevision + 1)) {
    diagnostics.push(diagnostic('error', 'invalid-field', '/revision', 'revision must equal baseRevision + 1', sourceVersion))
  }
  if (!isDesignerId(value.operationId)) diagnostics.push(diagnostic('error', 'invalid-field', '/operationId', 'operationId must be a non-empty string', sourceVersion))
  if (!isDesignerId(value.actorId)) diagnostics.push(diagnostic('error', 'invalid-field', '/actorId', 'actorId must be a non-empty string', sourceVersion))
  if (!isIsoTimestamp(value.issuedAt)) diagnostics.push(diagnostic('error', 'invalid-field', '/issuedAt', 'issuedAt must be an ISO-8601 UTC timestamp', sourceVersion))
  if (!Array.isArray(value.commands) || value.commands.length === 0) {
    diagnostics.push(diagnostic('error', value.commands === undefined ? 'missing-field' : 'invalid-field', '/commands', 'commands must be a non-empty array', sourceVersion))
  } else if (!value.commands.every(isDesignerEditCommand)) {
    diagnostics.push(diagnostic('error', 'invalid-field', '/commands', 'commands contains an invalid edit command', sourceVersion))
  } else {
    if (!hasUniqueCommandIds(value.commands)) diagnostics.push(diagnostic('error', 'invalid-command', '/commands', 'commandId values must be unique within an envelope', sourceVersion))
    if (isDesignerId(value.actorId) && !areCommandsFromActor(value.commands, value.actorId)) {
      diagnostics.push(diagnostic('error', 'invalid-command', '/commands', 'Every command actorId must match envelope actorId', sourceVersion))
    }
  }
  return diagnostics
}

/**
 * v1 currently has no implicit legacy conversion. It returns structured
 * diagnostics so a future explicit migrator can be added without changing the
 * transport/result shape or silently dropping fields.
 */
export function migrateDesignerRevisionEnvelope(raw: unknown): DesignerMigrationResult<DesignerRevisionEnvelope> {
  if (!isRecord(raw)) {
    return {
      ok: false,
      sourceVersion: null,
      targetVersion: DESIGNER_PROTOCOL_VERSION,
      diagnostics: [diagnostic('error', 'invalid-envelope', '', 'Revision envelope must be a JSON object', null)],
    }
  }

  const sourceVersion = readSourceVersion(raw)
  const protocol = typeof raw.protocol === 'string' ? raw.protocol : undefined
  const diagnostics = collectEnvelopeDiagnostics(raw, sourceVersion)

  if (protocol !== DESIGNER_PROTOCOL_NAME) {
    return {
      ok: false,
      protocol,
      sourceVersion,
      targetVersion: DESIGNER_PROTOCOL_VERSION,
      diagnostics: diagnostics.length > 0
        ? diagnostics
        : [diagnostic('error', 'unsupported-protocol', '/protocol', 'Protocol name is not supported', sourceVersion)],
    }
  }

  if (sourceVersion === null || sourceVersion !== DESIGNER_PROTOCOL_VERSION) {
    const code: DesignerMigrationDiagnosticCode = sourceVersion !== null && sourceVersion < DESIGNER_PROTOCOL_VERSION
      ? 'no-migrator'
      : 'unsupported-version'
    return {
      ok: false,
      protocol,
      sourceVersion,
      targetVersion: DESIGNER_PROTOCOL_VERSION,
      diagnostics: [
        diagnostic('error', code, '/protocolVersion', sourceVersion === null
          ? 'protocolVersion is required; unversioned envelopes need an explicit adapter'
          : `No migrator is registered for protocol version ${sourceVersion}`,
          sourceVersion),
        ...diagnostics.filter(item => item.path !== '/protocolVersion'),
      ],
    }
  }

  if (diagnostics.length > 0) {
    return {
      ok: false,
      protocol,
      sourceVersion,
      targetVersion: DESIGNER_PROTOCOL_VERSION,
      diagnostics,
    }
  }

  return {
    ok: true,
    protocol: DESIGNER_PROTOCOL_NAME,
    sourceVersion,
    targetVersion: DESIGNER_PROTOCOL_VERSION,
    value: raw as unknown as DesignerRevisionEnvelope,
    diagnostics: [],
  }
}

