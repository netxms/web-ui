// Dev Lab typography override (dev builds only): inline styles on <html> beat main.css and a
// brand's `html:root`. Google Fonts loads only in dev; the deployed CSP allows `font-src 'self'`.
import { prefs } from '@/utils/appStorage'

const STORAGE_FIELD = 'devLab.typography'

// Arimo is metric-compatible with Arial: what Linux renders when no listed face is installed.
export const UI_FONTS = [
  'Inter',
  'Roboto',
  'IBM Plex Sans',
  'Source Sans 3',
  'Noto Sans',
  'Open Sans',
  'Lato',
  'Public Sans',
  'Geist',
  'Figtree',
  'DM Sans',
  'Manrope',
  'Fira Sans',
  'Barlow',
  'Atkinson Hyperlegible Next',
  'Arimo',
]

export const MONO_FONTS = [
  'JetBrains Mono',
  'IBM Plex Mono',
  'Fira Code',
  'Source Code Pro',
  'Roboto Mono',
  'Geist Mono',
]

export const FONT_SIZES = [13, 14, 15, 16]

const PROPERTY = { ui: '--app-font-family', mono: '--font-mono', size: '--app-font-size' }

/** Google Fonts leaves out the weights a family lacks. */
const WEIGHTS = '400;500;600;700'

/**
 * '' when it cannot be a family name; the charset check also keeps it safe inside a CSS string.
 *
 * @param {*} input
 * @returns {string}
 */
export function normalizeFamily(input) {
  if (typeof input !== 'string') return ''
  const family = input.trim().replace(/\s+/g, ' ')
  return /^[A-Za-z0-9 ]+$/.test(family) ? family : ''
}

/**
 * @param {string} family
 * @returns {string}
 */
export function googleFontsHref(family) {
  const name = encodeURIComponent(family).replace(/%20/g, '+')
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${WEIGHTS}&display=swap`
}

/**
 * The generic fallback, not the shipped stack, makes missing glyphs visibly different.
 *
 * @param {string} family
 * @param {'ui'|'mono'} kind
 */
export function fontStack(family, kind) {
  return `'${family}', ${kind === 'mono' ? 'monospace' : 'sans-serif'}`
}

/** family -> Promise<boolean> */
const loads = new Map()

/**
 * @param {string} family
 * @returns {Promise<boolean>} false when Google Fonts has no such family (or no regular face)
 */
export function loadFont(family) {
  if (!loads.has(family)) {
    loads.set(
      family,
      new Promise((resolve) => {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = googleFontsHref(family)
        link.dataset.devFont = family
        link.onload = () => resolve(true)
        link.onerror = () => {
          link.remove()
          resolve(false)
        }
        document.head.append(link)
      }),
    )
  }
  return loads.get(family)
}

function familyList(value) {
  return Array.isArray(value) ? [...new Set(value.map(normalizeFamily).filter(Boolean))] : []
}

/** `ui`, `mono` and `size` are null when the shipped value applies. */
export function readTypography() {
  const saved = prefs.get(STORAGE_FIELD, {}) ?? {}
  return {
    ui: normalizeFamily(saved.ui) || null,
    mono: normalizeFamily(saved.mono) || null,
    size: FONT_SIZES.includes(saved.size) ? saved.size : null,
    extraUi: familyList(saved.extraUi),
    extraMono: familyList(saved.extraMono),
  }
}

export function saveTypography(typography) {
  const { ui, mono, size, extraUi, extraMono } = typography
  if (ui || mono || size || extraUi.length || extraMono.length) {
    prefs.set(STORAGE_FIELD, { ui, mono, size, extraUi, extraMono })
  } else {
    prefs.remove(STORAGE_FIELD)
  }
}

function setOverride(property, value) {
  const style = document.documentElement.style
  if (value) {
    style.setProperty(property, value)
  } else {
    style.removeProperty(property)
  }
}

export function applyTypography(typography) {
  const { ui, mono, size } = typography
  setOverride(PROPERTY.ui, ui && fontStack(ui, 'ui'))
  setOverride(PROPERTY.mono, mono && fontStack(mono, 'mono'))
  setOverride(PROPERTY.size, size && `${size}px`)
  if (ui) loadFont(ui)
  if (mono) loadFont(mono)
}

export function restoreTypography() {
  applyTypography(readTypography())
}

/**
 * What the property resolves to without the override.
 *
 * @param {'ui'|'mono'|'size'} field
 * @returns {string}
 */
export function shippedValue(field) {
  const property = PROPERTY[field]
  const style = document.documentElement.style
  const override = style.getPropertyValue(property)
  style.removeProperty(property)
  const value = getComputedStyle(document.documentElement).getPropertyValue(property).trim()
  if (override) style.setProperty(property, override)
  return value
}
