/**
 * A server without the physical-placement sub-resource answers 404 (the top-level object patch
 * would answer 200 and drop the group), so 404 means "server too old", not "object gone".
 *
 * @param {Error & { status?: number }} err
 * @returns {string}
 */
export function describePlacementError(err) {
  switch (err?.status) {
    case 404:
      return 'This server does not support placement changes over the web API.'
    case 409:
      return 'That container is inside the object being placed, which would create a loop.'
    case 403:
      return 'You do not have modify access to this object.'
    default:
      return err?.message || 'Placement could not be saved.'
  }
}

/**
 * Passive rack elements (PDU, patch panel) have no backing object and their own endpoints, so for
 * them 404 means the element is gone (typically deleted by someone else).
 *
 * @param {Error & { status?: number }} err
 * @param {{ objectBacked: boolean }} options
 * @returns {string}
 */
export function describeRackElementError(err, { objectBacked }) {
  if (objectBacked) return describePlacementError(err)
  if (err?.status === 404) return 'This rack element no longer exists on the server.'
  return err?.message || 'The rack element could not be saved.'
}
