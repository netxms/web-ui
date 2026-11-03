import { get, post, put, del } from './client'

export function getObjectTools(params = {}) {
  const query = new URLSearchParams()
  if (params.types) query.set('types', params.types)

  const qs = query.toString()
  return get(`/v1/object-tools${qs ? `?${qs}` : ''}`)
}

export function getObjectTool(toolId) {
  return get(`/v1/object-tools/${toolId}`)
}

export function createObjectTool(data) {
  return post('/v1/object-tools', data)
}

export function updateObjectTool(toolId, data) {
  return put(`/v1/object-tools/${toolId}`, data)
}

export function deleteObjectTool(toolId) {
  return del(`/v1/object-tools/${toolId}`)
}

export function enableObjectTool(toolId) {
  return post(`/v1/object-tools/${toolId}/enable`)
}

export function disableObjectTool(toolId) {
  return post(`/v1/object-tools/${toolId}/disable`)
}

/**
 * Fetch object tools applicable to a specific object.
 * Server-side filters by ACL, container context, disabled status, and menu filter
 * (SNMP/agent requirements, OID match, OS match, template match, custom attribute match).
 * @param {number} objectId
 * @param {object} [params]
 * @param {string} [params.types] - Comma-separated list of tool types to filter by
 */
export function getObjectToolsForObject(objectId, params = {}) {
  const query = new URLSearchParams()
  if (params.types) query.set('types', params.types)
  const qs = query.toString()
  return get(`/v1/objects/${objectId}/object-tools${qs ? `?${qs}` : ''}`)
}

/**
 * Execute an object tool via the unified endpoint.
 * @param {number} toolId - Object tool ID
 * @param {number} objectId - Target object ID
 * @param {object} [options]
 * @param {number} [options.alarmId] - Alarm ID for macro expansion context
 * @param {Record<string, string>} [options.inputFields] - Input field values
 * @param {boolean} [options.stream] - Request streaming mode (returns 202 with wsUrl + token)
 * @returns {Promise<
 *   { type: 'text', output: string } |
 *   { type: 'table', table: object } |
 *   { type: 'url', url: string } |
 *   { type: 'none' } |
 *   { token: string, wsUrl: string }
 * >}
 */
export function executeObjectTool(toolId, objectId, options = {}) {
  const body = { objectId }
  if (options.alarmId) body.alarmId = options.alarmId
  if (options.inputFields) body.inputFields = options.inputFields
  if (options.stream) body.stream = true
  return post(`/v1/object-tools/${toolId}/execute`, body)
}
