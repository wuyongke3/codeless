import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import path from 'node:path'

const root = process.cwd()
const results = []
const rendererErrors = []
let win

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('no-sandbox')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function inRenderer(fn, ...args) {
  const encoded = args.map(value => JSON.stringify(value)).join(',')
  // Every callback is serialized before it runs in the renderer. Keep the
  // snapshot helper in the same lexical scope so callbacks can use it in
  // assertions without relying on the Node process global scope.
  const snapshotSource = widgetSnapshot.toString()
  return win.webContents.executeJavaScript(`(() => { const widgetSnapshot = ${snapshotSource}; return (${fn.toString()})(${encoded}) })()`, true)
}

async function waitForMenuClosed(timeout = 600) {
  await waitFor(() => inRenderer(() => !document.querySelector('.canvas-context-menu')), timeout, 20)
}

async function waitFor(predicate, timeout = 10000, interval = 50) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await predicate()) return
    await sleep(interval)
  }
  throw new Error(`等待条件超时（${timeout}ms）`)
}

async function runCase(name, fn) {
  try {
    await fn()
    results.push({ name, status: 'passed' })
    console.log(`✓ ${name}`)
  } catch (error) {
    results.push({ name, status: 'failed', error: error instanceof Error ? error.message : String(error) })
    console.error(`✗ ${name}:`, error)
  }
}

function widgetSnapshot() {
  return Array.from(document.querySelectorAll('.canvas-widget')).map(element => {
    const node = element
    const style = getComputedStyle(node)
    return {
      id: node.dataset.widgetId,
      type: node.dataset.widgetType,
      left: parseFloat(node.style.left || '0'),
      top: parseFloat(node.style.top || '0'),
      width: parseFloat(node.style.width || '0'),
      height: parseFloat(node.style.height || '0'),
      zIndex: parseInt(node.style.zIndex || '0', 10),
      selected: node.classList.contains('selected'),
      locked: node.classList.contains('locked'),
      hidden: node.classList.contains('hidden'),
      renderedWidth: node.getBoundingClientRect().width,
      renderedHeight: node.getBoundingClientRect().height,
      display: style.display,
    }
  })
}

async function clickWidget(id, shiftKey = false) {
  return inRenderer((widgetId, additive) => {
    const element = document.querySelector(`[data-widget-id="${widgetId}"]`)
    if (!element) throw new Error(`??????${widgetId}`)
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, shiftKey: additive }))
  }, id, shiftKey)
}

async function rightClickWidget(id, clientX = 260, clientY = 220) {
  return inRenderer((widgetId, x, y) => {
    const element = document.querySelector(`[data-widget-id="${widgetId}"]`)
    if (!element) throw new Error(`??????${widgetId}`)
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2, clientX: x, clientY: y }))
  }, id, clientX, clientY)
}

async function clickMenu(command) {
  return inRenderer(commandValue => {
    const button = document.querySelector(`[data-menu-command="${commandValue}"]`)
    if (!(button instanceof HTMLButtonElement)) throw new Error(`????????${commandValue}`)
    if (button.disabled) throw new Error(`????????${commandValue}`)
    button.click()
  }, command)
}

async function rightClickCanvas(clientX = 1400, clientY = 900) {
  return inRenderer((x, y) => {
    const canvas = document.querySelector('.design-canvas')
    if (!canvas) throw new Error('?????')
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2, clientX: x, clientY: y }))
  }, clientX, clientY)
}

async function clearSelection() {
  return inRenderer(() => {
    const canvas = document.querySelector('.design-canvas')
    if (!canvas) throw new Error('?????')
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: 10, clientY: 10 }))
  })
}


async function setInspectorField(widgetId, label, value) {
  await clickWidget(widgetId)
  await waitFor(() => inRenderer((fieldLabel) => {
    const section = document.querySelector('.component-config-section')
    if (!section) return false
    return Array.from(section.querySelectorAll('.property-field, .property-check')).some(node => node.textContent?.includes(fieldLabel))
  }, label), 1200, 20)
  await inRenderer((fieldLabel, fieldValue) => {
    const section = document.querySelector('.component-config-section')
    const field = Array.from(section.querySelectorAll('.property-field, .property-check')).find(node => node.textContent?.includes(fieldLabel))
    const control = field?.querySelector('input, textarea, select')
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) throw new Error(`找不到配置字段：${fieldLabel}`)
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      control.checked = Boolean(fieldValue)
      control.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    const prototype = Object.getPrototypeOf(control)
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(control, String(fieldValue))
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  }, label, value)
  await sleep(35)
}

