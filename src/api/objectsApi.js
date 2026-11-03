import { get, getBlob, post, put, patch, del } from './client'
import { DEMO_GROUP_ID, createDemoDashboard } from './demoDashboardStorage'
import { createObjectBatcher } from './objectBatcher'
import { DEMO_CONTENT_ENABLED } from '@/config/buildFlags'
import { createDciValueBatcher } from './dciValueBatcher'

export function getObjects(params = {}) {
  const query = new URLSearchParams()
  if (params.filter) query.set('filter', params.filter)
  if (params.parent != null) query.set('parent', params.parent)

  const qs = query.toString()
  return get(`/v1/objects${qs ? `?${qs}` : ''}`)
}

/**
 * Fetch several objects in one request. Readable ids come back as the same document
 * `getObject` returns; ids readable only through `delegate` come back with `partial: true`.
 * A 403 here means the delegate is unreadable, which the batcher handles, so the global
 * forbidden toast is suppressed.
 *
 * @param {{ ids: number[], delegate?: number }} body
 * @param {object} [options] - `signal`, `priority` as for any request
 */
export function getObjectsBulk(body, options) {
  return post('/v1/objects/details', body, { ...options, suppressForbidden: true })
}

const objectBatcher = createObjectBatcher({
  fetchBulk: getObjectsBulk,
  fetchOne: (id, options) => get(`/v1/objects/${id}`, options),
})

/**
 * Fetch one object. Calls made in the same tick are sent together as one bulk request, so
 * resolving a list of ids costs one round trip rather than one per id; each call still
 * resolves with its own document or rejects with its own 403/404.
 *
 * @param {number|string} id
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {'interactive'|'background'} [options.priority] - resolving a list of objects
 *   should pass 'background' (see client.js)
 * @param {number} [options.delegate] - network map or dashboard id; objects on it that the
 *   user can see only through delegated read come back as partial documents
 */
export function getObject(id, options) {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) return get(`/v1/objects/${id}`, options)
  return objectBatcher.load(numericId, options)
}

/**
 * Search objects by class/name/ipAddress/parent/zoneUIN (all criteria AND-combined).
 * Returns lightweight object summaries (no zoneUIN/primaryName/etc.).
 */
export function searchObjects(criteria = {}) {
  return post('/v1/objects/search', criteria)
}

export function createObject(payload) {
  // Dashboards created under the synthetic "Demo Dashboards" group live in
  // localStorage, not on the server (see demoDashboardStorage.js).
  if (DEMO_CONTENT_ENABLED && payload?.parentId === DEMO_GROUP_ID) {
    if (payload.class !== 'Dashboard') {
      return Promise.reject(
        new Error('Only dashboards can be created inside the Demo Dashboards group'),
      )
    }
    return Promise.resolve(createDemoDashboard(payload.name))
  }
  return post('/v1/objects', payload)
}

export function updateObjectProperties(id, payload) {
  return patch(`/v1/objects/${id}`, payload)
}

export function updateObjectLocation(id, payload) {
  return patch(`/v1/objects/${id}/location`, payload)
}

// Placement in a rack or chassis is its own sub-resource rather than a property of the
// top-level object patch: a server that predates it answers 404, which is the only feature
// check available, while the top-level patch silently ignores groups it does not know.
export function updateObjectPhysicalPlacement(id, payload) {
  return patch(`/v1/objects/${id}/physical-placement`, payload)
}

export function setObjectManaged(id, managed) {
  return post(`/v1/objects/${id}/set-managed`, { managed })
}

/**
 * Delete an object and everything below it.
 *
 * Asynchronous server-side: 204 means the deletion was accepted, not that the object is
 * already gone, so callers must re-read the tree rather than assume it vanished.
 * `removeDCI` applies to templates and clusters only.
 */
export function deleteObject(id, { removeDCI } = {}) {
  const qs = removeDCI === undefined ? '' : `?removeDCI=${removeDCI ? 'true' : 'false'}`
  return del(`/v1/objects/${id}${qs}`)
}

/**
 * Send a Wake-on-LAN magic packet. Nodes and interfaces only; needs OBJECT_ACCESS_CONTROL. The
 * 204 says only that the packet was sent, not whether the host woke.
 */
