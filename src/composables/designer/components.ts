import type {
  ComponentConflict,
  ComponentDefinition,
  ComponentOverride,
  LowCodeProject,
  LowCodeWidget,
  WidgetConfig,
} from '../../types/lowcode'
import { clone, makeId } from '../utils'
import { getWidgetConfig, normalizeWidget, syncLegacyProps } from '../widgetConfig'

const componentConfigKeys = ['content', 'style', 'data', 'validation', 'interaction', 'submitTo', 'variant', 'variants'] as const
const localLayoutKeys = ['x', 'y', 'width', 'height', 'rotation', 'zIndex'] as const

type ComponentUpdateMode = 'preserve-overrides' | 'reset-overrides'

function now() {
  return new Date().toISOString()
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== typeof right || !left || !right) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => deepEqual(value, right[index]))
  }
  if (typeof left === 'object') {
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])
    return [...keys].every(key => deepEqual(leftRecord[key], rightRecord[key]))
  }
  return false
}

function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, source)
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  const last = keys.pop()
  if (!last) return
  let cursor = target
  for (const key of keys) {
    const next = cursor[key]
    if (!next || typeof next !== 'object' || Array.isArray(next)) cursor[key] = {}
    cursor = cursor[key] as Record<string, unknown>
  }
  if (value === undefined) delete cursor[last]
  else cursor[last] = clone(value)
}

function collectDifferences(base: unknown, actual: unknown, path: string, output: ComponentOverride[]) {
  if (deepEqual(base, actual)) return
  if (
    Array.isArray(base)
    || Array.isArray(actual)
    || !base
    || !actual
    || typeof base !== 'object'
    || typeof actual !== 'object'
  ) {
    output.push({ path, value: clone(actual) })
    return
  }
  const baseRecord = base as Record<string, unknown>
  const actualRecord = actual as Record<string, unknown>
  const keys = new Set([...Object.keys(baseRecord), ...Object.keys(actualRecord)])
  for (const key of keys) collectDifferences(baseRecord[key], actualRecord[key], `${path}.${key}`, output)
}

function collectOverrides(template: WidgetConfig, instance: WidgetConfig): ComponentOverride[] {
  const overrides: ComponentOverride[] = []
  for (const key of componentConfigKeys) {
    collectDifferences(template[key], instance[key], key, overrides)
  }
  collectDifferences(template.layout.hidden, instance.layout.hidden, 'layout.hidden', overrides)
  return overrides
}

function templateConfig(widget: LowCodeWidget): WidgetConfig {
  const config = clone(getWidgetConfig(widget))
  delete config.component
  for (const key of localLayoutKeys) config.layout[key] = key === 'width' || key === 'height' ? config.layout[key] : 0
  config.layout.locked = false
  config.layout.hidden = false
  return config
}

function definitionFromWidget(widget: LowCodeWidget, name = widget.name): ComponentDefinition {
  const createdAt = now()
  const variants = getWidgetConfig(widget).variants
  return {
    id: makeId('component'),
    name: name.trim() || widget.name || '未命名组件',
    type: widget.type,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    template: { name: widget.name, config: templateConfig(widget) },
    ...(variants ? { variantProperties: { variant: Object.keys(variants) } } : {}),
  }
}

function allProjectWidgets(project: LowCodeProject) {
  const layouts = new Set([project.layout, ...(project.pages || []).map(page => page.layout)])
  return [...layouts].flatMap(layout => layout.widgets || [])
}

export function getComponentDefinition(project: LowCodeProject | undefined, definitionId: string | undefined) {
  return project?.componentDefinitions?.find(definition => definition.id === definitionId)
}

export function getComponentLink(widget: LowCodeWidget | undefined) {
  return widget?.config?.component
}

export function componentInstanceCount(project: LowCodeProject | undefined, definitionId: string) {
  if (!project) return 0
  return allProjectWidgets(project).filter(widget => widget.config?.component?.role === 'instance' && widget.config.component.definitionId === definitionId).length
}

export function createComponentDefinition(project: LowCodeProject, widget: LowCodeWidget, name?: string) {
  const existingLink = getComponentLink(widget)
  if (existingLink?.role === 'definition') return getComponentDefinition(project, existingLink.definitionId)
  const definition = definitionFromWidget(widget, name)
  project.componentDefinitions ||= []
  project.componentDefinitions.push(definition)
  const config = getWidgetConfig(widget)
  config.component = {
    role: 'definition',
    definitionId: definition.id,
    sourceVersion: definition.version,
  }
  syncLegacyProps(widget)
  return definition
}

function conflictsForUpdate(previous: WidgetConfig, next: WidgetConfig, overrides: ComponentOverride[]) {
  const conflicts: ComponentConflict[] = []
  for (const override of overrides) {
    const previousValue = getPath(previous, override.path)
    const nextValue = getPath(next, override.path)
    if (!deepEqual(previousValue, nextValue)) {
      conflicts.push({ path: override.path, message: `主组件也更新了 ${override.path}；已保留实例覆盖。` })
    }
  }
  return conflicts
}

