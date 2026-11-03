import { get, post, patch, del } from './client'
import { normalizeCheck } from '@/utils/businessServiceChecks'

/**
 * Reading needs read access to the object, writes need modify. Checks copied from a prototype
 * or created by auto-binding cannot be modified (409) but can be deleted. A script that does not
 * compile is a 400 whose reason carries the error.
 *
 * @param {number} objectId
 * @returns {Promise<ReturnType<typeof normalizeCheck>[]>}
 */
export async function getBusinessServiceChecks(objectId) {
  const data = await get(`/v1/objects/${objectId}/business-service-checks`)
  return Array.isArray(data) ? data.map(normalizeCheck) : []
}

/**
 * @param {number} objectId
 * @param {object} data - BusinessServiceCheckUpdate; omitted fields get the server defaults
 * @returns {Promise<ReturnType<typeof normalizeCheck>>} the check as created
 */
export async function createBusinessServiceCheck(objectId, data) {
  return normalizeCheck(await post(`/v1/objects/${objectId}/business-service-checks`, data))
}

/**
 * Only the fields sent are changed; the request is validated as a whole.
 *
 * @param {number} objectId
 * @param {number} checkId
 * @param {object} data - BusinessServiceCheckUpdate
 * @returns {Promise<ReturnType<typeof normalizeCheck>>} the check as stored
 */
export async function updateBusinessServiceCheck(objectId, checkId, data) {
  return normalizeCheck(
    await patch(`/v1/objects/${objectId}/business-service-checks/${checkId}`, data),
  )
}

/**
 * Deleting a prototype check also deletes the checks created from it.
 *
 * @param {number} objectId
 * @param {number} checkId
 */
export function deleteBusinessServiceCheck(objectId, checkId) {
  return del(`/v1/objects/${objectId}/business-service-checks/${checkId}`)
}

/**
 * `from`/`to`: ISO 8601, UNIX timestamp, relative offset (`-30d`) or `now`; no `from` measures
 * from the start of recorded history. Tickets cost a second query, so they are opt-in.
 *
 *
 * @param {number} objectId
 * @param {{ from?: string, to?: string, includeTickets?: boolean }} [options]
 */
export function getBusinessServiceAvailability(objectId, { from, to, includeTickets } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (includeTickets) params.set('includeTickets', 'true')
  const qs = params.toString()
  return get(`/v1/objects/${objectId}/availability${qs ? `?${qs}` : ''}`)
}
