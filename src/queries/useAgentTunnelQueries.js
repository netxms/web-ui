// REALTIME_TIER: legacy gets live updates through `CHANNEL_AGENT_TUNNELS` notifications, which the
// WebAPI does not offer.
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as agentTunnelsApi from '@/api/agentTunnelsApi'
import { objectKeys } from './useObjectQueries'
import { REALTIME_TIER } from './config'

export const agentTunnelKeys = {
  all: () => ['agentTunnels'],
  list: () => ['agentTunnels', 'list'],
}

/** Shared with `fetchQuery` callers that poll it. */
export function agentTunnelListQuery() {
  return {
    queryKey: agentTunnelKeys.list(),
    queryFn: ({ signal }) => agentTunnelsApi.getAgentTunnels({ signal }),
  }
}

export function useAgentTunnels() {
  return useQuery({ ...agentTunnelListQuery(), ...REALTIME_TIER })
}

/**
 * Refetches the list whatever the outcome: a bind that timed out may still have gone through.
 *
 * @returns mutation taking `{ tunnelId, nodeId }`
 */
export function useBindAgentTunnel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ tunnelId, nodeId }) => agentTunnelsApi.bindAgentTunnel(tunnelId, nodeId),
    onSettled: (_data, _error, { nodeId }) => {
      queryClient.invalidateQueries({ queryKey: agentTunnelKeys.all() })
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(nodeId) })
    },
  })
}

/**
 * One call per node.
 *
 * @returns mutation taking node ids and resolving to the ids that failed, each with its error;
 *   it never rejects
 */
export function useUnbindAgentTunnels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (nodeIds) => {
      const results = await Promise.allSettled(
        nodeIds.map((nodeId) => agentTunnelsApi.unbindAgentTunnel(nodeId)),
      )
      return results
        .map((result, i) => ({ nodeId: nodeIds[i], result }))
        .filter(({ result }) => result.status === 'rejected')
        .map(({ nodeId, result }) => ({ nodeId, error: result.reason }))
    },
    onSettled: (_data, _error, nodeIds) => {
      queryClient.invalidateQueries({ queryKey: agentTunnelKeys.all() })
      for (const nodeId of nodeIds) {
        queryClient.invalidateQueries({ queryKey: objectKeys.detail(nodeId) })
      }
    },
  })
}
