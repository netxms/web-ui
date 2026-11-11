import { computed, toValue } from 'vue'
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/vue-query'
import * as dataCenterApi from '@/api/dataCenterApi'
import { adaptDciValue, adaptRackLayout } from '@/api/objectAdapters'
import { objectKeys } from './useObjectQueries'
import { useAlarms } from './useAlarmQueries'
import { dciValueKey } from '@/utils/dciValues'
import { mapConcurrent } from '@/utils/concurrencyLimit'
import { namedItems, taggedItems } from '@/utils/dataCenter'
import { MODERATE_TIER, VOLATILE_TIER } from './config'

export const dataCenterKeys = {
  all: () => ['dataCenter'],
  floorPlan: (roomId) => ['dataCenter', 'floorPlan', roomId],
  dcis: (objectId) => ['dataCenter', 'dcis', objectId],
  values: (keys) => ['dataCenter', 'values', keys],
  powerDomain: (id) => ['dataCenter', 'powerDomain', id],
  coolingZone: (id) => ['dataCenter', 'coolingZone', id],
}

/** Rack statuses change while geometry does not, hence the poll. */
const FLOOR_PLAN_REFRESH = 60 * 1000

/** @param {import('vue').MaybeRefOrGetter<number>} roomId */
export function useFloorPlan(roomId) {
  return useQuery({
    queryKey: computed(() => dataCenterKeys.floorPlan(toValue(roomId))),
    queryFn: ({ signal }) => dataCenterApi.getFloorPlan(toValue(roomId), { signal }),
    enabled: computed(() => !!toValue(roomId)),
    ...MODERATE_TIER,
    refetchInterval: FLOOR_PLAN_REFRESH,
  })
}

/**
 * DCIs of several objects whose system tag has one of the given bases, or whose name starts with
 * one of the given prefixes. An object whose DCI list cannot be read contributes nothing.
 *
 * @param {import('vue').MaybeRefOrGetter<number[]>} objectIds
 * @param {string[]} bases - e.g. ['env.temp.inlet', 'power.feed']
 * @param {string[]} [namePrefixes] - e.g. ['ENTSOE.CarbonIntensity(']
 * @returns {{ items: import('vue').ComputedRef<ReturnType<typeof taggedItems>>,
 *   isLoading: import('vue').ComputedRef<boolean>, isError: import('vue').ComputedRef<boolean> }}
 */
export function useTaggedDcis(objectIds, bases, namePrefixes = []) {
  const results = useQueries({
    queries: computed(() =>
      (toValue(objectIds) ?? []).map((id) => ({
        queryKey: dataCenterKeys.dcis(id),
        queryFn: () => dataCenterApi.listObjectDcis(id),
        ...MODERATE_TIER,
        retry: false,
      })),
    ),
  })
  const items = computed(() => {
    const ids = toValue(objectIds) ?? []
    return results.value.flatMap((result, i) =>
      Array.isArray(result.data)
        ? [
            ...taggedItems(ids[i], result.data, bases),
            ...namedItems(ids[i], result.data, namePrefixes),
          ]
        : [],
    )
  })
  const isLoading = computed(() => results.value.some((result) => result.isLoading))
  const isError = computed(() => results.value.some((result) => result.isError))
  return { items, isLoading, isError }
}

/**
 * Current values of tagged DCIs, demo and real alike.
 *
 * @param {import('vue').MaybeRefOrGetter<Array<{objectId: number, dciId: number}>>} items
 * @returns the query, plus `valueOf(item)`: the adapted DCIValue row or null
 */
export function useDataCenterValues(items) {
  const keys = computed(() => [...new Set((toValue(items) ?? []).map(dciValueKey))].sort())
  const query = useQuery({
    queryKey: computed(() => dataCenterKeys.values(keys.value)),
    queryFn: async ({ signal }) => {
      const raw = await dataCenterApi.getDataCenterValues(toValue(items) ?? [], {
        signal,
        priority: 'background',
      })
      const adapted = {}
      for (const key in raw) adapted[key] = adaptDciValue(raw[key])
      return adapted
    },
    enabled: computed(() => keys.value.length > 0),
    ...VOLATILE_TIER,
    placeholderData: keepPreviousData,
  })

  function valueOf(item) {
    return query.data.value?.[dciValueKey(item)] ?? null
  }

  return { ...query, valueOf }
}

