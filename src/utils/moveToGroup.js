import { canBindChild } from '@/utils/objectCreationRules'

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
 * go first, and come back when the bind still fails. Without an access list of its own an object
 * has the rights of its parents, so one left with none is out of everyone's reach, the next bind
 * included: a parent of the target holds it meanwhile, and without one the move is not tried.
 *
 * @param {object} options
 * @param {number} options.parentId
 * @param {number} options.childId
 * @param {number[]} options.replacedIds
 * @param {(payload: {parentId: number, childId: number}) => Promise} options.bind
 * @param {(payload: {parentId: number, childId: number}) => Promise} options.unbind
 * @param {(id: number) => Promise<{class: string, parents?: number[]}>} options.fetchObject
 */
export async function bindInPlaceOf({ parentId, childId, replacedIds, bind, unbind, fetchObject }) {
  const link = (id) => bind({ parentId: id, childId })
  const unlink = (id) => unbind({ parentId: id, childId })
  try {
    await link(parentId)
  } catch (error) {
    if (error?.status !== 409 || !replacedIds.length || !fetchObject) throw error
    const holder = await interimParent({ parentId, childId, replacedIds, fetchObject })
    if (holder === undefined) throw error
    if (holder !== null) await link(holder)
    try {
      for (const id of replacedIds) await unlink(id)
      await link(parentId)
    } catch (again) {
      const restored = await Promise.all(
        replacedIds.map((id) =>
          link(id).then(
            () => true,
            () => false,
          ),
        ),
      )
      if (holder !== null && restored.every(Boolean)) await unlink(holder).catch(() => {})
      throw again
    }
    if (holder !== null) await unlink(holder)
    return
  }
  for (const id of replacedIds) await unlink(id)
}

/**
 * Where the child stays bound while its replaced parents go: null when a parent of its own stays
 * anyway, undefined when no parent of the target can hold it.
 */
async function interimParent({ parentId, childId, replacedIds, fetchObject }) {
  const [child, target] = await Promise.all([fetchObject(childId), fetchObject(parentId)])
  if ((child.parents ?? []).some((id) => !replacedIds.includes(id))) return null
  for (const id of target.parents ?? []) {
    if (canBindChild(child.class, (await fetchObject(id)).class)) return id
  }
  return undefined
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
 * @param {(id: number) => Promise<{class: string, parents?: number[]}>} options.fetchObject
 * @returns {Promise<{succeeded: Array, failed: Array}>}
 */
export async function moveObjectsToContainer({ moves, target, bind, unbind, fetchObject }) {
  const results = await Promise.allSettled(
    moves.map(async ({ object, sourceId }) => {
      if (sourceId === target.id) return
      await bindInPlaceOf({
        parentId: target.id,
        childId: object.id,
        replacedIds: [sourceId],
        bind,
        unbind,
        fetchObject,
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
