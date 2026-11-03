import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as assetManagementSchemaApi from '@/api/assetManagementSchemaApi'
import { MODERATE_TIER } from './config'

export const assetAttributeKeys = {
  all: () => ['assetManagementSchema'],
  list: () => ['assetManagementSchema', 'list'],
  detail: (name) => ['assetManagementSchema', 'detail', name],
}

export function useAssetManagementSchema() {
  return useQuery({
    queryKey: assetAttributeKeys.list(),
    queryFn: async () => {
      const result = await assetManagementSchemaApi.getAssetManagementSchema()
      return result.attributes ?? []
    },
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} name
 */
export function useAssetAttribute(name) {
  return useQuery({
    queryKey: computed(() => assetAttributeKeys.detail(toValue(name))),
    queryFn: () => assetManagementSchemaApi.getAssetAttribute(toValue(name)),
    enabled: computed(() => {
      const n = toValue(name)
      return !!n && n !== 'new'
    }),
    ...MODERATE_TIER,
  })
}

export function useCreateAssetAttribute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => assetManagementSchemaApi.createAssetAttribute(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetAttributeKeys.all() }),
  })
}

export function useUpdateAssetAttribute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, data }) => assetManagementSchemaApi.updateAssetAttribute(name, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetAttributeKeys.all() }),
  })
}

export function useDeleteAssetAttribute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => assetManagementSchemaApi.deleteAssetAttribute(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetAttributeKeys.all() }),
  })
}
