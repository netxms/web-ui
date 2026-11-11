import { computed, toValue } from 'vue'
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/vue-query'
import * as objectsApi from '@/api/objectsApi'
import { executeDashboardScript } from '@/api/scriptApi'
import {
  adaptObject,
  adaptBaseObject,
  adaptDciCurrentValues,
  adaptDciValue,
  adaptRackLayout,
  adaptChassisLayout,
} from '@/api/objectAdapters'
import { buildHistoryParams } from '@/utils/dciChartModel'
import { dciValueKey } from '@/utils/dciValues'
import { STATIC_TIER, MODERATE_TIER, VOLATILE_TIER } from './config'

export const objectKeys = {
  all: () => ['objects'],
  list: (params) => ['objects', 'list', params],
  detail: (id) => ['objects', 'detail', id],
  /** Read through a network map or dashboard: the server may answer with a partial document. */
  delegated: (delegateId, id) => ['objects', 'delegated', delegateId, id],
  subTree: (id, filter) => ['objects', 'subTree', id, filter],
  children: (id, classes) => ['objects', 'children', id, classes],
  dciCurrentValues: (objectId) => ['objects', 'dciCurrentValues', objectId],
  /** Values of an explicit DCI list: `keys` are the sorted `dciValueKey`s of its items. */
  dciValues: (delegate, keys) => ['objects', 'dciValues', delegate, keys],
  dciTableValue: (objectId, dciId) => ['objects', 'dciTableValue', objectId, dciId],
  dciHistory: (objectId, dciId, rangeSeconds) => [
    'objects',
    'dciHistory',
    objectId,
    dciId,
    rangeSeconds,
  ],
  performanceDcis: (objectId) => ['objects', 'performanceDcis', objectId],
  scriptedChart: (dashboardId, elementIndex, contextObjectId) => [
    'objects',
    'scriptedChart',
    dashboardId,
    elementIndex,
    contextObjectId,
  ],
  statusExplanation: (id) => ['objects', 'statusExplanation', id],
  rackLayout: (id) => ['objects', 'rackLayout', id],
  // unitSystem is a cache discriminator, not a request parameter: the layout is cached in the
  // chassis's own units. Omit it for a prefix key matching every unit variant.
  chassisLayout: (id, unitSystem) => [
    'objects',
    'chassisLayout',
    id,
    ...(unitSystem ? [unitSystem] : []),
  ],
  // Prefix keys: a placement response names only the moved object.
  rackLayouts: () => ['objects', 'rackLayout'],
  chassisLayouts: () => ['objects', 'chassisLayout'],
  agentConfig: (id) => ['objects', 'agentConfig', id],
  snmpConfig: (id) => ['objects', 'snmpConfig', id],
  query: (params) => ['objects', 'query', params],
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 */
export function useObject(objectId) {
  return useQuery({
    queryKey: computed(() => objectKeys.detail(toValue(objectId))),
    queryFn: () => objectsApi.getObject(toValue(objectId)),
    select: adaptObject,
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 */
export function useObjectAgentConfig(objectId) {
  return useQuery({
    queryKey: computed(() => objectKeys.agentConfig(toValue(objectId))),
    queryFn: () => objectsApi.getObjectAgentConfig(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 */
export function useObjectSnmpConfig(objectId) {
  return useQuery({
    queryKey: computed(() => objectKeys.snmpConfig(toValue(objectId))),
    queryFn: () => objectsApi.getObjectSnmpConfig(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 */
export function useObjectStatusExplanation(objectId) {
  return useQuery({
    queryKey: computed(() => objectKeys.statusExplanation(toValue(objectId))),
    queryFn: () => objectsApi.getObjectStatusExplanation(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId)),
    ...VOLATILE_TIER,
  })
}

/**
 * One query per object; `objectsApi.getObject` coalesces the requests into one bulk request per
 * tick. With `delegate`, partial documents are cached under `objectKeys.delegated` only, never
 * under `objectKeys.detail`.
 *
 * @param {import('vue').MaybeRefOrGetter<number[]>} ids
 * @param {object} [options]
 * @param {'interactive'|'background'} [options.priority] - default 'background'; 'interactive'
 *   only for a short list the user is actively waiting on
 * @param {import('vue').MaybeRefOrGetter<number>} [options.delegate]
 * @returns {{
 *   objectsById: import('vue').ComputedRef<Map<number, object>>,
 *   isFetching: import('vue').ComputedRef<boolean>,
 *   unresolvedIds: import('vue').ComputedRef<number[]>
 * }} `unresolvedIds` are the ones that errored (typically no read access)
 */
export function useObjectsByIds(ids, options = {}) {
  const priority = options.priority ?? 'background'
  const queryClient = useQueryClient()

  function delegatedQuery(delegate, id) {
    return {
      queryKey: objectKeys.delegated(delegate, id),
      queryFn: async ({ signal }) => {
        const doc = await objectsApi.getObject(id, { signal, priority, delegate })
        if (!doc?.partial) queryClient.setQueryData(objectKeys.detail(id), doc)
        return doc
      },
      initialData: () => queryClient.getQueryData(objectKeys.detail(id)),
      initialDataUpdatedAt: () => queryClient.getQueryState(objectKeys.detail(id))?.dataUpdatedAt,
      select: adaptObject,
      enabled: !!id,
      ...MODERATE_TIER,
    }
  }

  const results = useQueries({
    queries: computed(() => {
      const delegate = Number(toValue(options.delegate)) || 0
      return (toValue(ids) ?? []).map((id) =>
        delegate
          ? delegatedQuery(delegate, id)
          : {
              queryKey: objectKeys.detail(id),
              queryFn: ({ signal }) => objectsApi.getObject(id, { signal, priority }),
              select: adaptObject,
              enabled: !!id,
              ...MODERATE_TIER,
            },
      )
    }),
  })

  const objectsById = computed(() => {
    const map = new Map()
    for (const result of results.value) {
      if (result.data) map.set(result.data.id, result.data)
    }
    return map
  })

  const isFetching = computed(() => results.value.some((result) => result.isFetching))

  const unresolvedIds = computed(() => {
    const requested = toValue(ids) ?? []
    return requested.filter((id, index) => id && results.value[index]?.isError)
  })

  return { objectsById, isFetching, unresolvedIds }
}

/**
 * Not `useObjects()`: `GET /v1/objects` returns only the perspective roots. The search endpoint
 * takes no result limit, so keep this off hot paths.
 *
 * @param {import('vue').MaybeRefOrGetter<string[]>} classes - class names, e.g. ['Node']
 */
export function useObjectsByClass(classes) {
  return useQuery({
    queryKey: computed(() => objectKeys.list({ class: toValue(classes) })),
    queryFn: () => objectsApi.searchObjects({ class: toValue(classes) }),
    enabled: computed(() => (toValue(classes) ?? []).length > 0),
    ...STATIC_TIER,
  })
}

/**
 * Full objects, because `uin` is not in search summaries or tree nodes. In no particular order.
 *
 * @param {{ enabled?: import('vue').MaybeRefOrGetter<boolean> }} [options]
 */
export function useZones(options = {}) {
  const { data: zoneSummaries } = useQuery({
    queryKey: objectKeys.list({ class: 'Zone' }),
    queryFn: () => objectsApi.searchObjects({ class: ['Zone'] }),
    enabled: computed(() => toValue(options.enabled ?? true)),
    ...STATIC_TIER,
  })

  const { objectsById } = useObjectsByIds(
    computed(() => (zoneSummaries.value ?? []).map((zone) => zone.id)),
  )

  return computed(() => [...objectsById.value.values()])
}

/** Map<zoneUIN, zoneName> */
export function useZoneNames() {
  const zones = useZones()
  return computed(() => new Map(zones.value.map((zone) => [zone.uin, zone.name])))
}

/**
 * @param {import('vue').MaybeRefOrGetter} rootId
 * @param {import('vue').MaybeRefOrGetter} [filter]
 */
export function useObjectTree(rootId, filter) {
  return useQuery({
    queryKey: computed(() => objectKeys.subTree(toValue(rootId), toValue(filter) || undefined)),
    queryFn: () => objectsApi.getObjectSubTree(toValue(rootId), toValue(filter) || undefined),
    select: (items) => items.map(adaptBaseObject),
    enabled: computed(() => !!toValue(rootId)),
    ...STATIC_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {number} [options.refetchInterval] - ms
 */
export function useDciCurrentValues(objectId, options = {}) {
  return useQuery({
    queryKey: computed(() => objectKeys.dciCurrentValues(toValue(objectId))),
    queryFn: () => objectsApi.getDciCurrentValues(toValue(objectId)),
    select: adaptDciCurrentValues,
    enabled: computed(() => !!toValue(objectId) && toValue(options.enabled) !== false),
    ...VOLATILE_TIER,
    ...(options.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  })
}

/**
 * Current values of an explicit DCI list, possibly across objects; every caller's list in the
 * same tick goes out as one bulk request. `useDciCurrentValues` is for an object's whole list.
 *
 * @param {import('vue').MaybeRefOrGetter<Array<{objectId: number, dciId: number,
 *   column?: string, instance?: string} | null>>} items - null entries are skipped
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<number>} [options.delegate] - network map or
 *   dashboard id, for objects the user can see only through it
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {import('vue').MaybeRefOrGetter<number | false>} [options.refetchInterval] - ms
 * @param {'interactive'|'background'} [options.priority] - polling should pass 'background'
 * @param {object} [options.tier] - cache tier preset, VOLATILE_TIER by default
 * @returns the query, plus `valueOf(item)`: the adapted DCIValue row, or null while loading or
 *   when the server cannot serve it
 */
export function useDciValues(items, options = {}) {
  const itemsByKey = computed(() => {
    const unique = new Map()
    for (const item of toValue(items) ?? []) if (item) unique.set(dciValueKey(item), item)
    return unique
  })
  const delegate = computed(() => Number(toValue(options.delegate)) || 0)

  const query = useQuery({
    // Sorted, so the same DCIs are the same query whatever order they are listed in.
    queryKey: computed(() =>
      objectKeys.dciValues(delegate.value, [...itemsByKey.value.keys()].sort()),
    ),
    queryFn: async ({ signal }) => {
      const values = await objectsApi.getDciValues([...itemsByKey.value.values()], {
        signal,
        priority: options.priority,
        delegate: delegate.value,
      })
      const adapted = {}
      for (const key in values) adapted[key] = adaptDciValue(values[key])
      return adapted
    },
    enabled: computed(() => itemsByKey.value.size > 0 && toValue(options.enabled) !== false),
    ...(options.tier ?? VOLATILE_TIER),
    ...(options.refetchInterval != null ? { refetchInterval: options.refetchInterval } : {}),
    // A changed list is a new key: keep the values already shown while it loads.
    placeholderData: keepPreviousData,
  })

  function valueOf(item) {
    return item ? (query.data.value?.[dciValueKey(item)] ?? null) : null
  }

  return { ...query, valueOf }
}

/**
 * TableData document of the DCI's last value.
 *
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @param {import('vue').MaybeRefOrGetter} dciId
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {number} [options.refetchInterval] - ms
 */
export function useDciTableValue(objectId, dciId, options = {}) {
  return useQuery({
    queryKey: computed(() => objectKeys.dciTableValue(toValue(objectId), toValue(dciId))),
    queryFn: () => objectsApi.getDciTableValue(toValue(objectId), toValue(dciId)),
    enabled: computed(
      () => !!toValue(objectId) && !!toValue(dciId) && toValue(options.enabled) !== false,
    ),
    ...VOLATILE_TIER,
    ...(options.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  })
}

/**
 * Shared with prefetching callers, so both land in the same cache entry.
 *
 * @param {number} objectId
 * @param {number} dciId
 * @param {object} [options]
 * @param {number} [options.timeRangeSeconds] - the last 24h when omitted
 * @param {number|null} [options.endAt] - Unix seconds; null means "now"
 */
export function dciHistoryQuery(objectId, dciId, { timeRangeSeconds, endAt } = {}) {
  const rangeSeconds = timeRangeSeconds || 24 * 60 * 60
  const end = endAt ?? null
  return {
    queryKey: [...objectKeys.dciHistory(objectId, dciId, rangeSeconds), end],
    queryFn: () => {
      const timeTo = end ?? Math.floor(Date.now() / 1000)
      return objectsApi.getDciHistory(objectId, dciId, {
        timeFrom: timeTo - rangeSeconds,
        timeTo,
        maxRows: 500,
      })
    },
    ...MODERATE_TIER,
  }
}

/**
 * Up to 500 points.
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @param {import('vue').MaybeRefOrGetter} dciId
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {import('vue').MaybeRefOrGetter<number>} [options.timeRangeSeconds]
 * @param {import('vue').MaybeRefOrGetter<number|null>} [options.endAt] - Unix seconds; null
 *   means "now"
 * @param {number} [options.refetchInterval] - ms
 */
export function useDciHistory(objectId, dciId, options = {}) {
  const query = computed(() =>
    dciHistoryQuery(toValue(objectId), toValue(dciId), {
      timeRangeSeconds: toValue(options.timeRangeSeconds),
      endAt: toValue(options.endAt),
    }),
  )
  return useQuery({
    queryKey: computed(() => query.value.queryKey),
    queryFn: () => query.value.queryFn(),
    enabled: computed(
      () => !!toValue(objectId) && !!toValue(dciId) && toValue(options.enabled) !== false,
    ),
    ...MODERATE_TIER,
    ...(options.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  })
}

/**
 * @returns {(objectId: number, dciId: number, options?: object) => Promise<void>} takes the
 *   same arguments as `dciHistoryQuery`
 */
export function usePrefetchDciHistory() {
  const queryClient = useQueryClient()
  return (objectId, dciId, options) =>
    queryClient.prefetchQuery(dciHistoryQuery(objectId, dciId, options))
}

/**
 * The key carries the request's shape, not an absolute window: a preset means "ending now", and
 * `queryFn` resolves it at call time. A custom range is absolute and is part of the key.
 *
 * @param {import('vue').MaybeRefOrGetter<object>} model - see utils/dciChartModel
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @returns {import('vue').Ref<Array>} one query result per `model.dcis` entry, in order
 */
export function useDciChartSeries(model, options = {}) {
  return useQueries({
    queries: computed(() => {
      const spec = toValue(model)
      const enabled = toValue(options.enabled) !== false
      const time = spec?.time ?? {}
      const timeKey =
        time.preset === 'custom' ? `custom:${time.from}:${time.to}` : (time.preset ?? '')

      return (spec?.dcis ?? []).map((dci) => ({
        queryKey: [
          'objects',
          'dciChartSeries',
          dci.nodeId,
          dci.dciId,
          timeKey,
          spec.tier,
          spec.raw,
          spec.band,
        ],
        queryFn: () => objectsApi.getDciHistory(dci.nodeId, dci.dciId, buildHistoryParams(spec)),
        enabled: enabled && !!dci.nodeId && !!dci.dciId,
        ...MODERATE_TIER,
        ...(spec.live ? { refetchInterval: (spec.refreshSeconds || 30) * 1000 } : {}),
      }))
    }),
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 */
export function useObjectSubTree(objectId) {
  return useQuery({
    queryKey: computed(() => objectKeys.subTree(toValue(objectId))),
    queryFn: () => objectsApi.getObjectSubTree(toValue(objectId)),
    select: (items) => items.map(adaptBaseObject),
    enabled: computed(() => !!toValue(objectId)),
    ...VOLATILE_TIER,
  })
}

/**
 * Full object details for each child.
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @param {string[]} [classes] - class names to filter by (e.g. ['Interface'])
 */
export function useObjectChildren(objectId, classes) {
  return useQuery({
    queryKey: computed(() => objectKeys.children(toValue(objectId), classes)),
    queryFn: () =>
      objectsApi
        .getObjectChildren(toValue(objectId), { classes })
        .then((raw) => raw.map(adaptObject)),
    enabled: computed(() => !!toValue(objectId)),
    ...VOLATILE_TIER,
  })
}

/**
 * Includes parsed chartConfig.
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 */
export function usePerformanceDcis(objectId, options = {}) {
  return useQuery({
    queryKey: computed(() => objectKeys.performanceDcis(toValue(objectId))),
    queryFn: () => objectsApi.getPerformanceDcis(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId) && toValue(options.enabled) !== false),
    ...MODERATE_TIER,
  })
}

/**
 * Perspective roots only (`GET /v1/objects`); use `useObjectsByClass()` to find objects of a class.
 * @param {import('vue').MaybeRefOrGetter} [params]
 */
export function useObjects(params) {
  return useQuery({
    queryKey: computed(() => objectKeys.list(toValue(params))),
    queryFn: () => objectsApi.getObjects(toValue(params) || {}),
    ...STATIC_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter<number>} objectId
 */
export function useRackLayout(objectId) {
  return useQuery({
    queryKey: computed(() => objectKeys.rackLayout(toValue(objectId))),
    queryFn: () => objectsApi.getRackLayout(toValue(objectId)).then(adaptRackLayout),
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter<number>} objectId
 * @param {import('vue').MaybeRefOrGetter<string>} [unitSystem] - 'hp-ru' or 'mm'
 */
export function useChassisLayout(objectId, unitSystem) {
  const units = computed(() => toValue(unitSystem) ?? 'hp-ru')
  return useQuery({
    queryKey: computed(() => objectKeys.chassisLayout(toValue(objectId), units.value)),
    queryFn: () =>
      objectsApi
        .getChassisLayout(toValue(objectId))
        .then((raw) => adaptChassisLayout(raw, units.value)),
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
  })
}

/**
 * Scripted dashboard elements (type 30 bar, 31 pie/donut, 33 gauge).
 * @param {import('vue').MaybeRefOrGetter<number>} dashboardId
 * @param {import('vue').MaybeRefOrGetter<number>} contextObjectId - 0 for none
 * @param {import('vue').MaybeRefOrGetter<number>} elementIndex
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {import('vue').MaybeRef<number>} [options.refetchInterval] - ms; legacy refreshes a
 *   scripted element at its own refreshRate
 */
export function useScriptedChartData(dashboardId, contextObjectId, elementIndex, options = {}) {
  return useQuery({
    queryKey: computed(() =>
      objectKeys.scriptedChart(
        toValue(dashboardId),
        toValue(elementIndex),
        toValue(contextObjectId),
      ),
    ),
    queryFn: () =>
      executeDashboardScript(toValue(dashboardId), {
        objectId: toValue(contextObjectId) ?? 0,
        elementIndex: toValue(elementIndex),
      }),
    enabled: computed(
      () =>
        !!toValue(dashboardId) &&
        toValue(elementIndex) != null &&
        toValue(options.enabled) !== false,
    ),
    ...VOLATILE_TIER,
    ...(options.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  })
}

/**
 * NXSL filter script for the "Object Query" dashboard widget.
 * @param {import('vue').MaybeRefOrGetter<object>} params
 * @param {import('vue').MaybeRefOrGetter<string>} params.query - NXSL query script
 * @param {import('vue').MaybeRefOrGetter<number>} [params.rootObjectId]
 * @param {import('vue').MaybeRefOrGetter<string[]>} [params.fields]
 * @param {import('vue').MaybeRefOrGetter<number>} [params.limit]
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {number} [options.refetchInterval] - ms
 */
export function useObjectQuery(params, options = {}) {
  const resolved = computed(() => toValue(params) ?? {})
  return useQuery({
    queryKey: computed(() => objectKeys.query(resolved.value)),
    queryFn: () => objectsApi.queryObjects(resolved.value),
    enabled: computed(() => !!resolved.value.query && toValue(options.enabled) !== false),
    ...VOLATILE_TIER,
    ...(options.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  })
}

export function useUpdateObjectProperties() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectProperties(id, payload),
    onSuccess: (_, { id, payload }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
      // `name` and `alias` show in the tree and in child lists such as Interfaces.
      queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
      queryClient.invalidateQueries({ queryKey: ['objects', 'children'] })
      // A rack's cabinet is its footprint on floor plans (`dataCenterKeys.all()`).
      if (payload && ('width' in payload || 'depth' in payload)) {
        queryClient.invalidateQueries({ queryKey: ['dataCenter'] })
      }
    },
  })
}

export function useUpdateObjectPhysicalPlacement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectPhysicalPlacement(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
      queryClient.invalidateQueries({ queryKey: objectKeys.rackLayouts() })
      queryClient.invalidateQueries({ queryKey: objectKeys.chassisLayouts() })
    },
  })
}

export function useCreatePassiveRackElement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ rackId, payload }) => objectsApi.createPassiveRackElement(rackId, payload),
    onSuccess: (_, { rackId }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.rackLayout(rackId) })
    },
  })
}

export function useUpdatePassiveRackElement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ rackId, elementId, payload }) =>
      objectsApi.updatePassiveRackElement(rackId, elementId, payload),
    onSuccess: (_, { rackId }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.rackLayout(rackId) })
    },
  })
}

export function useDeletePassiveRackElement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ rackId, elementId }) => objectsApi.deletePassiveRackElement(rackId, elementId),
    onSuccess: (_, { rackId }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.rackLayout(rackId) })
    },
  })
}

