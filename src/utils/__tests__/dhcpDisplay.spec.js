import { describe, it, expect } from 'vitest'
import { scopeLabel, toLeaseRow, toScopeRow } from '@/utils/dhcpDisplay'
import { formatDateTimeMedium } from '@/utils/timeFormat'

const scope = {
  id: '1',
  network: { family: 2, address: '10.0.1.0', prefixLength: 24 },
  name: 'Office',
  ranges: '10.0.1.100 - 10.0.1.199',
  enabled: true,
  totalAddresses: 100,
  usedAddresses: 87,
  declinedAddresses: 2,
  freeAddresses: 11,
  utilization: 87,
}

describe('scopeLabel', () => {
  it('names a scope by its network', () => {
    expect(scopeLabel(scope)).toBe('10.0.1.0/24')
  })

  it('falls back to the scope ID when the network is not known', () => {
    expect(scopeLabel({ id: 'lan', network: null })).toBe('lan')
    expect(scopeLabel({ id: 'lan', network: { family: 0, prefixLength: 0 } })).toBe('lan')
  })
})

describe('toScopeRow', () => {
  it('maps a reported scope', () => {
    expect(toScopeRow(scope)).toEqual({
      id: '1',
      network: '10.0.1.0/24',
      networkSort: '010.000.001.000',
      name: 'Office',
      ranges: '10.0.1.100 - 10.0.1.199',
      enabled: true,
      total: 100,
      used: 87,
      declined: 2,
      free: 11,
      utilization: 87,
      utilizationText: '87.0%',
    })
  })

  it('keeps values the server did not report as null', () => {
    const row = toScopeRow({
      ...scope,
      network: null,
      name: '',
      declinedAddresses: null,
      totalAddresses: 0,
      utilization: null,
      enabled: false,
    })
    expect(row.network).toBe('1')
    expect(row.networkSort).toBeNull()
    expect(row.name).toBeNull()
    expect(row.declined).toBeNull()
    expect(row.total).toBe(0)
    expect(row.utilization).toBeNull()
    expect(row.utilizationText).toBeNull()
    expect(row.enabled).toBe(false)
  })
})

describe('toLeaseRow', () => {
  const lease = {
    ipAddress: '10.0.1.120',
    prefixLength: 32,
    scopeId: '1',
    macAddress: '3C:22:FB:01:AA:10',
    vendor: 'Apple, Inc.',
    clientId: '01:3c:22:fb:01:aa:10',
    hostname: 'laptop-17',
    type: 'DYNAMIC',
    state: 'ACTIVE',
    lastTransaction: '2026-11-16T08:15:00Z',
    expiration: '2026-11-17T08:15:00Z',
    nodeId: 1234,
    nodeName: 'laptop-17',
  }

  it('maps a lease and names its scope by network', () => {
    const row = toLeaseRow(lease, 4, new Map([['1', '10.0.1.0/24']]))
    expect(row).toEqual({
      id: 4,
      ip: '10.0.1.120',
      ipSort: '010.000.001.120',
      mac: '3C:22:FB:01:AA:10',
      vendor: 'Apple, Inc.',
      hostname: 'laptop-17',
      nodeId: 1234,
      nodeName: 'laptop-17',
      clientId: '01:3c:22:fb:01:aa:10',
      scopeId: '1',
      scope: '10.0.1.0/24',
      type: 'Dynamic',
      typeSort: 0,
      state: 'Active',
      stateSort: 0,
      lastTransaction: formatDateTimeMedium('2026-11-16T08:15:00Z'),
      lastTransactionSort: Date.parse('2026-11-16T08:15:00Z'),
      expiration: formatDateTimeMedium('2026-11-17T08:15:00Z'),
      expirationSort: Date.parse('2026-11-17T08:15:00Z'),
    })
  })

  it('shows the scope ID when the scope is not in the list', () => {
    expect(toLeaseRow(lease, 0).scope).toBe('1')
    expect(toLeaseRow({ ...lease, scopeId: '' }, 0).scope).toBeNull()
  })

  it('adds the length to a delegated IPv6 prefix only', () => {
    expect(toLeaseRow({ ...lease, ipAddress: '2001:db8:1::', prefixLength: 56 }, 0).ip).toBe(
      '2001:db8:1::/56',
    )
    expect(toLeaseRow({ ...lease, ipAddress: '2001:db8::10', prefixLength: 128 }, 0).ip).toBe(
      '2001:db8::10',
    )
  })

  it('reads a reservation without a lease and unknown codes', () => {
    const row = toLeaseRow(
      {
        ...lease,
        type: 'UNKNOWN',
        state: 'UNKNOWN',
        macAddress: null,
        vendor: null,
        lastTransaction: null,
        expiration: null,
        nodeId: 0,
        nodeName: null,
      },
      0,
    )
    expect(row.type).toBeNull()
    expect(row.typeSort).toBeNull()
    expect(row.state).toBe('Unknown')
    expect(row.stateSort).toBeNull()
    expect(row.mac).toBeNull()
    expect(row.lastTransaction).toBeNull()
    expect(row.lastTransactionSort).toBeNull()
    expect(row.expiration).toBeNull()
    expect(row.nodeId).toBeNull()
  })

  it('sorts states in the server order', () => {
    const order = ['ACTIVE', 'EXPIRED', 'DECLINED', 'RELEASED', 'OFFERED', 'INACTIVE']
    expect(order.map((state) => toLeaseRow({ ...lease, state }, 0).stateSort)).toEqual([
      0, 1, 2, 3, 4, 5,
    ])
    expect(toLeaseRow({ ...lease, state: 'INACTIVE', type: 'RESERVATION' }, 0)).toMatchObject({
      state: 'Inactive',
      type: 'Reservation',
      typeSort: 1,
    })
  })
})
