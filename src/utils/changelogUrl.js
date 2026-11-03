const CHANGELOG_BASE = 'https://netxms.github.io/changelog'

/**
 * Legacy truncation: stop at the first '-' (`7.0.0-rc372`) or the third '.' (`5.2.0.1234`).
 *
 * @param {string|null|undefined} version
 * @returns {string|null}
 */
export function reduceVersion(version) {
  if (typeof version !== 'string') return null

  const trimmed = version.trim()
  let dots = 0
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '-') return trimmed.slice(0, i)
    if (ch === '.' && ++dots === 3) return trimmed.slice(0, i)
  }
  return trimmed
}

/**
 * Requires three numeric components: legacy links `5_2.html` for two, a page that does not exist.
 *
 * @param {string|null|undefined} version
 * @returns {string|null}
 */
export function changelogUrl(version) {
  const reduced = reduceVersion(version)
  if (reduced === null || !/^\d+\.\d+\.\d+$/.test(reduced)) return null
  return `${CHANGELOG_BASE}/${reduced.replaceAll('.', '_')}.html`
}
