import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({
  get: vi.fn(),
  post: vi.fn(),
}))

const client = await import('../client')
const { getAgentTunnels, bindAgentTunnel, unbindAgentTunnel } = await import('../agentTunnelsApi')

beforeEach(() => vi.clearAllMocks())

describe('agentTunnelsApi', () => {
  it('lists tunnels and normalizes them', async () => {
    client.get.mockResolvedValue([
      { id: 3, nodeId: 502, bound: true, address: { family: 2, address: '10.0.0.1' } },
    ])

    const [tunnel] = await getAgentTunnels({ signal: 'sig' })

    expect(client.get).toHaveBeenCalledWith('/v1/agent-tunnels', { signal: 'sig' })
    expect(tunnel).toMatchObject({ id: 3, nodeId: 502, bound: true, address: '10.0.0.1' })
  })

  it('answers an empty list for a non-array body', async () => {
    client.get.mockResolvedValue(null)
    expect(await getAgentTunnels()).toEqual([])
  })

  it('binds with the node id, keeping a 504 away from the reconnect probe', async () => {
    client.post.mockResolvedValue(null)

    await bindAgentTunnel(14, 502)

    expect(client.post).toHaveBeenCalledWith(
      '/v1/agent-tunnels/14/bind',
      { nodeId: 502 },
      { suppressUnavailable: true },
    )
  })

  it('unbinds through the node', async () => {
    client.post.mockResolvedValue(null)
    await unbindAgentTunnel(502)
    expect(client.post).toHaveBeenCalledWith('/v1/objects/502/unbind-agent-tunnel')
  })
})
