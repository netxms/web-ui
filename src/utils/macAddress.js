// A MAC search turns a client-side palette filter into a server call, so detection is strict:
// separated input needs a full OUI (6 digits), bare input all 12, since ordinary words are often
// valid hex ("decade", "deadbeef"). A `mac:` prefix forces the mode for anything shorter.

const MAC_QUERY_PREFIX = 'mac:'

const FULL_MAC_HEX_DIGITS = 12

const MIN_SEPARATED_HEX_DIGITS = 6

const SEPARATORS = /[:.-]/

const HEX_ONLY = /^[0-9a-f]+$/i

// Checking group widths, not just stripping separators, is what keeps `192.168.1.1` out.
const NOTATIONS = {
  ':': { maxGroups: 6, width: 2 },
  '-': { maxGroups: 6, width: 2 },
  // Cisco: 001a.2b3c.4d5e
  '.': { maxGroups: 3, width: 4 },
}

/**
 * @typedef {object} MacQuery
 * @property {boolean} isMac
 * @property {string} normalized - uppercase colon-separated pairs, the server's own notation
 * @property {number} hexDigits
 * @property {boolean} isPartial - fewer than 12 digits, so a prefix search
 * @property {boolean} forced - the `mac:` prefix was used
 */

/**
 * @param {string} text - raw palette input
 * @returns {MacQuery}
 */
export function parseMacQuery(text) {
  const miss = { isMac: false, normalized: '', hexDigits: 0, isPartial: false, forced: false }

  const shape = readMacShape(text)
  if (!shape) return miss

  const { digits, separator, forced } = shape
  if (digits === null) return { ...miss, forced }

  const threshold = separator === '' ? FULL_MAC_HEX_DIGITS : MIN_SEPARATED_HEX_DIGITS
  if (!forced && digits.length < threshold) return { ...miss, forced }

  return {
    isMac: true,
    normalized: toColonPairs(digits),
    hexDigits: digits.length,
    isPartial: digits.length < FULL_MAC_HEX_DIGITS,
    forced,
  }
}

/**
 * Is `text` still an edit of the searched address (a digit prefix in either direction)? Lets the
 * palette keep MAC results while the address is adjusted; length thresholds do not apply, since
 * a shortened address falls below them by definition.
 *
 * @param {string} text - raw palette input
 * @param {string} normalized - in any notation
 * @returns {boolean}
 */
export function isMacRefinementOf(text, normalized) {
  const typed = macQueryDigits(text)
  const searched = macQueryDigits(normalized)
  if (!typed || !searched) return false
  return typed.startsWith(searched) || searched.startsWith(typed)
}

/**
 * @param {string} text
 * @returns {string|null}
 */
function macQueryDigits(text) {
  return readMacShape(text)?.digits ?? null
}

/**
 * Null for empty input; `digits: null` for text that is not MAC-shaped, so `forced` survives.
 *
 * @param {string} text
 * @returns {{digits: string|null, separator: string, forced: boolean}|null}
 */
function readMacShape(text) {
  const raw = (text ?? '').trim()
  if (!raw) return null

  const forced = raw.toLowerCase().startsWith(MAC_QUERY_PREFIX)
  const body = (forced ? raw.slice(MAC_QUERY_PREFIX.length) : raw).trim()
  const nothing = { digits: null, separator: '', forced }
  if (!body) return nothing

  const separator = findSeparator(body)
  if (separator === null) return nothing

  const digits = separator === '' ? body : joinGroups(body, separator)
  if (digits === null || !HEX_ONLY.test(digits)) return nothing
  if (digits.length > FULL_MAC_HEX_DIGITS) return nothing

  return { digits, separator, forced }
}

/**
 * `''` for none, null when separators are mixed.
 *
 * @param {string} body
 * @returns {string|null}
 */
function findSeparator(body) {
  const used = new Set(body.split('').filter((char) => SEPARATORS.test(char)))
  if (used.size === 0) return ''
  if (used.size > 1) return null
  return [...used][0]
}

/**
 * @param {string} body
 * @param {string} separator
 * @returns {string|null}
 */
function joinGroups(body, separator) {
  const { maxGroups, width } = NOTATIONS[separator]
  const groups = body.split(separator)

  // A just-typed trailing separator ("00:50:56:") is mid-typing, not malformed; only one, only
  // at the end.
  if (groups.length > 1 && groups.at(-1) === '') groups.pop()

  if (groups.length > maxGroups) return null

  for (const [index, group] of groups.entries()) {
    // Only the final group may be short: it is still being typed.
    const isLast = index === groups.length - 1
    if (group.length === 0) return null
    if (group.length > width) return null
    if (group.length < width && !isLast) return null
  }
  return groups.join('')
}

/**
 * The server's own notation, so it round-trips through its parser.
 *
 * @param {string} digits
 */
function toColonPairs(digits) {
  return (digits.toUpperCase().match(/.{1,2}/g) ?? []).join(':')
}
