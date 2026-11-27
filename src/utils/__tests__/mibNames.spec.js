import { describe, expect, it, vi } from 'vitest'
import { createMibNameResolver, formatRawValue } from '../mibNames'

function child(oid, name, hasChildren) {
  return { subId: Number(oid.split('.').pop()), oid, name, hasChildren }
}

// iso.org.dod.internet.mgmt.mib-2 with system (sysDescr) and interfaces.ifTable.ifEntry.
const TREE = {
  '': [child('1', 'iso', true)],
  1: [child('1.3', 'org', true)],
  1.3: [child('1.3.6', 'dod', true)],
  '1.3.6': [child('1.3.6.1', 'internet', true)],
  '1.3.6.1': [child('1.3.6.1.2', 'mgmt', true)],
  '1.3.6.1.2': [child('1.3.6.1.2.1', 'mib-2', true)],
  '1.3.6.1.2.1': [
    child('1.3.6.1.2.1.1', 'system', true),
    child('1.3.6.1.2.1.2', 'interfaces', true),
  ],
  '1.3.6.1.2.1.1': [child('1.3.6.1.2.1.1.1', 'sysDescr', false)],
  '1.3.6.1.2.1.2': [child('1.3.6.1.2.1.2.2', 'ifTable', true)],
  '1.3.6.1.2.1.2.2': [child('1.3.6.1.2.1.2.2.1', 'ifEntry', true)],
  '1.3.6.1.2.1.2.2.1': [
    child('1.3.6.1.2.1.2.2.1.1', 'ifIndex', false),
    child('1.3.6.1.2.1.2.2.1.2', 'ifDescr', false),
  ],
}

function resolverOver(tree = TREE) {
  const fetchNode = vi.fn(async (oid) => {
    if (!(oid in tree)) throw new Error('not found')
    return { children: tree[oid] }
  })
  return { resolver: createMibNameResolver(fetchNode), fetchNode }
}

describe('createMibNameResolver', () => {
  it('names a table cell by its column object plus the instance suffix', async () => {
    const { resolver } = resolverOver()
    expect(await resolver.resolve('1.3.6.1.2.1.2.2.1.2.3')).toEqual({
      name: 'ifDescr.3',
      fullName: 'iso.org.dod.internet.mgmt.mib-2.interfaces.ifTable.ifEntry.ifDescr.3',
      objectOid: '1.3.6.1.2.1.2.2.1.2',
    })
  })

  it('names a scalar instance', async () => {
    const { resolver } = resolverOver()
    expect((await resolver.resolve('1.3.6.1.2.1.1.1.0')).name).toBe('sysDescr.0')
  })

  it('stops at the deepest known object when the rest is not in the MIBs', async () => {
    const { resolver } = resolverOver()
    expect(await resolver.resolve('1.3.6.1.2.1.2.2.1.99.1')).toEqual({
      name: 'ifEntry.99.1',
      fullName: 'iso.org.dod.internet.mgmt.mib-2.interfaces.ifTable.ifEntry.99.1',
      objectOid: '1.3.6.1.2.1.2.2.1',
    })
  })

  it('names an OID that is itself a MIB object without a suffix', async () => {
    const { resolver } = resolverOver()
    expect((await resolver.resolve('1.3.6.1.2.1.2.2')).name).toBe('ifTable')
  })

  it('returns null when even the first element is unknown', async () => {
    const { resolver } = resolverOver()
    expect(await resolver.resolve('2.5.4')).toBeNull()
  })

  it('reads each children list once, also for concurrent lookups', async () => {
    const { resolver, fetchNode } = resolverOver()
    await Promise.all([
      resolver.resolve('1.3.6.1.2.1.2.2.1.2.1'),
      resolver.resolve('1.3.6.1.2.1.2.2.1.2.2'),
      resolver.resolve('1.3.6.1.2.1.2.2.1.1.1'),
    ])
    await resolver.resolve('1.3.6.1.2.1.2.2.1.2.3')
    const fetched = fetchNode.mock.calls.map(([oid]) => oid)
    expect(fetched).toHaveLength(new Set(fetched).size)
    // Leaves (ifDescr, ifIndex) are never asked for children.
    expect(fetched).not.toContain('1.3.6.1.2.1.2.2.1.2')
  })

  it('keeps what it found when a deeper children list cannot be read', async () => {
    const partial = { ...TREE }
    delete partial['1.3.6.1.2.1.2.2']
    const { resolver, fetchNode } = resolverOver(partial)
    expect((await resolver.resolve('1.3.6.1.2.1.2.2.1.2.1')).name).toBe('ifTable.1.2.1')
    await resolver.resolve('1.3.6.1.2.1.2.2.1.2.2')
    expect(fetchNode.mock.calls.filter(([oid]) => oid === '1.3.6.1.2.1.2.2')).toHaveLength(1)
  })

  it('returns null for every OID when the tree root cannot be read', async () => {
    const { resolver } = resolverOver({})
    expect(await resolver.resolve('1.3.6.1')).toBeNull()
  })
})

describe('formatRawValue', () => {
  it('groups hex bytes, upper case, as legacy shows them', () => {
    expect(formatRawValue('65746830')).toBe('65 74 68 30')
    expect(formatRawValue('0a')).toBe('0A')
  })

  it('is empty for numeric types, which carry no raw value', () => {
    expect(formatRawValue(undefined)).toBe('')
    expect(formatRawValue('')).toBe('')
  })
})