async function widgetIdByType(type) {
  return inRenderer(widgetType => document.querySelector(`.canvas-widget[data-widget-type="${widgetType}"]`)?.dataset.widgetId, type)
}

async function openPreview() {
  await inRenderer(() => {
    const button = Array.from(document.querySelectorAll('button.ghost-button.compact')).find(node => node.textContent?.includes('预览'))
    if (!(button instanceof HTMLButtonElement)) throw new Error('找不到预览按钮')
    button.click()
  })
  await waitFor(() => inRenderer(() => Boolean(document.querySelector('.preview-modal'))))
  await sleep(120)
}

async function closePreview() {
  await inRenderer(() => {
    const button = document.querySelector('.preview-modal > header button')
    if (!(button instanceof HTMLButtonElement)) throw new Error('找不到预览关闭按钮')
    button.click()
  })
  await waitFor(() => inRenderer(() => !document.querySelector('.preview-modal')))
}
async function main() {
  win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 1000,
    backgroundColor: '#ffffff',
    webPreferences: {
      // Deliberately omit the production preload so the app uses its isolated
      // localStorage demo bootstrap and the test never touches user data.
      partition: `e2e-${Date.now()}`,
      backgroundThrottling: false,
    },
  })
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) rendererErrors.push(`${sourceId}:${line} ${message}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    rendererErrors.push(`render-process-gone:${details.reason}`)
  })

  await win.loadFile(path.join(root, 'dist', 'index.html'))
  await waitFor(() => inRenderer(() => Boolean(document.querySelector('.design-canvas')) && !document.querySelector('.boot-screen')))
  await inRenderer(() => {
    window.addEventListener('error', event => { window.__codelessE2eErrors ||= []; window.__codelessE2eErrors.push(event.message) })
    window.addEventListener('unhandledrejection', event => { window.__codelessE2eErrors ||= []; window.__codelessE2eErrors.push(String(event.reason)) })
  })
  await sleep(150)

  let initialIds = []
  let allTypes = []

  await runCase('画布加载与基础节点渲染', async () => {
    const snapshot = await inRenderer(widgetSnapshot)
    const canvas = await inRenderer(() => {
      const element = document.querySelector('.design-canvas')
      return { width: element?.clientWidth, height: element?.clientHeight, background: getComputedStyle(element).backgroundColor }
    })
    assert.equal(canvas.width, 960)
    assert.equal(canvas.height, 720)
    assert.ok(snapshot.length >= 5, `初始组件数不足：${snapshot.length}`)
    assert.ok(snapshot.every(item => item.display !== 'none' && item.width > 0 && item.height > 0), '存在不可见或零尺寸节点')
    initialIds = snapshot.slice(0, 3).map(item => item.id)
    assert.equal(new Set(snapshot.map(item => item.id)).size, snapshot.length, '组件 ID 不唯一')
  })

  await runCase('设计交换导入导出入口', async () => {
    const controls = await inRenderer(() => {
      const importButton = document.querySelector('[data-design-exchange="import"]')
      const exportButton = document.querySelector('[data-design-exchange="export"]')
      return {
        importExists: importButton instanceof HTMLButtonElement,
        exportExists: exportButton instanceof HTMLButtonElement,
        importDisabled: importButton instanceof HTMLButtonElement ? importButton.disabled : true,
        exportDisabled: exportButton instanceof HTMLButtonElement ? exportButton.disabled : true,
      }
    })
    assert.equal(controls.importExists, true, '缺少设计 JSON 导入入口')
    assert.equal(controls.exportExists, true, '缺少设计 JSON 导出入口')
    assert.equal(controls.importDisabled, false, '设计 JSON 导入入口不应被禁用')
    assert.equal(controls.exportDisabled, false, '设计 JSON 导出入口不应被禁用')

    await inRenderer(() => {
      const button = document.querySelector('[data-design-exchange="import"]')
      if (!(button instanceof HTMLButtonElement)) throw new Error('设计 JSON 导入按钮不存在')
      const originalInputClick = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function () {
        window.setTimeout(() => window.dispatchEvent(new Event('focus')), 0)
      }
      try {
        button.click()
      } finally {
        HTMLInputElement.prototype.click = originalInputClick
      }
    })
    await sleep(450)

    await inRenderer(() => {
      const button = document.querySelector('[data-design-exchange="export"]')
      if (!(button instanceof HTMLButtonElement)) throw new Error('设计 JSON 导出按钮不存在')
      button.click()
    })
    await sleep(80)
    const errors = await inRenderer(() => window.__codelessE2eErrors || [])
    assert.deepEqual(errors, [], `设计交换入口产生 renderer error：${errors.join('; ')}`)
  })
  await runCase('组件尺寸、位置、层级与缩放映射', async () => {
    const data = await inRenderer(() => {
      const canvas = document.querySelector('.design-canvas').getBoundingClientRect()
      const zoom = Number(getComputedStyle(document.querySelector('.design-canvas')).transform.match(/matrix\([^,]+/)?.[0]?.replace('matrix(', '') || '1')
      return { canvasLeft: canvas.left, canvasTop: canvas.top, zoom, widgets: widgetSnapshot() }
    })
    assert.ok(data.widgets.every(item => item.width >= 24 && item.height >= 24), '组件尺寸未满足最小尺寸约束')
    assert.ok(data.widgets.every(item => item.left >= 0 && item.top >= 0), '组件位置越界')
    assert.ok(data.widgets.every(item => item.renderedWidth > 0 && item.renderedHeight > 0), '组件没有实际渲染尺寸')
    assert.ok(data.widgets.every(item => Number.isFinite(item.zIndex)), '组件层级无效')
    assert.ok(data.zoom > 0, '画布缩放值无效')
  })

  await runCase('选择反馈与 Shift 多选', async () => {
    await clickWidget(initialIds[0])
    await sleep(30)
    let selected = await inRenderer(() => Array.from(document.querySelectorAll('.canvas-widget.selected')).map(node => node.dataset.widgetId))
    assert.deepEqual(selected, [initialIds[0]])
    await clickWidget(initialIds[1], true)
    await sleep(30)
    selected = await inRenderer(() => Array.from(document.querySelectorAll('.canvas-widget.selected')).map(node => node.dataset.widgetId))
    assert.equal(selected.length, 2)
    assert.ok(selected.includes(initialIds[0]) && selected.includes(initialIds[1]))
    await clearSelection()
    await sleep(30)
    assert.equal(await inRenderer(() => document.querySelectorAll('.canvas-widget.selected').length), 0)
  })

  await runCase('本地 Inspect、代码生成与 SVG 导出入口', async () => {
    await clickWidget(initialIds[0])
    await inRenderer(() => {
      const button = Array.from(document.querySelectorAll('.builder-actions button')).find(item => item.textContent?.includes('Inspect'))
      if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('Inspect 按钮不可用')
      button.click()
    })
    await waitFor(() => inRenderer(() => Boolean(document.querySelector('[data-testid="inspect-panel"]'))))
    const panel = await inRenderer(() => ({
      title: document.querySelector('[data-testid="inspect-panel"]')?.textContent || '',
      code: document.querySelector('.inspect-code')?.textContent || '',
      hasFormats: document.querySelectorAll('.inspect-format-tabs button').length,
    }))
    assert.ok(panel.title.includes('Inspect / Codegen'))
    assert.ok(panel.code.includes('data-codeless-id'))
    assert.equal(panel.hasFormats, 4)
    await inRenderer(() => {
      const button = document.querySelector('[data-testid="inspect-panel"] .inspect-panel-header button')
      if (!(button instanceof HTMLButtonElement)) throw new Error('Inspect 关闭按钮缺失')
      button.click()
    })
    await waitFor(() => inRenderer(() => !document.querySelector('[data-testid="inspect-panel"]')))
  })

  await runCase('画布框选', async () => {
    const rect = await inRenderer(() => document.querySelector('.design-canvas').getBoundingClientRect().toJSON())
    const startX = rect.left + 8
    const startY = rect.top + 8
      await inRenderer((x, y) => {
      const element = document.querySelector('.design-canvas')
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, isPrimary: true, pointerId: 7, clientX: x, clientY: y }))
    }, startX, startY)
    await inRenderer((x, y) => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, isPrimary: true, pointerId: 7, clientX: x, clientY: y })), rect.left + 420, rect.top + 190)
    await inRenderer((x, y) => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, buttons: 0, isPrimary: true, pointerId: 7, clientX: x, clientY: y })), rect.left + 420, rect.top + 190)
    await sleep(50)
    const selected = await inRenderer(() => document.querySelectorAll('.canvas-widget.selected').length)
    assert.ok(selected >= 1, `框选未命中组件，selected=${selected}`)
    assert.equal(await inRenderer(() => Boolean(document.querySelector('.canvas-selection-box'))), false, '框选框未清理')
    await clearSelection()
  })

  await runCase('组件面板覆盖所有组件类型', async () => {
    allTypes = await inRenderer(() => Array.from(document.querySelectorAll('.component-grid button')).map(node => node.dataset.widgetType).filter(Boolean))
    assert.ok(allTypes.length >= 20, `组件面板类型数量异常：${allTypes.length}`)
    for (const type of allTypes) {
      await inRenderer(typeValue => {
        const button = Array.from(document.querySelectorAll('.component-grid button')).find(node => node.dataset.widgetType === typeValue)
        if (!button) throw new Error(`组件面板缺少 ${typeValue}`)
        button.click()
      }, type)
    }
    await sleep(120)
    const renderedTypes = await inRenderer(() => Array.from(new Set(Array.from(document.querySelectorAll('.canvas-widget')).map(node => node.dataset.widgetType))))
    assert.ok(allTypes.every(type => renderedTypes.includes(type)), `未渲染类型：${allTypes.filter(type => !renderedTypes.includes(type)).join(',')}`)
    const ids = await inRenderer(() => Array.from(document.querySelectorAll('.canvas-widget')).map(node => node.dataset.widgetId))
    assert.equal(new Set(ids).size, ids.length, '批量添加后组件 ID 重复')
  })

  await runCase('Element Plus 组件实际渲染节点与视觉属性', async () => {
    const expected = {
      badge: '.render-badge', tag: '.render-tag', alert: '.render-alert', progress: '.render-progress',
      switch: '.render-switch', checkbox: '.render-choice input[type="checkbox"]', radio: '.render-choice input[type="radio"]',
      datePicker: '.render-field input[type="date"], .render-field input[type="datetime-local"]', pagination: '.render-pagination',
      breadcrumb: '.render-breadcrumb', tabs: '.render-tabs', collapse: '.render-collapse', modal: '.render-modal', drawer: '.render-drawer', loading: '.render-loading', avatar: '.render-avatar',
      icon: '.render-icon .app-icon', link: '.render-link', tooltip: '.render-tooltip .tooltip-trigger', spacer: '.render-spacer',
    }
    const checks = await inRenderer((expectedSelectors) => Object.entries(expectedSelectors).map(([type, selector]) => {
      const node = document.querySelector(`.canvas-widget[data-widget-type="${type}"]`)
      const rendered = type === 'tooltip'
        ? document.querySelector(`.tooltip-bubble-portal[data-tooltip-widget-id="${node?.dataset.widgetId}"]`)
        : node?.querySelector(selector)
      const rect = node?.getBoundingClientRect()
      return {
        type, exists: Boolean(node), rendered: Boolean(rendered), width: rect?.width || 0, height: rect?.height || 0,
        progressWidth: node?.querySelector('.render-progress-track i')?.style.width || '',
        switchPressed: node?.querySelector('.render-switch')?.getAttribute('aria-pressed') || '',
        checkboxCount: node?.querySelectorAll('input[type="checkbox"]').length || 0,
        radioCount: node?.querySelectorAll('input[type="radio"]').length || 0,
        paginationButtons: node?.querySelectorAll('.render-pagination button').length || 0,
        activeTabs: node?.querySelectorAll('.render-tabs-head button.active').length || 0,
        collapseExpanded: node?.querySelector('.render-collapse-head')?.getAttribute('aria-expanded') || '',
        collapsePanelDisplay: node?.querySelector('.render-collapse-panel') ? getComputedStyle(node.querySelector('.render-collapse-panel')).display : '',
        tooltipOpacity: rendered && type === 'tooltip' ? getComputedStyle(rendered).opacity : '',
      }
    }), expected)
    for (const item of checks) {
      assert.equal(item.exists, true, `缺少 ${item.type} 画布节点`)
      assert.equal(item.rendered, true, `${item.type} 内部渲染节点缺失`)
      assert.ok(item.width > 0 && item.height > 0, `${item.type} 渲染尺寸无效：${item.width}x${item.height}`)
    }
    const progress = checks.find(item => item.type === 'progress')
    assert.equal(progress?.progressWidth, '68%', '进度条默认百分比未映射到轨道宽度')
    assert.equal(checks.find(item => item.type === 'switch')?.switchPressed, 'true', '开关默认状态未渲染')
    assert.ok((checks.find(item => item.type === 'checkbox')?.checkboxCount || 0) >= 1, '复选框输入项缺失')
    assert.ok((checks.find(item => item.type === 'radio')?.radioCount || 0) >= 2, '单选框选项缺失')
    assert.ok((checks.find(item => item.type === 'pagination')?.paginationButtons || 0) >= 3, '分页按钮缺失')
    assert.equal(checks.find(item => item.type === 'tabs')?.activeTabs, 1, '标签页没有唯一激活项')
    assert.equal(checks.find(item => item.type === 'collapse')?.collapseExpanded, 'true', '折叠面板默认展开状态错误')
    assert.equal(checks.find(item => item.type === 'collapse')?.collapsePanelDisplay, 'block', '折叠面板内容未显示')
    assert.equal(checks.find(item => item.type === 'tooltip')?.tooltipOpacity, '1', '设计态 Tooltip 提示气泡未显示')
  })

  await runCase('运行态 Preview 组件交互与服务组件', async () => {
    const tagId = await widgetIdByType('tag')
    const alertId = await widgetIdByType('alert')
    const checkboxId = await widgetIdByType('checkbox')
    const modalId = await widgetIdByType('modal')
    const drawerId = await widgetIdByType('drawer')
    const loadingId = await widgetIdByType('loading')
    assert.ok(tagId && alertId && checkboxId && modalId && drawerId && loadingId, '运行态测试组件未创建')
    await setInspectorField(tagId, '可关闭', true)
    await setInspectorField(alertId, '可关闭', true)
    await setInspectorField(checkboxId, '多选项', '选项一|option-1\n选项二|option-2')
    await setInspectorField(modalId, '默认显示', true)
    await setInspectorField(drawerId, '默认显示', true)
    await setInspectorField(loadingId, '默认显示', true)

    await openPreview()
    const runtime = await inRenderer(() => ({
      count: document.querySelectorAll('.runtime-widget-node').length,
      types: Array.from(new Set(Array.from(document.querySelectorAll('.runtime-widget-node')).map(node => node.className.match(/(?:^|\s)widget-([\w-]+)/)?.[1]).filter(Boolean))),
      dateType: document.querySelector('.runtime-widget-node.widget-datePicker input')?.type,
      serviceNodes: document.querySelectorAll('.runtime-widget-node.widget-modal, .runtime-widget-node.widget-drawer, .runtime-widget-node.widget-loading').length,
    }))
    assert.ok(runtime.count >= allTypes.length, `运行态节点数量不足：${runtime.count}`)
    assert.ok(allTypes.every(type => runtime.types.includes(type)), `运行态缺少组件：${allTypes.filter(type => !runtime.types.includes(type)).join(',')}`)
    assert.equal(runtime.dateType, 'date', '日期选择器没有使用 date input')
    assert.equal(runtime.serviceNodes, 3, '运行态服务组件数量错误')

    const switchBefore = await inRenderer(() => document.querySelector('.runtime-widget-node.widget-switch .render-switch')?.getAttribute('aria-pressed'))
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-switch .render-switch')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await sleep(40)
    const switchAfter = await inRenderer(() => document.querySelector('.runtime-widget-node.widget-switch .render-switch')?.getAttribute('aria-pressed'))
    assert.equal(switchBefore, 'true')
    assert.equal(switchAfter, 'false', '运行态开关点击没有切换状态')

    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-checkbox input[type="checkbox"]')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => document.querySelector('.runtime-widget-node.widget-checkbox input[type="checkbox"]')?.checked), true, '运行态复选框点击没有选中')

    const radioInputs = await inRenderer(() => Array.from(document.querySelectorAll('.runtime-widget-node.widget-radio input[type="radio"]')).map(node => node.value))
    assert.ok(radioInputs.length >= 2, '运行态单选框选项不足')
    await inRenderer(() => document.querySelectorAll('.runtime-widget-node.widget-radio input[type="radio"]')[1]?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => Array.from(document.querySelectorAll('.runtime-widget-node.widget-radio input[type="radio"]')).filter(node => node.checked).length), 1, '运行态单选框选中数量异常')

    await inRenderer(() => Array.from(document.querySelectorAll('.runtime-widget-node.widget-pagination .render-pagination button')).find(node => node.textContent?.trim() === '2')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => document.querySelector('.runtime-widget-node.widget-pagination .render-pagination button.active')?.textContent?.trim()), '2', '运行态分页切换失败')

    await inRenderer(() => document.querySelectorAll('.runtime-widget-node.widget-tabs .render-tabs-head button')[1]?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => document.querySelectorAll('.runtime-widget-node.widget-tabs .render-tabs-head button.active')[0]?.textContent?.trim()), '详情', '运行态标签页切换失败')

    const collapseBefore = await inRenderer(() => document.querySelector('.runtime-widget-node.widget-collapse .render-collapse-head')?.getAttribute('aria-expanded'))
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-collapse .render-collapse-head')?.click())
    await sleep(40)
    const collapseAfter = await inRenderer(() => document.querySelector('.runtime-widget-node.widget-collapse .render-collapse-head')?.getAttribute('aria-expanded'))
    assert.equal(collapseBefore, 'true')
    assert.equal(collapseAfter, 'false', '运行态折叠面板没有收起')
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-collapse .render-collapse-panel')).display), 'none')

    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-tag .render-tag button')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-tag .render-tag')).display), 'none', 'Tag 关闭后仍然可见')
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-alert .render-alert button')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-alert .render-alert')).display), 'none', 'Alert 关闭后仍然可见')

    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-modal .render-modal')).display), 'flex', 'Modal 默认显示失败')
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-modal .service-close')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-modal .render-modal')).display), 'none', 'Modal 关闭按钮没有隐藏弹窗')
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-drawer .render-drawer')).display), 'block', 'Drawer 默认显示失败')
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-drawer .service-close')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-drawer .render-drawer')).display), 'none', 'Drawer 关闭按钮没有隐藏抽屉')
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-loading .render-loading')).display), 'flex', 'Loading ??????')
    assert.ok(await inRenderer(() => Boolean(document.querySelector('.runtime-widget-node.widget-loading .loading-spinner'))), 'Loading spinner ????')
    await closePreview()
  })
  await runCase('右键菜单弹出、边界翻转与动画规则', async () => {
    await rightClickWidget(initialIds[0], 1435, 995)
    await sleep(50)
    const menu = await inRenderer(() => {
      const element = document.querySelector('.canvas-context-menu')
      const rect = element?.getBoundingClientRect()
      const rules = Array.from(document.styleSheets).flatMap(sheet => {
        try { return Array.from(sheet.cssRules) } catch { return [] }
      }).map(rule => rule.cssText).join('\n')
      return { exists: Boolean(element), left: rect?.left, top: rect?.top, right: rect?.right, bottom: rect?.bottom, animated: rules.includes('.context-menu-enter-active') }
    })
    assert.equal(menu.exists, true)
    assert.ok(menu.left >= 0 && menu.top >= 0 && menu.right <= 1440 && menu.bottom <= 1000, `菜单越界：${JSON.stringify(menu)}`)
    assert.equal(menu.animated, true, '未发现菜单进入/离开动画规则')
    await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) )
    await waitForMenuClosed()
    assert.equal(await inRenderer(() => Boolean(document.querySelector('.canvas-context-menu'))), false)
  })

  await runCase('复制、粘贴、删除与唯一 ID', async () => {
    await clickWidget(initialIds[0])
    await rightClickWidget(initialIds[0], 260, 220)
    await sleep(30)
    await clickMenu('copy')
    await sleep(30)
    const before = await inRenderer(() => document.querySelectorAll('.canvas-widget').length)
    await rightClickCanvas(1200, 800)
    await sleep(30)
    assert.equal(await inRenderer(() => document.querySelector('[data-menu-command="paste"]')?.disabled), false)
    await clickMenu('paste')
    await sleep(80)
    const after = await inRenderer(() => ({ count: document.querySelectorAll('.canvas-widget').length, ids: Array.from(document.querySelectorAll('.canvas-widget')).map(node => node.dataset.widgetId), selected: document.querySelectorAll('.canvas-widget.selected').length }))
    assert.equal(after.count, before + 1)
    assert.equal(new Set(after.ids).size, after.ids.length)
    assert.equal(after.selected, 1)
    const pastedId = after.ids.find(id => !initialIds.includes(id))
    assert.ok(pastedId)
    await clickWidget(pastedId)
    await rightClickWidget(pastedId, 280, 240)
    await sleep(30)
    await clickMenu('delete')
    await sleep(70)
    assert.equal(await inRenderer(() => document.querySelectorAll('.canvas-widget').length), before)
  })

  await runCase('剪切后粘贴恢复', async () => {
    const targetId = initialIds[1]
    await clickWidget(targetId)
    await rightClickWidget(targetId, 280, 240)
    await sleep(20)
    const before = await inRenderer(() => document.querySelectorAll('.canvas-widget').length)
    await clickMenu('cut')
    await sleep(60)
    assert.equal(await inRenderer(id => Boolean(document.querySelector(`[data-widget-id="${id}"]`)), targetId), false)
    await rightClickCanvas(900, 700)
    await sleep(20)
    await clickMenu('paste')
    await sleep(70)
    assert.equal(await inRenderer(() => document.querySelectorAll('.canvas-widget').length), before)
  })

  await runCase('重命名、锁定/解锁、隐藏/显示', async () => {
    const targetId = initialIds[0]
    await clickWidget(targetId)
    await inRenderer(() => { window.prompt = () => 'E2E重命名' })
    await rightClickWidget(targetId, 280, 240)
    await sleep(20)
    await clickMenu('rename')
    await sleep(50)
    assert.ok(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"] .widget-label`)?.textContent?.includes('E2E重命名'), targetId))

    await rightClickWidget(targetId, 280, 240)
    await sleep(20)
    await clickMenu('lock')
    await sleep(50)
    assert.equal(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`)?.classList.contains('locked'), targetId), true)

    await inRenderer(id => {
      const element = document.querySelector(`[data-widget-id="${id}"]`)
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 21, clientX: 100, clientY: 100 }))
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }))
    }, targetId)
    await sleep(20)
    assert.equal(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`)?.classList.contains('selected'), targetId), true)
    await rightClickWidget(targetId, 280, 240)
    await sleep(20)
    assert.ok(await inRenderer(() => document.querySelector('[data-menu-command="lock"]')?.textContent?.includes('解锁')))
    await clickMenu('lock')
    await sleep(50)
    assert.equal(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`)?.classList.contains('locked'), targetId), false)

    await rightClickWidget(targetId, 280, 240)
    await sleep(20)
    await clickMenu('hide')
    await sleep(50)
    assert.equal(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`)?.classList.contains('hidden'), targetId), true)
    assert.ok(await inRenderer(id => Number.parseFloat(document.querySelector(`[data-widget-id="${id}"]`).style.opacity) < 1, targetId))
    await rightClickWidget(targetId, 280, 240)
    await sleep(20)
    await clickMenu('hide')
    await sleep(50)
    assert.equal(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`)?.classList.contains('hidden'), targetId), false)
  })

  await runCase('层级调整与撤销/重做', async () => {
    const targetId = initialIds[0]
    await clickWidget(targetId)
    const before = await inRenderer(id => Number.parseInt(document.querySelector(`[data-widget-id="${id}"]`).style.zIndex, 10), targetId)
    await rightClickWidget(targetId, 300, 250)
    await sleep(20)
    await clickMenu('front')
    await sleep(50)
    const top = await inRenderer(id => Number.parseInt(document.querySelector(`[data-widget-id="${id}"]`).style.zIndex, 10), targetId)
    const max = await inRenderer(() => Math.max(...widgetSnapshot().map(item => item.zIndex)))
    assert.equal(top, max)
    assert.ok(top >= before)

    await clickWidget(targetId)
    await rightClickWidget(targetId, 300, 250)
    await sleep(20)
    await clickMenu('back')
    await sleep(50)
    const bottom = await inRenderer(id => Number.parseInt(document.querySelector(`[data-widget-id="${id}"]`).style.zIndex, 10), targetId)
    const min = await inRenderer(() => Math.min(...widgetSnapshot().map(item => item.zIndex)))
    assert.equal(bottom, min)

    await clickWidget(targetId)
    const hiddenBeforeUndo = await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`).classList.contains('hidden'), targetId)
    await rightClickWidget(targetId, 300, 250)
    await sleep(20)
    await clickMenu('hide')
    await sleep(50)
    assert.notEqual(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`).classList.contains('hidden'), targetId), hiddenBeforeUndo)
    await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })))
    await sleep(60)
    assert.equal(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`).classList.contains('hidden'), targetId), hiddenBeforeUndo)
    await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true })))
    await sleep(60)
    assert.notEqual(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"]`).classList.contains('hidden'), targetId), hiddenBeforeUndo)
  })

  await runCase('容器粘贴目标与子节点渲染', async () => {
    const containerInfo = await inRenderer(() => {
      const nodes = Array.from(document.querySelectorAll('.canvas-widget'))
      const node = nodes.find(item => ['card', 'frame', 'modal', 'stack', 'grid', 'drawer', 'loading'].includes(item.dataset.widgetType || ''))
      return { id: node?.dataset.widgetId, types: nodes.map(item => item.dataset.widgetType) }
    })
    const containerId = containerInfo.id
    assert.ok(containerId, `?????????????${containerInfo.types.join(',')}`)
    await clickWidget(initialIds[2])
    await rightClickWidget(initialIds[2], 320, 270)
    await sleep(20)
    await clickMenu('copy')
    await rightClickWidget(containerId, 350, 290)
    await sleep(25)
    assert.equal(await inRenderer(() => Boolean(document.querySelector('[data-menu-command="paste"]'))), true)
    const beforeChildren = await inRenderer(id => document.querySelectorAll(`[data-container-id="${id}"] > [data-widget-id]`).length, containerId)
    await clickMenu('paste')
    await sleep(80)
    const afterChildren = await inRenderer(id => document.querySelectorAll(`[data-container-id="${id}"] > [data-widget-id]`).length, containerId)
    assert.equal(afterChildren, beforeChildren + 1)
  })

  await runCase('键盘移动、尺寸调整与菜单退出', async () => {
    const targetId = initialIds[2]
    await clickWidget(targetId)
    const leftBefore = await inRenderer(id => parseFloat(document.querySelector(`[data-widget-id="${id}"]`).style.left), targetId)
    await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await sleep(50)
    const leftAfter = await inRenderer(id => parseFloat(document.querySelector(`[data-widget-id="${id}"]`).style.left), targetId)
    assert.ok(leftAfter > leftBefore, `键盘移动未生效：${leftBefore} -> ${leftAfter}`)

    const widthBefore = await inRenderer(id => parseFloat(document.querySelector(`[data-widget-id="${id}"]`).style.width), targetId)
    await inRenderer(id => {
      const handle = document.querySelector(`[data-widget-id="${id}"] .handle.se`)
      const rect = handle.getBoundingClientRect()
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 31, clientX: rect.right, clientY: rect.bottom }))
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, clientX: rect.right + 25, clientY: rect.bottom + 15 }))
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 31, clientX: rect.right + 25, clientY: rect.bottom + 15 }))
    }, targetId)
    await sleep(80)
    const widthAfter = await inRenderer(id => parseFloat(document.querySelector(`[data-widget-id="${id}"]`).style.width), targetId)
    assert.ok(widthAfter >= widthBefore, `尺寸调整未生效：${widthBefore} -> ${widthAfter}`)

    await rightClickWidget(targetId, 400, 300)
    await sleep(20)
    assert.equal(await inRenderer(() => Boolean(document.querySelector('.canvas-context-menu'))), true)
    await inRenderer(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })))
    await waitForMenuClosed()
    assert.equal(await inRenderer(() => Boolean(document.querySelector('.canvas-context-menu'))), false)
    await rightClickWidget(targetId, 400, 300)
    await sleep(20)
    await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await waitForMenuClosed()
    assert.equal(await inRenderer(() => Boolean(document.querySelector('.canvas-context-menu'))), false)
  })

  const browserErrors = await inRenderer(() => window.__codelessE2eErrors || [])
  if (browserErrors.length) rendererErrors.push(...browserErrors.map(error => `browser:${error}`))

  const failed = results.filter(item => item.status === 'failed')
  console.log('\nE2E 结果：')
  for (const result of results) console.log(`${result.status === 'passed' ? '通过' : '失败'} | ${result.name}${result.error ? ` | ${result.error}` : ''}`)
  if (rendererErrors.length) {
    console.error('\n渲染器错误：')
    rendererErrors.forEach(error => console.error(error))
  }
  if (failed.length || rendererErrors.length) process.exitCode = 1
}

app.whenReady().then(async () => {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    if (app.isReady()) app.quit()
  }
})
