// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { collectInheritedAccessEntries } from '../useInheritedAccessRights'

function resolverFor(objects) {
  return (id) => objects[id]
}

describe('collectInheritedAccessEntries', () => {
  it('returns nothing for a null object or an object without parents', () => {
    expect(collectInheritedAccessEntries(null, () => undefined)).toEqual({
      ids: [],
      entries: [],
    })
    expect(collectInheritedAccessEntries({ id: 10, parents: [] }, () => undefined)).toEqual({
      ids: [],
      entries: [],
    })
  })

  it('collects entries from a direct parent', () => {
    const objects = {
      2: {
        id: 2,
        name: 'Infrastructure',
        parents: [],
        inheritAccessRights: false,
        accessList: [{ userId: 5, access: 0x1 }],
      },
    }
    const { ids, entries } = collectInheritedAccessEntries(
      { id: 10, parents: [2] },
      resolverFor(objects),
    )
    expect(ids).toEqual([2])
    expect(entries).toEqual([
      {
        userId: 5,
        access: 0x1,
        inherited: true,
        sourceObjectId: 2,
        sourceObjectName: 'Infrastructure',
      },
    ])
  })

  it('recurses into grandparents only while the parent itself inherits', () => {
    const objects = {
      2: {
        id: 2,
        name: 'parent-inheriting',
        parents: [1],
        inheritAccessRights: true,
        accessList: [],
      },
      3: {
        id: 3,
        name: 'parent-not-inheriting',
        parents: [4],
        inheritAccessRights: false,
        accessList: [],
      },
      1: {
        id: 1,
        name: 'grandparent',
        parents: [],
        inheritAccessRights: false,
        accessList: [{ userId: 7, access: 0x3 }],
      },
      4: {
        id: 4,
        name: 'unreachable',
        parents: [],
        inheritAccessRights: false,
        accessList: [{ userId: 8, access: 0xff }],
      },
    }
    const { ids, entries } = collectInheritedAccessEntries(
      { id: 10, parents: [2, 3] },
      resolverFor(objects),
    )
    expect(ids).toEqual([2, 3, 1])
    expect(entries.map((e) => e.userId)).toEqual([7])
  })

  it('keeps the first occurrence per userId (breadth-first order)', () => {
    const objects = {
      2: {
        id: 2,
        name: 'first',
        parents: [],
        inheritAccessRights: false,
        accessList: [{ userId: 5, access: 0x1 }],
      },
      3: {
        id: 3,
        name: 'second',
        parents: [],
        inheritAccessRights: false,
        accessList: [
          { userId: 5, access: 0xff },
          { userId: 6, access: 0x2 },
        ],
      },
    }
    const { entries } = collectInheritedAccessEntries(
      { id: 10, parents: [2, 3] },
      resolverFor(objects),
    )
    expect(entries.map((e) => [e.userId, e.access])).toEqual([
      [5, 0x1],
      [6, 0x2],
    ])
  })

  it('requests unresolved ancestors but survives missing data and cycles', () => {
    const objects = {
      2: {
        id: 2,
        name: 'cyclic',
        parents: [10, 2, 3],
        inheritAccessRights: true,
        accessList: [],
      },
      // 3 not yet fetched
    }
    const { ids, entries } = collectInheritedAccessEntries(
      { id: 10, parents: [2] },
      resolverFor(objects),
    )
    expect(ids).toEqual([2, 3])
    expect(entries).toEqual([])
  })
})
