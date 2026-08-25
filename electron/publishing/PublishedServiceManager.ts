import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import os from 'node:os'
import type { LowCodeProject, LowCodeWidget, PublishedServiceInfo, QueryResult, TableMeta, WidgetDataBinding } from '../../src/types/lowcode'
import type { DatabaseClient } from '../database/client'

interface RunningService {
  info: PublishedServiceInfo
  server: Server
  project: LowCodeProject
  tables: TableMeta[]
}

const containerTypes = new Set(['modal', 'loading', 'card', 'frame', 'stack', 'grid', 'drawer'])

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function json(res: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

function htmlEscape(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function numeric(value: unknown, fallback: number) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function widgetConfig(widget: LowCodeWidget): any {
  return widget.config || {
    layout: { x: widget.x, y: widget.y, width: widget.w, height: widget.h },
    content: widget.props || {},
    style: {},
    data: { source: 'static' },
  }
}

function getBoundFields(binding: WidgetDataBinding) {
  return [...new Set([
    binding.field,
    binding.labelField,
    binding.valueField,
    ...Object.values(binding.fields || {}),
    binding.aggregate?.field,
  ].filter(Boolean) as string[])]
}

function lanAddresses(port: number) {
  const addresses: string[] = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(`http://${entry.address}:${port}`)
    }
  }
  return [...new Set(addresses)]
}

function bindingForProject(project: LowCodeProject, widgetId: string, table: string) {
  const widget = project.layout.widgets.find(item => item.id === widgetId)
  if (!widget) return undefined
  const binding = widgetConfig(widget).data as WidgetDataBinding | undefined
  if (binding?.source !== 'table' || binding.table !== table) return undefined
  return binding
}

function containerContentStyle(widget: LowCodeWidget, config: any) {
  const style = config.style || {}
  const content = config.content || {}
  const padding = Math.max(0, numeric(style.padding, 0))
  if (widget.type === 'modal') {
    const top = 12 + 28 + (content.description ? 18 : 0)
    return `top:${top}px;right:12px;bottom:54px;left:12px;`
  }
  if (widget.type === 'loading') return 'inset:0;'
  if (widget.type === 'drawer') {
    return `top:${padding + (content.description ? 58 : 38)}px;right:${padding}px;bottom:${padding}px;left:${padding}px;`
  }
  const header = content.title || content.description ? (content.description ? 48 : 28) : 0
  return `top:${padding + header}px;right:${padding}px;bottom:${padding}px;left:${padding}px;`
}

function widgetFrameStyle(widget: LowCodeWidget, config: any) {
  const layout = config.layout || {}
  const style = config.style || {}
  const width = Math.max(1, numeric(layout.width ?? widget.w, 160))
  const height = Math.max(1, numeric(layout.height ?? widget.h, 48))
  const color = style.color || '#303133'
  const background = style.background || (widget.type === 'button' ? style.accent || '#665cf6' : '#ffffff')
  const borderWidth = Math.max(0, numeric(style.borderWidth, 1))
  const borderColor = style.borderColor || '#ebeef5'
  const fontSize = Math.max(1, numeric(style.fontSize, widget.type === 'heading' ? 24 : 14))
  const fontWeight = Math.max(100, numeric(style.fontWeight, widget.type === 'heading' ? 700 : 400))
  const rotation = numeric(layout.rotation, 0)
  const zIndex = numeric(layout.zIndex, 1)
  return [
    `left:${numeric(layout.x, 0)}px`,
    `top:${numeric(layout.y, 0)}px`,
    `width:${width}px`,
    `height:${height}px`,
    `z-index:${zIndex}`,
    `color:${htmlEscape(color)}`,
    `background:${htmlEscape(background)}`,
    `border:${borderWidth}px solid ${htmlEscape(borderColor)}`,
    `border-radius:${Math.max(0, numeric(style.borderRadius, 8))}px`,
    `opacity:${Math.max(0, Math.min(1, numeric(style.opacity, 1)))}`,
    `font-size:${fontSize}px`,
    `font-weight:${fontWeight}`,
    `text-align:${htmlEscape(style.textAlign || 'left')}`,
    rotation ? `transform:rotate(${rotation}deg)` : '',
  ].filter(Boolean).join(';')
}

