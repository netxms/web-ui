// Create and update seed the detail cache from the server's answer (numeric keys normalized), so
// the editor reloads into the table as stored.
import { computed, toValue } from 'vue'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as mappingTablesApi from '@/api/mappingTablesApi'
import { lookupMappedValue } from '@/utils/mappingTables'
import { STATIC_TIER } from './config'

export const mappingTableKeys = {
  all: () => ['mappingTables'],
  list: () => ['mappingTables', 'list'],
  detail: (id) => ['mappingTables', 'detail', id],
}

/** Without elements. */
export function useMappingTables() {
  return useQuery({
    queryKey: mappingTableKeys.list(),
    queryFn: () => mappingTablesApi.getMappingTables(),
    ...STATIC_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} tableId
 */
export function useMappingTable(tableId) {
  return useQuery({
    queryKey: computed(() => mappingTableKeys.detail(toValue(tableId))),
    queryFn: () => mappingTablesApi.getMappingTable(toValue(tableId)),
    enabled: computed(() => toValue(tableId) > 0),
    ...STATIC_TIER,
  })
}

/**
 * Mapped display values for DCI current values (legacy `MappingTableCache`), through the
 * editor's detail cache. A table that cannot be loaded maps nothing.
 *
 * @param {import('vue').MaybeRefOrGetter<object[]>} dciValues - current-value rows
 * @returns {{ mappedValue: (dciValue: object | null | undefined) => string | null }}
 */
export function useDciValueMapping(dciValues) {
  const tableIds = computed(() => {
    const ids = new Set()
    for (const value of toValue(dciValues) ?? []) {
      if (value?.mappingTableId > 0) ids.add(value.mappingTableId)
    }
    return [...ids].sort((a, b) => a - b)
  })

  const results = useQueries({
    queries: computed(() =>
      tableIds.value.map((id) => ({
        queryKey: mappingTableKeys.detail(id),
        queryFn: () => mappingTablesApi.getMappingTable(id),
        ...STATIC_TIER,
      })),
    ),
  })

  // By the id the table carries, not position: results can trail the id list by a tick.
  const tablesById = computed(() => {
    const byId = new Map()
    for (const result of results.value) {
      if (result.data) byId.set(result.data.id, result.data)
    }
    return byId
  })

  function mappedValue(dciValue) {
    if (!(dciValue?.mappingTableId > 0)) return null
    return lookupMappedValue(tablesById.value.get(dciValue.mappingTableId), dciValue.value)
  }

  return { mappedValue }
}

/** Resolves to the table as created. */
export function useCreateMappingTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => mappingTablesApi.createMappingTable(data),
    onSuccess: (table) => {
      queryClient.setQueryData(mappingTableKeys.detail(table.id), table)
      queryClient.invalidateQueries({ queryKey: mappingTableKeys.list() })
    },
  })
}

/** Takes `{ id, data }`, resolves to the table as stored. */
export function useUpdateMappingTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => mappingTablesApi.updateMappingTable(id, data),
    onSuccess: (table) => {
      queryClient.setQueryData(mappingTableKeys.detail(table.id), table)
      queryClient.invalidateQueries({ queryKey: mappingTableKeys.list() })
    },
  })
}

/** Takes the table id. */
export function useDeleteMappingTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => mappingTablesApi.deleteMappingTable(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: mappingTableKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: mappingTableKeys.list() })
    },
  })
}