const GROUP_UPDATES = {
  facility: dataCenterApi.updateFacilityConfig,
  powerDomain: dataCenterApi.updatePowerDomainConfig,
  coolingZone: dataCenterApi.updateCoolingZoneConfig,
  room: dataCenterApi.updateRoomConfig,
}

/** Merge patch of one property group: `mutate({ id, group, payload })`, group as in the document. */
export function useUpdateDataCenterGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, group, payload }) => GROUP_UPDATES[group](id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: dataCenterKeys.all() })
    },
  })
}

/** Concurrent floor plan calls; the WebAPI answers bursts badly (no keep-alive). */
const SAVE_CONCURRENCY = 3

/**
 * Floor plan save, one call per change. `mutateAsync({ roomId, ops, plan })` resolves with
 * `{ op, ok, answer, error }` per call and never rejects; when every call succeeded the cached
 * floor plan becomes `plan` before it refetches, so the view does not jump back.
 */
export function useSaveFloorPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ roomId, ops }) =>
      mapConcurrent(
        ops,
        (op) =>
          dataCenterApi.saveFloorPlanOperation(roomId, op).then(
            (answer) => ({ op, ok: true, answer }),
            (error) => ({ op, ok: false, error }),
          ),
        SAVE_CONCURRENCY,
      ),
    onSuccess: async (results, { roomId, plan }) => {
      if (!plan || !results.every((r) => r.ok)) return
      const queryKey = dataCenterKeys.floorPlan(roomId)
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, plan)
    },
    onSettled: (results, _error, { roomId, ops }) => {
      queryClient.invalidateQueries({ queryKey: dataCenterKeys.floorPlan(roomId) })
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(roomId) })
      for (const op of ops) {
        if (op.kind === 'rack')
          queryClient.invalidateQueries({ queryKey: objectKeys.detail(op.id) })
      }
    },
  })
}

/** One query per id, results by id; an id whose query fails is absent. */
function useQueryMap(ids, keyOf, read) {
  const results = useQueries({
    queries: computed(() =>
      (toValue(ids) ?? []).map((id) => ({
        queryKey: keyOf(id),
        queryFn: () => read(id),
        ...MODERATE_TIER,
      })),
    ),
  })
  const byId = computed(() => {
    const map = new Map()
    const list = toValue(ids) ?? []
    results.value.forEach((result, i) => {
      if (result.data) map.set(list[i], result.data)
    })
    return map
  })
  const isLoading = computed(() => results.value.some((result) => result.isLoading))
  return { byId, isLoading }
}

/**
 * Power domain groups by id; a domain whose group cannot be read is absent.
 *
 * @param {import('vue').MaybeRefOrGetter<number[]>} ids
 */
export function usePowerDomainConfigs(ids) {
  const { byId, isLoading } = useQueryMap(
    ids,
    dataCenterKeys.powerDomain,
    dataCenterApi.getPowerDomainConfig,
  )
  return { configs: byId, isLoading }
}

/**
 * Cooling zone groups by id; a zone whose group cannot be read is absent.
 *
 * @param {import('vue').MaybeRefOrGetter<number[]>} ids
 */
export function useCoolingZoneConfigs(ids) {
  const { byId, isLoading } = useQueryMap(
    ids,
    dataCenterKeys.coolingZone,
    dataCenterApi.getCoolingZoneConfig,
  )
  return { configs: byId, isLoading }
}

/**
 * Adapted rack layouts by rack id, under RackView's query key; a rack whose layout cannot be read
 * is absent.
 *
 * @param {import('vue').MaybeRefOrGetter<number[]>} ids
 */
export function useRackLayouts(ids) {
  const { byId, isLoading } = useQueryMap(ids, objectKeys.rackLayout, (id) =>
    dataCenterApi.getDataCenterRackLayout(id).then(adaptRackLayout),
  )
  return { layouts: byId, isLoading }
}

/**
 * Alarms for the views on an object: the app-wide alarm list, which the alarm feed keeps current,
 * or the demo alarms for a demo object, which the server does not have. Null until the list is
 * read, and when it cannot be.
 *
 * @param {import('vue').MaybeRefOrGetter<number>} objectId
 */
export function useDataCenterAlarms(objectId) {
  const demo = computed(() => dataCenterApi.isDemoDataCenterId(toValue(objectId)))
  const query = useAlarms(undefined, { enabled: computed(() => !demo.value) })
  const data = computed(() => {
    if (demo.value) return dataCenterApi.getDemoDataCenterAlarms()
    return query.isError.value ? null : (query.data.value ?? null)
  })
  return { ...query, data }
}
