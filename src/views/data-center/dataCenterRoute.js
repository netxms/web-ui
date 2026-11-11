import { objectTarget } from '@/utils/routeTargets'

/** Route name of the dev-only Data Center perspective; release builds have no such route. */
export const DATA_CENTER_ROUTE = 'data-center'

/**
 * An object in the Data Center perspective. Not in `routeTargets.js`: its classes open in
 * Infrastructure everywhere else.
 *
 * @param {{ id: number|string, class?: string }} object
 * @param {string} [viewId]
 */
export function dataCenterTarget(object, viewId) {
  return objectTarget(object, viewId, { perspective: DATA_CENTER_ROUTE })
}
