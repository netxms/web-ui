// The server stores colors as 0x00BBGGRR integers (red in the low byte). Configs carry them as
// '0x' + toHexString(int), without leading zeroes: '0x8000' is green. Always parse to an
// integer and swap the bytes; never paste the digits onto '#'.

/**
 * @param {number} n
 * @returns {string}
 */
export function bgrIntToHex(n) {
  const r = n & 0xff
  const g = (n >> 8) & 0xff
  const b = (n >> 16) & 0xff
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}

/**
 * Null for the "use default" sentinel 0xFFFFFFFF.
 * @param {number | null} n
 * @returns {string | null}
 */
export function safeBgrIntToHex(n) {
  if (n == null || n === 4294967295) return null
  return bgrIntToHex(n)
}

/**
 * @param {string} hex
 * @returns {number}
 */
export function hexToBgrInt(hex) {
  const h = expandHex(String(hex).replace('#', ''))
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return r | (g << 8) | (b << 16)
}

function expandHex(h) {
  return h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h
}

/**
 * Everything but the '#' form is a BGR integer: '0x...', bare hex, decimal or a number.
 * @param {string | number | null | undefined} value
 * @returns {string | null}
 */
export function parseConfigColor(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? bgrIntToHex(value) : null

  const s = String(value).trim()
  if (s === '' || s.toLowerCase() === 'auto') return null
  // A '#' value came from this app's color pickers.
  if (s.startsWith('#')) return s.toLowerCase()
  if (/^0x[0-9a-f]+$/i.test(s)) return bgrIntToHex(parseInt(s.slice(2), 16))
  // Bare digits: six characters or any a-f digit means hex, as legacy configs write it.
  if (/^[0-9a-f]{1,6}$/i.test(s) && (s.length === 6 || /[a-f]/i.test(s))) {
    return bgrIntToHex(parseInt(s, 16))
  }
  if (/^-?\d+$/.test(s)) return bgrIntToHex(parseInt(s, 10))
  return null
}

/**
 * Unlike legacy, keeps the leading zeroes; every reader tolerates them.
 * @param {string | null} cssHex
 * @returns {string | null}
 */
export function toApiColor(cssHex) {
  if (!cssHex) return null
  const s = String(cssHex).trim().replace(/^#/, '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return null
  return '0x' + hexToBgrInt(s).toString(16).toUpperCase().padStart(6, '0')
}
