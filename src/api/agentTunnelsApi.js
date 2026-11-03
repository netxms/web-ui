/**
 * Agent tunnels (`webapi/agent_tunnels.cpp`). Every call needs MANAGE_AGENT_TUNNELS. The list
 * holds only the tunnels connected right now, unbound first.
 */
import { get, post } from './client'
import { adaptAgentTunnel } from '@/utils/agentTunnels'

/**
 * @param {object} [options] - `signal` and `priority`, passed to the client
 * @returns {Promise<import('@/utils/agentTunnels').AgentTunnel[]>}
 */
export async function getAgentTunnels(options) {
  const data = await get('/v1/agent-tunnels', options)
  return Array.isArray(data) ? data.map(adaptAgentTunnel) : []
}

/**
 * Synchronous: returns once the agent has completed its certificate request, which can take
 * seconds. 404 (tunnel gone or already bound), 409 (bind running, or certificate externally
 * provisioned), 504 (agent too slow; this endpoint's own verdict, hence `suppressUnavailable`).
 *
 * @param {number} tunnelId
 * @param {number} nodeId
 * @returns {Promise<void>}
 */
export function bindAgentTunnel(tunnelId, nodeId) {
  return post(`/v1/agent-tunnels/${tunnelId}/bind`, { nodeId }, { suppressUnavailable: true })
}

/**
 * Unbind the node's tunnel: the server revokes the node's agent certificate and closes the
 * tunnel. Succeeds for a node with no tunnel too. 400 when the object is not a node.
 *
 * @param {number} nodeId
 * @returns {Promise<void>}
 */
export function unbindAgentTunnel(nodeId) {
  return post(`/v1/objects/${nodeId}/unbind-agent-tunnel`)
}
