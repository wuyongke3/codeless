export interface DesignerPersistenceScheduler {
  schedule: (flushHistory: () => void, isDirty: () => boolean) => void
  clear: () => void
}

function getStorage() {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

export function readDesignerPanelWidth(key: string, fallback: number, min: number, max: number) {
  const storage = getStorage()
  if (!storage) return fallback
  try {
    const value = Number(storage.getItem(key))
    return Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback
  } catch {
    return fallback
  }
}

export function saveDesignerPanelWidth(key: string, value: number) {
  try { getStorage()?.setItem(key, String(value)) } catch { /* localStorage may be unavailable. */ }
}

export function designerPanelWidthLimits(side: 'component' | 'inspector') {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
  const min = side === 'component' ? 170 : 220
  const desktopMax = side === 'component' ? 360 : 420
  const ratio = side === 'component'
    ? viewportWidth <= 900 ? 0.23 : 0.28
    : viewportWidth <= 900 ? 0.28 : 0.32
  return { min, max: Math.max(min, Math.min(desktopMax, Math.floor(viewportWidth * ratio))) }
}

export function readDesignerBooleanSetting(key: string) {
  try { return getStorage()?.getItem(key) === '1' } catch { return false }
}

export function saveDesignerBooleanSetting(key: string, value: boolean) {
  try { getStorage()?.setItem(key, value ? '1' : '0') } catch { /* localStorage may be unavailable. */ }
}

export function createDesignerPersistence(options: {
  saveProject: (message?: string) => Promise<void>
  message?: string
  delayMs?: number
}): DesignerPersistenceScheduler {
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  const delayMs = options.delayMs ?? 1200

  function clear() {
    if (autoSaveTimer === null) return
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  function schedule(flushHistory: () => void, isDirty: () => boolean) {
    clear()
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      flushHistory()
      if (isDirty()) void options.saveProject(options.message || '自动保存')
    }, delayMs)
  }

  return { schedule, clear }
}
