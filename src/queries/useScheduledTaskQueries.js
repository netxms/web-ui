import { computed } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as scheduledTasksApi from '@/api/scheduledTasksApi'
import { MODERATE_TIER, STATIC_TIER } from './config'

export const scheduledTaskKeys = {
  all: () => ['scheduledTasks'],
  list: () => ['scheduledTasks', 'list'],
  detail: (id) => ['scheduledTasks', 'detail', id],
  handlers: () => ['scheduledTasks', 'handlers'],
}

export function useScheduledTaskHandlers() {
  return useQuery({
    queryKey: scheduledTaskKeys.handlers(),
    queryFn: () => scheduledTasksApi.getScheduledTaskHandlers(),
    ...STATIC_TIER,
  })
}

export function useScheduledTasks() {
  return useQuery({
    queryKey: scheduledTaskKeys.list(),
    queryFn: () => scheduledTasksApi.getScheduledTasks(),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').Ref<string|number|null>} id
 */
export function useScheduledTask(id) {
  return useQuery({
    queryKey: computed(() => scheduledTaskKeys.detail(id.value)),
    queryFn: () => scheduledTasksApi.getScheduledTask(id.value),
    enabled: computed(() => !!id.value),
    ...MODERATE_TIER,
  })
}

export function useCreateScheduledTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => scheduledTasksApi.createScheduledTask(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scheduledTaskKeys.all() }),
  })
}

export function useUpdateScheduledTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => scheduledTasksApi.updateScheduledTask(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: scheduledTaskKeys.all() })
      queryClient.invalidateQueries({ queryKey: scheduledTaskKeys.detail(id) })
    },
  })
}

export function useDeleteScheduledTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => scheduledTasksApi.deleteScheduledTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scheduledTaskKeys.all() }),
  })
}
