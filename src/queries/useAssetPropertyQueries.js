import { computed, toValue } from 'vue'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as assetApi from '@/api/assetApi'
import { MODERATE_TIER } from './config'

export const assetPropertyKeys = {
  all: (objectId) => ['assetProperties', toValue(objectId)],
}

/**
 * @param {import('vue').MaybeRefOrGetter} objectId
 */
export function useAssetProperties(objectId) {
  return useQuery({
    queryKey: computed(() => assetPropertyKeys.all(objectId)),
    queryFn: () => assetApi.getAssetProperties(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
  })
}

export function useAssetPropertiesBatch(objectIds) {
  const results = useQueries({
    queries: computed(() =>
      (toValue(objectIds) ?? []).map((id) => ({
        queryKey: assetPropertyKeys.all(id),
        queryFn: () => assetApi.getAssetProperties(id),
        enabled: !!id,
        ...MODERATE_TIER,
      })),
    ),
  })

  const propertiesById = computed(() => {
    const map = new Map()
    const ids = toValue(objectIds) ?? []
    for (let i = 0; i < ids.length; i++) {
      map.set(ids[i], results.value[i]?.data ?? {})
    }
    return map
  })

  const isLoading = computed(() => results.value.some((r) => r.isPending))

  return { propertiesById, isLoading }
}

export function useUpdateAssetProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ objectId, name, value }) => assetApi.updateAssetProperty(objectId, name, value),
    onSuccess: (_, { objectId }) =>
      queryClient.invalidateQueries({ queryKey: assetPropertyKeys.all(objectId) }),
  })
}

export function useDeleteAssetProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ objectId, name }) => assetApi.deleteAssetProperty(objectId, name),
    onSuccess: (_, { objectId }) =>
      queryClient.invalidateQueries({ queryKey: assetPropertyKeys.all(objectId) }),
  })
}
