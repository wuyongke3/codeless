import { computed, onBeforeUnmount, onMounted, reactive, watch, type ComputedRef } from 'vue'

export type AppTheme = 'system' | 'light' | 'dark'
export type AppFontSize = 'small' | 'medium' | 'large'

export interface AppPreferences {
  theme: AppTheme
  fontSize: AppFontSize
  reducedMotion: boolean
}

export interface AppPreferencesController {
  preferences: AppPreferences
  resolvedTheme: ComputedRef<'light' | 'dark'>
  reset: () => void
}

const storageKey = 'codeless-app-preferences'
const defaults: AppPreferences = { theme: 'system', fontSize: 'medium', reducedMotion: false }

function readPreferences(): AppPreferences {
  if (typeof window === 'undefined') return { ...defaults }
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as Partial<AppPreferences>
    return {
      theme: saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system' ? saved.theme : defaults.theme,
      fontSize: saved.fontSize === 'small' || saved.fontSize === 'large' || saved.fontSize === 'medium' ? saved.fontSize : defaults.fontSize,
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
    root.dataset.fontSize = preferences.fontSize
    root.dataset.reducedMotion = String(preferences.reducedMotion)
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
