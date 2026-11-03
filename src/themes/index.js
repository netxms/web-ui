import { brand } from '@/brands'

/**
 * Themes of the active brand, keyed by id: `id`, `label`, `swatch` (any CSS background),
 * `palette` (50-950 primary scale), `preset` (for the first paint), `headerTone`
 * ('dark' | 'light', picks the header logo) and optional `vars` (STRUCTURAL_VARS values).
 */
export const THEMES = brand.themes

export const DEFAULT_THEME_ID = brand.defaultTheme

const STRUCTURAL_VARS = [
  '--app-header-bg',
  '--app-header-fg',
  '--app-header-border',
  '--app-nav-bg',
  '--app-nav-border',
  '--app-nav-fg',
  '--app-nav-active-bg',
  '--app-nav-active-fg',
]

/**
 * Falls back to the default for an id this brand does not offer.
 *
 * @param {string|null|undefined} id
 * @returns {string}
 */
export function resolveThemeId(id) {
  return id && Object.hasOwn(THEMES, id) ? id : DEFAULT_THEME_ID
}

/**
 * Sets or removes a theme's structural CSS custom properties on <html>.
 *
 * @param {string} themeId
 */
export function applyThemeVars(themeId) {
  const t = THEMES[themeId] ?? THEMES[DEFAULT_THEME_ID]
  const root = document.documentElement
  for (const key of STRUCTURAL_VARS) {
    if (t.vars?.[key]) root.style.setProperty(key, t.vars[key])
    else root.style.removeProperty(key)
  }
}

export const THEME_PICKER_ENABLED = import.meta.env.VITE_THEME_PICKER !== 'false'