export function useSetObjectMaintenance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...options }) => objectsApi.setObjectMaintenance(id, options),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
    },
  })
}

export function useUpdateObjectLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectLocation(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectStatusCalculation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectStatusCalculation(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectCustomAttribute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, payload }) =>
      objectsApi.updateObjectCustomAttribute(id, name, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useDeleteObjectCustomAttribute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }) => objectsApi.deleteObjectCustomAttribute(id, name),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectResponsibleUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, userId, tag }) => objectsApi.updateObjectResponsibleUser(id, userId, tag),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useDeleteObjectResponsibleUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, userId }) => objectsApi.deleteObjectResponsibleUser(id, userId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectDashboards() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectDashboards(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectTrustedObjects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectTrustedObjects(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectAccessRights() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectAccessRights(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectPolling() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectPolling(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectAutoBind() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectAutoBind(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectAgentConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectAgentConfig(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: objectKeys.agentConfig(id) })
    },
  })
}

export function useUpdateObjectSnmpConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.updateObjectSnmpConfig(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: objectKeys.snmpConfig(id) })
    },
  })
}

export function useCreateObjectUrl() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }) => objectsApi.createObjectUrl(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useUpdateObjectUrl() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, urlId, payload }) => objectsApi.updateObjectUrl(id, urlId, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useDeleteObjectUrl() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, urlId }) => objectsApi.deleteObjectUrl(id, urlId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
    },
  })
}

