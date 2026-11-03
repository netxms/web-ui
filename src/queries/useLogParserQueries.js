import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as logParserApi from '@/api/logParserApi'
import { MODERATE_TIER } from './config'

export const logParserKeys = {
  all: () => ['log-parsers'],
  detail: (type) => ['log-parsers', type],
}

/**
 * XML configuration.
 * @param {import('vue').MaybeRefOrGetter<string|null>} type
 */
export function useLogParser(type) {
  return useQuery({
    queryKey: computed(() => logParserKeys.detail(toValue(type))),
    queryFn: () => logParserApi.getLogParser(toValue(type)),
    enabled: computed(() => !!toValue(type)),
    ...MODERATE_TIER,
  })
}

export function useUpdateLogParser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, content }) => logParserApi.updateLogParser(type, content),
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({ queryKey: logParserKeys.detail(type) })
    },
  })
}
