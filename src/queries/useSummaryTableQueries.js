import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as summaryTablesApi from '@/api/summaryTablesApi'
import { MODERATE_TIER, STATIC_TIER } from './config'

export const summaryTableKeys = {
  all: () => ['summaryTables'],
  list: () => ['summaryTables', 'list'],
  detail: (id) => ['summaryTables', 'detail', id],
  query: (tableId, objectId) => ['summaryTables', 'query', tableId, objectId],
}

export function useSummaryTables() {
  return useQuery({
    queryKey: summaryTableKeys.list(),
    queryFn: () => summaryTablesApi.getSummaryTables(),
    ...STATIC_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} tableId
 */
export function useSummaryTable(tableId) {
  return useQuery({
    queryKey: computed(() => summaryTableKeys.detail(toValue(tableId))),
    queryFn: () => summaryTablesApi.getSummaryTable(toValue(tableId)),
    enabled: computed(() => {
      const id = toValue(tableId)
      return !!id && id !== 'new'
    }),
    ...STATIC_TIER,
  })
}

/**
 * For the dci-summary-table dashboard widget.
 * @param {import('vue').MaybeRefOrGetter<number>} tableId
 * @param {import('vue').MaybeRefOrGetter<number>} objectId
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 * @param {number} [options.refetchInterval] - ms
 */
export function useQuerySummaryTable(tableId, objectId, options = {}) {
  return useQuery({
    queryKey: computed(() => summaryTableKeys.query(toValue(tableId), toValue(objectId))),
    queryFn: () => summaryTablesApi.querySummaryTable(toValue(tableId), toValue(objectId)),
    enabled: computed(
      () => !!toValue(tableId) && !!toValue(objectId) && toValue(options.enabled) !== false,
    ),
    ...MODERATE_TIER,
    ...(options.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  })
}

export function useCreateSummaryTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => summaryTablesApi.createSummaryTable(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: summaryTableKeys.all() }),
  })
}

export function useUpdateSummaryTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => summaryTablesApi.updateSummaryTable(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: summaryTableKeys.all() }),
  })
}

export function useDeleteSummaryTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => summaryTablesApi.deleteSummaryTable(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: summaryTableKeys.all() }),
  })
}
