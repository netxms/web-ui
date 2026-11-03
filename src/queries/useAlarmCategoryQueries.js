import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as alarmCategoriesApi from '@/api/alarmCategoriesApi'
import { MODERATE_TIER } from './config'

export const alarmCategoryKeys = {
  all: () => ['alarmCategories'],
  list: () => ['alarmCategories', 'list'],
}

export function useAlarmCategories() {
  return useQuery({
    queryKey: alarmCategoryKeys.list(),
    queryFn: () => alarmCategoriesApi.getAlarmCategories(),
    ...MODERATE_TIER,
  })
}

export function useCreateAlarmCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => alarmCategoriesApi.createAlarmCategory(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmCategoryKeys.all() }),
  })
}

export function useUpdateAlarmCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, data }) => alarmCategoriesApi.updateAlarmCategory(categoryId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmCategoryKeys.all() }),
  })
}

export function useDeleteAlarmCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId }) => alarmCategoriesApi.deleteAlarmCategory(categoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmCategoryKeys.all() }),
  })
}
