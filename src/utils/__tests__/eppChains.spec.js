import { describe, it, expect, beforeEach } from 'vitest'
import {
  EPP_CHAIN_ACCESS_EDIT,
  EPP_CHAIN_ACCESS_READ,
  MAIN_CHAIN_ID,
  applyRulePaste,
  canEditChain,
  canReadChain,
  buildCallEdges,
  buildCallGraph,
  callEdgeKey,
  callWouldLoop,
  chainLabel,
  findCycleEdges,
  findUnreachableChains,
  isMainChain,
  reachableChains,
  resolveChainId,
  sortChains,
} from '../eppChains'

const main = { id: 0, name: 'Default policy' }
const escalation = { id: 2, name: 'Escalation' }
const backup = { id: 3, name: 'Backup handling' }

describe('chainLabel', () => {
  it('labels the main chain from its id, ignoring the seeded server name', () => {
    expect(chainLabel(main)).toBe('Main')
  })

  it('uses the name for sub-chains', () => {
    expect(chainLabel(escalation)).toBe('Escalation')
  })

  it('falls back to the id when a sub-chain has no name', () => {
    expect(chainLabel({ id: 7, name: '' })).toBe('Chain #7')
  })

  it('returns an empty string for a missing chain', () => {
    expect(chainLabel(null)).toBe('')
  })
})

describe('isMainChain', () => {
  it('accepts a chain object or a bare id', () => {
    expect(isMainChain(main)).toBe(true)
    expect(isMainChain(MAIN_CHAIN_ID)).toBe(true)
    expect(isMainChain(escalation)).toBe(false)
    expect(isMainChain(2)).toBe(false)
  })
})

describe('sortChains', () => {
  it('puts the main chain first and sorts the rest by name', () => {
    const sorted = sortChains([escalation, main, backup])
    expect(sorted.map((c) => c.id)).toEqual([0, 3, 2])
  })

  it('sorts names numeric-aware and case-insensitive', () => {
    const sorted = sortChains([
      { id: 1, name: 'chain 10' },
      { id: 2, name: 'Chain 2' },
    ])
    expect(sorted.map((c) => c.name)).toEqual(['Chain 2', 'chain 10'])
  })

  it('falls back to id when two chains share a name', () => {
    const sorted = sortChains([
      { id: 9, name: 'Duplicate' },
      { id: 4, name: 'Duplicate' },
    ])
    expect(sorted.map((c) => c.id)).toEqual([4, 9])
  })

  it('does not mutate its input', () => {
    const input = [escalation, main]
    sortChains(input)
    expect(input.map((c) => c.id)).toEqual([2, 0])
  })
})

describe('resolveChainId', () => {
  const chains = [main, escalation]

  it('parses a query-string id', () => {
    expect(resolveChainId('2', chains)).toBe(2)
  })

  it('falls back to the main chain for an id that no longer exists', () => {
    expect(resolveChainId('99', chains)).toBe(MAIN_CHAIN_ID)
  })

  it('falls back to the main chain for junk', () => {
    expect(resolveChainId(undefined, chains)).toBe(MAIN_CHAIN_ID)
    expect(resolveChainId('abc', chains)).toBe(MAIN_CHAIN_ID)
    expect(resolveChainId('-1', chains)).toBe(MAIN_CHAIN_ID)
    expect(resolveChainId('1.5', chains)).toBe(MAIN_CHAIN_ID)
  })

  it('trusts the route before the registry has loaded', () => {
    expect(resolveChainId('2', [])).toBe(2)
    expect(resolveChainId('2', undefined)).toBe(2)
  })
})

describe('buildCallGraph', () => {
  it('collects called chain ids per loaded chain, de-duplicated', () => {
    const graph = buildCallGraph([
      { id: 0, rules: [{ chainCalls: [2] }, { chainCalls: [2, 3] }, {}] },
      { id: 3, rules: [{ chainCalls: [2] }] },
    ])
    expect(graph.get(0)).toEqual([2, 3])
    expect(graph.get(3)).toEqual([2])
  })

  it('skips chains whose rules are not loaded, so the registry alone yields nothing', () => {
    const graph = buildCallGraph([main, escalation])
    expect(graph.size).toBe(0)
  })
})

describe('reachableChains', () => {
  it('follows calls transitively', () => {
    const graph = new Map([
      [0, [2]],
      [2, [3]],
      [3, [4]],
    ])
    expect([...reachableChains(0, graph)]).toEqual([2, 3, 4])
  })

  it('terminates on a cycle', () => {
    const graph = new Map([
      [2, [3]],
      [3, [2]],
    ])
    expect([...reachableChains(2, graph)]).toEqual([3])
  })
})

