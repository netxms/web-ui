import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as serverActionsApi from '@/api/serverActionsApi'
import { MODERATE_TIER } from './config'

export const serverActionKeys = {
  all: () => ['serverActions'],
  list: () => ['serverActions', 'list'],
  detail: (id) => ['serverActions', 'detail', id],
}

export function useServerActions() {
  return useQuery({
    queryKey: serverActionKeys.list(),
    queryFn: () => serverActionsApi.getServerActions(),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} actionId
 */
export function useServerAction(actionId) {
  return useQuery({
    queryKey: computed(() => serverActionKeys.detail(toValue(actionId))),
    queryFn: () => serverActionsApi.getServerAction(toValue(actionId)),
    enabled: computed(() => {
      const id = toValue(actionId)
      return !!id && id !== 'new'
    }),
    ...MODERATE_TIER,
  })
}

export function useCreateServerAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => serverActionsApi.createServerAction(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serverActionKeys.all() }),
  })
}

export function useUpdateServerAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => serverActionsApi.updateServerAction(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serverActionKeys.all() }),
  })
}

export function useDeleteServerAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => serverActionsApi.deleteServerAction(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serverActionKeys.all() }),
  })
}
