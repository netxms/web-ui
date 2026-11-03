import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as eventTemplatesApi from '@/api/eventTemplatesApi'
import { MODERATE_TIER } from './config'

export const eventTemplateKeys = {
  all: () => ['eventTemplates'],
  list: () => ['eventTemplates', 'list'],
  detail: (code) => ['eventTemplates', 'detail', code],
}

export function useEventTemplates() {
  return useQuery({
    queryKey: eventTemplateKeys.list(),
    queryFn: () => eventTemplatesApi.getEventTemplates(),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} code
 */
export function useEventTemplate(code) {
  return useQuery({
    queryKey: computed(() => eventTemplateKeys.detail(toValue(code))),
    queryFn: () => eventTemplatesApi.getEventTemplate(toValue(code)),
    enabled: computed(() => {
      const c = toValue(code)
      return !!c && c !== 'new'
    }),
    ...MODERATE_TIER,
  })
}

export function useCreateEventTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => eventTemplatesApi.createEventTemplate(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventTemplateKeys.all() }),
  })
}

export function useUpdateEventTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ code, data }) => eventTemplatesApi.updateEventTemplate(code, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventTemplateKeys.all() }),
  })
}

export function useDeleteEventTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code) => eventTemplatesApi.deleteEventTemplate(code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventTemplateKeys.all() }),
  })
}
