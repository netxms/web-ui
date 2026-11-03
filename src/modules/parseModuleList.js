/**
 * `' alpha , ,alpha'` reads as `['alpha']`. Shared by the build plugin (Node) and the runtime
 * registry (browser), so it imports nothing.
 *
 * @param {string|undefined} value
 * @returns {string[]}
 */
export function parseModuleList(value) {
  const ids = String(value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return [...new Set(ids)]
}