describe('callWouldLoop', () => {
  it('flags a chain calling itself', () => {
    expect(callWouldLoop(2, 2, new Map())).toBe(true)
  })

  it('flags a call that closes a cycle back to the calling chain', () => {
    const graph = new Map([[3, [0]]])
    expect(callWouldLoop(0, 3, graph)).toBe(true)
  })

  it('flags a cycle closed indirectly', () => {
    const graph = new Map([
      [3, [4]],
      [4, [2]],
    ])
    expect(callWouldLoop(2, 3, graph)).toBe(true)
  })

  it('allows a diamond — the same chain reached from two callers is not a loop', () => {
    const graph = new Map([
      [0, [2, 3]],
      [3, [2]],
    ])
    expect(callWouldLoop(3, 2, graph)).toBe(false)
  })

  it('allows a call into an unrelated chain', () => {
    expect(callWouldLoop(0, 2, new Map([[2, [3]]]))).toBe(false)
  })
})

describe('buildCallEdges', () => {
  it('groups the rules that make the same chain-to-chain call onto one edge', () => {
    const edges = buildCallEdges([
      {
        id: 0,
        rules: [
          { guid: 'a', ruleNumber: 1, comments: 'first', chainCalls: [2] },
          { guid: 'b', ruleNumber: 2, comments: 'second', chainCalls: [2, 3] },
        ],
      },
    ])
    expect(edges).toHaveLength(2)
    const toEscalation = edges.find((e) => e.to === 2)
    expect(toEscalation.from).toBe(0)
    expect(toEscalation.rules.map((r) => r.comments)).toEqual(['first', 'second'])
    expect(edges.find((e) => e.to === 3).rules).toHaveLength(1)
  })

  it('falls back to array position when a rule carries no ruleNumber', () => {
    const edges = buildCallEdges([{ id: 0, rules: [{ guid: 'a', chainCalls: [2] }] }])
    expect(edges[0].rules[0].ruleNumber).toBe(1)
  })

  it('ignores chains whose rules are not loaded', () => {
    expect(buildCallEdges([{ id: 0 }, { id: 2 }])).toEqual([])
  })
})

describe('findCycleEdges', () => {
  it('finds nothing in an acyclic graph', () => {
    const graph = new Map([
      [0, [2, 3]],
      [3, [2]],
    ])
    expect(findCycleEdges(graph).size).toBe(0)
  })

  it('marks a direct back-edge', () => {
    const graph = new Map([
      [0, [2]],
      [2, [0]],
    ])
    expect([...findCycleEdges(graph)].sort()).toEqual([callEdgeKey(0, 2), callEdgeKey(2, 0)])
  })

  it('marks every edge around a longer cycle', () => {
    const graph = new Map([
      [2, [3]],
      [3, [4]],
      [4, [2]],
    ])
    expect([...findCycleEdges(graph)].sort()).toEqual(
      [callEdgeKey(2, 3), callEdgeKey(3, 4), callEdgeKey(4, 2)].sort(),
    )
  })

  it('marks a self-call', () => {
    expect([...findCycleEdges(new Map([[2, [2]]]))]).toEqual([callEdgeKey(2, 2)])
  })

  it('leaves the acyclic approach to a cycle unmarked', () => {
    // 0 enters 2 once; 2 and 3 loop between themselves. Entering from 0 is fine.
    const graph = new Map([
      [0, [2]],
      [2, [3]],
      [3, [2]],
    ])
    const cycles = findCycleEdges(graph)
    expect(cycles.has(callEdgeKey(0, 2))).toBe(false)
    expect(cycles.has(callEdgeKey(2, 3))).toBe(true)
    expect(cycles.has(callEdgeKey(3, 2))).toBe(true)
  })
})

describe('findUnreachableChains', () => {
  const registry = [{ id: 0 }, { id: 2 }, { id: 3 }, { id: 4 }]

  it('treats the main chain as always reachable', () => {
    expect(findUnreachableChains([{ id: 0 }], new Map())).toEqual(new Set())
  })

  it('finds a chain nothing calls', () => {
    const graph = new Map([[0, [2]]])
    expect(findUnreachableChains(registry, graph)).toEqual(new Set([3, 4]))
  })

  it('follows calls transitively, so a chain reached via another counts as reachable', () => {
    const graph = new Map([
      [0, [2]],
      [2, [3]],
      [3, [4]],
    ])
    expect(findUnreachableChains(registry, graph)).toEqual(new Set())
  })

  it('still reports a chain whose only caller is itself unreachable', () => {
    // 3 calls 4, but nothing calls 3 — so neither ever runs.
    const graph = new Map([
      [0, [2]],
      [3, [4]],
    ])
    expect(findUnreachableChains(registry, graph)).toEqual(new Set([3, 4]))
  })
})

