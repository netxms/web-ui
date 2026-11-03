import { describe, it, expect, afterEach } from 'vitest'
import { brand } from '@/brands'
import { THEMES, DEFAULT_THEME_ID, resolveThemeId, applyThemeVars } from '@/themes'

describe('theme defaults', () => {
  it('serves the active brand themes', () => {
    expect(THEMES).toBe(brand.themes)
  })

  it('defaults to flame', () => {
    expect(DEFAULT_THEME_ID).toBe('flame')
  })

  it('names a theme that exists in the registry', () => {
    expect(THEMES[DEFAULT_THEME_ID]).toBeDefined()
  })

  // Flame is a dark-header theme; applyThemeVars depends on these being present.
  it('carries the structural header variables', () => {
    expect(THEMES[DEFAULT_THEME_ID].vars['--app-header-bg']).toBeDefined()
    expect(THEMES[DEFAULT_THEME_ID].vars['--app-nav-bg']).toBeDefined()
  })
})

describe('resolveThemeId', () => {
  it('keeps an id the brand offers', () => {
    expect(resolveThemeId('ocean')).toBe('ocean')
  })

  it('falls back to the default for an id saved by another brand or an older build', () => {
    expect(resolveThemeId('jade')).toBe(DEFAULT_THEME_ID)
    expect(resolveThemeId('toString')).toBe(DEFAULT_THEME_ID)
    expect(resolveThemeId(null)).toBe(DEFAULT_THEME_ID)
    expect(resolveThemeId(undefined)).toBe(DEFAULT_THEME_ID)
  })
})

describe('applyThemeVars', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('clears the nav-active colors a previous theme set', () => {
    document.documentElement.style.setProperty('--app-nav-active-bg', '#c4b5fd')
    document.documentElement.style.setProperty('--app-nav-active-fg', '#2e1065')
    applyThemeVars('emerald')
    expect(document.documentElement.style.getPropertyValue('--app-nav-active-bg')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--app-nav-active-fg')).toBe('')
  })
})
