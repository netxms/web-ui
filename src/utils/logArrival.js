// `useLogLiveTail` stamps accepted rows with `arrivedAt`; the seed gets `null` so it does not
// flash on mount.

// Shorter than the poll interval, so the highlight always means "this batch".
export const ARRIVAL_HIGHLIGHT_MS = 1500

/**
 * Not reactive on purpose: a row renders when it arrives, and by any later re-render it has
 * aged out, so nothing has to clear the stamp.
 *
 * @param {object} row
 * @returns {boolean}
 */
export function isArriving(row) {
  return row?.arrivedAt != null && Date.now() - row.arrivedAt < ARRIVAL_HIGHLIGHT_MS
}
