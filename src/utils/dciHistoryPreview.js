/**
 * The history window a Live Data row expands into: the last day, or for a DCI that has
 * collected nothing for longer than that, the day ending at its last collected value.
 */

export const PREVIEW_RANGE_SECONDS = 24 * 60 * 60

// The server reports a DCI that never collected anything with an epoch timestamp.
const NEVER_COLLECTED_BEFORE = Date.UTC(1971, 0, 1)

/**
 * Unix seconds, or null if it never collected. Rounded up: the server compares in
 * milliseconds, so rounding down would leave the anchoring value outside the window.
 *
 * @param {string|null|undefined} timestamp - the DCI's last poll, as current values report it
 * @returns {number|null}
 */
export function lastCollectedAt(timestamp) {
  const parsed = Date.parse(timestamp ?? '')
  if (Number.isNaN(parsed) || parsed < NEVER_COLLECTED_BEFORE) return null
  return Math.ceil(parsed / 1000)
}

/**
 * null for "now".
 *
 * @param {string|null|undefined} timestamp - the DCI's last poll
 * @param {number} [now] - Unix seconds
 * @returns {number|null}
 */
export function previewWindowEnd(timestamp, now = Math.floor(Date.now() / 1000)) {
  const last = lastCollectedAt(timestamp)
  return last != null && last < now - PREVIEW_RANGE_SECONDS ? last : null
}
