import { computed, onBeforeUnmount, onMounted, reactive, watch, type ComputedRef } from 'vue'

export type AppTheme = 'system' | 'light' | 'dark'

export interface AppPreferences {
  theme: AppTheme
  /** Global application typography size in CSS pixels. */
  fontSize: number
  reducedMotion: boolean
}

export interface AppPreferencesController {
  preferences: AppPreferences
  resolvedTheme: ComputedRef<'light' | 'dark'>
  reset: () => void
}

export const APP_FONT_SIZE_MIN = 12
export const APP_FONT_SIZE_MAX = 20
export const APP_FONT_SIZE_STEP = 1
export const APP_FONT_SIZE_DEFAULT = 14

const storageKey = 'codeless-app-preferences'
const defaults: AppPreferences = { theme: 'system', fontSize: APP_FONT_SIZE_DEFAULT, reducedMotion: false }

function normalizeFontSize(value: unknown): number {
  // Keep settings created by older builds working while migrating from presets.
  if (value === 'small') return 12
  if (value === 'medium') return APP_FONT_SIZE_DEFAULT
  if (value === 'large') return 17
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return defaults.fontSize
  return Math.min(APP_FONT_SIZE_MAX, Math.max(APP_FONT_SIZE_MIN, Math.round(parsed)))
}

function readPreferences(): AppPreferences {
  if (typeof window === 'undefined') return { ...defaults }
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as Partial<AppPreferences> & { fontSize?: unknown }
    return {
      theme: saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system' ? saved.theme : defaults.theme,
      fontSize: normalizeFontSize(saved.fontSize),
      reducedMotion: Boolean(saved.reducedMotion),
    }
  } catch {
    return { ...defaults }
  }
}

export function useAppPreferences(): AppPreferencesController {
  const preferences = reactive<AppPreferences>(readPreferences())
  const prefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const resolvedTheme = computed<'light' | 'dark'>(() => preferences.theme === 'system' ? (prefersDark() ? 'dark' : 'light') : preferences.theme)

  function apply() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.theme = resolvedTheme.value
    root.dataset.fontSize = String(preferences.fontSize)
    root.dataset.reducedMotion = String(preferences.reducedMotion)
    root.style.setProperty('--app-font-size', `${preferences.fontSize}px`)
    root.style.setProperty('--app-font-scale', String(preferences.fontSize / APP_FONT_SIZE_DEFAULT))
  }

  function persist() {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(preferences))
    } catch {
      // Preferences are non-critical; private browsing or a constrained host may deny storage.
    }
  }

  function reset() {
    Object.assign(preferences, defaults)
  }

  let mediaQuery: MediaQueryList | undefined
  const syncSystemTheme = () => apply()

  watch(preferences, () => {
    apply()
    persist()
  }, { deep: true, immediate: true })

  onMounted(() => {
    mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
    mediaQuery?.addEventListener?.('change', syncSystemTheme)
    apply()
  })
  onBeforeUnmount(() => mediaQuery?.removeEventListener?.('change', syncSystemTheme))

  return { preferences, resolvedTheme, reset }
}