function staticWidgetContent(widget: LowCodeWidget, config: any, childrenMarkup: string) {
  const content = config.content || {}
  const text = content.text || content.title || content.label || content.value || widget.name
  const label = `<div class="widget-label">${htmlEscape(text)}</div>`
  const children = childrenMarkup
    ? `<div class="widget-children" style="${containerContentStyle(widget, config)}">${childrenMarkup}</div>`
    : ''

  if (containerTypes.has(widget.type)) {
    const description = content.description ? `<p class="widget-description">${htmlEscape(content.description)}</p>` : ''
    return `${label}${description}${children}`
  }
  if (widget.type === 'image') {
    const src = content.src ? `<img src="${htmlEscape(content.src)}" alt="${htmlEscape(content.alt || text)}" style="object-fit:${htmlEscape(content.imageFit || config.style?.objectFit || 'cover')}">` : ''
    return src || `${label}<div class="widget-value">${htmlEscape(content.description || '')}</div>`
  }
  if (widget.type === 'input' || widget.type === 'datePicker') {
    return `${label}<input class="widget-control" disabled value="${htmlEscape(content.value || '')}" placeholder="${htmlEscape(content.placeholder || '')}">`
  }
  if (widget.type === 'select') {
    return `${label}<select class="widget-control" data-value disabled><option>${htmlEscape(content.placeholder || '请选择')}</option></select>`
  }
  if (widget.type === 'progress') {
    return `${label}<div class="widget-progress"><i style="width:${Math.max(0, Math.min(100, numeric(content.percentage, 0)))}%"></i></div>`
  }
  if (widget.type === 'divider') return '<div class="widget-divider"></div>'
  return `${label}<div class="widget-value" data-value></div>`
}

function buildRuntimeHtml(project: LowCodeProject, token: string) {
  const canvas = project.layout.canvas
  const childrenByParent = new Map<string, LowCodeWidget[]>()
  project.layout.widgets.forEach(widget => {
    if (!widget.parentId) return
    const children = childrenByParent.get(widget.parentId) || []
    children.push(widget)
    childrenByParent.set(widget.parentId, children)
  })
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => numeric(widgetConfig(left).layout?.zIndex, 0) - numeric(widgetConfig(right).layout?.zIndex, 0))
  }

  const renderWidget = (widget: LowCodeWidget, ancestors = new Set<string>()): string => {
    const config = widgetConfig(widget)
    if (config.layout?.hidden || ancestors.has(widget.id)) return ''
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(widget.id)
    const childrenMarkup = containerTypes.has(widget.type)
      ? (childrenByParent.get(widget.id) || []).map(child => renderWidget(child, nextAncestors)).join('')
      : ''
    const data = config.data || { source: 'static' }
    const dataBinding = data.source === 'table' ? ` data-binding='${htmlEscape(safeJson(data))}'` : ''
    return `<article class="widget widget-${htmlEscape(widget.type)}" data-widget-id="${htmlEscape(widget.id)}"${dataBinding} style="${widgetFrameStyle(widget, config)}">${staticWidgetContent(widget, config, childrenMarkup)}</article>`
  }

  const widgetMarkup = project.layout.widgets.filter(widget => !widget.parentId).map(widget => renderWidget(widget)).join('')
  const canvasWidth = Math.max(320, numeric(canvas.width, 1200))
  const canvasHeight = Math.max(240, numeric(canvas.height, 760))
  const fontFamily = project.designSystem?.typography?.fontFamily || '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(project.name)}</title><style>