describe('applyRulePaste', () => {
  const chainRules = [
    { guid: 'a', chainId: 0, ruleNumber: 1, comments: 'first' },
    { guid: 'b', chainId: 0, ruleNumber: 2, comments: 'second' },
  ]

  let counter = 0
  const makeGuid = () => `tmp-${++counter}`

  beforeEach(() => {
    counter = 0
  })

  it('copies within the chain, marking the duplicate', () => {
    const clipboard = { type: 'copy', rules: [chainRules[0]], chainId: 0 }
    const { rules, selection } = applyRulePaste({
      clipboard,
      rules: chainRules,
      chainId: 0,
      insertIndex: 1,
      makeGuid,
    })
    expect(rules.map((r) => r.guid)).toEqual(['a', 'tmp-1', 'b'])
    expect(rules[1].comments).toBe('first (copy)')
    expect(selection).toEqual(new Set(['tmp-1']))
  })

  it('pastes a copy into another chain as a new rule, without the "(copy)" marker', () => {
    const clipboard = { type: 'copy', rules: chainRules, chainId: 0 }
    const { rules } = applyRulePaste({
      clipboard,
      rules: [{ guid: 'x', chainId: 2, ruleNumber: 1, comments: 'existing' }],
      chainId: 2,
      insertIndex: 1,
      makeGuid,
    })
    expect(rules.map((r) => r.comments)).toEqual(['existing', 'first', 'second'])
    // The source chain's identity must not travel with the rule: the paste decides both.
    expect(rules[1].chainId).toBeUndefined()
    expect(rules[1].ruleNumber).toBeUndefined()
    expect(rules[1].guid).toBe('tmp-1')
  })

  it('moves the rules when a cut is pasted into the chain it came from', () => {
    const rulesBefore = [...chainRules, { guid: 'c', chainId: 0, ruleNumber: 3 }]
    const clipboard = { type: 'cut', rules: [rulesBefore[0]], chainId: 0 }
    const { rules, selection } = applyRulePaste({
      clipboard,
      rules: rulesBefore,
      chainId: 0,
      insertIndex: 3,
      makeGuid,
    })
    expect(rules.map((r) => r.guid)).toEqual(['b', 'c', 'a'])
    expect(selection).toEqual(new Set(['a']))
  })

  it('moves a cut from another chain, and says what that chain is left with', () => {
    // Every chain holds its own working copy, so a cross-chain cut is a move that keeps guids.
    const clipboard = { type: 'cut', rules: [chainRules[0]], chainId: 0 }
    const { rules, selection, sourceChainId, sourceRules } = applyRulePaste({
      clipboard,
      rules: [],
      chainId: 2,
      insertIndex: 0,
      makeGuid,
      sourceRules: chainRules,
    })
    expect(rules.map((r) => r.guid)).toEqual(['a'])
    expect(selection).toEqual(new Set(['a']))
    expect(sourceChainId).toBe(0)
    expect(sourceRules.map((r) => r.guid)).toEqual(['b'])
    expect(rules[0].chainId).toBeUndefined()
    expect(rules[0].ruleNumber).toBeUndefined()
  })

  it('degrades a cross-chain cut to a copy when the source chain is not loaded', () => {
    // Without the source chain's rules there is nothing to take them out of.
    const clipboard = { type: 'cut', rules: [chainRules[0]], chainId: 0 }
    const { rules, sourceRules } = applyRulePaste({
      clipboard,
      rules: [],
      chainId: 2,
      insertIndex: 0,
      makeGuid,
    })
    expect(rules).toHaveLength(1)
    expect(rules[0].guid).toBe('tmp-1')
    expect(sourceRules).toBeUndefined()
  })

  it('leaves the rules untouched when the clipboard is empty', () => {
    const { rules, selection } = applyRulePaste({
      clipboard: { type: 'copy', rules: [], chainId: 0 },
      rules: chainRules,
      chainId: 0,
      insertIndex: 0,
      makeGuid,
    })
    expect(rules).toBe(chainRules)
    expect(selection.size).toBe(0)
  })
})

describe('chain access rights', () => {
  it('reads the mask the server computed', () => {
    expect(canReadChain({ effectiveRights: EPP_CHAIN_ACCESS_READ })).toBe(true)
    expect(canEditChain({ effectiveRights: EPP_CHAIN_ACCESS_READ })).toBe(false)

    const full = { effectiveRights: EPP_CHAIN_ACCESS_READ | EPP_CHAIN_ACCESS_EDIT }
    expect(canReadChain(full)).toBe(true)
    expect(canEditChain(full)).toBe(true)

    expect(canReadChain({ effectiveRights: 0 })).toBe(false)
    expect(canEditChain({ effectiveRights: 0 })).toBe(false)
  })

  it('allows both when the server sent no mask at all', () => {
    // Older servers omit the field; the server enforces every write regardless.
    expect(canReadChain({ id: 2, name: 'legacy' })).toBe(true)
    expect(canEditChain({ id: 2, name: 'legacy' })).toBe(true)
    expect(canEditChain(null)).toBe(true)
  })
})
