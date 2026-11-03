// Chain 0 is the main chain. Its name from the database seed is never displayed: clients label it
// from the id, as nxmc does.

export const MAIN_CHAIN_ID = 0

export const MAIN_CHAIN_LABEL = 'Main'

/** Chain-level access rights (`include/nxcldefs.h`). */
export const EPP_CHAIN_ACCESS_READ = 0x01
export const EPP_CHAIN_ACCESS_EDIT = 0x02

const EPP_CHAIN_ACCESS_FULL = EPP_CHAIN_ACCESS_READ | EPP_CHAIN_ACCESS_EDIT

// Older servers send no `effectiveRights`; absent means allow, since the server enforces rights on
// every write.
function chainRights(chain) {
  return chain?.effectiveRights ?? EPP_CHAIN_ACCESS_FULL
}

export function canReadChain(chain) {
  return (chainRights(chain) & EPP_CHAIN_ACCESS_READ) !== 0
}

// The main chain has no access list; the server folds the global EPP right into `effectiveRights`.
export function canEditChain(chain) {
  return (chainRights(chain) & EPP_CHAIN_ACCESS_EDIT) !== 0
}

export function isMainChain(chain) {
  return (typeof chain === 'object' ? chain?.id : chain) === MAIN_CHAIN_ID
}

export function chainLabel(chain) {
  if (chain == null) return ''
  if (isMainChain(chain)) return MAIN_CHAIN_LABEL
  return chain.name || `Chain #${chain.id}`
}

/** Main chain first, then by name, then by id (chain names need not be unique). */
export function sortChains(chains) {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
  return [...(chains ?? [])].sort((a, b) => {
    if (isMainChain(a) !== isMainChain(b)) return isMainChain(a) ? -1 : 1
    const byName = collator.compare(chainLabel(a), chainLabel(b))
    return byName !== 0 ? byName : a.id - b.id
  })
}

/** An id that no longer exists (deleted chain, stale bookmark) falls back to the main chain. */
export function resolveChainId(raw, chains) {
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 0) return MAIN_CHAIN_ID
  if (!chains?.length) return id
  return chains.some((chain) => chain.id === id) ? id : MAIN_CHAIN_ID
}

/**
 * Excludes the start itself.
 *
 * @param {number} startId
 * @param {Map<number, number[]>} callsByChain
 */
export function reachableChains(startId, callsByChain) {
  const seen = new Set()
  const queue = [...(callsByChain.get(startId) ?? [])]
  while (queue.length) {
    const next = queue.shift()
    if (seen.has(next) || next === startId) continue
    seen.add(next)
    queue.push(...(callsByChain.get(next) ?? []))
  }
  return seen
}

/**
 * A warning, not an error: the server skips a call to a chain already active for the event and
 * reports SYS_EPP_CHAIN_LOOP.
 *
 * @param {number} fromChainId
 * @param {number} toChainId
 * @param {Map<number, number[]>} callsByChain
 * @returns {boolean}
 */
export function callWouldLoop(fromChainId, toChainId, callsByChain) {
  if (fromChainId === toChainId) return true
  return reachableChains(toChainId, callsByChain).has(fromChainId)
}

/**
 * Only chains whose rules are loaded contribute, so a cycle check is best-effort until the
 * chains involved have been opened.
 *
 * @param {Array<{ id: number, rules?: Array<{ chainCalls?: number[] }> }>} chains
 * @returns {Map<number, number[]>}
 */
export function buildCallGraph(chains) {
  const graph = new Map()
  for (const chain of chains ?? []) {
    if (!chain?.rules) continue
    const calls = []
    for (const rule of chain.rules) {
      for (const target of rule.chainCalls ?? []) {
        if (!calls.includes(target)) calls.push(target)
      }
    }
    graph.set(chain.id, calls)
  }
  return graph
}

export function callEdgeKey(from, to) {
  return `${from}>${to}`
}

/**
 * One entry per chain-to-chain call; rules calling the same target share an edge.
 *
 * @param {Array<{ id: number, rules?: object[] }>} chains
 * @returns {Array<{ key: string, from: number, to: number, rules: object[] }>}
 */
