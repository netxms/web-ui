import { computed, toValue } from 'vue'
import { useMutation, useQuery } from '@tanstack/vue-query'
import * as inventoryApi from '@/api/inventoryApi'
import * as objectsApi from '@/api/objectsApi'
import { assetsBySerial, componentAssetQuery } from '@/utils/nodeInventory'
import { MODERATE_TIER, STATIC_TIER } from './config'

/** BUILTIN_OID_ASSETROOT: every asset sits below it, so the query runs on assets only. */
const ASSET_ROOT_ID = 5

export const nodeInventoryKeys = {
  softwareInventory: (objectId) => ['node-inventory', 'software', toValue(objectId)],
  hardwareInventory: (objectId) => ['node-inventory', 'hardware', toValue(objectId)],
  physicalComponents: (objectId) => ['node-inventory', 'physical-components', toValue(objectId)],
  componentAssets: (objectId) => ['node-inventory', 'component-assets', toValue(objectId)],
  processes: (objectId) => ['node-inventory', 'processes', toValue(objectId)],
  cpuCount: (objectId) => ['node-inventory', 'cpu-count', toValue(objectId)],
  services: (objectId) => ['node-inventory', 'services', toValue(objectId)],
  userSessions: (objectId) => ['node-inventory', 'user-sessions', toValue(objectId)],
}

// Each retry of a live agent read is another round trip to the agent, and its failures are the
// agent's answer.
const LIVE_AGENT_OPTIONS = { retry: false }

/**
 * No refetch on focus: the stored inventories change only on a configuration poll and the rest
 * are live agent reads. The user refreshes through the view toolbar.
 */
function nodeQuery(queryKey, queryFn, objectId, options = {}) {
  const { enabled, ...rest } = options
  return useQuery({
    queryKey,
    queryFn,
    enabled: computed(() => !!toValue(objectId) && toValue(enabled) !== false),
    ...MODERATE_TIER,
    refetchOnWindowFocus: false,
    ...rest,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useSoftwareInventory(objectId) {
  return nodeQuery(
    computed(() => nodeInventoryKeys.softwareInventory(objectId)),
    () => inventoryApi.getSoftwareInventory(toValue(objectId)),
    objectId,
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {{ enabled?: import('vue').MaybeRefOrGetter<boolean> }} [options]
 */
export function useHardwareInventory(objectId, options = {}) {
  return nodeQuery(
    computed(() => nodeInventoryKeys.hardwareInventory(objectId)),
    () => inventoryApi.getHardwareInventory(toValue(objectId)),
    objectId,
    options,
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {{ enabled?: import('vue').MaybeRefOrGetter<boolean> }} [options]
 */
export function usePhysicalComponents(objectId, options = {}) {
  return nodeQuery(
    computed(() => nodeInventoryKeys.physicalComponents(objectId)),
    () => inventoryApi.getPhysicalComponents(toValue(objectId)),
    objectId,
    options,
  )
}

/**
 * Assets linked to components of the node, by component serial number. A failed query leaves
 * the Asset column empty rather than failing the inventory.
 *
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useComponentAssets(objectId) {
  return nodeQuery(
    computed(() => nodeInventoryKeys.componentAssets(objectId)),
    () =>
      objectsApi.queryObjects({
        query: componentAssetQuery(toValue(objectId)),
        rootObjectId: ASSET_ROOT_ID,
        fields: ['serial'],
      }),
    objectId,
    { retry: false, select: assetsBySerial },
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {{ refetchInterval?: import('vue').MaybeRefOrGetter<number|false> }} [options]
 */
export function useProcesses(objectId, options = {}) {
  return nodeQuery(
    computed(() => nodeInventoryKeys.processes(objectId)),
    () => objectsApi.queryTable(toValue(objectId), 'agent', 'System.Processes'),
    objectId,
    {
      ...LIVE_AGENT_OPTIONS,
      // CPU % is measured between two samples, so a stored one must not stand in for a read.
      staleTime: 0,
      gcTime: 0,
      refetchInterval: computed(() => toValue(options.refetchInterval) ?? false),
    },
  )
}

/**
 * The agent's CPU count, which legacy ProcessesView divides CPU time by; 1 when the agent
 * cannot tell.
 *
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useCpuCount(objectId) {
  return nodeQuery(
    computed(() => nodeInventoryKeys.cpuCount(objectId)),
    () =>
      objectsApi
        .queryMetric(toValue(objectId), 'agent', 'System.CPU.Count')
        .then((result) => Math.max(1, parseInt(result?.value, 10) || 1))
        .catch(() => 1),
    objectId,
    { ...STATIC_TIER, refetchOnWindowFocus: false, retry: false },
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useServices(objectId) {
  return nodeQuery(
    computed(() => nodeInventoryKeys.services(objectId)),
    () => objectsApi.queryTable(toValue(objectId), 'agent', 'System.Services'),
    objectId,
    LIVE_AGENT_OPTIONS,
  )
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {{ refetchInterval?: import('vue').MaybeRefOrGetter<number|false> }} [options]
 */
export function useUserSessions(objectId, options = {}) {
  return nodeQuery(
    computed(() => nodeInventoryKeys.userSessions(objectId)),
    () => inventoryApi.getUserSessions(toValue(objectId)),
    objectId,
    {
      ...LIVE_AGENT_OPTIONS,
      refetchInterval: computed(() => toValue(options.refetchInterval) ?? false),
    },
  )
}

/**
 * One agent action per call; `command` comes from `agentCommandLine`.
 */
export function useAgentCommand() {
  return useMutation({
    mutationFn: ({ objectId, command }) => objectsApi.executeAgentCommand(objectId, command),
  })
}
