import { describe, it, expect } from 'vitest'
import { sortTreeLevel, sortObjectTree, filterObjectTree } from '@/utils/objectTreeSort'

const dash = (name, id = name) => ({ id, name, class: 'Dashboard' })
const group = (name, children = [], id = name) => ({
  id,
  name,
  class: 'DashboardGroup',
  children,
})

const names = (nodes) => nodes.map((n) => n.name)

describe('sortTreeLevel', () => {
  it('puts grouping objects above everything else', () => {
    const sorted = sortTreeLevel([dash('Alpha'), group('Zulu'), dash('Beta')])
    expect(names(sorted)).toEqual(['Zulu', 'Alpha', 'Beta'])
  })

  it('sorts each block by name', () => {
    const sorted = sortTreeLevel([group('TEST'), dash('DB'), group('Fix'), dash('Demo')])
    expect(names(sorted)).toEqual(['Fix', 'TEST', 'DB', 'Demo'])
  })

  it('does not mutate its input', () => {
    const input = [dash('B'), dash('A')]
    sortTreeLevel(input)
    expect(names(input)).toEqual(['B', 'A'])
  })

  it('tolerates nodes without a name', () => {
    expect(() => sortTreeLevel([{ id: 1, class: 'Dashboard' }, dash('A')])).not.toThrow()
  })
})

describe('sortObjectTree', () => {
  it('sorts every level, not just the top', () => {
    const sorted = sortObjectTree([
      dash('Internet Traffic'),
      group('Fix', [dash('Home Env'), dash('AIX')]),
    ])
    expect(names(sorted)).toEqual(['Fix', 'Internet Traffic'])
    expect(names(sorted[0].children)).toEqual(['AIX', 'Home Env'])
  })

  it('leaves leaf nodes untouched by identity', () => {
    const leaf = dash('A')
    const [out] = sortObjectTree([leaf])
    expect(out).toBe(leaf)
  })

  it('returns an empty array for a missing tree', () => {
    expect(sortObjectTree(undefined)).toEqual([])
  })
})

describe('filterObjectTree', () => {
  const tree = [dash('Internet Traffic'), group('Fix', [dash('Home Env'), dash('AIX')]), dash('DB')]

  it('sorts the whole tree when the filter is empty', () => {
    expect(names(filterObjectTree(tree, ''))).toEqual(['Fix', 'DB', 'Internet Traffic'])
  })

  it('treats a blank filter as empty', () => {
    expect(names(filterObjectTree(tree, '   '))).toEqual(['Fix', 'DB', 'Internet Traffic'])
  })

  it('keeps a node whose descendant matches', () => {
    const out = filterObjectTree(tree, 'aix')
    expect(names(out)).toEqual(['Fix'])
    expect(names(out[0].children)).toEqual(['AIX'])
  })

  it('keeps the full child list of a group that matches by its own name', () => {
    const out = filterObjectTree(tree, 'fix')
    expect(names(out[0].children)).toEqual(['AIX', 'Home Env'])
  })

  it('matches case-insensitively across levels and stays sorted', () => {
    const out = filterObjectTree([dash('zeta'), dash('Alpha'), dash('beta')], 'A')
    expect(names(out)).toEqual(['Alpha', 'beta', 'zeta'])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterObjectTree(tree, 'nosuchthing')).toEqual([])
  })
})