export function useCreateObject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) => objectsApi.createObject(payload),
    onSuccess: (_, payload) => {
      if (payload.parentId != null) {
        queryClient.invalidateQueries({ queryKey: objectKeys.detail(payload.parentId) })
      }
      queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
      // The dashboard sidebar tree has its own query key
      if (['Dashboard', 'DashboardGroup', 'DashboardTemplate'].includes(payload.class)) {
        queryClient.invalidateQueries({ queryKey: ['dashboards', 'tree'] })
      }
    },
  })
}

export function useBindObjectChild() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ parentId, childId, force }) =>
      objectsApi.bindObjectChild(parentId, childId, { force }),
    onSuccess: (_, { parentId, childId }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(parentId) })
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(childId) })
      queryClient.invalidateQueries({ queryKey: ['objects', 'children', parentId] })
      queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
      // dataCenterKeys.floorPlan: a room lists the racks bound to it.
      queryClient.invalidateQueries({ queryKey: ['dataCenter', 'floorPlan', parentId] })
    },
  })
}

export function useUnbindObjectChild() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ parentId, childId, removeDci }) =>
      objectsApi.unbindObjectChild(parentId, childId, { removeDci }),
    onSuccess: (_, { parentId, childId }) => {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(parentId) })
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(childId) })
      queryClient.invalidateQueries({ queryKey: ['objects', 'children', parentId] })
      queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
      // dataCenterKeys.floorPlan: a room lists the racks bound to it.
      queryClient.invalidateQueries({ queryKey: ['dataCenter', 'floorPlan', parentId] })
    },
  })
}
