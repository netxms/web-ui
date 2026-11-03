import { get } from './client'

/**
 * @param {number} objectId
 * @param {{ radius?: number, useL1Topology?: boolean }} [options]
 */
export function getL2Topology(objectId, { radius = 0, useL1Topology = false } = {}) {
  const query = new URLSearchParams()
  if (radius !== 0) query.set('radius', radius)
  if (useL1Topology) query.set('useL1Topology', 'true')
  const qs = query.toString()
  return get(`/v1/objects/${objectId}/topology/l2${qs ? `?${qs}` : ''}`)
}

/**
 * @param {number} objectId
 * @param {{ radius?: number }} [options]
 */
export function getIpTopology(objectId, { radius = 0 } = {}) {
  const query = new URLSearchParams()
  if (radius !== 0) query.set('radius', radius)
  const qs = query.toString()
  return get(`/v1/objects/${objectId}/topology/ip${qs ? `?${qs}` : ''}`)
}

/**
 * @param {number} objectId
 */
export function getOspfTopology(objectId) {
  return get(`/v1/objects/${objectId}/topology/ospf`)
}

/**
 * @param {number} objectId
 */
export function getInternalTopology(objectId) {
  return get(`/v1/objects/${objectId}/topology/internal`)
}

/**
 * ARP cache of a node.
 *
 * `forceRead` bypasses the server's cached copy and blocks for the duration of a live agent or
 * SNMP request, so it is reserved for an explicit user gesture.
 *
 * @param {number} objectId
 * @param {{ forceRead?: boolean }} [options]
 */
export function getArpCache(objectId, { forceRead = false } = {}) {
  return get(`/v1/objects/${objectId}/arp-cache${forceRead ? '?forceRead=true' : ''}`)
}

/**
 * @param {number} objectId
 */
export function getRoutingTable(objectId) {
  return get(`/v1/objects/${objectId}/routing-table`)
}

/**
 * @param {number} objectId
 */
export function getSwitchForwardingDatabase(objectId) {
  return get(`/v1/objects/${objectId}/switch-forwarding-database`)
}

/**
 * Radio interfaces of a node, an access point, or every reader-visible controller and access
 * point of a wireless domain.
 *
 * @param {number} objectId
 */
export function getWirelessRadios(objectId) {
  return get(`/v1/objects/${objectId}/wireless/radios`)
}

/**
 * Wireless stations of a node, an access point or a wireless domain. A domain with a
 * controller bridge queries the external controller, so this can be slow.
 *
 * @param {number} objectId
 */
export function getWirelessStations(objectId) {
  return get(`/v1/objects/${objectId}/wireless/stations`)
}
