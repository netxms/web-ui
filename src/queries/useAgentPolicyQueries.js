import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as agentPolicyApi from '@/api/agentPolicyApi'
import { MODERATE_TIER } from './config'

export const agentPolicyKeys = {
  all: (objectId) => ['agent-policies', objectId],
  list: (objectId) => ['agent-policies', objectId, 'list'],
}

/**
 * Demo-only stub (src/api/agentPolicyApi.js).
 * @param {import('vue').MaybeRefOrGetter} objectId
 */
export function useAgentPolicies(objectId) {
  return useQuery({
    queryKey: computed(() => agentPolicyKeys.list(toValue(objectId))),
    queryFn: () => agentPolicyApi.listAgentPolicies(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
  })
}

export function useCreateAgentPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ objectId, data }) => agentPolicyApi.createAgentPolicy(objectId, data),
    onSuccess: (_, { objectId }) =>
      queryClient.invalidateQueries({ queryKey: agentPolicyKeys.all(objectId) }),
  })
}

export function useUpdateAgentPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ objectId, policyId, data }) =>
      agentPolicyApi.updateAgentPolicy(objectId, policyId, data),
    onSuccess: (_, { objectId }) =>
      queryClient.invalidateQueries({ queryKey: agentPolicyKeys.all(objectId) }),
  })
}

export function useDeleteAgentPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ objectId, policyId }) => agentPolicyApi.deleteAgentPolicy(objectId, policyId),
    onSuccess: (_, { objectId }) =>
      queryClient.invalidateQueries({ queryKey: agentPolicyKeys.all(objectId) }),
  })
}
