import { computed, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import * as topologyApi from '@/api/topologyApi'
import { MODERATE_TIER, VOLATILE_TIER } from './config'

export const topologyKeys = {
  detail: (objectId, type, options = {}) => [
    'topology',
    toValue(objectId),
    toValue(type),
    { useL1Topology: !!toValue(options.useL1Topology) },
  ],
}

const API_FNS = {
  l2: (id, { useL1Topology }) => topologyApi.getL2Topology(id, { useL1Topology }),
  ip: (id) => topologyApi.getIpTopology(id),
  ospf: (id) => topologyApi.getOspfTopology(id),
  internal: (id) => topologyApi.getInternalTopology(id),
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {import('vue').MaybeRefOrGetter<string>} topologyType - 'l2' | 'ip' | 'ospf' | 'internal'
 * @param {{
 *   enabled?: import('vue').MaybeRefOrGetter<boolean>,
 *   useL1Topology?: import('vue').MaybeRefOrGetter<boolean>,
 * }} [options] - `useL1Topology` applies to 'l2' only
 */
export function useTopology(objectId, topologyType, options = {}) {
  const baseEnabled = computed(() => !!toValue(objectId) && !!toValue(topologyType))
  return useQuery({
    queryKey: computed(() =>
      topologyKeys.detail(objectId, topologyType, {
        useL1Topology: toValue(topologyType) === 'l2' && toValue(options.useL1Topology),
      }),
    ),
    queryFn: () => {
      const id = toValue(objectId)
      const type = toValue(topologyType)
      const fn = API_FNS[type]
      if (!fn) throw new Error(`Unknown topology type: ${type}`)
      return fn(id, { useL1Topology: !!toValue(options.useL1Topology) })
    },
    enabled:
      options.enabled !== undefined
        ? computed(() => baseEnabled.value && !!toValue(options.enabled))
        : baseEnabled,
    ...VOLATILE_TIER,
  })
}

export const nodeTableKeys = {
  arpCache: (objectId) => ['node-table', 'arp-cache', toValue(objectId)],
  routingTable: (objectId) => ['node-table', 'routing-table', toValue(objectId)],
  fdb: (objectId) => ['node-table', 'fdb', toValue(objectId)],
  wirelessRadios: (objectId) => ['node-table', 'wireless-radios', toValue(objectId)],
  wirelessStations: (objectId) => ['node-table', 'wireless-stations', toValue(objectId)],
  dhcpScopes: (objectId) => ['node-table', 'dhcp-scopes', toValue(objectId)],
  dhcpLeases: (objectId, scopeId) => [
    'node-table',
    'dhcp-leases',
    toValue(objectId),
    toValue(scopeId) ?? null,
  ],
}

/**
 * Not polled and no refetch on focus: these tables can fall through to a live agent, SNMP or
 * controller read. The user refreshes through the view toolbar.
 */
function nodeTableQuery(queryKey, queryFn, objectId, options = {}) {
  return useQuery({
    queryKey,
    queryFn,
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
    refetchOnWindowFocus: false,
    ...options,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useArpCache(objectId) {
  return nodeTableQuery(
    computed(() => nodeTableKeys.arpCache(objectId)),
    () => topologyApi.getArpCache(toValue(objectId)),
    objectId,
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useRoutingTable(objectId) {
  return nodeTableQuery(
    computed(() => nodeTableKeys.routingTable(objectId)),
    () => topologyApi.getRoutingTable(toValue(objectId)),
    objectId,
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useSwitchForwardingDatabase(objectId) {
  return nodeTableQuery(
    computed(() => nodeTableKeys.fdb(objectId)),
    () => topologyApi.getSwitchForwardingDatabase(toValue(objectId)),
    objectId,
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useWirelessRadios(objectId) {
  return nodeTableQuery(
    computed(() => nodeTableKeys.wirelessRadios(objectId)),
    () => topologyApi.getWirelessRadios(toValue(objectId)),
    objectId,
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useWirelessStations(objectId) {
  return nodeTableQuery(
    computed(() => nodeTableKeys.wirelessStations(objectId)),
    () => topologyApi.getWirelessStations(toValue(objectId)),
    objectId,
  )
}

// Every DHCP failure is the agent's answer (unsupported, unreadable, unreachable), and each retry
// would be another live agent read.
const DHCP_QUERY_OPTIONS = { retry: false }

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useDhcpScopes(objectId) {
  return nodeTableQuery(
    computed(() => nodeTableKeys.dhcpScopes(objectId)),
    () => topologyApi.getDhcpScopes(toValue(objectId)),
    objectId,
    DHCP_QUERY_OPTIONS,
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {import('vue').MaybeRefOrGetter<string|null>} scopeId - all scopes when null
 */
export function useDhcpLeases(objectId, scopeId) {
  return nodeTableQuery(
    computed(() => nodeTableKeys.dhcpLeases(objectId, scopeId)),
    () => topologyApi.getDhcpLeases(toValue(objectId), toValue(scopeId)),
    objectId,
    DHCP_QUERY_OPTIONS,
  )
}
