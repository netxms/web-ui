import { describe, it, expect } from 'vitest'
import {
  statusAffectingSources,
  collectAncestorIds,
  collectObjectIds,
  patchStatuses,
} from '../objectStatusSync'

function alarm(id, source, severity, state = 0) {
  return { id, source, severity, state }
}

describe('statusAffectingSources', () => {
  it('reports the source of a new unresolved alarm', () => {
    expect(statusAffectingSources([], [alarm(1, 15, 4)])).toEqual(new Set([15]))
  })

  it('ignores a new alarm that is already resolved', () => {
    expect(statusAffectingSources([], [alarm(1, 15, 4, 2)])).toEqual(new Set())
  })

  it('ignores acknowledging, which leaves status alone', () => {
    expect(statusAffectingSources([alarm(1, 15, 4, 0)], [alarm(1, 15, 4, 1)])).toEqual(new Set())
  })

  it('reports a severity change on an unresolved alarm', () => {
    expect(statusAffectingSources([alarm(1, 15, 2)], [alarm(1, 15, 4)])).toEqual(new Set([15]))
  })

  it('ignores a severity change on a resolved alarm', () => {
    expect(statusAffectingSources([alarm(1, 15, 2, 2)], [alarm(1, 15, 4, 2)])).toEqual(new Set())
  })

  it('reports resolving', () => {
    expect(statusAffectingSources([alarm(1, 15, 4, 1)], [alarm(1, 15, 4, 2)])).toEqual(
      new Set([15]),
    )
  })

  it('reports an unresolved alarm that was terminated, not a resolved one', () => {
    const before = [alarm(1, 15, 4, 0), alarm(2, 16, 4, 2)]
    expect(statusAffectingSources(before, [])).toEqual(new Set([15]))
  })

  it('reports both sources when an alarm moves to another object', () => {
    expect(statusAffectingSources([alarm(1, 15, 4)], [alarm(1, 16, 4)])).toEqual(new Set([15, 16]))
  })

  it('reports nothing for an unchanged list', () => {
    const list = [alarm(1, 15, 4), alarm(2, 16, 3, 1)]
    expect(
      statusAffectingSources(
        list,
        list.map((a) => ({ ...a })),
      ),
    ).toEqual(new Set())
  })
})

// Root 2 is not in its own sub-tree answer. Node 15 sits under both containers 10 and 11.
const tree = [
  {
    id: 10,
    status: 0,
    children: [
      { id: 15, status: 0 },
      { id: 16, status: 0 },
    ],
  },
  { id: 11, status: 0, children: [{ id: 15, status: 0 }] },
  { id: 12, status: 0 },
]

describe('collectAncestorIds', () => {
  it('collects the root and every parent on each path to the object', () => {
    expect(collectAncestorIds(tree, 2, new Set([15]))).toEqual(new Set([2, 10, 11]))
  })

  it('adds nothing for an object that is not in the tree', () => {
    expect(collectAncestorIds(tree, 2, new Set([99]))).toEqual(new Set())
  })

  it('takes the root id from a query key that holds a string', () => {
    expect(collectAncestorIds(tree, '2', new Set([12]))).toEqual(new Set([2]))
  })
})

describe('collectObjectIds', () => {
  it('collects ids from a tree, a list and a single document', () => {
    expect(collectObjectIds(tree)).toEqual(new Set([10, 15, 16, 11, 12]))
    expect(collectObjectIds([{ id: 3 }, { id: 4 }])).toEqual(new Set([3, 4]))
    expect(collectObjectIds({ id: '7' })).toEqual(new Set([7]))
  })
})

describe('patchStatuses', () => {
  const critical = new Map([
    [15, 4],
    [10, 4],
  ])

  it('replaces the status of every occurrence in a tree', () => {
    const patched = patchStatuses(tree, critical)
    expect(patched[0].status).toBe(4)
    expect(patched[0].children[0].status).toBe(4)
    expect(patched[1].children[0].status).toBe(4)
    expect(patched[0].children[1].status).toBe(0)
  })

  it('keeps the identity of everything it did not change', () => {
    const patched = patchStatuses(tree, critical)
    expect(patched[0].children[1]).toBe(tree[0].children[1])
    expect(patched[2]).toBe(tree[2])
    expect(patchStatuses(tree, new Map([[99, 4]]))).toBe(tree)
    expect(patchStatuses(tree, new Map([[16, 0]]))).toBe(tree)
  })

  it('does not add a status or children field an object did not have', () => {
    const doc = { id: 15, name: 'n' }
    expect(patchStatuses(doc, critical)).toBe(doc)
    const parent = { id: 20, children: [{ id: 15, status: 0 }] }
    expect(Object.keys(patchStatuses(parent, critical))).toEqual(['id', 'children'])
    expect(Object.keys(patchStatuses({ id: 15, status: 0 }, critical))).toEqual(['id', 'status'])
  })
})
