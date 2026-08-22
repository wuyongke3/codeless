import type { DesignSystem, LowCodeWidget } from '../types/lowcode'
import { getActiveDesignTheme } from './designSystem'
import { resolveWidgetConfig } from './widgetConfig'

export type InspectCodeFormat = 'html' | 'css' | 'vue' | 'json'

export interface WidgetInspectModel {
  id: string
  name: string
  type: LowCodeWidget['type']
  parentId?: string
  frame: {
    x: number
    y: number
    width: number
    height: number
    rotation: number
    zIndex: number
    locked: boolean
    hidden: boolean
  }
  content: Record<string, unknown>
  style: Record<string, unknown>
  tokenRefs: Record<string, string>
  resolvedTokens: Record<string, string | number>
  data: Record<string, unknown>
  interaction: Record<string, unknown>
  asset: {
    source: string
    kind: 'data-url' | 'local-path' | 'remote-url' | 'none'
    mimeType?: string
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(value: unknown) {
  return escapeHtml(value)
}

function safeClassName(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '')
  return `codeless-${normalized || 'widget'}`
}

function number(value: unknown, fallback = 0) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function assetInfo(source: unknown): WidgetInspectModel['asset'] {
  const value = String(source || '').trim()
  if (!value) return { source: '', kind: 'none' }
  if (value.startsWith('data:')) {
    return { source: value, kind: 'data-url', mimeType: value.slice(5, value.indexOf(';') > 0 ? value.indexOf(';') : value.indexOf(',') > 0 ? value.indexOf(',') : undefined) || undefined }
  }
  if (/^(https?:|blob:)/i.test(value)) return { source: value, kind: 'remote-url' }
  return { source: value, kind: 'local-path' }
}

export function inspectWidget(widget: LowCodeWidget, designSystem?: DesignSystem): WidgetInspectModel {
  // The normalizer used by the renderer is intentionally mutation-friendly for
  // legacy widgets. Inspect runs from a computed value, so isolate the snapshot
  // first to prevent reactive render loops in Vue.
  const snapshot = JSON.parse(JSON.stringify(widget)) as LowCodeWidget
  const safeDesignSystem = designSystem ? JSON.parse(JSON.stringify(designSystem)) as DesignSystem : undefined
  const config = resolveWidgetConfig(snapshot, safeDesignSystem)
  const theme = getActiveDesignTheme(safeDesignSystem)
  const tokenRefs = { ...(config.style.tokenRefs || {}) }
  const resolvedTokens: Record<string, string | number> = {}
  for (const [key, reference] of Object.entries(tokenRefs)) {
    const [category, token] = reference.replace(/^\$/, '').split('.')
    const bucket = category === 'color' ? theme.tokens.colors
      : category === 'type' ? theme.tokens.typography
        : category === 'space' ? theme.tokens.spacing
          : category === 'radius' ? theme.tokens.radii
            : category === 'shadow' ? theme.tokens.shadows
              : undefined
    if (bucket && token && bucket[token] !== undefined) resolvedTokens[key] = bucket[token]
  }
  return {
    id: snapshot.id,
    name: snapshot.name,
    type: snapshot.type,
    parentId: snapshot.parentId,
    frame: { ...config.layout },
    content: { ...config.content },
    style: { ...config.style, tokenRefs: undefined },
    tokenRefs,
    resolvedTokens,
    data: { ...config.data },
    interaction: { ...config.interaction },
    asset: assetInfo(config.content.src),
  }
}

function textFor(model: WidgetInspectModel) {
  const content = model.content
  return String(content.text || content.label || content.title || content.placeholder || model.name || '')
}

function tagFor(model: WidgetInspectModel) {
  if (model.type === 'button') return 'button'
  if (model.type === 'input' || model.type === 'datePicker') return 'input'
  if (model.type === 'select') return 'select'
  if (model.type === 'image') return 'img'
  if (model.type === 'link') return 'a'
  return ['heading', 'text'].includes(model.type) ? (model.type === 'heading' ? 'h2' : 'p') : 'div'
}

function cssValue(value: unknown, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value)
}