export function wakeUpObject(id) {
  return post(`/v1/objects/${id}/wake-up`)
}

/**
 * Screenshot of a remote Windows desktop through the agent, as `image/png` bytes. Needs
 * OBJECT_ACCESS_SCREENSHOT (`openapi.yaml` wrongly says read access). The server raises the
 * agent command timeout to 60s, so the request can stay open a while.
 *
 * @param {number} objectId - node id.
 * @param {{ sessionName?: string }} [options] - session to capture; the server falls back
 *   to "Console" when omitted.
 * @returns {Promise<Blob>}
 */
export function takeScreenshot(objectId, { sessionName } = {}) {
  const qs = sessionName ? `?sessionName=${encodeURIComponent(sessionName)}` : ''
  return getBlob(`/v1/objects/${objectId}/take-screenshot${qs}`)
}

/**
 * Expand text macros server-side: several resolve against state a client cannot see, so this
 * is the only correct expansion.
 *
 * @param {number} objectId - context object.
 * @param {string} text
 * @param {{ alarmId?: number, inputFields?: Record<string,string> }} [options]
 * @returns {Promise<string>} the expanded text.
 */
export async function expandText(objectId, text, { alarmId, inputFields } = {}) {
  const result = await post(`/v1/objects/${objectId}/expand-text`, {
    text,
    alarmId: alarmId || undefined,
    inputFields: inputFields && Object.keys(inputFields).length > 0 ? inputFields : undefined,
  })
  return result?.expandedText ?? ''
}

export function setObjectMaintenance(id, { maintenance, comments, startTime, endTime } = {}) {
  return post(`/v1/objects/${id}/set-maintenance`, {
    maintenance,
    comments: comments || undefined,
    startTime: startTime || undefined,
    endTime: endTime || undefined,
  })
}

export function updateObjectStatusCalculation(id, payload) {
  return patch(`/v1/objects/${id}/status-calculation`, payload)
}

export function getObjectStatusExplanation(id) {
  return get(`/v1/objects/${id}/status-explanation`)
}

/**
 * Current values of every DCI on the object - the endpoint takes no DCI filter, so a
 * caller that needs two values still receives the node's whole set. For known DCIs use
 * `getDciValues`.
 * @param {number} objectId
 * @param {object} [options] - forwarded to the client: `signal`, `priority` (see client.js)
 */
export function getDciCurrentValues(objectId, options) {
  return get(`/v1/objects/${objectId}/data-collection/current-values`, options)
}

/**
 * Last values of an explicit list of DCIs, possibly on different objects, in one request.
 * Each value answers the request item at its `index`; items the server cannot serve are
 * listed in `errors` instead. A 403 means the delegate is unreadable, which the batcher
 * handles, so the global forbidden toast is suppressed.
 *
 * @param {{ items: Array<{objectId: number, dciId: number, column?: string,
 *   instance?: string}>, delegate?: number }} body - at most 500 items
 * @param {object} [options] - `signal`, `priority` as for any request
 */
export function getDciCurrentValuesBulk(body, options) {
  return post('/v1/data-collection/current-values', body, { ...options, suppressForbidden: true })
}

const dciValueBatcher = createDciValueBatcher({
  fetchBulk: getDciCurrentValuesBulk,
  fetchObjectValues: getDciCurrentValues,
})

/**
 * Current values of the given DCIs. Calls made in the same tick are sent together as one
 * bulk request per delegate (see `createDciValueBatcher`).
 *
 * @param {Array<{objectId: number, dciId: number, column?: string, instance?: string}>} items
 *   - `column` with `instance` selects a cell of a table DCI
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {'interactive'|'background'} [options.priority] - polling should pass 'background'
 * @param {number} [options.delegate] - network map or dashboard id; DCIs it shows are served
 *   on objects the user can see only through it
 * @returns {Promise<Record<string, object>>} DCIValue rows keyed by `dciValueKey`; an item
 *   the server cannot serve is absent
 */
export function getDciValues(items, options) {
  return dciValueBatcher.load(items, options)
}

