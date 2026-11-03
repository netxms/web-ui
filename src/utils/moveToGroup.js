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
