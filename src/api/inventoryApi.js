import { get } from './client'

/**
 * Packages installed on a node, as stored by the last configuration poll. `entries` is null
 * when the node has none collected.
 *
 * @param {number} objectId - node id.
 * @returns {Promise<{ entries: object[]|null }>}
 */
export function getSoftwareInventory(objectId) {
  return get(`/v1/objects/${objectId}/software-inventory`)
}

/**
 * Hardware components reported by the node's agent or device driver, as stored by the last
 * configuration poll. `entries` is null when the node has none collected.
 *
 * @param {number} objectId - node id.
 * @returns {Promise<{ entries: object[]|null }>}
 */
export function getHardwareInventory(objectId) {
  return get(`/v1/objects/${objectId}/hardware-inventory`)
}

/**
 * The node's ENTITY-MIB component tree, as stored by the last configuration poll. `root` is
 * null when the node provides none.
 *
 * @param {number} objectId - node id.
 * @returns {Promise<{ timestamp: string|null, root: object|null }>}
 */
export function getPhysicalComponents(objectId) {
  return get(`/v1/objects/${objectId}/physical-components`)
}

/**
 * Sessions open on the node, read live from its agent. The server answers 503 when the agent
 * is unreachable and 502 for its errors, hence `suppressUnavailable`.
 *
 * @param {number} objectId - node id.
 * @returns {Promise<{ entries: object[] }>}
 */
export function getUserSessions(objectId) {
  return get(`/v1/objects/${objectId}/user-sessions`, { suppressUnavailable: true })
}