:root{font-family:${htmlEscape(fontFamily)};color:#303133;background:#f5f7fa}*{box-sizing:border-box}body{margin:0;min-width:100%;min-height:100vh;background:#f5f7fa}.published-shell{min-height:100vh;padding:28px;overflow:auto}.published-header{max-width:${canvasWidth}px;margin:0 auto 16px;display:flex;align-items:center;justify-content:space-between;gap:16px}.published-header h1{margin:0;font-size:22px}.published-header small{color:#909399}.published-canvas{position:relative;margin:0 auto;width:${canvasWidth}px;min-height:${canvasHeight}px;background:${htmlEscape(canvas.background || '#fff')};overflow:hidden;box-shadow:0 8px 32px #1f2d3d12}.widget{position:absolute;overflow:hidden;padding:12px}.widget-label{font:inherit;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.widget-description{margin:5px 0 0;color:#909399;font-size:.78em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.widget-value{margin-top:8px;color:inherit;line-height:1.55;white-space:pre-wrap;overflow:hidden;text-overflow:ellipsis}.widget-control{display:block;width:100%;margin-top:8px;min-height:30px;padding:4px 8px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;color:#606266}.widget-table .widget-value{white-space:normal}.widget-table table{width:100%;border-collapse:collapse;font-size:.85em}.widget-table th,.widget-table td{padding:5px 6px;border-bottom:1px solid #ebeef5;text-align:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.widget-table th{background:#f5f7fa}.widget-button{color:#fff}.widget-button .widget-value{display:none}.widget-children{position:absolute;overflow:hidden;min-width:0;min-height:0}.widget-children>.widget{position:absolute}.widget-image{padding:0}.widget-image img{display:block;width:100%;height:100%}.widget-progress{height:8px;margin-top:10px;overflow:hidden;border-radius:999px;background:#ebeef5}.widget-progress i{display:block;height:100%;background:#409eff}.widget-divider{height:1px;margin-top:12px;background:#dcdfe6}.error{color:#f56c6c}.loading{color:#909399}@media(max-width:${canvasWidth + 56}px){.published-shell{padding:0}.published-header{padding:14px 16px;margin-bottom:0}.published-canvas{margin:0;transform-origin:top left;box-shadow:none}}
</style></head><body><main class="published-shell"><header class="published-header"><h1>${htmlEscape(project.name)}</h1><small>局域网发布 · 数据实时读取</small></header><section class="published-canvas">${widgetMarkup}</section></main><script>window.__CODELESS_TOKEN__=${safeJson(token)};(()=>{const token=window.__CODELESS_TOKEN__;const valueText=v=>v===null||v===undefined||v===''?'—':String(v);const fields=b=>[...new Set([b.field,b.labelField,b.valueField,...Object.values(b.fields||{}),b.aggregate&&b.aggregate.field].filter(Boolean))];const clear=el=>{while(el.firstChild)el.removeChild(el.firstChild)};const setTable=(target,rows,columns)=>{clear(target);if(!rows.length){target.textContent='暂无数据';return}const table=document.createElement('table'),head=document.createElement('thead'),headRow=document.createElement('tr'),body=document.createElement('tbody');columns.forEach(column=>{const cell=document.createElement('th');cell.textContent=column;headRow.appendChild(cell)});head.appendChild(headRow);rows.forEach(row=>{const tr=document.createElement('tr');columns.forEach(column=>{const cell=document.createElement('td');cell.textContent=valueText(row[column]);tr.appendChild(cell)});body.appendChild(tr)});table.append(head,body);target.appendChild(table)};const setSelect=(target,rows,labelField,valueField)=>{clear(target);if(!rows.length){const option=document.createElement('option');option.textContent='暂无数据';target.appendChild(option);return}rows.forEach(row=>{const option=document.createElement('option');option.value=valueText(row[valueField]);option.textContent=valueText(row[labelField]);target.appendChild(option)})};async function load(el){const raw=el.dataset.binding;if(!raw)return;let binding;try{binding=JSON.parse(raw)}catch{return}if(binding.source!=='table'||!binding.table)return;const target=el.querySelector('[data-value]');if(!target)return;target.classList.add('loading');try{const qs=new URLSearchParams({token:token,widgetId:el.dataset.widgetId||''});const response=await fetch('/api/data/'+encodeURIComponent(binding.table)+'?'+qs);if(!response.ok)throw new Error('数据加载失败');const result=await response.json(),rows=result.rows||[],selected=fields(binding);if(binding.mode==='count'){target.textContent=String(result.total??rows.length)}else if(binding.mode==='aggregate'){target.textContent=valueText(rows[0]&&(rows[0].value??rows[0].count))}else if(el.classList.contains('widget-table')){setTable(target,rows,selected.length?selected:result.columns||[])}else if(el.classList.contains('widget-select')){setSelect(target,rows,binding.labelField||binding.field||selected[0]||result.columns[0],binding.valueField||binding.field||selected[0]||result.columns[0])}else{const field=binding.field||binding.labelField||selected[0]||result.columns[0];const text=rows.map(row=>valueText(row[field])).join('、')||'暂无数据';if(target instanceof HTMLInputElement)target.value=text;else target.textContent=text}}catch(error){target.textContent=error instanceof Error?error.message:'数据加载失败';target.classList.add('error')}finally{target.classList.remove('loading')}}document.querySelectorAll('[data-binding]').forEach(load)})();</script></body></html>`
}

export class PublishedServiceManager {
  private services = new Map<string, RunningService>()
  private readonly database: DatabaseClient

  constructor(database: DatabaseClient) {
    this.database = database
  }

  async publish(projectInput: LowCodeProject): Promise<PublishedServiceInfo> {
    const project = clone(projectInput)
    await this.stop(project.id)
    const tables = await this.database.request<TableMeta[]>('listTables')
    const token = randomBytes(24).toString('hex')
    const server = createServer((req, res) => {
      void this.handleRequest(req, res, project, tables, token).catch(error => {
        console.error('Published service request failed', error)
        if (!res.headersSent) json(res, 500, { error: 'Internal server error' })
        else res.end()
      })
    })
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { server.off('listening', onListening); reject(error) }
      const onListening = () => { server.off('error', onError); resolve() }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(0, '0.0.0.0')
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      await this.closeServer(server)
      throw new Error('Failed to determine published service port')
    }
    const port = address.port
    const info: PublishedServiceInfo = {
      projectId: project.id,
      projectName: project.name,
      status: 'running',
      port,
      host: '0.0.0.0',
      localUrl: `http://127.0.0.1:${port}`,
      lanUrls: lanAddresses(port),
      token,
      publishedAt: new Date().toISOString(),
    }
    this.services.set(project.id, { info, server, project, tables })
    return clone(info)
  }

  list() {
    return [...this.services.values()].map(item => clone(item.info))
  }

  async stop(projectId: string) {
    const current = this.services.get(projectId)
    if (!current) return false
    this.services.delete(projectId)
    await this.closeServer(current.server)
    return true
  }

  async stopAll() {
    const current = [...this.services.values()]
    this.services.clear()
    await Promise.all(current.map(item => this.closeServer(item.server)))
  }

  private async closeServer(server: Server) {
    if (!server.listening) return
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  private authorized(req: IncomingMessage, token: string) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    return req.headers.authorization === `Bearer ${token}` || url.searchParams.get('token') === token
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse, project: LowCodeProject, tables: TableMeta[], token: string) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' })
      res.end()
      return
    }
    if (url.pathname === '/api/health') {
      json(res, 200, { ok: true, projectId: project.id, publishedAt: new Date().toISOString() })
      return
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(buildRuntimeHtml(project, token))
      return
    }
    if (!this.authorized(req, token)) {
      json(res, 401, { error: 'Unauthorized' })
      return
    }
    if (url.pathname === '/api/meta') {
      json(res, 200, { project: { id: project.id, name: project.name }, tables })
      return
    }
    const match = url.pathname.match(/^\/api\/data\/([^/]+)$/)
    if (match && req.method === 'GET') {
      const table = decodeURIComponent(match[1])
      const meta = tables.find(item => item.name === table)
      if (!meta) {
        json(res, 404, { error: 'Unknown table' })
        return
      }
      const widgetId = url.searchParams.get('widgetId')?.trim()
      if (!widgetId) {
        json(res, 400, { error: 'widgetId is required' })
        return
      }
      const binding = bindingForProject(project, widgetId, table)
      if (!binding) {
        json(res, 404, { error: 'Unknown widget data binding' })
        return
      }
      const allowedFields = new Set(meta.fields.map(field => field.name))
      const columns = getBoundFields(binding).filter(field => allowedFields.has(field))
      if (!columns.length && !['count', 'aggregate'].includes(binding.mode || 'list')) {
        json(res, 422, { error: 'Published widget has no valid bound fields' })
        return
      }
      const result = await this.database.request<QueryResult>('queryRows', table, {
        columns,
        where: binding.where,
        orderBy: binding.orderBy,
        limit: Math.min(200, Math.max(1, numeric(binding.limit, 20))),
        offset: Math.max(0, numeric(binding.offset, 0)),
        mode: binding.mode,
        aggregate: binding.aggregate,
      })
      json(res, 200, result)
      return
    }
    json(res, 404, { error: 'Not found' })
  }
}