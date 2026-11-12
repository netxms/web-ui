// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { flattenUnique, sortStatusMapObjects } from '@/utils/statusMapObjects'

// The same node under two containers, the way a subtree reports a shared child.
const TREE = [
  {
    id: 1,
    name: 'Servers',
    status: 0,
    children: [
      { id: 10, name: 'db', status: 4 },
      { id: 11, name: 'app', status: 2 },
    ],
  },
  {
    id: 2,
    name: 'Critical',
    status: 4,
    children: [{ id: 10, name: 'db', status: 4 }],
  },
]

describe('flattenUnique', () => {
  it('lists every object once, parents before their children', () => {
    expect(flattenUnique(TREE).map((o) => o.id)).toEqual([1, 10, 11, 2])
  })

  it('handles an empty or missing tree', () => {
    expect(flattenUnique([])).toEqual([])
    expect(flattenUnique(undefined)).toEqual([])
  })
})

describe('sortStatusMapObjects', () => {
  const objects = flattenUnique(TREE)

  it('puts the worst status first, then orders by name', () => {
    expect(sortStatusMapObjects(objects, 'status').map((o) => o.name)).toEqual([
      'Critical',
      'db',
      'app',
      'Servers',
    ])
  })

  it('orders by name', () => {
    expect(sortStatusMapObjects(objects, 'name').map((o) => o.name)).toEqual([
      'app',
      'Critical',
      'db',
      'Servers',
    ])
  })

  it('leaves the input order alone', () => {
    sortStatusMapObjects(objects, 'name')
    expect(objects.map((o) => o.id)).toEqual([1, 10, 11, 2])
  })
})
