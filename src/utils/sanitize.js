// For the sinks Vue does not protect: ECharts tooltip formatters (injected as HTML) and `href` /
// `window.open()` targets (bound verbatim, `javascript:` included). Object names, DCI values and
// tool payloads are influenced by users with far less privilege than admin.

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Do not use it on ECharts' own `params.marker`, which is intentional HTML.
 *
 * @param {unknown} value - nullish becomes ''
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

const DEFAULT_SCHEMES = ['http', 'https']

/** Schemes object tools use to launch an external client; the OS protocol handler takes over. */
export const REMOTE_ACCESS_SCHEMES = ['ssh', 'telnet', 'rdp', 'vnc', 'sftp', 'ftp']

/**
 * Rejects `javascript:`, `data:` / `blob:`, and relative URLs: these sinks only open external
 * targets.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string[]} [options.extraSchemes] - without the ':'
 * @returns {boolean}
 */
export function isSafeExternalUrl(url, { extraSchemes = [] } = {}) {
  if (typeof url !== 'string' || url.trim() === '') return false

  let parsed
  try {
    parsed = new URL(url.trim())
  } catch {
    return false
  }

  const scheme = parsed.protocol.replace(/:$/, '')
  return [...DEFAULT_SCHEMES, ...extraSchemes].includes(scheme)
}
