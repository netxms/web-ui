import { computed, toValue } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { getAgentLog } from '@/api/objectsApi'
import { AGENT_LOG_TAIL_BYTES, agentLogTail } from '@/utils/agentLog'

export const agentLogKeys = {
  tail: (objectId) => ['agent-log', toValue(objectId)],
}

/**
 * The last megabyte of the agent's own log. Not polled, no refetch on focus and no retry: every
 * read is a live transfer from the agent, and every failure is the agent's answer. Dropped from
 * the cache soon after the tab closes, since it can hold a megabyte.
 *
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useAgentLogTail(objectId) {
  return useQuery({
    queryKey: computed(() => agentLogKeys.tail(objectId)),
    queryFn: async () => {
      const blob = await getAgentLog(toValue(objectId), { sizeLimit: AGENT_LOG_TAIL_BYTES })
      return agentLogTail(await blob.text(), blob.size)
    },
    enabled: computed(() => !!toValue(objectId)),
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