/**
 * Last collected value of one table DCI, as a TableData document.
 *
 * The current-values list carries only a value *summary* for a table DCI (empty value,
 * DCI_DT_NULL data type), so the contents need this second call.
 *
 * @param {number} objectId
 * @param {number} dciId
 * @param {object} [options] - forwarded to the client: `signal`, `priority` (see client.js)
 */
export function getDciTableValue(objectId, dciId, options) {
  return get(`/v1/objects/${objectId}/data-collection/${dciId}/table-value`, options)
}

export function getPerformanceDcis(objectId) {
  return get(`/v1/objects/${objectId}/data-collection/performance-view`)
}

/**
 * Historical values for one DCI.
 *
 * @param {number} objectId
 * @param {number} dciId
 * @param {object} [params]
 * @param {number} [params.timeFrom] - Unix seconds
 * @param {number} [params.timeTo] - Unix seconds
 * @param {number} [params.maxRows] - hard cap on returned points
 * @param {number} [params.maxDataPoints] - on a raw-tier read, bucket into this many points
 *        and return avg/min/max per bucket. Ignored on hourly/daily reads, which already
 *        serve pre-computed buckets.
 * @param {'auto'|'raw'|'hourly'|'daily'} [params.tier] - storage tier to read from. `auto`
 *        picks the densest tier that fits the server's point threshold. A tier the DCI has
 *        no aggregates for is silently downgraded to raw; the response's `tierServed` says
 *        what was actually used.
 * @param {'avg'|'min'|'max'|'minmax'} [params.function] - aggregate column(s) for
 *        hourly/daily reads. `minmax` returns avg + min + max together, for band rendering.
 *        Ignored when `tierServed` is `raw`.
 * @param {number} [params.historicalDataType] - 0 processed (default), 1 raw,
 *        2 raw and processed, 3 full table
 */
export function getDciHistory(objectId, dciId, params = {}) {
  const query = new URLSearchParams()
  if (params.timeFrom != null) query.set('timeFrom', params.timeFrom)
  if (params.timeTo != null) query.set('timeTo', params.timeTo)
  if (params.maxRows != null) query.set('maxRows', params.maxRows)
  if (params.maxDataPoints != null) query.set('maxDataPoints', params.maxDataPoints)
  if (params.tier != null) query.set('tier', params.tier)
  if (params.function != null) query.set('function', params.function)
  if (params.historicalDataType != null) query.set('historicalDataType', params.historicalDataType)

  const qs = query.toString()
  return get(`/v1/objects/${objectId}/data-collection/${dciId}/history${qs ? `?${qs}` : ''}`)
}

export function getObjectSubTree(id, filter) {
  const query = new URLSearchParams()
  if (filter) query.set('filter', filter)

  const qs = query.toString()
  return get(`/v1/objects/${id}/sub-tree${qs ? `?${qs}` : ''}`)
}

/**
 * Execute an object query (NXSL filter script) and return matching objects.
 * @param {object} params
 * @param {string} params.query - NXSL query script
 * @param {number} [params.rootObjectId] - scope the query to a sub-tree (0 = all objects)
 * @param {string[]} [params.fields] - additional object fields to retrieve
 * @param {boolean} [params.readAllFields] - return every global the script computed, named
 *        by the script itself. Without it, and without `fields`, results carry no extra
 *        fields at all — the server only ever returns what one of the two asked for.
 * @param {number} [params.limit] - max number of results
 * @returns {Promise<Array<{ object: object, fields: Record<string, string> }>>}
 */
export function queryObjects({ query, rootObjectId, fields, readAllFields, limit } = {}) {
  return post('/v1/objects/query', {
    query,
    rootObjectId: rootObjectId || 0,
    ...(fields?.length ? { fields } : {}),
    ...(readAllFields ? { readAllFields: true } : {}),
    ...(limit ? { limit } : {}),
  })
}

export function getObjectChildren(id, { classes, filter } = {}) {
  const query = new URLSearchParams()
  if (classes?.length) query.set('class', classes.join(','))
  if (filter) query.set('filter', filter)

  const qs = query.toString()
  return get(`/v1/objects/${id}/children${qs ? `?${qs}` : ''}`)
}

