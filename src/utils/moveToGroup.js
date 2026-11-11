/**
 * There is no move endpoint: bind into the new group, then unbind from the previous parents, so a
 * failure halfway leaves the object in both places. An object whose parent list is unknown is
 * reported as failed: binding it would turn the move into a copy.
 *
 * @param {object} options
 * @param {Array<{id: number, name: string}>} options.objects - objects to move
 * @param {{id: number, name: string}} options.group - destination group
 * @param {(id: number) => Promise<{parents?: number[]}>} options.fetchParents - object detail
 * @param {(payload: {parentId: number, childId: number}) => Promise} options.bind
 * @param {(payload: {parentId: number, childId: number}) => Promise} options.unbind
 * @returns {Promise<{succeeded: Array, failed: Array}>}
 */
export async function moveObjectsToGroup({ objects, group, fetchParents, bind, unbind }) {
  const results = await Promise.allSettled(
    objects.map(async (object) => {
      const detail = await fetchParents(object.id)
      if (!Array.isArray(detail?.parents)) {
        throw new Error('Current group membership is unknown')
      }
      const previousParents = detail.parents.filter((id) => id !== group.id)
      await bind({ parentId: group.id, childId: object.id })
      await Promise.all(previousParents.map((parentId) => unbind({ parentId, childId: object.id })))
    }),
  )
  return splitResults(objects, results)
}

/**
 * Bind `childId` under `parentId` and unbind it from `replacedIds`, binding first so a refused
 * bind changes nothing. The server takes one parent of some kinds only (a rack's room and
 * cooling zone, a power domain's facility line) and answers 409 to a second: then the old parents
 * go first, and come back when the bind still fails.
 *
 * @param {object} options
 * @param {number} options.parentId
 * @param {number} options.childId
 * @param {number[]} options.replacedIds
 * @param {(payload: {parentId: number, childId: number}) => Promise} options.bind
 * @param {(payload: {parentId: number, childId: number}) => Promise} options.unbind
 */
export async function bindInPlaceOf({ parentId, childId, replacedIds, bind, unbind }) {
  const unbindReplaced = async () => {
    for (const id of replacedIds) await unbind({ parentId: id, childId })
  }
  try {
    await bind({ parentId, childId })
  } catch (error) {
    if (error?.status !== 409 || !replacedIds.length) throw error
    await unbindReplaced()
    try {
      await bind({ parentId, childId })
    } catch (again) {
      for (const id of replacedIds) await bind({ parentId: id, childId }).catch(() => {})
      throw again
    }
    return
  }
  await unbindReplaced()
}

/**
 * An Infrastructure move, as the legacy object browser does it: into the target, out of the one
 * parent the object moves from. Its other parents (a power domain, a second container) stay.
 *
 * @param {object} options
 * @param {Array<{object: {id: number, name: string}, sourceId: number}>} options.moves
 * @param {{id: number, name: string}} options.target - destination container
 * @param {(payload: {parentId: number, childId: number}) => Promise} options.bind
 * @param {(payload: {parentId: number, childId: number}) => Promise} options.unbind
 * @returns {Promise<{succeeded: Array, failed: Array}>}
 */
export async function moveObjectsToContainer({ moves, target, bind, unbind }) {
  const results = await Promise.allSettled(
    moves.map(async ({ object, sourceId }) => {
      if (sourceId === target.id) return
      await bindInPlaceOf({
        parentId: target.id,
        childId: object.id,
        replacedIds: [sourceId],
        bind,
        unbind,
      })
    }),
  )
  return splitResults(
    moves.map((move) => move.object),
    results,
  )
}

function splitResults(objects, results) {
  const succeeded = []
  const failed = []

  results.forEach((result, index) => {
    const object = objects[index]
    if (result.status === 'fulfilled') {
      succeeded.push({ id: object.id, name: object.name })
    } else {
      failed.push({
        id: object.id,
        name: object.name,
        status: result.reason?.status,
        message: result.reason?.message,
      })
    }
  })

  return { succeeded, failed }
}
