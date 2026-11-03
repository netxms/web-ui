import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@/api/agentTunnelsApi', () => ({
  getAgentTunnels: vi.fn(),
  bindAgentTunnel: vi.fn(),
  unbindAgentTunnel: vi.fn(),
}))
vi.mock('@/api/objectsApi', () => ({ setObjectManaged: vi.fn() }))
vi.mock('@/utils/agentTunnels', async (importOriginal) => ({
  ...(await importOriginal()),
  waitForBoundTunnel: vi.fn(),
}))

const agentTunnelsApi = await import('@/api/agentTunnelsApi')
const { setObjectManaged } = await import('@/api/objectsApi')
const { waitForBoundTunnel } = await import('@/utils/agentTunnels')
const { useAgentTunnelBinding } = await import('../useAgentTunnelBinding')

const TUNNEL = { id: 14 }
const NODE = { id: 900, name: 'branch-gw-07' }

describe('useAgentTunnelBinding', () => {
  let queryClient
  let wrapper

  function setup() {
    let api
    wrapper = mount(
      defineComponent({
        setup() {
          api = useAgentTunnelBinding()
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    return api
  }

  const lastToast = () => toastAdd.mock.calls.at(-1)[0]

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    agentTunnelsApi.bindAgentTunnel.mockResolvedValue(null)
    agentTunnelsApi.getAgentTunnels.mockResolvedValue([])
    setObjectManaged.mockResolvedValue(null)
    waitForBoundTunnel.mockResolvedValue({ id: 20, nodeId: NODE.id, bound: true })
  })

  afterEach(() => {
    wrapper?.unmount()
    queryClient.clear()
  })

  describe('bindNewNode', () => {
    it('binds, waits for the agent, then sets the node managed', async () => {
      const { bindNewNode, pending } = setup()

      const promise = bindNewNode(TUNNEL, NODE, { manage: true })
      expect(pending.value.get(14)).toEqual({ phase: 'binding', nodeName: 'branch-gw-07' })

      expect(await promise).toBe(true)
      expect(agentTunnelsApi.bindAgentTunnel).toHaveBeenCalledWith(14, 900)
      expect(waitForBoundTunnel).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 900 }))
      expect(setObjectManaged).toHaveBeenCalledWith(900, true)
      expect(lastToast().severity).toBe('success')
      expect(pending.value.size).toBe(0)
    })

    it('polls through the tunnel list query', async () => {
      const { bindNewNode } = setup()
      await bindNewNode(TUNNEL, NODE, { manage: true })

      const { fetchTunnels } = waitForBoundTunnel.mock.calls[0][0]
      agentTunnelsApi.getAgentTunnels.mockResolvedValue([{ id: 20 }])
      expect(await fetchTunnels()).toEqual([{ id: 20 }])
      expect(queryClient.getQueryData(['agentTunnels', 'list'])).toEqual([{ id: 20 }])
    })

    it('leaves the node unmanaged when the agent does not come back', async () => {
      waitForBoundTunnel.mockResolvedValue(null)
      const { bindNewNode } = setup()

      expect(await bindNewNode(TUNNEL, NODE, { manage: true })).toBe(false)
      expect(setObjectManaged).not.toHaveBeenCalled()
      expect(lastToast()).toMatchObject({ severity: 'warn', summary: 'Agent has not reconnected' })
    })

    it('reports a failed bind and never manages the node', async () => {
      agentTunnelsApi.bindAgentTunnel.mockRejectedValue(new Error('Timeout waiting for agent'))
      const { bindNewNode, pending } = setup()

      expect(await bindNewNode(TUNNEL, NODE, { manage: true })).toBe(false)
      expect(waitForBoundTunnel).not.toHaveBeenCalled()
      expect(setObjectManaged).not.toHaveBeenCalled()
      expect(lastToast().severity).toBe('error')
      expect(lastToast().detail).toContain('Timeout waiting for agent')
      expect(pending.value.size).toBe(0)
    })

    it('keeps a node the user asked to stay unmanaged unmanaged', async () => {
      const { bindNewNode } = setup()

      expect(await bindNewNode(TUNNEL, NODE, { manage: false })).toBe(true)
      expect(setObjectManaged).not.toHaveBeenCalled()
      expect(lastToast().detail).toMatch(/stays unmanaged/)
    })

    it('says so when setting the node managed fails', async () => {
      setObjectManaged.mockRejectedValue(new Error('Access denied'))
      const { bindNewNode } = setup()

      expect(await bindNewNode(TUNNEL, NODE, { manage: true })).toBe(false)
      expect(lastToast()).toMatchObject({ severity: 'error', summary: 'Cannot set node managed' })
    })
  })

  describe('bindToNode', () => {
    it('binds and keeps following the list', async () => {
      const { bindToNode } = setup()

      expect(await bindToNode(TUNNEL, NODE)).toBe(true)
      expect(agentTunnelsApi.bindAgentTunnel).toHaveBeenCalledWith(14, 900)
      expect(waitForBoundTunnel).toHaveBeenCalled()
      expect(setObjectManaged).not.toHaveBeenCalled()
      expect(lastToast().severity).toBe('success')
    })

    it('reports the server message on failure', async () => {
      agentTunnelsApi.bindAgentTunnel.mockRejectedValue(new Error('Unbound tunnel not found'))
      const { bindToNode, pending } = setup()

      expect(await bindToNode(TUNNEL, NODE)).toBe(false)
      expect(lastToast()).toMatchObject({
        severity: 'error',
        detail: 'Unbound tunnel not found',
      })
      expect(pending.value.size).toBe(0)
    })
  })
})
