// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
  adaptAgentTunnel,
  bindBlockedReason,
  hasProxyFunction,
  tunnelFilterFields,
  waitForBoundTunnel,
} from '../agentTunnels'

const RAW = {
  id: 14,
  nodeId: 0,
  bound: false,
  inbound: true,
  address: { family: 2, address: '203.0.113.24', prefixLength: 32 },
  zoneUIN: 4,
  systemName: 'branch-gw-07',
  hostname: 'branch-gw-07.corp.example.com',
  agentId: '2b9c7d1e-4a3f-4e6b-8d2c-1f0e9a8b7c61',
  hardwareId: null,
  activeChannelCount: 0,
  agentProxy: false,
  snmpProxy: false,
  snmpTrapProxy: false,
  syslogProxy: false,
  externallyProvisionedCertificate: false,
  connectionTime: '2026-10-21T08:12:44Z',
}

describe('adaptAgentTunnel', () => {
  it('flattens the address and defaults missing strings to empty', () => {
    const tunnel = adaptAgentTunnel(RAW)
    expect(tunnel).toMatchObject({
      id: 14,
      bound: false,
      address: '203.0.113.24',
      addressObject: RAW.address,
      zoneUIN: 4,
      hardwareId: '',
      platformName: '',
      certificateExpirationTime: null,
    })
  })

  it('treats the null GUID as no agent id', () => {
    const tunnel = adaptAgentTunnel({ ...RAW, agentId: '00000000-0000-0000-0000-000000000000' })
    expect(tunnel.agentId).toBe('')
  })

  it('derives bound from nodeId when the flag is absent', () => {
    const { bound: _omitted, ...withoutFlag } = RAW
    expect(adaptAgentTunnel({ ...withoutFlag, nodeId: 502 }).bound).toBe(true)
    expect(adaptAgentTunnel(withoutFlag).bound).toBe(false)
  })

  it('survives an address the server left out', () => {
    expect(adaptAgentTunnel({ ...RAW, address: null }).address).toBe('')
  })
})

describe('hasProxyFunction', () => {
  it('is true for any one of the four proxy roles', () => {
    const base = adaptAgentTunnel(RAW)
    expect(hasProxyFunction(base)).toBe(false)
    for (const flag of ['agentProxy', 'snmpProxy', 'snmpTrapProxy', 'syslogProxy']) {
      expect(hasProxyFunction({ ...base, [flag]: true })).toBe(true)
    }
  })
})

describe('bindBlockedReason', () => {
  it('allows an unbound tunnel', () => {
    expect(bindBlockedReason(adaptAgentTunnel(RAW))).toBeNull()
  })

  it('refuses a bound tunnel and an externally provisioned certificate', () => {
    expect(bindBlockedReason(adaptAgentTunnel({ ...RAW, nodeId: 5, bound: true }))).toMatch(
      /already bound/,
    )
    expect(
      bindBlockedReason(adaptAgentTunnel({ ...RAW, externallyProvisionedCertificate: true })),
    ).toMatch(/externally provisioned/)
  })
})

describe('tunnelFilterFields', () => {
  it('matches "unbound" and leaves out the node and channels of an unbound tunnel', () => {
    const fields = tunnelFilterFields(adaptAgentTunnel(RAW), 'ignored')
    expect(fields).toContain('unbound')
    expect(fields).toContain('203.0.113.24')
    expect(fields).not.toContain('ignored')
  })

  it('includes the node name and channel count of a bound tunnel', () => {
    const tunnel = adaptAgentTunnel({ ...RAW, nodeId: 502, bound: true, activeChannelCount: 3 })
    const fields = tunnelFilterFields(tunnel, 'web-01')
    expect(fields).toEqual(expect.arrayContaining(['bound', 'web-01', '3']))
  })
})

describe('waitForBoundTunnel', () => {
  const unbound = adaptAgentTunnel(RAW)
  const bound = adaptAgentTunnel({ ...RAW, id: 20, nodeId: 77, bound: true })

  function clock() {
    let t = 0
    return {
      now: () => t,
      sleep: vi.fn(async (ms) => {
        t += ms
      }),
    }
  }

  it('returns the tunnel once one is bound to the node', async () => {
    const { now, sleep } = clock()
    const fetchTunnels = vi
      .fn()
      .mockResolvedValueOnce([unbound])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([bound])

    const found = await waitForBoundTunnel({ fetchTunnels, nodeId: 77, now, sleep })

    expect(found).toBe(bound)
    expect(fetchTunnels).toHaveBeenCalledTimes(3)
  })

  it('ignores a tunnel bound to another node', async () => {
    const { now, sleep } = clock()
    const fetchTunnels = vi.fn().mockResolvedValue([bound])
    const found = await waitForBoundTunnel({
      fetchTunnels,
      nodeId: 78,
      timeoutMs: 3000,
      intervalMs: 1000,
      now,
      sleep,
    })
    expect(found).toBeNull()
  })

  it('gives up at the deadline', async () => {
    const { now, sleep } = clock()
    const fetchTunnels = vi.fn().mockResolvedValue([unbound])

    const found = await waitForBoundTunnel({
      fetchTunnels,
      nodeId: 77,
      timeoutMs: 5000,
      intervalMs: 1000,
      now,
      sleep,
    })

    expect(found).toBeNull()
    expect(fetchTunnels).toHaveBeenCalledTimes(6)
  })

  it('keeps polling through a failed request', async () => {
    const { now, sleep } = clock()
    const fetchTunnels = vi
      .fn()
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce([bound])

    expect(await waitForBoundTunnel({ fetchTunnels, nodeId: 77, now, sleep })).toBe(bound)
  })
})
