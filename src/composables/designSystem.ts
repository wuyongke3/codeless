import type { DesignSystem, DesignTheme, DesignTokenPrimitive } from '../types/lowcode'

export const DEFAULT_DESIGN_SYSTEM: DesignSystem = {
  activeThemeId: 'light',
  themes: [
    {
      id: 'light',
      name: 'Light',
      mode: 'light',
      tokens: {
        colors: {
          primary: '#665cf6',
          secondary: '#687084',
          success: '#20b486',
          warning: '#f59e0b',
          danger: '#e45b70',
          surface: '#ffffff',
          canvas: '#f7f8fb',
          text: '#272b40',
          muted: '#858a9a',
          border: '#e3e5ec',
          primaryMuted: '#eeedff',
        },
        typography: { xs: 11, sm: 13, body: 14, lg: 18, heading: 28 },
        spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
        radii: { sm: 6, md: 10, lg: 14, pill: 999 },
        shadows: {
          none: 'none',
          sm: '0 4px 12px rgba(35, 38, 60, .08)',
          md: '0 10px 24px rgba(35, 38, 60, .12)',
        },
      },
    },
    {
      id: 'dark',
      name: 'Dark',
      mode: 'dark',
      tokens: {
        colors: {
          primary: '#8c84ff',
          secondary: '#aeb4c5',
          success: '#45d0a0',
          warning: '#f8bd55',
          danger: '#f27b8d',
          surface: '#25283a',
          canvas: '#171927',
          text: '#f1f2f7',
          muted: '#b5bacb',
          border: '#454a61',
          primaryMuted: '#39355f',
        },
        typography: { xs: 11, sm: 13, body: 14, lg: 18, heading: 28 },
        spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
        radii: { sm: 6, md: 10, lg: 14, pill: 999 },
        shadows: {
          none: 'none',
          sm: '0 4px 12px rgba(0, 0, 0, .18)',
          md: '0 10px 24px rgba(0, 0, 0, .28)',
        },
      },
    },
  ],
}

function cloneDefaultSystem() {
  return JSON.parse(JSON.stringify(DEFAULT_DESIGN_SYSTEM)) as DesignSystem
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeRecord<T extends Record<string, unknown>>(fallback: T, value: unknown): T {
  return { ...fallback, ...(isRecord(value) ? value : {}) } as T
}

export function normalizeDesignSystem(value?: DesignSystem): DesignSystem {
  const fallback = cloneDefaultSystem()
  if (!value || !Array.isArray(value.themes)) return fallback
  value.themes = value.themes
    .filter(theme => isRecord(theme) && typeof theme.id === 'string')
    .map((theme) => {
      const rawTheme = theme as unknown as Record<string, unknown>
      const themeId = typeof rawTheme.id === 'string' ? rawTheme.id : 'light'
      const fallbackTheme = fallback.themes.find(item => item.id === themeId) || fallback.themes[0]
      const rawTokens = (isRecord(rawTheme.tokens) ? rawTheme.tokens : {}) as Record<string, unknown>
      return {
        id: themeId,
        name: typeof rawTheme.name === 'string' && rawTheme.name.trim() ? rawTheme.name : fallbackTheme.name,
        mode: rawTheme.mode === 'dark' ? 'dark' : 'light',
        tokens: {
          colors: mergeRecord(fallbackTheme.tokens.colors, rawTokens.colors),
          typography: mergeRecord(fallbackTheme.tokens.typography, rawTokens.typography),
          spacing: mergeRecord(fallbackTheme.tokens.spacing, rawTokens.spacing),
          radii: mergeRecord(fallbackTheme.tokens.radii, rawTokens.radii),
          shadows: mergeRecord(fallbackTheme.tokens.shadows, rawTokens.shadows),
        },
      } satisfies DesignTheme
    })
  if (!value.themes.length) value.themes = fallback.themes
  if (!value.themes.some(theme => theme.id === value.activeThemeId)) value.activeThemeId = value.themes[0].id
  return value
}

export function getActiveDesignTheme(system?: DesignSystem): DesignTheme {
  const normalized = normalizeDesignSystem(system)
  return normalized.themes.find(theme => theme.id === normalized.activeThemeId) || normalized.themes[0]
}

export function resolveDesignToken(system: DesignSystem | undefined, reference: string): DesignTokenPrimitive | undefined {
  const normalizedReference = String(reference || '').trim().replace(/^\$/, '')
  if (!normalizedReference) return undefined
  const [rawCategory, ...parts] = normalizedReference.split('.')
  const category = ({ color: 'colors', type: 'typography', space: 'spacing', radius: 'radii', shadow: 'shadows' } as Record<string, string>)[rawCategory] || rawCategory
  const key = parts.join('.')
  if (!key) return undefined
  const theme = getActiveDesignTheme(system)
  const tokens = theme.tokens as unknown as Record<string, Record<string, DesignTokenPrimitive>>
  return tokens[category]?.[key]
}