export function getObjectCustomAttributes(id) {
  return get(`/v1/objects/${id}/custom-attributes`)
}

export function updateObjectCustomAttribute(id, name, payload) {
  return put(`/v1/objects/${id}/custom-attributes/${encodeURIComponent(name)}`, payload)
}

export function deleteObjectCustomAttribute(id, name) {
  return del(`/v1/objects/${id}/custom-attributes/${encodeURIComponent(name)}`)
}

export function updateObjectResponsibleUser(id, userId, tag) {
  return put(`/v1/objects/${id}/responsible-users/${userId}`, { tag: tag ?? '' })
}

export function deleteObjectResponsibleUser(id, userId) {
  return del(`/v1/objects/${id}/responsible-users/${userId}`)
}

export function updateObjectDashboards(id, idArray) {
  return put(`/v1/objects/${id}/dashboards`, idArray)
}

export function updateObjectDashboardContent(id, payload) {
  return put(`/v1/objects/${id}/dashboard`, payload)
}

export function getObjectNetworkMapContent(id) {
  return get(`/v1/objects/${id}/map`)
}

export function updateObjectNetworkMapContent(id, payload) {
  return put(`/v1/objects/${id}/map`, payload)
}

export function updateObjectTrustedObjects(id, idArray) {
  return put(`/v1/objects/${id}/trusted-objects`, idArray)
}

/**
 * Full replacement of the object's directly assigned access control list.
 * @param {number} id
 * @param {{ inheritAccessRights: boolean, accessList: Array<{ userId: number, access: number }> }} payload
 */
export function updateObjectAccessRights(id, payload) {
  return put(`/v1/objects/${id}/access-rights`, payload)
}

export function updateObjectPolling(id, payload) {
  return patch(`/v1/objects/${id}/polling`, payload)
}

export function getObjectAgentConfig(id) {
  return get(`/v1/objects/${id}/agent`)
}

export function updateObjectAgentConfig(id, payload) {
  return patch(`/v1/objects/${id}/agent`, payload)
}

export function getObjectSnmpConfig(id) {
  return get(`/v1/objects/${id}/snmp`)
}

export function updateObjectSnmpConfig(id, payload) {
  return patch(`/v1/objects/${id}/snmp`, payload)
}

export function updateObjectAutoBind(id, payload) {
  return patch(`/v1/objects/${id}/auto-bind`, payload)
}

export function createObjectUrl(id, payload) {
  return post(`/v1/objects/${id}/urls`, payload)
}

export function updateObjectUrl(id, urlId, payload) {
  return put(`/v1/objects/${id}/urls/${urlId}`, payload)
}

export function deleteObjectUrl(id, urlId) {
  return del(`/v1/objects/${id}/urls/${urlId}`)
}

export function bindObjectChild(parentId, childId, options = {}) {
  const query = new URLSearchParams()
  if (options.force) query.set('force', 'true')

  const qs = query.toString()
  return put(`/v1/objects/${parentId}/children/${childId}${qs ? `?${qs}` : ''}`)
}

export function unbindObjectChild(parentId, childId, options = {}) {
  const query = new URLSearchParams()
  if (options.removeDci) query.set('remove-dci', 'true')

  const qs = query.toString()
  return del(`/v1/objects/${parentId}/children/${childId}${qs ? `?${qs}` : ''}`)
}

export function getRackLayout(id) {
  return get(`/v1/objects/${id}/rack-layout`)
}

export function getChassisLayout(id) {
  return get(`/v1/objects/${id}/chassis-layout`)
}

// Passive rack elements (PDU, patch panel, etc.) have no backing object, so placement can't
// go through the generic /v1/objects/{id} PATCH — dedicated endpoints instead.

export function createPassiveRackElement(rackId, payload) {
  return post(`/v1/objects/${rackId}/rack-layout/passive-elements`, payload)
}

export function updatePassiveRackElement(rackId, elementId, payload) {
  return patch(`/v1/objects/${rackId}/rack-layout/passive-elements/${elementId}`, payload)
}

export function deletePassiveRackElement(rackId, elementId) {
  return del(`/v1/objects/${rackId}/rack-layout/passive-elements/${elementId}`)
}