export function generateWidgetCss(model: WidgetInspectModel) {
  const className = safeClassName(model.id)
  const style = model.style
  const frame = model.frame
  const declarations = [
    'position: absolute',
    `left: ${number(frame.x)}px`,
    `top: ${number(frame.y)}px`,
    `width: ${number(frame.width)}px`,
    `height: ${number(frame.height)}px`,
    `z-index: ${number(frame.zIndex, 1)}`,
    frame.rotation ? `transform: rotate(${number(frame.rotation)}deg)` : '',
    style.color ? `color: ${cssValue(style.color)}` : '',
    style.background ? `background: ${cssValue(style.background)}` : '',
    style.accent && !style.background ? `--codeless-accent: ${cssValue(style.accent)}` : '',
    style.borderColor ? `border: ${number(style.borderWidth, 1)}px solid ${cssValue(style.borderColor)}` : '',
    style.borderRadius !== undefined ? `border-radius: ${number(style.borderRadius)}px` : '',
    style.fontSize !== undefined ? `font-size: ${number(style.fontSize)}px` : '',
    style.fontWeight !== undefined ? `font-weight: ${number(style.fontWeight)}` : '',
    style.textAlign ? `text-align: ${cssValue(style.textAlign)}` : '',
    style.opacity !== undefined ? `opacity: ${number(style.opacity, 1)}` : '',
    style.padding !== undefined ? `padding: ${number(style.padding)}px` : '',
    style.gap !== undefined ? `gap: ${number(style.gap)}px` : '',
    style.lineHeight !== undefined ? `line-height: ${number(style.lineHeight)}` : '',
    style.objectFit ? `object-fit: ${cssValue(style.objectFit)}` : '',
    style.shadow && style.shadow !== true ? `box-shadow: ${cssValue(style.shadow)}` : style.shadow === true ? 'box-shadow: var(--codeless-shadow, 0 4px 12px rgb(35 38 60 / 8%))' : '',
  ].filter(Boolean)
  return `.${className} {\n${declarations.map(item => `  ${item};`).join('\n')}\n}`
}

export function generateWidgetHtml(model: WidgetInspectModel) {
  const tag = tagFor(model)
  const className = safeClassName(model.id)
  const text = escapeHtml(textFor(model))
  const content = model.content
  const attributes = [`class="${className}"`, `data-codeless-id="${escapeHtml(model.id)}"`, `data-codeless-type="${escapeHtml(model.type)}"`]
  if (tag === 'img') {
    attributes.push(`src="${escapeHtml(content.src || '')}"`, `alt="${escapeHtml(content.alt || textFor(model))}"`)
    return `<img ${attributes.join(' ')} />`
  }
  if (tag === 'input') {
    attributes.push(`type="${model.type === 'datePicker' ? 'date' : 'text'}"`)
    if (content.placeholder) attributes.push(`placeholder="${escapeHtml(content.placeholder)}"`)
    return `<input ${attributes.join(' ')} />`
  }
  if (tag === 'a') {
    attributes.push(`href="${escapeHtml(content.href || '#')}"`)
    return `<a ${attributes.join(' ')}>${text}</a>`
  }
  return `<${tag} ${attributes.join(' ')}>${text}</${tag}>`
}

export function generateWidgetCode(widget: LowCodeWidget, format: InspectCodeFormat, designSystem?: DesignSystem) {
  const model = inspectWidget(widget, designSystem)
  if (format === 'json') return JSON.stringify(model, null, 2)
  const html = generateWidgetHtml(model)
  const css = generateWidgetCss(model)
  if (format === 'css') return css
  if (format === 'vue') return `<template>\n  ${html}\n</template>\n\n<style scoped>\n${css}\n</style>`
  return `${html}\n\n<style>\n${css}\n</style>`
}

export function generateWidgetSvg(widget: LowCodeWidget, designSystem?: DesignSystem) {
  const model = inspectWidget(widget, designSystem)
  const frame = model.frame
  const style = model.style
  const width = Math.max(1, number(frame.width, 1))
  const height = Math.max(1, number(frame.height, 1))
  const fill = escapeXml(style.background || 'transparent')
  const stroke = style.borderColor ? escapeXml(style.borderColor) : 'none'
  const strokeWidth = number(style.borderWidth, 1)
  const radius = number(style.borderRadius, 0)
  const text = escapeXml(textFor(model))
  const textColor = escapeXml(style.color || '#272b40')
  const fontSize = number(style.fontSize, model.type === 'heading' ? 24 : 14)
  const imageSource = typeof model.content.src === 'string' && model.content.src.startsWith('data:image/') ? model.content.src : ''
  const body = imageSource
    ? `<image href="${escapeXml(imageSource)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />\n  <text x="${Math.max(8, number(style.padding, 8))}" y="${Math.max(fontSize, height / 2 + fontSize / 3)}" fill="${textColor}" font-size="${fontSize}" font-family="Arial, sans-serif">${text}</text>`
  const transform = frame.rotation ? ` transform="rotate(${number(frame.rotation)} ${width / 2} ${height / 2})"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${transform}>\n  ${body}\n</svg>\n`
}

export function downloadLocalText(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') return false
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}
