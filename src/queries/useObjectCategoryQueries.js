import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as objectCategoriesApi from '@/api/objectCategoriesApi'
import { MODERATE_TIER } from './config'

export const objectCategoryKeys = {
  all: () => ['objectCategories'],
  list: () => ['objectCategories', 'list'],
}

export function useObjectCategories() {
  return useQuery({
    queryKey: objectCategoryKeys.list(),
    queryFn: () => objectCategoriesApi.getObjectCategories(),
    ...MODERATE_TIER,
  })
}

export function useCreateObjectCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => objectCategoriesApi.createObjectCategory(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectCategoryKeys.all() }),
  })
}

export function useUpdateObjectCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, data }) =>
      objectCategoriesApi.updateObjectCategory(categoryId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectCategoryKeys.all() }),
  })
}

export function useDeleteObjectCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, force }) =>
      objectCategoriesApi.deleteObjectCategory(categoryId, force ?? false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectCategoryKeys.all() }),
  })
}