function applyDefinitionToInstance(
  widget: LowCodeWidget,
  definition: ComponentDefinition,
  options: { mode?: ComponentUpdateMode; previousTemplate?: WidgetConfig; acknowledgeConflicts?: boolean } = {},
) {
  const currentConfig = getWidgetConfig(widget)
  const oldLink = currentConfig.component
  const overrides = options.mode === 'reset-overrides'
    ? []
    : collectOverrides(options.previousTemplate || definition.template.config, currentConfig)
  const conflicts = options.previousTemplate
    ? conflictsForUpdate(options.previousTemplate, definition.template.config, overrides)
    : oldLink?.conflicts || []
  const localLayout = Object.fromEntries(localLayoutKeys.map(key => [key, currentConfig.layout[key]]))
  const nextConfig = clone(definition.template.config)
  nextConfig.layout = { ...nextConfig.layout, ...localLayout }
  for (const override of overrides) setPath(nextConfig as unknown as Record<string, unknown>, override.path, override.value)
  nextConfig.component = {
    role: 'instance',
    definitionId: definition.id,
    sourceVersion: definition.version,
    ...(overrides.length ? { overrides } : {}),
    ...(!options.acknowledgeConflicts && conflicts.length ? { conflicts } : {}),
  }
  widget.type = definition.type
  widget.name = definition.name
  widget.config = nextConfig
  syncLegacyProps(widget)
  normalizeWidget(widget)
  return { overrides, conflicts }
}

/** Publishes an edited master to its definition and propagates non-conflicting changes. */
export function publishComponentDefinition(project: LowCodeProject, master: LowCodeWidget) {
  const link = getComponentLink(master)
  if (link?.role !== 'definition') return { updated: false, instances: 0, conflicts: 0 }
  const definition = getComponentDefinition(project, link.definitionId)
  if (!definition) return { updated: false, instances: 0, conflicts: 0 }
  const nextTemplate = templateConfig(master)
  const templateChanged = !deepEqual(definition.template.config, nextTemplate) || definition.name !== master.name || definition.type !== master.type
  if (!templateChanged) return { updated: false, instances: 0, conflicts: 0 }
  const previousTemplate = clone(definition.template.config)
  definition.name = master.name
  definition.type = master.type
  definition.template = { name: master.name, config: nextTemplate }
  definition.version += 1
  definition.updatedAt = now()
  getWidgetConfig(master).component = { role: 'definition', definitionId: definition.id, sourceVersion: definition.version }
  let instances = 0
  let conflicts = 0
  for (const widget of allProjectWidgets(project)) {
    if (widget.id === master.id || widget.config?.component?.role !== 'instance' || widget.config.component.definitionId !== definition.id) continue
    const result = applyDefinitionToInstance(widget, definition, { previousTemplate })
    instances += 1
    conflicts += result.conflicts.length
  }
  return { updated: true, instances, conflicts }
}

export function createComponentInstance(project: LowCodeProject, source: LowCodeWidget) {
  const link = getComponentLink(source)
  const definition = link ? getComponentDefinition(project, link.definitionId) : undefined
  if (!definition) return undefined
  const instance = clone(source)
  instance.id = makeId('widget')
  instance.name = definition.name
  instance.config = clone(definition.template.config)
  const sourceLayout = getWidgetConfig(source).layout
  instance.config.layout = {
    ...instance.config.layout,
    x: Math.min(project.layout.canvas.width - sourceLayout.width, sourceLayout.x + 32),
    y: Math.min(project.layout.canvas.height - sourceLayout.height, sourceLayout.y + 32),
    width: sourceLayout.width,
    height: sourceLayout.height,
    rotation: sourceLayout.rotation,
    zIndex: Math.max(...project.layout.widgets.map(widget => getWidgetConfig(widget).layout.zIndex), 0) + 1,
  }
  instance.config.component = { role: 'instance', definitionId: definition.id, sourceVersion: definition.version }
  syncLegacyProps(instance)
  normalizeWidget(instance)
  project.layout.widgets.push(instance)
  return instance
}

export function recordComponentInstanceOverrides(project: LowCodeProject, widget: LowCodeWidget) {
  const link = getComponentLink(widget)
  if (link?.role !== 'instance') return 0
  const definition = getComponentDefinition(project, link.definitionId)
  if (!definition) return 0
  const config = getWidgetConfig(widget)
  const overrides = collectOverrides(definition.template.config, config)
  config.component = {
    ...link,
    sourceVersion: definition.version,
    ...(overrides.length ? { overrides } : { overrides: undefined }),
  }
  return overrides.length
}

export function refreshComponentInstance(project: LowCodeProject, widget: LowCodeWidget, mode: ComponentUpdateMode = 'preserve-overrides') {
  const link = getComponentLink(widget)
  if (link?.role !== 'instance') return false
  const definition = getComponentDefinition(project, link.definitionId)
  if (!definition) return false
  applyDefinitionToInstance(widget, definition, { mode, acknowledgeConflicts: true })
  return true
}

export function detachComponentInstance(widget: LowCodeWidget) {
  const link = getComponentLink(widget)
  if (link?.role !== 'instance') return false
  const config = getWidgetConfig(widget)
  delete config.component
  syncLegacyProps(widget)
  return true
}

/** Explicit migration action for legacy WidgetConfig variants. It never mutates a
 * project during loading, so opening an older document remains side-effect free. */
export function migrateLegacyVariantsToComponent(project: LowCodeProject, widget: LowCodeWidget) {
  if (getComponentLink(widget) || !Object.keys(getWidgetConfig(widget).variants || {}).length) return undefined
  return createComponentDefinition(project, widget, `${widget.name} 组件`)
}