export function buildCallEdges(chains) {
  const edges = new Map()
  for (const chain of chains ?? []) {
    if (!chain?.rules) continue
    chain.rules.forEach((rule, index) => {
      for (const target of rule.chainCalls ?? []) {
        const key = callEdgeKey(chain.id, target)
        if (!edges.has(key)) {
          edges.set(key, { key, from: chain.id, to: target, rules: [] })
        }
        edges.get(key).rules.push({
          guid: rule.guid,
          ruleNumber: rule.ruleNumber ?? index + 1,
          comments: rule.comments ?? '',
        })
      }
    })
  }
  return [...edges.values()]
}

/**
 * Edges on a cycle: calls the server will never take (it reports SYS_EPP_CHAIN_LOOP).
 *
 * @param {Map<number, number[]>} callGraph
 * @returns {Set<string>} edge keys, as produced by `callEdgeKey`
 */
export function findCycleEdges(callGraph) {
  const onCycle = new Set()
  const state = new Map() // chain id → 'visiting' | 'done'
  const path = []

  function visit(chainId) {
    state.set(chainId, 'visiting')
    path.push(chainId)
    for (const target of callGraph.get(chainId) ?? []) {
      if (state.get(target) === 'visiting') {
        const start = path.indexOf(target)
        for (let i = start; i < path.length - 1; i++) {
          onCycle.add(callEdgeKey(path[i], path[i + 1]))
        }
        onCycle.add(callEdgeKey(chainId, target))
      } else if (!state.has(target)) {
        visit(target)
      }
    }
    path.pop()
    state.set(chainId, 'done')
  }

  for (const chainId of callGraph.keys()) {
    if (!state.has(chainId)) visit(chainId)
  }
  return onCycle
}

/**
 * @param {Array<{ id: number }>} chains
 * @param {Map<number, number[]>} callGraph
 * @returns {Set<number>}
 */
export function findUnreachableChains(chains, callGraph) {
  const reachable = reachableChains(MAIN_CHAIN_ID, callGraph)
  reachable.add(MAIN_CHAIN_ID)
  return new Set((chains ?? []).map((c) => c.id).filter((id) => !reachable.has(id)))
}

/**
 * A cross-chain cut also returns what the source chain is left with, for the caller to save
 * together. Moved rules keep their guids; only copies get fresh ones.
 *
 * @param {object} args
 * @param {{ type: 'copy'|'cut', rules: object[], chainId: number }} args.clipboard
 * @param {object[]} args.rules
 * @param {number} args.chainId
 * @param {number} args.insertIndex
 * @param {() => string} args.makeGuid
 * @param {object[]} [args.sourceRules] without it a cross-chain cut degrades to a copy
 * @returns {{ rules: object[], selection: Set<string>, sourceChainId?: number,
 *   sourceRules?: object[] }}
 */
export function applyRulePaste({ clipboard, rules, chainId, insertIndex, makeGuid, sourceRules }) {
  const pasted = clipboard?.rules ?? []
  if (!pasted.length) return { rules, selection: new Set() }
  const sameChain = clipboard.chainId === chainId

  if (clipboard.type === 'cut' && !sameChain && Array.isArray(sourceRules)) {
    const cutGuids = new Set(pasted.map((r) => r.guid))
    const moved = pasted.map((rule) => {
      const { chainId: _chainId, ruleNumber: _ruleNumber, ...rest } = rule
      return rest
    })
    return {
      rules: [...rules.slice(0, insertIndex), ...moved, ...rules.slice(insertIndex)],
      selection: new Set(moved.map((r) => r.guid)),
      sourceChainId: clipboard.chainId,
      sourceRules: sourceRules.filter((r) => !cutGuids.has(r.guid)),
    }
  }

  if (clipboard.type === 'cut' && sameChain) {
    const cutGuids = new Set(pasted.map((r) => r.guid))
    const remaining = rules.filter((r) => !cutGuids.has(r.guid))
    const removedBefore = rules.slice(0, insertIndex).filter((r) => cutGuids.has(r.guid)).length
    const at = insertIndex - removedBefore
    return {
      rules: [...remaining.slice(0, at), ...pasted, ...remaining.slice(at)],
      selection: new Set(pasted.map((r) => r.guid)),
    }
  }

  const copies = pasted.map((rule) => {
    const { chainId: _chainId, ruleNumber: _ruleNumber, ...rest } = rule
    return {
      ...rest,
      guid: makeGuid(),
      comments: sameChain ? (rule.comments ? `${rule.comments} (copy)` : '(copy)') : rule.comments,
    }
  })
  return {
    rules: [...rules.slice(0, insertIndex), ...copies, ...rules.slice(insertIndex)],
    selection: new Set(copies.map((r) => r.guid)),
  }
}
