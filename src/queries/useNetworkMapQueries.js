import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as networkMapsApi from '@/api/networkMapsApi'
import {
  adaptApiNetworkMap,
  networkMapObjectIds,
  serializeNetworkMapContent,
} from '@/utils/networkMapAdapters'
import { dciValueItem } from '@/utils/dciValues'
import { useDciValues, useObjectsByIds } from './useObjectQueries'
import { useDciValueMapping } from './useMappingTableQueries'
import { MODERATE_TIER, STATIC_TIER } from './config'

export const networkMapKeys = {
  all: () => ['network-maps'],
  tree: () => ['network-maps', 'tree'],
  /** Holds the raw map document; the objects it names live under `objectKeys.detail`. */
  detail: (id) => ['network-maps', 'detail', id],
}

export function useNetworkMapTree() {
  return useQuery({
    queryKey: networkMapKeys.tree(),
    queryFn: () => networkMapsApi.getNetworkMapTree(),
    ...STATIC_TIER,
  })
}

/**
 * A network map with the objects its elements and links refer to resolved into it. Objects are
 * ordinary object queries (cached and shared, read with the map as delegate), not part of the map
 * query: resolving them inside it refetched every object on each refocus and save. An object that
 * fails is absent, and its element keeps the `adaptApiElement` defaults.
 *
 * @param {import('vue').MaybeRefOrGetter} mapId
 */
export function useNetworkMap(mapId) {
  const document = useQuery({
    queryKey: computed(() => networkMapKeys.detail(toValue(mapId))),
    queryFn: ({ signal }) => networkMapsApi.getNetworkMap(toValue(mapId), { signal }),
    enabled: computed(() => !!toValue(mapId)),
    ...MODERATE_TIER,
  })

  // Demo maps are fixtures already in internal format.
  const isDemo = computed(() => networkMapsApi.isDemoMapId(toValue(mapId)))

  const objectIds = computed(() =>
    !document.data.value || isDemo.value ? [] : networkMapObjectIds(document.data.value),
  )
  // Delegated read: names and statuses of objects the user can see only through the map.
  const { objectsById, isFetching: resolvingObjects } = useObjectsByIds(objectIds, {
    delegate: () => (isDemo.value ? 0 : Number(toValue(mapId)) || 0),
  })

  function adapt(source) {
    if (!source) return undefined
    return isDemo.value ? source : adaptApiNetworkMap(source, objectsById.value)
  }

  const data = computed(() => adapt(document.data.value))

  /**
   * Resolves with the adapted map, the same shape as `data`: the save-time concurrent-edit check
   * compares its baseline against it.
   */
  async function refetch(options) {
    const result = await document.refetch(options)
    return { ...result, data: adapt(result.data) }
  }

  return {
    data,
    isLoading: document.isLoading,
    isFetching: computed(() => document.isFetching.value || resolvingObjects.value),
    isError: document.isError,
    error: document.error,
    refetch,
  }
}

/** Legacy LinkDciValueProvider refreshes map DCI values on a 30s timer. */
const MAP_DCI_REFRESH_MS = 30 * 1000

/**
 * Values of every DCI a map displays (link labels and DCI containers), in one bulk request per
 * refresh, with the map as delegate. A table source with a column and an instance gets that cell.
 *
 * @param {import('vue').MaybeRefOrGetter<object[]>} dciSources - MapDataSource-shaped entries
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<number>} [options.delegate] - the map's id
 * @returns {{ valuesByDci: import('vue').ComputedRef<Map<string, object>> }}
 *   keyed by `dciSourceKey`
 */
export function useMapDciValues(dciSources, options = {}) {
  const items = computed(() => (toValue(dciSources) ?? []).map(dciValueItem))
  const { data } = useDciValues(items, {
    delegate: options.delegate,
    refetchInterval: MAP_DCI_REFRESH_MS,
    priority: 'background',
  })

  const { mappedValue } = useDciValueMapping(() => Object.values(data.value ?? {}))

  const valuesByDci = computed(() => {
    const byDci = new Map()
    for (const [key, dci] of Object.entries(data.value ?? {})) {
      const mapped = mappedValue(dci)
      byDci.set(key, mapped == null ? dci : { ...dci, mappedValue: mapped })
    }
    return byDci
  })

  return { valuesByDci }
}

/**
 * Optimistic: the detail cache holds the raw map document, so the optimistic value is the same
 * serialized content the PUT sends. Rolls back on failure.
 */
export function useSaveNetworkMap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, map, positionOverrides }) =>
      networkMapsApi.saveNetworkMap(id, map, positionOverrides),
    onMutate: async ({ id, map, positionOverrides }) => {
      const queryKey = networkMapKeys.detail(id)
      await queryClient.cancelQueries({ queryKey })
      const previousMap = queryClient.getQueryData(queryKey)
      if (previousMap) {
        queryClient.setQueryData(queryKey, {
          ...previousMap,
          ...serializeNetworkMapContent(map, positionOverrides),
        })
      }
      return { previousMap }
    },
    onError: (_err, { id }, context) => {
      if (context) queryClient.setQueryData(networkMapKeys.detail(id), context.previousMap)
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: networkMapKeys.detail(id) })
    },
  })
}
