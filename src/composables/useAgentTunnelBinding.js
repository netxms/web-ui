import { ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useToast } from 'primevue/usetoast'
import { setObjectManaged } from '@/api/objectsApi'
import { agentTunnelListQuery, useBindAgentTunnel } from '@/queries/useAgentTunnelQueries'
import { objectKeys } from '@/queries/useObjectQueries'
import { waitForBoundTunnel } from '@/utils/agentTunnels'

/**
 * Bind flows for Configuration > Agent Tunnels.
 *
 * `bindNewNode` finishes legacy "Create node and bind...": the node is created unmanaged so
 * its first configuration poll cannot run before the tunnel is in place, and is set managed
 * only once the agent reconnects.
 *
 * `pending` maps a tunnel id to `{ phase: 'binding' | 'waiting', nodeName }`.
 */
export function useAgentTunnelBinding() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { mutateAsync: bindAsync } = useBindAgentTunnel()

  const pending = ref(new Map())

  function setPending(tunnelId, entry) {
    const next = new Map(pending.value)
    if (entry) next.set(tunnelId, entry)
    else next.delete(tunnelId)
    pending.value = next
  }

  // Through the list query, so the table follows every answer.
  function pollUntilBound(nodeId) {
    return waitForBoundTunnel({
      nodeId,
      fetchTunnels: () => queryClient.fetchQuery({ ...agentTunnelListQuery(), staleTime: 0 }),
    })
  }

  /**
   * @param {{ id: number }} tunnel
   * @param {{ id: number, name: string }} node
   * @returns {Promise<boolean>} whether the bind went through
   */
  async function bindToNode(tunnel, node) {
    setPending(tunnel.id, { phase: 'binding', nodeName: node.name })
    try {
      await bindAsync({ tunnelId: tunnel.id, nodeId: node.id })
    } catch (err) {
      toast.add({
        severity: 'error',
        summary: 'Cannot bind tunnel',
        detail: err.message,
        life: 6000,
      })
      return false
    } finally {
      setPending(tunnel.id, null)
    }
    toast.add({
      severity: 'success',
      summary: 'Tunnel bound',
      detail: `Bound to "${node.name}". The agent reconnects with its new certificate.`,
      life: 4000,
    })
    pollUntilBound(node.id)
    return true
  }

  /**
   * @param {{ id: number }} tunnel
   * @param {{ id: number, name: string }} node - just created, unmanaged
   * @param {{ manage: boolean }} options - false when the user ticked "Create as unmanaged"
   * @returns {Promise<boolean>} whether everything asked for happened
   */
  async function bindNewNode(tunnel, node, { manage }) {
    setPending(tunnel.id, { phase: 'binding', nodeName: node.name })
    try {
      await bindAsync({ tunnelId: tunnel.id, nodeId: node.id })
    } catch (err) {
      setPending(tunnel.id, null)
      toast.add({
        severity: 'error',
        summary: 'Node created, tunnel not bound',
        detail: `"${node.name}" was created unmanaged, but the tunnel could not be bound: ${err.message}`,
        life: 10000,
      })
      return false
    }

    if (!manage) {
      setPending(tunnel.id, null)
      toast.add({
        severity: 'success',
        summary: 'Node created and tunnel bound',
        detail: `"${node.name}" stays unmanaged, as requested.`,
        life: 4000,
      })
      pollUntilBound(node.id)
      return true
    }

    setPending(tunnel.id, { phase: 'waiting', nodeName: node.name })
    const found = await pollUntilBound(node.id)
    setPending(tunnel.id, null)
    if (!found) {
      toast.add({
        severity: 'warn',
        summary: 'Agent has not reconnected',
        detail:
          `The tunnel was bound to "${node.name}", but the agent has not come back within ` +
          '20 seconds, so the node stays unmanaged. Set it managed once its tunnel shows as bound.',
        life: 12000,
      })
      return false
    }

    try {
      await setObjectManaged(node.id, true)
    } catch (err) {
      toast.add({
        severity: 'error',
        summary: 'Cannot set node managed',
        detail: `The tunnel is bound to "${node.name}", but the node stays unmanaged: ${err.message}`,
        life: 10000,
      })
      return false
    } finally {
      queryClient.invalidateQueries({ queryKey: objectKeys.detail(node.id) })
      queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
    }
    toast.add({
      severity: 'success',
      summary: 'Node created and tunnel bound',
      detail: `"${node.name}" is managed and connects through the tunnel.`,
      life: 4000,
    })
    return true
  }

  return { pending, bindToNode, bindNewNode }
}
