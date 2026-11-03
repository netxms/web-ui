import { get } from './client'

/**
 * @typedef {object} MacSearchHit
 * @property {string} localMacAddress - the matched address, colon separated
 * @property {'DIRECT'|'INDIRECT'|'WIRELESS'|'UNKNOWN'|'NOT_FOUND'} type - how it was learned
 * @property {number} localNodeId - node owning the address, 0 when unknown
 * @property {object} [localNode] - object summary, omitted without read access
 * @property {number} localInterfaceId - owning interface, 0 for access points
 * @property {object} [localInterface] - object summary, omitted without read access
 * @property {object|null} localIpAddress - InetAddress, render with formatIpAddress()
 * @property {number} nodeId - switch the address was seen on, 0 when unknown
 * @property {object} [node] - object summary, omitted without read access
 * @property {number} interfaceId - switch port, 0 when unknown
 * @property {object} [interface] - object summary, omitted without read access
 * @property {number} interfaceIndex - ifIndex of that port
 */

/**
 * Find where a MAC address lives, by full address or leading fragment. Needs SEARCH_NETWORK; the
 * palette renders the 403 inline. `includeObjects` returns node and interface summaries inline,
 * sparing a fetch per hit.
 *
 * @param {object} params
 * @param {string} params.macAddress - full address or leading fragment
 * @param {number} [params.searchLimit] - server default is 100
 * @param {boolean} [params.includeObjects]
 * @returns {Promise<MacSearchHit[]>}
 */
export function findMacAddress({ macAddress, searchLimit = 100, includeObjects = true }) {
  const query = new URLSearchParams({ macAddress })
  if (searchLimit) query.set('searchLimit', searchLimit)
  if (includeObjects) query.set('includeObjects', 'true')

  return get(`/v1/find/mac-address?${query}`, { suppressForbidden: true })
}
