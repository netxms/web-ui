import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as scriptApi from '@/api/scriptApi'
import { MODERATE_TIER } from './config'

export const scriptKeys = {
  all: () => ['scripts'],
  list: () => ['scripts', 'list'],
  detail: (id) => ['scripts', 'detail', id],
}

/**
 * Id and name only.
 * @param {import('vue').MaybeRefOrGetter<boolean>} [enabled]
 */
export function useScriptLibrary(enabled = true) {
  return useQuery({
    queryKey: scriptKeys.list(),
    queryFn: () => scriptApi.getScriptLibrary(),
    enabled: computed(() => toValue(enabled)),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter<number|null>} scriptId
 */
export function useScript(scriptId) {
  return useQuery({
    queryKey: computed(() => scriptKeys.detail(toValue(scriptId))),
    queryFn: () => scriptApi.getScript(toValue(scriptId)),
    enabled: computed(() => !!toValue(scriptId)),
    ...MODERATE_TIER,
  })
}

export function useCreateScript() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, code }) => scriptApi.createScript(name, code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scriptKeys.list() }),
  })
}

export function useUpdateScript() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ scriptId, name, code }) => scriptApi.updateScript(scriptId, name, code),
    onSuccess: (_, { scriptId }) => {
      queryClient.invalidateQueries({ queryKey: scriptKeys.detail(scriptId) })
      queryClient.invalidateQueries({ queryKey: scriptKeys.list() })
    },
  })
}

export function useDeleteScript() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scriptId) => scriptApi.deleteScript(scriptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scriptKeys.list() }),
  })
}
