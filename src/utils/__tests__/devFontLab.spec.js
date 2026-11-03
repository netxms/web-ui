import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prefs } from '@/utils/appStorage'
import {
  normalizeFamily,
  googleFontsHref,
  fontStack,
  readTypography,
  saveTypography,
  applyTypography,
  loadFont,
  shippedValue,
} from '@/utils/devFontLab'

const root = document.documentElement

const EMPTY = { ui: null, mono: null, size: null, extraUi: [], extraMono: [] }

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  root.removeAttribute('style')
  document.head.querySelectorAll('[data-dev-font], style[data-test]').forEach((el) => el.remove())
})

describe('normalizeFamily', () => {
  it('tidies whitespace', () => {
    expect(normalizeFamily('  IBM   Plex  Sans ')).toBe('IBM Plex Sans')
  })

  it('rejects anything that cannot be a family name', () => {
    expect(normalizeFamily("Inter'; color: red")).toBe('')
    expect(normalizeFamily('')).toBe('')
    expect(normalizeFamily(null)).toBe('')
  })
})

describe('googleFontsHref', () => {
  it('encodes spaces as + and asks for the weights the UI uses', () => {
    expect(googleFontsHref('Source Sans 3')).toBe(
      'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap',
    )
  })
})

describe('fontStack', () => {
  it('falls back to the generic family of its kind', () => {
    expect(fontStack('Inter', 'ui')).toBe("'Inter', sans-serif")
    expect(fontStack('Fira Code', 'mono')).toBe("'Fira Code', monospace")
  })
})

describe('readTypography / saveTypography', () => {
  it('reads nothing as the shipped values', () => {
    expect(readTypography()).toEqual(EMPTY)
  })

  it('round-trips a saved override', () => {
    const typography = { ...EMPTY, ui: 'Inter', size: 15, extraMono: ['Victor Mono'] }
    saveTypography(typography)
    expect(readTypography()).toEqual(typography)
  })

  it('drops stored values it cannot use', () => {
    prefs.set('devLab.typography', {
      ui: 'bad"name',
      mono: 42,
      size: 99,
      extraUi: ['Rubik', 'Rubik', '', 'x;y'],
      extraMono: 'not a list',
    })
    expect(readTypography()).toEqual({ ...EMPTY, extraUi: ['Rubik'] })
  })

  it('removes the field once nothing is overridden', () => {
    saveTypography({ ...EMPTY, ui: 'Inter' })
    saveTypography(EMPTY)
    expect(prefs.read()).not.toHaveProperty('devLab.typography')
  })
})

describe('applyTypography', () => {
  it('overrides the tokens on <html> and restores them when cleared', () => {
    applyTypography({ ...EMPTY, ui: 'Inter', mono: 'Fira Code', size: 15 })
    expect(root.style.getPropertyValue('--app-font-family')).toBe("'Inter', sans-serif")
    expect(root.style.getPropertyValue('--font-mono')).toBe("'Fira Code', monospace")
    expect(root.style.getPropertyValue('--app-font-size')).toBe('15px')

    applyTypography(EMPTY)
    expect(root.style.getPropertyValue('--app-font-family')).toBe('')
    expect(root.style.getPropertyValue('--font-mono')).toBe('')
    expect(root.style.getPropertyValue('--app-font-size')).toBe('')
  })
})

describe('loadFont', () => {
  it('requests each family stylesheet once', () => {
    loadFont('Manrope')
    loadFont('Manrope')
    const links = document.head.querySelectorAll('link[data-dev-font="Manrope"]')
    expect(links).toHaveLength(1)
    expect(links[0].href).toBe(googleFontsHref('Manrope'))
  })
})

describe('shippedValue', () => {
  it('reads past the override and leaves it in place', () => {
    const style = document.createElement('style')
    style.dataset.test = ''
    style.textContent = ':root { --app-font-size: 14px; }'
    document.head.append(style)
    root.style.setProperty('--app-font-size', '16px')

    expect(shippedValue('size')).toBe('14px')
    expect(root.style.getPropertyValue('--app-font-size')).toBe('16px')
  })
})
