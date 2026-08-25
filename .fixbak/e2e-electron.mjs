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
  throw new Error(`Wait condition timed out (${timeout}ms)`)
}

async function runCase(name, fn) {
  try {
    await fn()
    results.push({ name, status: 'passed' })
    console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, status: 'failed', error: error instanceof Error ? error.message : String(error) })
    console.error(`FAIL ${name}:`, error)
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
    if (!element) throw new Error(`找不到组�?${widgetId}`)
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, shiftKey: additive }))
  }, id, shiftKey)
}

async function rightClickWidget(id, clientX = 260, clientY = 220) {
  return inRenderer((widgetId, x, y) => {
    const element = document.querySelector(`[data-widget-id="${widgetId}"]`)
    if (!element) throw new Error(`找不到组�?${widgetId}`)
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2, clientX: x, clientY: y }))
  }, id, clientX, clientY)
}

async function clickMenu(command) {
  return inRenderer(commandValue => {
    const button = document.querySelector(`[data-menu-command="${commandValue}"]`)
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
    if (button.disabled) throw new Error(`找不到菜单命�?${commandValue}`)
    button.click()
  }, command)
}

async function rightClickCanvas(clientX = 1400, clientY = 900) {
  return inRenderer((x, y) => {
    const canvas = document.querySelector('.design-canvas')
    if (!canvas) throw new Error('design canvas not found')
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2, clientX: x, clientY: y }))
  }, clientX, clientY)
}

async function clearSelection() {
  return inRenderer(() => {
    const canvas = document.querySelector('.design-canvas')
    if (!canvas) throw new Error('design canvas not found')
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
    const button = Array.from(document.querySelectorAll('button.ghost-button.compact')).find(node => node.textContent?.includes('\u9884\u89c8'))
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
    button.click()
  })
  await waitFor(() => inRenderer(() => Boolean(document.querySelector('.preview-modal'))))
  await sleep(120)
}

async function closePreview() {
  await inRenderer(() => {
    const button = document.querySelector('.preview-modal > header button')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
    button.click()
  })
  await waitFor(() => inRenderer(() => !document.querySelector('.preview-modal')))
}
async function openBuilderOverflowMenu() {
  await inRenderer(() => {
    const trigger = document.querySelector('.builder-more-trigger')
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('builder overflow trigger not found')
    trigger.click()
  })
  await waitFor(() => inRenderer(() => Boolean(document.querySelector('[data-testid="builder-overflow-menu"]'))))
}

