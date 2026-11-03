/** Legacy `AbstractObject.CONTEXT`: "the object this dashboard is shown for". */
export const CONTEXT_OBJECT_ID = 0xffffffff

/** @param {unknown} objectId */
export function isContextObjectId(objectId) {
  return Number(objectId) === CONTEXT_OBJECT_ID
}

/**
 * Legacy `ElementWidget.getEffectiveObjectId`.
 *
 * @param {unknown} objectId - a config field, possibly a string or null
 * @param {number|null|undefined} contextObjectId
 * @returns {number}
 */
export function resolveContextObjectId(objectId, contextObjectId) {
  const id = Number(objectId)
  if (!Number.isFinite(id)) return 0
  if (id === CONTEXT_OBJECT_ID) return Number(contextObjectId) || 0
  return id
}
