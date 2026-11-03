/**
 * 94230 -> '1d 2h', 3900 -> '1h 5m', 90 -> '1m', 30 -> '<1m'; days only from 10 days ('609d').
 * @param {number} seconds
 * @returns {string}
 */
export function formatDurationCompact(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  if (seconds < 60) return '<1m'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days >= 10) return `${days}d`
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

/**
 * Null when the input is not a usable date. A future timestamp clamps to 0 (clock skew).
 * @param {string|number|Date|null|undefined} value
 * @param {number} [now] - epoch ms
 * @returns {number|null}
 */
export function secondsSince(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return null
  const ms = new Date(value).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, (now - ms) / 1000)
}

/**
 * '40s ago' / '2m ago' / '3h 12m ago' / '4d 6h ago': second precision under a minute.
 * @param {string|number|Date|null|undefined} value
 * @param {number} [now] - epoch ms
 * @returns {string} empty when the timestamp is missing or unparseable
 */
export function formatAgeCompact(value, now = Date.now()) {
  const seconds = secondsSince(value, now)
  if (seconds === null) return ''
  if (seconds < 60) return `${Math.floor(seconds)}s ago`
  return `${formatDurationCompact(seconds)} ago`
}

/**
 * ISO 8601 to second precision, UTC (`2026-09-01T10:27:08Z`). Older servers' `ParseTimestamp`
 * needs the `Z` right after the seconds, so a `.000` makes the request fail with "Invalid filter
 * definition". A string, not a UNIX integer: the server converts seconds to ms for
 * `LC_TIMESTAMP_MS` columns only on the string path.
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {string|null} null when the input is missing or unparseable
 */
export function toApiTimestamp(value) {
  const date = toDate(value)
  if (date === null) return null
  return `${date.toISOString().slice(0, 19)}Z`
}

/**
 * @param {string|number|Date|null|undefined} value
 * @param {boolean} [unixSeconds] - treat a number as epoch seconds rather than ms
 * @returns {Date|null}
 */
function toDate(value, unixSeconds = false) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  const date = new Date(unixSeconds && typeof value === 'number' ? value * 1000 : value)
  return Number.isFinite(date.getTime()) ? date : null
}

/**
 * Locale date+time, or null when the input is missing or unparseable.
 * @param {string|number|Date|null|undefined} value
 * @param {object} [options]
 * @param {boolean} [options.unixSeconds] - input is epoch seconds
 * @returns {string|null}
 */
export function formatDateTime(value, { unixSeconds = false } = {}) {
  const date = toDate(value, unixSeconds)
  return date ? date.toLocaleString() : null
}

/**
 * "13 Aug, 02:30 PM" in en-US; the locale follows the browser.
 *
 * @param {string|number|Date|null|undefined} value
 * @param {object} [options]
 * @param {string} [options.fallback='-'] - returned when the timestamp is missing
 * @param {boolean} [options.unixSeconds] - input is epoch seconds
 * @returns {string}
 */
export function formatDateTimeShort(value, { fallback = '-', unixSeconds = false } = {}) {
  const date = toDate(value, unixSeconds)
  if (!date) return fallback
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * "13 Aug 2026" in en-GB, "Aug 13, 2026" in en-US.
 *
 * @param {string|number|Date|null|undefined} value
 * @param {object} [options]
 * @param {string} [options.fallback='-']
 * @param {boolean} [options.unixSeconds]
 * @returns {string}
 */
export function formatDateMedium(value, { fallback = '-', unixSeconds = false } = {}) {
  const date = toDate(value, unixSeconds)
  if (!date) return fallback
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

/**
 * Medium date with a time.
 *
 * @param {string|number|Date|null|undefined} value
 * @param {object} [options]
 * @param {string} [options.fallback='-']
 * @param {'short'|'medium'} [options.timeStyle='short'] - 'medium' adds seconds
 * @param {boolean} [options.unixSeconds]
 * @returns {string}
 */
export function formatDateTimeMedium(
  value,
  { fallback = '-', timeStyle = 'short', unixSeconds = false } = {},
) {
  const date = toDate(value, unixSeconds)
  if (!date) return fallback
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle }).format(date)
}

/**
 * Time only, for a run that happened within the session the user is watching.
 *
 * @param {string|number|Date|null|undefined} value
 * @param {object} [options]
 * @param {string} [options.fallback='-']
 * @param {boolean} [options.unixSeconds]
 * @returns {string}
 */
export function formatTimeShort(value, { fallback = '-', unixSeconds = false } = {}) {
  const date = toDate(value, unixSeconds)
  if (!date) return fallback
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(date)
}

/**
 * Down to the second, for collected values where two samples can share a minute.
 *
 * @param {string|number|Date|null|undefined} value
 * @param {object} [options]
 * @param {string} [options.fallback='-']
 * @param {boolean} [options.unixSeconds]
 * @returns {string}
 */
export function formatDateTimeWithSeconds(value, { fallback = '-', unixSeconds = false } = {}) {
  const date = toDate(value, unixSeconds)
  if (!date) return fallback
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}