async function closeBuilderOverflowMenuWithEscape() {
  await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await waitFor(() => inRenderer(() => !document.querySelector('[data-testid="builder-overflow-menu"]')))
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
  await waitFor(() => inRenderer(() => !document.querySelector('.boot-screen')))
  await inRenderer(() => {
    const project = document.querySelector('.project-card')
    if (!(project instanceof HTMLElement)) throw new Error('home route did not render a project card')
    project.click()
  })
  await waitFor(() => inRenderer(() => Boolean(document.querySelector('.design-canvas'))))
  await inRenderer(() => {
    window.addEventListener('error', event => { window.__codelessE2eErrors ||= []; window.__codelessE2eErrors.push(event.message) })
    window.addEventListener('unhandledrejection', event => { window.__codelessE2eErrors ||= []; window.__codelessE2eErrors.push(String(event.reason)) })
  })
  await sleep(150)

  let initialIds = []
  let allTypes = []

  await runCase('canvas loading and baseline widgets', async () => {
    const snapshot = await inRenderer(widgetSnapshot)
    const canvas = await inRenderer(() => {
      const element = document.querySelector('.design-canvas')
      return { width: element?.clientWidth, height: element?.clientHeight, background: getComputedStyle(element).backgroundColor }
    })
    assert.equal(canvas.width, 960)
    assert.equal(canvas.height, 720)
    assert.ok(snapshot.length >= 5, `初始组件数不足：${snapshot.length}`)
    assert.ok(snapshot.every(item => item.display !== 'none' && item.width > 0 && item.height > 0), 'invisible or zero-size widget found')
    initialIds = snapshot.slice(0, 3).map(item => item.id)
    assert.equal(new Set(snapshot.map(item => item.id)).size, snapshot.length, '组件 ID 不唯�一')
  })

  await runCase('default AppTopbar is not rendered', async () => {
    const headers = await inRenderer(() => ({
      globalTopbar: document.querySelector('.topbar') instanceof HTMLElement,
      builderToolbar: document.querySelector('.builder-toolbar') instanceof HTMLElement,
    }))
    assert.equal(headers.globalTopbar, false, 'the removed global AppTopbar is still rendered in the builder')
    assert.equal(headers.builderToolbar, true, 'the local Builder toolbar must remain available')
  })
  await runCase('custom window titlebar and responsive density', async () => {
    const initial = await inRenderer(() => {
      const titlebar = document.querySelector('[data-testid="app-window-titlebar"]')
      const controls = titlebar?.querySelectorAll('.app-window-controls button')
      const appShell = document.querySelector('.app-content-shell')
      const rootStyle = getComputedStyle(document.documentElement)
      return {
        titlebar: titlebar instanceof HTMLElement,
        controls: controls?.length || 0,
        labels: Array.from(controls || []).map(button => button.getAttribute('aria-label')),
        dragRegion: titlebar instanceof HTMLElement ? getComputedStyle(titlebar).getPropertyValue('-webkit-app-region') : '',
        scale: rootStyle.getPropertyValue('--ui-scale').trim(),
        titlebarHeight: titlebar instanceof HTMLElement ? titlebar.getBoundingClientRect().height : 0,
        contentHeight: appShell instanceof HTMLElement ? appShell.getBoundingClientRect().height : 0,
      }
    })
    assert.equal(initial.titlebar, true, 'custom Electron titlebar is missing')
    assert.equal(initial.controls, 3, 'custom titlebar must expose three window controls')
    assert.deepEqual(initial.labels, ['Minimize window', 'Maximize window', 'Close window'])
    assert.equal(initial.dragRegion, 'drag', 'titlebar must provide a draggable region')
    assert.ok(initial.scale, 'responsive UI scale token is missing')
    assert.ok(initial.titlebarHeight >= 40, 'titlebar is too small for reliable pointer interaction')

    await win.setSize(1240, 780)
    await sleep(100)
    const compact = await inRenderer(() => {
      const titlebar = document.querySelector('[data-testid="app-window-titlebar"]')
      const content = document.querySelector('.app-content-shell')
      return {
        titlebarWidth: titlebar instanceof HTMLElement ? titlebar.getBoundingClientRect().width : 0,
        contentWidth: content instanceof HTMLElement ? content.getBoundingClientRect().width : 0,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        captionVisible: Boolean(titlebar?.querySelector('.app-window-caption')) && getComputedStyle(titlebar.querySelector('.app-window-caption')).display !== 'none',
      }
    })
    assert.ok(compact.titlebarWidth > 0 && compact.contentWidth > 0, 'responsive layout collapsed at compact width')
    assert.ok(compact.overflow <= 1, `compact layout overflows horizontally by ${compact.overflow}px`)
    await win.setSize(1440, 1000)
    await sleep(100)
  })

  await runCase('autosave persists final widget content and layout', async () => {
    const before = await inRenderer(widgetId => {
      const widget = document.querySelector(`[data-widget-id="${widgetId}"]`)
      if (!(widget instanceof HTMLElement)) throw new Error('autosave widget target not found')
      widget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      const sections = document.querySelectorAll('.inspector-scroll .property-section')
      const inputs = sections[1]?.querySelectorAll('input') || []
      const contentInput = inputs[1]
      if (!(contentInput instanceof HTMLInputElement)) throw new Error('widget content inspector field not found')
      return {
        content: contentInput.value,
        left: widget.style.left,
        top: widget.style.top,
      }
    }, initialIds[0])

    const nextContent = `Autosave final state ${Date.now()}`
    await inRenderer(({ widgetId, content }) => {
      const widget = document.querySelector(`[data-widget-id="${widgetId}"]`)
      const sections = document.querySelectorAll('.inspector-scroll .property-section')
      const contentInput = sections[1]?.querySelectorAll('input')[1]
      if (!(widget instanceof HTMLElement) || !(contentInput instanceof HTMLInputElement)) throw new Error('autosave edit targets not found')
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      descriptor?.set?.call(contentInput, content)
      contentInput.dispatchEvent(new Event('input', { bubbles: true }))
      widget.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 8801, clientX: 180, clientY: 120,
      }))
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 8801, clientX: 218, clientY: 146,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, button: 0, buttons: 0, pointerId: 8801, clientX: 218, clientY: 146,
      }))
    }, { widgetId: initialIds[0], content: nextContent })

    const latest = await inRenderer(widgetId => {
      const widget = document.querySelector(`[data-widget-id="${widgetId}"]`)
      return widget instanceof HTMLElement ? { left: widget.style.left, top: widget.style.top } : null
    }, initialIds[0])
    assert.ok(latest && latest.left !== before.left && latest.top !== before.top, 'layout drag did not update the final widget frame')

    await waitFor(() => inRenderer(({ widgetId, content, frame }) => {
      const raw = localStorage.getItem('codeless-projects')
      const projects = raw ? JSON.parse(raw) : []
      const widget = projects.flatMap(project => project.pages || []).flatMap(page => page.layout?.widgets || [])
        .find(item => item.id === widgetId)
      return widget?.config?.content?.text === content
        && `${widget?.config?.layout?.x}px` === frame.left
        && `${widget?.config?.layout?.y}px` === frame.top
    }, { widgetId: initialIds[0], content: nextContent, frame: latest }), 4000, 50)
  })
  await runCase('Create Page creates and activates an independent blank page', async () => {
    await inRenderer(() => {
      const pagesTab = document.querySelectorAll('.panel-tabs button')[1]
      if (!(pagesTab instanceof HTMLButtonElement)) throw new Error('Pages palette tab not found')
      pagesTab.click()
    })
    await waitFor(() => inRenderer(() => document.querySelector('.pages-panel') instanceof HTMLElement))

    const before = await inRenderer(() => {
      const active = document.querySelector('.page-item.active')
      return {
        pageCount: document.querySelectorAll('.page-item').length,
        activePath: active?.querySelector('small')?.textContent?.trim() || '',
        widgetCount: document.querySelectorAll('.canvas-widget').length,
      }
    })
    assert.ok(before.activePath, 'the initial page path is required to restore the scenario')

    await inRenderer(() => {
      const createButton = document.querySelector('.page-list-head button')
      if (!(createButton instanceof HTMLButtonElement)) throw new Error('Create page button not found')
      createButton.click()
    })
    await waitFor(() => inRenderer(() => document.querySelector('.page-create-dialog') instanceof HTMLFormElement))

    const created = {
      name: `E2E Regression ${Date.now()}`,
      path: `/e2e-regression-${Date.now()}`,
    }
    await inRenderer(({ name, path }) => {
      const dialog = document.querySelector('.page-create-dialog')
      const inputs = dialog?.querySelectorAll('input') || []
      const nameInput = inputs[0]
      const pathInput = inputs[1]
      if (!(nameInput instanceof HTMLInputElement) || !(pathInput instanceof HTMLInputElement)) throw new Error('Create page dialog inputs not found')
      const setValue = (control, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        descriptor?.set?.call(control, value)
        control.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setValue(nameInput, name)
      setValue(pathInput, path)
    }, created)
    await waitFor(() => inRenderer(() => {
      const submit = document.querySelector('.page-create-dialog button[type="submit"]')
      return submit instanceof HTMLButtonElement && !submit.disabled
    }))
    await inRenderer(() => {
      const submit = document.querySelector('.page-create-dialog button[type="submit"]')
      if (!(submit instanceof HTMLButtonElement)) throw new Error('Create page submit button not found')
      submit.click()
    })
    await waitFor(() => inRenderer(() => !document.querySelector('.page-create-dialog')))
    await waitFor(() => inRenderer(({ name, path, pageCount }) => {
      const active = document.querySelector('.page-item.active')
      return document.querySelectorAll('.page-item').length === pageCount + 1
        && active?.querySelector('strong')?.textContent?.trim() === name
        && active?.querySelector('small')?.textContent?.trim() === path
        && document.querySelectorAll('.canvas-widget').length === 0
    }, { ...created, pageCount: before.pageCount }))

    await inRenderer(activePath => {
      const page = Array.from(document.querySelectorAll('.page-item')).find(node => node.querySelector('small')?.textContent?.trim() === activePath)
      if (!(page instanceof HTMLElement)) throw new Error('Original page was not found after page creation')
      page.click()
    }, before.activePath)
    await waitFor(() => inRenderer(widgetCount => document.querySelectorAll('.canvas-widget').length === widgetCount, before.widgetCount))
    await inRenderer(() => {
      const componentsTab = document.querySelectorAll('.panel-tabs button')[0]
      if (!(componentsTab instanceof HTMLButtonElement)) throw new Error('Components palette tab not found')
      componentsTab.click()
    })
  })

  await runCase('Page properties update canvas size, position, and background', async () => {
    await clearSelection()
    await waitFor(() => inRenderer(() => document.querySelector('[data-testid="page-properties-panel"]') instanceof HTMLElement))

    const before = await inRenderer(() => {
      const canvas = document.querySelector('.design-canvas')
      const panel = document.querySelector('[data-testid="page-properties-panel"]')
      const fieldValue = label => {
        const field = Array.from(panel?.querySelectorAll('label') || []).find(node => node.querySelector('span')?.textContent?.trim() === label)
        const input = field?.querySelector('input:not([type="color"])') || field?.querySelector('input')
        return input instanceof HTMLInputElement ? input.value : ''
      }
      return {
        name: fieldValue('Page name'),
        width: fieldValue('Width'),
        height: fieldValue('Height'),
        x: fieldValue('Position X'),
        y: fieldValue('Position Y'),
        background: fieldValue('Canvas background'),
      }
    })
    assert.ok(before.name && before.width && before.height, 'page property controls did not expose their current values')

    const next = {
      name: `E2E Page ${Date.now()}`,
      width: '1001',
      height: '653',
      x: '37',
      y: '-23',
      background: '#123456',
    }
    await inRenderer(values => {
      const panel = document.querySelector('[data-testid="page-properties-panel"]')
      if (!panel) throw new Error('Page properties panel not found')
      const setField = (label, value, color = false) => {
        const field = Array.from(panel.querySelectorAll('label')).find(node => node.querySelector('span')?.textContent?.trim() === label)
        const control = field?.querySelector(color ? 'input[type="color"]' : 'input')
        if (!(control instanceof HTMLInputElement)) throw new Error(`Page property control not found: ${label}`)
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        descriptor?.set?.call(control, value)
        control.dispatchEvent(new Event('change', { bubbles: true }))
      }
      setField('Page name', values.name)
      setField('Width', values.width)
      setField('Height', values.height)
      setField('Position X', values.x)
      setField('Position Y', values.y)
      setField('Canvas background', values.background, true)
    }, next)
    await waitFor(() => inRenderer(values => {
      const canvas = document.querySelector('.design-canvas')
      const headerPageName = document.querySelector('.builder-breadcrumb span')?.textContent?.trim()
      const colorInput = document.querySelector('[data-testid="page-properties-panel"] input[type="color"]')
      const expectedRgb = [1, 3, 5].map(offset => Number.parseInt(values.background.slice(offset, offset + 2), 16)).join(',')
      if (!(canvas instanceof HTMLElement) || !(colorInput instanceof HTMLInputElement)) return false
      return canvas.style.width === `${values.width}px`
        && canvas.style.height === `${values.height}px`
        && canvas.style.transform === `translate(${values.x}px, ${values.y}px)`
        && colorInput.value.toLowerCase() === values.background
        && getComputedStyle(canvas).backgroundColor.replace(/\s/g, '') === `rgb(${expectedRgb})`
        && headerPageName === values.name
    }, next))

    await inRenderer(values => {
      const panel = document.querySelector('[data-testid="page-properties-panel"]')
      if (!panel) throw new Error('Page properties panel not found while restoring state')
      const setField = (label, value, color = false) => {
        const field = Array.from(panel.querySelectorAll('label')).find(node => node.querySelector('span')?.textContent?.trim() === label)
        const control = field?.querySelector(color ? 'input[type="color"]' : 'input')
        if (!(control instanceof HTMLInputElement)) throw new Error(`Page property control not found while restoring: ${label}`)
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        descriptor?.set?.call(control, value)
        control.dispatchEvent(new Event('change', { bubbles: true }))
      }
      setField('Page name', values.name)
      setField('Width', values.width)
      setField('Height', values.height)
      setField('Position X', values.x)
      setField('Position Y', values.y)
      setField('Canvas background', values.background, true)
    }, { ...before, background: before.background || '#ffffff' })
    await waitFor(() => inRenderer(values => {
      const canvas = document.querySelector('.design-canvas')
      return canvas instanceof HTMLElement
        && canvas.style.width === `${values.width}px`
        && canvas.style.height === `${values.height}px`
        && canvas.style.transform === `translate(${values.x}px, ${values.y}px)`
    }, before))
  })

  await runCase('Space plus widget drag pans canvas without moving widget', async () => {
    await clearSelection()
    const result = await inRenderer(widgetId => {
      const widget = document.querySelector(`[data-widget-id="${widgetId}"]`)
      const canvas = document.querySelector('.design-canvas')
      const frame = document.querySelector('.canvas-frame')
      if (!(widget instanceof HTMLElement) || !(canvas instanceof HTMLElement) || !(frame instanceof HTMLElement)) throw new Error('Canvas pan regression targets not found')
      const before = {
        left: widget.style.left,
        top: widget.style.top,
        width: widget.style.width,
        height: widget.style.height,
        frameTransform: frame.style.transform,
      }
      const pointerId = 9041
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
      widget.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId, pointerType: 'mouse', isPrimary: true, clientX: 240, clientY: 210,
      }))
      widget.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId, pointerType: 'mouse', isPrimary: true, clientX: 302, clientY: 257,
      }))
      widget.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, button: 0, buttons: 0, pointerId, pointerType: 'mouse', isPrimary: true, clientX: 302, clientY: 257,
      }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
      return {
        before,
        after: {
          left: widget.style.left,
          top: widget.style.top,
          width: widget.style.width,
          height: widget.style.height,
          frameTransform: frame.style.transform,
        },
      }
    }, initialIds[0])
    assert.deepEqual(
      { left: result.after.left, top: result.after.top, width: result.after.width, height: result.after.height },
      { left: result.before.left, top: result.before.top, width: result.before.width, height: result.before.height },
      'Space+drag changed the widget frame instead of reserving the gesture for canvas panning',
    )
    await sleep(50)
    const frameTransform = await inRenderer(() => {
      const frame = document.querySelector('.canvas-frame')
      return frame instanceof HTMLElement ? frame.style.transform : ''
    })
    assert.notEqual(frameTransform, result.before.frameTransform, 'Space+drag did not change the canvas viewport transform')
  })
  await runCase('structured builder header overflow behavior', async () => {
    const header = await inRenderer(() => ({
      context: document.querySelector('.builder-context')?.textContent || '',
      command: document.querySelector('.command-trigger') instanceof HTMLButtonElement,
      preview: document.querySelector('.builder-preview-action') instanceof HTMLButtonElement,
      publish: document.querySelector('.builder-publish-action') instanceof HTMLButtonElement,
    }))
    assert.ok(header.context.trim().length > 0, 'builder header context is missing')
    assert.equal(header.command, true, 'command palette entry is missing from header')
    assert.equal(header.preview, true, 'preview action is missing from header')
    assert.equal(header.publish, true, 'publish action is missing from header')

    await openBuilderOverflowMenu()
    const menu = await inRenderer(() => ({
      collaboration: document.querySelector('[data-collaboration-toggle]') instanceof HTMLButtonElement,
      designImport: document.querySelector('[data-design-exchange="import"]') instanceof HTMLButtonElement,
      designExport: document.querySelector('[data-design-exchange="export"]') instanceof HTMLButtonElement,
    }))
    assert.deepEqual(menu, { collaboration: true, designImport: true, designExport: true }, 'overflow menu is missing expected actions')
    await closeBuilderOverflowMenuWithEscape()

    await openBuilderOverflowMenu()
    await inRenderer(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    await waitFor(() => inRenderer(() => !document.querySelector('[data-testid="builder-overflow-menu"]')))
  })

  await runCase('local collaboration panel and WebGL layer', async () => {
    await openBuilderOverflowMenu()
    const toolbarExists = await inRenderer(() => document.querySelector('[data-collaboration-toggle]') instanceof HTMLButtonElement)
    assert.equal(toolbarExists, true, 'missing collaboration toolbar entry')
    await inRenderer(() => {
      const button = document.querySelector('[data-collaboration-toggle]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
      button.click()
    })
    await waitFor(() => inRenderer(() => Boolean(document.querySelector('[data-collaboration-panel]'))))
    const collaboration = await inRenderer(() => {
      const panel = document.querySelector('[data-collaboration-panel]')
      const mode = panel?.querySelector('[data-collaboration-mode]')
      const create = panel?.querySelector('[data-collaboration-create]')
      return {
        panel: Boolean(panel),
        mode: mode instanceof HTMLSelectElement ? mode.value : '',
        createEnabled: create instanceof HTMLButtonElement && !create.disabled,
      }
    })
    assert.equal(collaboration.panel, true, 'collaboration panel did not open')
    assert.equal(collaboration.mode, 'same-device', 'default collaboration mode is not same-device')
    assert.equal(collaboration.createEnabled, true, 'create session button is disabled')
    assert.equal(await inRenderer(() => Boolean(document.querySelector('[data-testid="canvas-webgl-layer"]'))), true, 'missing WebGL canvas layer')
    await inRenderer(() => {
      const create = document.querySelector('[data-collaboration-create]')
      if (!(create instanceof HTMLButtonElement)) throw new Error('create session button not found')
      create.click()
    })
    await waitFor(() => inRenderer(() => Boolean(document.querySelector('.collaboration-session-card'))))
    const session = await inRenderer(() => {
      const card = document.querySelector('.collaboration-session-card')
      const inputs = card ? Array.from(card.querySelectorAll('input')) : []
      return {
        mode: card?.textContent?.includes('\u540c\u673a\u534f\u4f5c\u5df2\u5f00\u542f') ? 'same-device' : 'unknown',
        hasSessionId: Boolean(inputs[0]?.value),
        hasToken: Boolean(inputs[1]?.value),
        hasLanAddress: Boolean(card?.querySelector('input[readonly]') && card?.textContent?.includes('灞一域网地址')),
      }
    })
    assert.equal(session.mode, 'same-device', 'created session unexpectedly uses LAN mode')
    assert.equal(session.hasSessionId, true, 'created session has no session ID')
    assert.equal(session.hasToken, true, 'created session has no collaboration token')
    assert.equal(session.hasLanAddress, false, 'same-device session should not expose a LAN address')
    await inRenderer(() => {
      const leave = document.querySelector('.collaboration-session-card .danger-button')
      if (!(leave instanceof HTMLButtonElement)) throw new Error('leave session button not found')
      leave.click()
    })
    await waitFor(() => inRenderer(() => !document.querySelector('.collaboration-session-card')))
    await inRenderer(() => {
      const close = document.querySelector('[data-collaboration-panel] [data-collaboration-close]')
      if (!(close instanceof HTMLButtonElement)) throw new Error('collaboration close button not found')
      close.click()
    })
    await waitFor(() => inRenderer(() => !document.querySelector('[data-collaboration-panel]')))
  })
  await runCase('design exchange import and export entry points', async () => {
    await openBuilderOverflowMenu()
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
    assert.equal(controls.importExists, true, '缺少设计 JSON 导入�ュ彛')
    assert.equal(controls.exportExists, true, '缺少设计 JSON 导出�ュ彛')
    assert.equal(controls.importDisabled, false, 'design JSON import must be enabled')
    assert.equal(controls.exportDisabled, false, 'design JSON export must be enabled')

    await inRenderer(() => {
      const button = document.querySelector('[data-design-exchange="import"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
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
    await openBuilderOverflowMenu()

    await inRenderer(() => {
      const button = document.querySelector('[data-design-exchange="export"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
      button.click()
    })
    await sleep(80)
    const errors = await inRenderer(() => window.__codelessE2eErrors || [])
    assert.deepEqual(errors, [], `设计�ゆ崲鍏ュ彛浜х敓 renderer error锛?{errors.join('; ')}`)
  })
  await runCase('component size position hierarchy and zoom mapping', async () => {
    const data = await inRenderer(() => {
      const canvas = document.querySelector('.design-canvas').getBoundingClientRect()
      const zoom = Number(getComputedStyle(document.querySelector('.design-canvas')).transform.match(/matrix\([^,]+/)?.[0]?.replace('matrix(', '') || '1')
      return { canvasLeft: canvas.left, canvasTop: canvas.top, zoom, widgets: widgetSnapshot() }
    })
    assert.ok(data.widgets.every(item => item.width >= 24 && item.height >= 24), 'widget minimum size constraint failed')
    assert.ok(data.widgets.every(item => item.width >= 24 && item.height >= 24), 'widget minimum size constraint failed')
    assert.ok(data.widgets.every(item => item.width >= 24 && item.height >= 24), 'widget minimum size constraint failed')
    assert.ok(data.widgets.every(item => item.width >= 24 && item.height >= 24), 'widget minimum size constraint failed')
    assert.ok(data.zoom > 0, 'canvas zoom must be positive')
  })

  await runCase('selection feedback and shift multi-select', async () => {
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

  await runCase('canvas grid and smart snap', async () => {
    const initial = await inRenderer(() => {
      const grid = document.querySelector('[data-testid="canvas-grid-toggle"]')
      const snap = document.querySelector('[data-testid="canvas-snap-toggle"]')
      const pattern = document.querySelector('.canvas-grid-pattern')
      return {
        gridExists: grid instanceof HTMLButtonElement,
        snapExists: snap instanceof HTMLButtonElement,
        gridActive: grid?.classList.contains('active') || false,
        snapActive: snap?.classList.contains('active') || false,
        opacity: pattern ? getComputedStyle(pattern).opacity : '',
      }
    })
    assert.equal(initial.gridExists, true, '网格�一关不存在')
    assert.equal(initial.snapExists, true, '鏅鸿兘鍚搁檮寮一关不存在')
    assert.equal(initial.gridActive, true, 'grid should be enabled by default')
    assert.equal(initial.snapActive, true, 'smart snap should be enabled by default')
    assert.equal(initial.opacity, '1', 'grid layer should be visible by default')

    await inRenderer(() => {
      const button = document.querySelector('[data-testid="canvas-grid-toggle"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
      button.click()
    })
    await sleep(30)
    const hidden = await inRenderer(() => ({
      active: document.querySelector('[data-testid="canvas-grid-toggle"]')?.classList.contains('active') || false,
      opacity: getComputedStyle(document.querySelector('.canvas-grid-pattern')).opacity,
    }))
    assert.equal(hidden.active, false, '网格关闭后按钮仍�?active')
    assert.equal(hidden.opacity, '0', 'grid layer opacity did not change')

    await inRenderer(() => {
      const button = document.querySelector('[data-testid="canvas-grid-toggle"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
      button.click()
    })
    await inRenderer(() => {
      const button = document.querySelector('[data-testid="canvas-snap-toggle"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
      button.click()
    })
    await sleep(30)
    assert.equal(await inRenderer(() => document.querySelector('[data-testid="canvas-snap-toggle"]')?.classList.contains('active') || false), false, '鍏抽棴鍚搁檮鍚庢寜閽粛涓?active')
    await inRenderer(() => {
      const button = document.querySelector('[data-testid="canvas-snap-toggle"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
      button.click()
    })
  })

  await runCase('multi-select alignment and undo', async () => {
    await clickWidget(initialIds[0])
    await clickWidget(initialIds[1], true)
    await clickWidget(initialIds[2], true)
    await waitFor(() => inRenderer(() => Boolean(document.querySelector('.canvas-selection-toolbar'))))
    const selected = await inRenderer(() => document.querySelectorAll('.canvas-widget.selected').length)
    assert.equal(selected, 3, `多�一�组件数量异常：${selected}`)
    const before = await inRenderer(ids => ids.map(id => ({
      id,
      left: Number.parseFloat(document.querySelector(`[data-widget-id="${id}"]`).style.left),
    })), initialIds)
    await inRenderer(() => {
      const button = document.querySelector('.canvas-selection-toolbar button[title="Align left"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
      button.click()
    })
    await sleep(70)
    const after = await inRenderer(ids => ids.map(id => Number.parseFloat(document.querySelector(`[data-widget-id="${id}"]`).style.left)), initialIds)
    assert.equal(new Set(after).size, 1, `宸﹀��齐结果不�一鑷达細${after.join(', ')}`)
    assert.ok(new Set(before.map(item => item.left)).size > 1, `测试初始位置未形成可验证差异�?{JSON.stringify(before)}`)

    await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })))
    await sleep(70)
    const undone = await inRenderer(ids => ids.map(id => Number.parseFloat(document.querySelector(`[data-widget-id="${id}"]`).style.left)), initialIds)
    assert.deepEqual(undone, before.map(item => item.left), `宸﹀��齐操作未被撤�一锛?{JSON.stringify({ before, undone })}`)
    await clearSelection()
  })

  await runCase('local Inspect codegen and SVG export entry points', async () => {
    await clickWidget(initialIds[0])
    await openBuilderOverflowMenu()
    await inRenderer(() => {
      const menu = document.querySelector('[data-testid="builder-overflow-menu"]')
      const button = Array.from(menu?.querySelectorAll('button') || []).find(item => item.textContent?.includes('Inspect'))
      if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('Inspect button unavailable')
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
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
      button.click()
    })
    await waitFor(() => inRenderer(() => !document.querySelector('[data-testid="inspect-panel"]')))
  })

  await runCase('canvas marquee selection', async () => {
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
    assert.ok(selected >= 1, `框�一�未命中组件，selected=${selected}`)
    assert.equal(await inRenderer(() => Boolean(document.querySelector('.canvas-selection-box'))), false, 'marquee selection box was not cleared')
    await clearSelection()
  })

  await runCase('component panel coverage', async () => {
    allTypes = await inRenderer(() => Array.from(document.querySelectorAll('.component-grid button')).map(node => node.dataset.widgetType).filter(Boolean))
    assert.ok(allTypes.length >= 20, `组件�㈡��类型数量异常�?{allTypes.length}`)
    for (const type of allTypes) {
      await inRenderer(typeValue => {
        const button = Array.from(document.querySelectorAll('.component-grid button')).find(node => node.dataset.widgetType === typeValue)
        if (!button) throw new Error(`组件�㈡澘缂哄皯 ${typeValue}`)
        button.click()
      }, type)
    }
    await sleep(120)
    const renderedTypes = await inRenderer(() => Array.from(new Set(Array.from(document.querySelectorAll('.canvas-widget')).map(node => node.dataset.widgetType))))
    assert.ok(allTypes.every(type => renderedTypes.includes(type)), `未渲染类型：${allTypes.filter(type => !renderedTypes.includes(type)).join(',')}`)
    const ids = await inRenderer(() => Array.from(document.querySelectorAll('.canvas-widget')).map(node => node.dataset.widgetId))
    assert.equal(new Set(ids).size, ids.length, '批量添加后组�?ID 重复')
  })

  await runCase('Element Plus component rendering', async () => {
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
      assert.equal(item.exists, true, `缂哄皯 ${item.type} 画布节点`)
      assert.equal(item.rendered, true, `${item.type} 内部渲染节点缺�け`)
      assert.ok(item.width > 0 && item.height > 0, `${item.type} 娓叉煋灏哄鏃犳晥锛?{item.width}x${item.height}`)
    }
    const progress = checks.find(item => item.type === 'progress')
    assert.equal(progress?.progressWidth, '68%', '进度�￠粯璁ょ��分比未映射到�ㄩ��宽度')
    assert.equal(checks.find(item => item.type === 'switch')?.switchPressed, 'true', '寮一关默�ょ��态未渲染')
    assert.ok((checks.find(item => item.type === 'checkbox')?.checkboxCount || 0) >= 1, 'checkbox input is missing')
    assert.ok((checks.find(item => item.type === 'radio')?.radioCount || 0) >= 2, '单�一�框选�」缂哄け')
    assert.ok((checks.find(item => item.type === 'pagination')?.paginationButtons || 0) >= 3, '分�〉按钮缺�け')
    assert.equal(checks.find(item => item.type === 'tabs')?.activeTabs, 1, '标签页没有唯�一婵一娲婚」')
    assert.equal(checks.find(item => item.type === 'collapse')?.collapseExpanded, 'true', 'collapse panel should be expanded')
    assert.equal(checks.find(item => item.type === 'collapse')?.collapsePanelDisplay, 'block', 'collapse panel content is not visible')
    assert.equal(checks.find(item => item.type === 'tooltip')?.tooltipOpacity, '1', 'tooltip did not become visible')
  })

  await runCase('runtime preview interactions', async () => {
    const tagId = await widgetIdByType('tag')
    const alertId = await widgetIdByType('alert')
    const checkboxId = await widgetIdByType('checkbox')
    const modalId = await widgetIdByType('modal')
    const drawerId = await widgetIdByType('drawer')
    const loadingId = await widgetIdByType('loading')
    assert.ok(tagId && alertId && checkboxId && modalId && drawerId && loadingId, '运行态测试组件未创建')
    await setInspectorField(tagId, '\u53ef\u5173\u95ed', true)
    await setInspectorField(alertId, '\u53ef\u5173\u95ed', true)
    await setInspectorField(checkboxId, '\u591a\u9009\u9879', '\u9009\u9879\u4e00|option-1\n\u9009\u9879\u4e8c|option-2')
    await setInspectorField(modalId, '\u9ed8\u8ba4\u663e\u793a', true)
    await setInspectorField(drawerId, '\u9ed8\u8ba4\u663e\u793a', true)
    await setInspectorField(loadingId, '\u9ed8\u8ba4\u663e\u793a', true)

    await openPreview()
    const runtime = await inRenderer(() => ({
      count: document.querySelectorAll('.runtime-widget-node').length,
      types: Array.from(new Set(Array.from(document.querySelectorAll('.runtime-widget-node')).map(node => node.className.match(/(?:^|\s)widget-([\w-]+)/)?.[1]).filter(Boolean))),
      dateType: document.querySelector('.runtime-widget-node.widget-datePicker input')?.type,
      serviceNodes: document.querySelectorAll('.runtime-widget-node.widget-modal, .runtime-widget-node.widget-drawer, .runtime-widget-node.widget-loading').length,
    }))
    assert.ok(runtime.count >= allTypes.length, `运行态节点数量不足：${runtime.count}`)
    assert.ok(allTypes.every(type => runtime.types.includes(type)), `运行态缺少组件：${allTypes.filter(type => !runtime.types.includes(type)).join(',')}`)
    assert.equal(runtime.dateType, 'date', '鏃ユ��选择�ㄦ��有使�?date input')
    assert.equal(runtime.serviceNodes, 3, 'runtime service node count is incorrect')

    const switchBefore = await inRenderer(() => document.querySelector('.runtime-widget-node.widget-switch .render-switch')?.getAttribute('aria-pressed'))
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-switch .render-switch')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await sleep(40)
    const switchAfter = await inRenderer(() => document.querySelector('.runtime-widget-node.widget-switch .render-switch')?.getAttribute('aria-pressed'))
    assert.equal(switchBefore, 'true')
    assert.equal(switchAfter, 'false', 'runtime switch did not toggle')

    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-checkbox input[type="checkbox"]')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => document.querySelector('.runtime-widget-node.widget-checkbox input[type="checkbox"]')?.checked), true, '运行态复选框点击�℃��选中')

    const radioInputs = await inRenderer(() => Array.from(document.querySelectorAll('.runtime-widget-node.widget-radio input[type="radio"]')).map(node => node.value))
    assert.ok(radioInputs.length >= 2, '运行态单选框选�」不足')
    await inRenderer(() => document.querySelectorAll('.runtime-widget-node.widget-radio input[type="radio"]')[1]?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => Array.from(document.querySelectorAll('.runtime-widget-node.widget-radio input[type="radio"]')).filter(node => node.checked).length), 1, '运行态单选框选中数量异常')

    await inRenderer(() => Array.from(document.querySelectorAll('.runtime-widget-node.widget-pagination .render-pagination button')).find(node => node.textContent?.trim() === '2')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => document.querySelector('.runtime-widget-node.widget-pagination .render-pagination button.active')?.textContent?.trim()), '2', 'runtime pagination did not switch')

    await inRenderer(() => document.querySelectorAll('.runtime-widget-node.widget-tabs .render-tabs-head button')[1]?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => document.querySelectorAll('.runtime-widget-node.widget-tabs .render-tabs-head button.active')[0]?.textContent?.trim()), '\u8be6\u60c5', '运行态标签�〉切换失败')

    const collapseBefore = await inRenderer(() => document.querySelector('.runtime-widget-node.widget-collapse .render-collapse-head')?.getAttribute('aria-expanded'))
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-collapse .render-collapse-head')?.click())
    await sleep(40)
    const collapseAfter = await inRenderer(() => document.querySelector('.runtime-widget-node.widget-collapse .render-collapse-head')?.getAttribute('aria-expanded'))
    assert.equal(collapseBefore, 'true')
    assert.equal(collapseAfter, 'false', 'runtime collapse did not close')
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-collapse .render-collapse-panel')).display), 'none')

    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-tag .render-tag button')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-tag .render-tag')).display), 'none', 'Tag remained visible after closing')
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-alert .render-alert button')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-alert .render-alert')).display), 'none', 'Alert remained visible after closing')

    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-modal .render-modal')).display), 'flex', 'Modal 默认显�ず失败')
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-modal .service-close')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-modal .render-modal')).display), 'none', 'Modal 关闭按钮�℃��隐藏弹窗')
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-drawer .render-drawer')).display), 'block', 'Drawer 默认显�ず失败')
    await inRenderer(() => document.querySelector('.runtime-widget-node.widget-drawer .service-close')?.click())
    await sleep(40)
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-drawer .render-drawer')).display), 'none', 'Drawer 关闭按钮�℃��隐藏抽屉')
    assert.equal(await inRenderer(() => getComputedStyle(document.querySelector('.runtime-widget-node.widget-loading .render-loading')).display), 'flex', 'Loading 状�一�未显�ず')
    assert.ok(await inRenderer(() => Boolean(document.querySelector('.runtime-widget-node.widget-loading .loading-spinner'))), 'loading spinner is missing')
    await closePreview()
  })
  await runCase('context menu boundary scrolling and animation rules', async () => {
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
    assert.ok(menu.left >= 0 && menu.top >= 0 && menu.right <= 1440 && menu.bottom <= 1000, `菜单越界�?{JSON.stringify(menu)}`)
    assert.equal(menu.animated, true, '未发现菜单进�?离开�ㄧ��规则')
    await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) )
    await waitForMenuClosed()
    assert.equal(await inRenderer(() => Boolean(document.querySelector('.canvas-context-menu'))), false)
  })

  await runCase('copy paste delete and unique ids', async () => {
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

  await runCase('cut and paste restores widget', async () => {
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

  await runCase('rename lock visibility and unlock behavior', async () => {
    const targetId = initialIds[0]
    await clickWidget(targetId)
    await inRenderer(() => { window.prompt = () => 'E2E renamed' })
    await rightClickWidget(targetId, 280, 240)
    await sleep(20)
    await clickMenu('rename')
    await sleep(50)
    assert.ok(await inRenderer(id => document.querySelector(`[data-widget-id="${id}"] .widget-label`)?.textContent?.includes('E2E renamed'), targetId))

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
    assert.ok(await inRenderer(() => document.querySelector('[data-menu-command="lock"]')?.textContent?.includes('\u89e3\u9501')))
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

  await runCase('layer ordering and undo redo', async () => {
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

  await runCase('container paste target and child rendering', async () => {
    let containerInfo = await inRenderer(() => {
      const nodes = Array.from(document.querySelectorAll('.canvas-widget'))
      const node = nodes.find(item => ['card', 'frame', 'modal', 'stack', 'grid', 'drawer', 'loading'].includes(item.dataset.widgetType || ''))
      return { id: node?.dataset.widgetId, types: nodes.map(item => item.dataset.widgetType) }
    })
    if (!containerInfo.id) {
      await inRenderer(() => {
        const button = document.querySelector('.component-grid button[data-widget-type="card"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('required button not found')
        button.click()
      })
      await sleep(80)
      containerInfo = await inRenderer(() => {
        const nodes = Array.from(document.querySelectorAll('.canvas-widget'))
        const node = nodes.find(item => ['card', 'frame', 'modal', 'stack', 'grid', 'drawer', 'loading'].includes(item.dataset.widgetType || ''))
        return { id: node?.dataset.widgetId, types: nodes.map(item => item.dataset.widgetType) }
      })
    }
    const containerId = containerInfo.id
    assert.ok(containerId, `未找到可粘贴的容器：${containerInfo.types.join(',')}`)
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

  await runCase('keyboard movement and menu exit', async () => {
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
    assert.ok(widthAfter >= widthBefore, `灏哄璋冩暣鏈敓鏁堬細${widthBefore} -> ${widthAfter}`)

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

  await runCase('viewport navigation and transform integration', async () => {
    const initial = await inRenderer(() => {
      const stage = document.querySelector('.canvas-stage')
      const frame = document.querySelector('.canvas-frame')
      const canvas = document.querySelector('.design-canvas')
      if (!(stage instanceof HTMLElement) || !(frame instanceof HTMLElement) || !(canvas instanceof HTMLElement)) throw new Error('viewport DOM is incomplete')
      return {
        canvasWidth: canvas.clientWidth,
        canvasHeight: canvas.clientHeight,
        transform: frame.style.transform,
        stagePosition: getComputedStyle(stage).position,
      }
    })
    assert.equal(initial.canvasWidth, 960)
    assert.equal(initial.canvasHeight, 720)
    assert.match(initial.transform, /scale\(/)
    assert.equal(initial.stagePosition, 'absolute')

    await inRenderer(() => {
      const select = document.querySelector('.builder-center-tools select')
      if (!(select instanceof HTMLSelectElement)) throw new Error('zoom selector not found')
      select.value = '1.5'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await sleep(60)
    const zoomed = await inRenderer(() => document.querySelector('.canvas-frame')?.style.transform || '')
    assert.match(zoomed, /scale\(1\.5\)/)

    const beforePan = await inRenderer(() => {
      const frame = document.querySelector('.canvas-frame')
      if (!(frame instanceof HTMLElement)) throw new Error('canvas frame not found')
      const rect = frame.getBoundingClientRect()
      return { left: rect.left, top: rect.top }
    })
    await inRenderer(() => {
      const canvas = document.querySelector('.design-canvas')
      if (!(canvas instanceof HTMLElement)) throw new Error('canvas transform node not found')
      const rect = canvas.getBoundingClientRect()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 77, clientX: rect.left + 120, clientY: rect.top + 120 }))
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, button: 0, pointerId: 77, clientX: rect.left + 156, clientY: rect.top + 138 }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 77, clientX: rect.left + 156, clientY: rect.top + 138 }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }))
    })
    await sleep(30)
    const afterPan = await inRenderer(() => {
      const frame = document.querySelector('.canvas-frame')
      if (!(frame instanceof HTMLElement)) throw new Error('canvas frame not found')
      const rect = frame.getBoundingClientRect()
      return { left: rect.left, top: rect.top }
    })
    const moved = { dx: afterPan.left - beforePan.left, dy: afterPan.top - beforePan.top }
    assert.ok(Math.abs(moved.dx) > 1 || Math.abs(moved.dy) > 1, `space pan did not move viewport: ${JSON.stringify(moved)}`)

    await inRenderer(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', shiftKey: true, bubbles: true })))
    await sleep(60)
    const fitted = await inRenderer(() => {
      const stage = document.querySelector('.canvas-stage')
      const canvas = document.querySelector('.design-canvas')
      if (!(stage instanceof HTMLElement) || !(canvas instanceof HTMLElement)) throw new Error('fit nodes not found')
      const stageRect = stage.getBoundingClientRect()
      const canvasRect = canvas.getBoundingClientRect()
      return { width: canvasRect.width, height: canvasRect.height, stageWidth: stageRect.width, stageHeight: stageRect.height }
    })
    assert.ok(fitted.width <= fitted.stageWidth + 2, `fit page width exceeds viewport: ${JSON.stringify(fitted)}`)
    assert.ok(fitted.height <= fitted.stageHeight + 2, `fit page height exceeds viewport: ${JSON.stringify(fitted)}`)
  })


  await runCase('local review panel creates snapshots and comments', async () => {
    await openBuilderOverflowMenu()
    await inRenderer(() => {
      const menu = document.querySelector('[data-testid="builder-overflow-menu"]')
      const reviewButton = Array.from(menu?.querySelectorAll('button') || []).find(button => button.textContent?.trim() === 'Review')
      if (!(reviewButton instanceof HTMLButtonElement)) throw new Error('Review toolbar button not found')
      reviewButton.click()
    })
    await waitFor(() => inRenderer(() => Boolean(document.querySelector('[data-testid="review-panel"]'))))
    const before = await inRenderer(() => ({
      snapshots: document.querySelectorAll('.review-snapshot').length,
      comments: document.querySelectorAll('.review-comment').length,
      activity: document.querySelectorAll('.review-activity-list li').length,
    }))
    await inRenderer(() => {
      const input = document.querySelector('.review-create-row input')
      const button = document.querySelector('.review-create-row button')
      if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) throw new Error('Review snapshot controls not found')
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      descriptor?.set?.call(input, 'E2E review snapshot')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      button.click()
    })
    await waitFor(() => inRenderer(count => document.querySelectorAll('.review-snapshot').length > count, before.snapshots))
    await inRenderer(() => {
      const textarea = document.querySelector('.review-section textarea')
      const button = document.querySelector('.review-comment-actions button')
      if (!(textarea instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement)) throw new Error('Review comment controls not found')
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
      descriptor?.set?.call(textarea, 'E2E review comment')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await waitFor(() => inRenderer(() => {
      const button = document.querySelector('.review-comment-actions button')
      return button instanceof HTMLButtonElement && !button.disabled
    }))
    await inRenderer(() => {
      const button = document.querySelector('.review-comment-actions button')
      if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('Review comment action is unavailable')
      button.click()
    })
    await waitFor(() => inRenderer(count => document.querySelectorAll('.review-comment').length > count, before.comments))
    const after = await inRenderer(() => ({
      filters: document.querySelectorAll('.review-filter-grid select').length,
      comment: Array.from(document.querySelectorAll('.review-comment p')).some(node => node.textContent === 'E2E review comment'),
      activity: document.querySelectorAll('.review-activity-list li').length,
    }))
    assert.equal(after.filters, 3, 'review diff must expose page, node, and property filters')
    assert.equal(after.comment, true, 'local review comment was not rendered')
    assert.ok(after.activity >= before.activity, 'review actions must be traceable in the panel')
    await inRenderer(() => document.querySelector('.review-panel-header .icon-button')?.click())
    await waitFor(() => inRenderer(() => !document.querySelector('[data-testid="review-panel"]')))
  })

  const browserErrors = await inRenderer(() => window.__codelessE2eErrors || [])
  if (browserErrors.length) rendererErrors.push(...browserErrors.map(error => `browser:${error}`))

  const failed = results.filter(item => item.status === 'failed')
  console.log('\nE2E results:')
  for (const result of results) console.log(`${result.status === 'passed' ? 'PASS' : 'FAIL'} | ${result.name}${result.error ? ` | ${result.error}` : ''}`)
  if (rendererErrors.length) {
    console.error('\n渲染�ㄩ��误：')
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
