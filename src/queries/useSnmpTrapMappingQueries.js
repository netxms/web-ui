// Create and update seed the detail cache from the server's answer, so the editor reloads into
// the mapping as stored.
import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as snmpTrapMappingsApi from '@/api/snmpTrapMappingsApi'
import { STATIC_TIER } from './config'

export const snmpTrapMappingKeys = {
  all: () => ['snmpTrapMappings'],
  list: () => ['snmpTrapMappings', 'list'],
  detail: (id) => ['snmpTrapMappings', 'detail', id],
}

export function useSnmpTrapMappings() {
  return useQuery({
    queryKey: snmpTrapMappingKeys.list(),
    queryFn: () => snmpTrapMappingsApi.getSnmpTrapMappings(),
    ...STATIC_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} mappingId
 */
export function useSnmpTrapMapping(mappingId) {
  return useQuery({
    queryKey: computed(() => snmpTrapMappingKeys.detail(toValue(mappingId))),
    queryFn: () => snmpTrapMappingsApi.getSnmpTrapMapping(toValue(mappingId)),
    enabled: computed(() => toValue(mappingId) > 0),
    ...STATIC_TIER,
  })
}

/** Resolves to the mapping as created. */
export function useCreateSnmpTrapMapping() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => snmpTrapMappingsApi.createSnmpTrapMapping(data),
    onSuccess: (mapping) => {
      queryClient.setQueryData(snmpTrapMappingKeys.detail(mapping.id), mapping)
      queryClient.invalidateQueries({ queryKey: snmpTrapMappingKeys.list() })
    },
  })
}

/** Takes `{ id, data }`, resolves to the mapping as stored. */
export function useUpdateSnmpTrapMapping() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => snmpTrapMappingsApi.updateSnmpTrapMapping(id, data),
    onSuccess: (mapping) => {
      queryClient.setQueryData(snmpTrapMappingKeys.detail(mapping.id), mapping)
      queryClient.invalidateQueries({ queryKey: snmpTrapMappingKeys.list() })
    },
  })
}

/** Takes the mapping id. */
export function useDeleteSnmpTrapMapping() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => snmpTrapMappingsApi.deleteSnmpTrapMapping(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: snmpTrapMappingKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: snmpTrapMappingKeys.list() })
    },
  })
}
