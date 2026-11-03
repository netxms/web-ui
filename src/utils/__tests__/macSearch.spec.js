import { describe, it, expect } from 'vitest'
import { describeMacHit, MAC_TYPE_SEVERITY } from '@/utils/macSearch'

/** A fully populated hit: known device on a known switch port. */
function fullHit(overrides = {}) {
  return {
    localMacAddress: '00:50:56:A5:F7:08',
    localNodeId: 101,
    localInterfaceId: 202,
    localIpAddress: { address: '10.0.10.43' },
    localNode: { id: 101, name: 'core-sw-01', class: 'Node', status: 3 },
    localInterface: { id: 202, name: 'ens160', class: 'Interface', status: 0 },
    nodeId: 301,
    interfaceId: 302,
    interfaceIndex: 6,
    node: {
      id: 301,
      name: 'sw-02.dc-alpha.example.com',
      class: 'Node',
      status: 0,
      ipAddress: { address: '10.0.11.3' },
    },
    interface: { id: 302, name: 'ether6', class: 'Interface', status: 0 },
    type: 'INDIRECT',
    ...overrides,
  }
}

describe('describeMacHit', () => {
  it('flattens both sides of a fully populated hit', () => {
    const row = describeMacHit(fullHit())

    expect(row.ownerName).toBe('core-sw-01')
    expect(row.ifaceName).toBe('ens160')
    expect(row.switchName).toBe('sw-02.dc-alpha.example.com')
    expect(row.portName).toBe('ether6')
    expect(row.mac).toBe('00:50:56:A5:F7:08')
    expect(row.ip).toBe('10.0.10.43')
    expect(row.switchIp).toBe('10.0.11.3')
    expect(row.ifIndex).toBe(6)
    expect(row.type).toBe('INDIRECT')
  })

  it('falls back to [id] when an object summary is withheld by ACLs', () => {
    const row = describeMacHit(
      fullHit({ localNode: undefined, node: undefined, interface: undefined }),
    )

    expect(row.ownerName).toBe('[101]')
    expect(row.switchName).toBe('[301]')
    expect(row.portName).toBe('[302]')
  })

  it('reports null for a side the server has no object for', () => {
    const row = describeMacHit(
      fullHit({
        localNodeId: 0,
        localInterfaceId: 0,
        localNode: undefined,
        localInterface: undefined,
        localIpAddress: null,
      }),
    )

    expect(row.ownerName).toBeNull()
    expect(row.ifaceName).toBeNull()
    expect(row.ip).toBeNull()
    expect(row.status).toBeNull()
  })

  it('prefers the owning device as the navigation target', () => {
    const row = describeMacHit(fullHit())
    expect(row.target).toMatchObject({ params: { objectId: 101 } })
  })

  it('falls back to the switch when the address has no owner object', () => {
    const row = describeMacHit(fullHit({ localNodeId: 0, localNode: undefined }))
    expect(row.target).toMatchObject({ params: { objectId: 301 } })
  })

  it('has no target when neither side is readable', () => {
    const row = describeMacHit(
      fullHit({ localNodeId: 0, localNode: undefined, nodeId: 0, node: undefined }),
    )
    expect(row.target).toBeNull()
  })

  it('normalizes a zero interface index to null', () => {
    expect(describeMacHit(fullHit({ interfaceIndex: 0 })).ifIndex).toBeNull()
  })

  it('carries the raw summaries through for per-cell links', () => {
    const row = describeMacHit(fullHit())
    expect(row.ownerObject?.id).toBe(101)
    expect(row.switchObject?.id).toBe(301)
    expect(row.portObject?.id).toBe(302)
  })

  it('exposes a severity for every connection type the API returns', () => {
    expect(Object.keys(MAC_TYPE_SEVERITY).sort()).toEqual([
      'DIRECT',
      'INDIRECT',
      'NOT_FOUND',
      'UNKNOWN',
      'WIRELESS',
    ])
  })
})
