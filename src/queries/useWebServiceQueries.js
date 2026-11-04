import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as webServicesApi from '@/api/webServicesApi'
import { MODERATE_TIER } from './config'

export const webServiceKeys = {
  all: () => ['web-service-definitions'],
  list: () => ['web-service-definitions', 'list'],
}

/**
 * @param {import('vue').MaybeRefOrGetter<boolean>} [enabled]
 */
export function useWebServiceDefinitions(enabled = true) {
  return useQuery({
    queryKey: webServiceKeys.list(),
    queryFn: () => webServicesApi.getWebServiceDefinitions(),
    enabled: computed(() => toValue(enabled)),
    ...MODERATE_TIER,
  })
}

export function useCreateWebServiceDefinition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => webServicesApi.createWebServiceDefinition(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webServiceKeys.all() }),
  })
}

export function useUpdateWebServiceDefinition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => webServicesApi.updateWebServiceDefinition(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webServiceKeys.all() })
    },
  })
}

export function useDeleteWebServiceDefinition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => webServicesApi.deleteWebServiceDefinition(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webServiceKeys.all() }),
  })
}
