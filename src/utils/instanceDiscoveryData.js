// Packs `instanceDiscoveryData` the way the legacy client does (`InstanceDiscovery.java`). Text is
// kept as typed (the form writes on every keystroke); only emptiness is judged trimmed.

/** Discovery methods whose data is `table` or `table:instanceColumn`. */
export const TABLE_DISCOVERY_METHODS = new Set(['agentTable', 'internalTable'])

/**
 * The column follows the last colon: table names may contain one.
 *
 * @param {string} data
 * @returns {{ table: string, column: string }}
 */
export function parseTableDiscoveryData(data) {
  const value = data ?? ''
  const i = value.lastIndexOf(':')
  return i === -1
    ? { table: value, column: '' }
    : { table: value.slice(0, i), column: value.slice(i + 1) }
}

/**
 * @param {{ table: string, column: string }} parts
 * @returns {string}
 */
export function formatTableDiscoveryData({ table, column }) {
  const t = table ?? ''
  const c = column ?? ''
  return c.trim() ? `${t}:${c}` : t
}

/**
 * `pattern;keyAttributes;nameFormat`, the last two optional.
 *
 * @param {string} data
 * @returns {{ pattern: string, keys: string, format: string }}
 */
export function parseOtlpDiscoveryData(data) {
  const value = data ?? ''
  const first = value.indexOf(';')
  if (first === -1) return { pattern: value, keys: '', format: '' }
  const second = value.indexOf(';', first + 1)
  return second === -1
    ? { pattern: value.slice(0, first), keys: value.slice(first + 1), format: '' }
    : {
        pattern: value.slice(0, first),
        keys: value.slice(first + 1, second),
        format: value.slice(second + 1),
      }
}

/**
 * @param {{ pattern: string, keys: string, format: string }} parts
 * @returns {string}
 */
export function formatOtlpDiscoveryData({ pattern, keys, format }) {
  const k = keys ?? ''
  const f = format ?? ''
  let result = pattern ?? ''
  if (k.trim() || f.trim()) result += `;${k}`
  if (f.trim()) result += `;${f}`
  return result
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function parseOtlpKeyList(text) {
  return (text ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

/**
 * The format legacy offers once key attributes are chosen, e.g. `%{host}:%{port}`.
 *
 * @param {string[]} keys
 * @returns {string}
 */
export function defaultOtlpNameFormat(keys) {
  return keys.map((k) => `%{${k}}`).join(':')
}
