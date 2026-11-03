import { computed, toValue } from 'vue'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as dashboardsApi from '@/api/dashboardsApi'
import { MODERATE_TIER, STATIC_TIER } from './config'

export const dashboardKeys = {
  all: () => ['dashboards'],
  tree: () => ['dashboards', 'tree'],
  detail: (id) => ['dashboards', 'detail', id],
}

export function useDashboardTree() {
  return useQuery({
    queryKey: dashboardKeys.tree(),
    queryFn: () => dashboardsApi.getDashboardTree(),
    ...STATIC_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} dashboardId
 */
export function useDashboard(dashboardId) {
  return useQuery({
    queryKey: computed(() => dashboardKeys.detail(toValue(dashboardId))),
    queryFn: () => dashboardsApi.getDashboard(toValue(dashboardId)),
    enabled: computed(() => !!toValue(dashboardId)),
    ...MODERATE_TIER,
  })
}

/**
 * Map<dashboardId, dashboard>, sharing the cache with useDashboard().
 * @param {import('vue').MaybeRefOrGetter<number[]>} ids
 */
export function useDashboardsByIds(ids) {
  const results = useQueries({
    queries: computed(() =>
      (toValue(ids) ?? []).map((id) => ({
        queryKey: dashboardKeys.detail(id),
        queryFn: () => dashboardsApi.getDashboard(id),
        enabled: !!id,
        ...MODERATE_TIER,
      })),
    ),
  })

  const dashboardsById = computed(() => {
    const map = new Map()
    for (const result of results.value) {
      if (result.data) map.set(result.data.id, result.data)
    }
    return map
  })

  return { dashboardsById }
}

/**
 * Also invalidates the dashboard's object document (context-view flags, display priority),
 * keyed by numeric or route-string id, hence the predicate.
 */
export function useSaveDashboard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => dashboardsApi.saveDashboard(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.detail(id) })
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === 'objects' &&
          queryKey[1] === 'detail' &&
          String(queryKey[2]) === String(id),
      })
    },
  })
}
