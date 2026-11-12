// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { findDeletionSuccessor, findNodeByPath } from '@/utils/objectTreeNavigation'

// 10, 11, 12 at the top level; 11 has children 110 and 111.
const tree = () => [
  { id: 10, name: 'A' },
  {
    id: 11,
    name: 'B',
    children: [
      { id: 110, name: 'B1' },
      { id: 111, name: 'B2' },
    ],
  },
  { id: 12, name: 'C' },
]

const successor = (targetId, alsoDeleted = []) =>
  findDeletionSuccessor(tree(), targetId, new Set([targetId, ...alsoDeleted]))

describe('findDeletionSuccessor', () => {
  it('returns null when the object is not in this tree', () => {
    expect(successor(999)).toBeNull()
  })

  it('picks the next sibling below', () => {
    expect(successor(11).node.id).toBe(12)
  })

  it('falls back to the sibling above when the deleted row is last', () => {
    expect(successor(12).node.id).toBe(11)
  })

  it('skips siblings that are being deleted too', () => {
    expect(successor(10, [11]).node.id).toBe(12)
  })

  it('moves up to the parent when the level empties out', () => {
    const result = successor(110, [111])
    expect(result.node.id).toBe(11)
    expect(result.path.map((n) => n.id)).toEqual([11])
  })

  it('never descends into children', () => {
    expect(successor(10).node.id).toBe(11)
  })

  it('reports the path of a nested successor', () => {
    const result = successor(110)
    expect(result.node.id).toBe(111)
    expect(result.path.map((n) => n.id)).toEqual([11, 111])
  })

  it('climbs past a parent that is deleted as well', () => {
    expect(successor(110, [111, 11]).node.id).toBe(12)
  })

  it('reports no successor when the whole tree goes', () => {
    const result = findDeletionSuccessor(tree(), 10, new Set([10, 11, 12]))
    expect(result.node).toBeNull()
  })
})

describe('findNodeByPath', () => {
  it('resolves a top-level row', () => {
    expect(findNodeByPath(tree(), '12').name).toBe('C')
  })

  it('follows the whole chain to a nested row', () => {
    expect(findNodeByPath(tree(), '11-111').name).toBe('B2')
  })

  // The same object can sit in more than one branch, which is why a row is identified by
  // its path and not by its id: an id that is real but reached the wrong way is not a hit.
  it('returns null when a step in the chain does not exist', () => {
    expect(findNodeByPath(tree(), '10-111')).toBeNull()
    expect(findNodeByPath(tree(), '999')).toBeNull()
  })

  it('survives an empty tree', () => {
    expect(findNodeByPath([], '11')).toBeNull()
    expect(findNodeByPath(undefined, '11')).toBeNull()
  })
})
