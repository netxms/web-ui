import fs from 'node:fs'
import path from 'node:path'

/**
 * In-memory rule-chain store seeded from `eppChainSeed.json`. `ruleCount`, `callerCount` and
 * the callers list are derived, not stored, so the mocks cannot drift apart.
 */

const SEED_FILE = path.resolve('mocks/v1/_lib/eppChainSeed.json')

/** id → { id, guid, name, description, version, accessList, rules }. */
let store = null

function load() {
  if (store === null) {
    store = new Map()
    for (const chain of JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'))) {
      store.set(chain.id, structuredClone(chain))
    }
  }
  return store
}

export function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve({})
      }
    })
  })
}

/** Rules, in any chain, whose `chainCalls` include `chainId`. */
export function callersOf(chainId) {
  const callers = []
  for (const chain of load().values()) {
    chain.rules.forEach((rule, index) => {
      if ((rule.chainCalls ?? []).includes(chainId)) {
        callers.push({
          ruleGuid: rule.guid,
          chainId: chain.id,
          ruleNumber: index + 1,
          comments: rule.comments ?? '',
        })
      }
    })
  }
  return callers
}

function withCounts(chain, { includeRules }) {
  const { rules, ...rest } = chain
  return {
    ...rest,
    ruleCount: rules.length,
    callerCount: callersOf(chain.id).length,
    ...(includeRules ? { rules } : {}),
  }
}

/** Registry: main chain first, then sub-chains in creation order. */
export function listChains() {
  return [...load().values()].map((chain) => withCounts(chain, { includeRules: false }))
}

export function getChain(chainId) {
  const chain = load().get(chainId)
  return chain ? withCounts(chain, { includeRules: true }) : null
}

export function chainExists(chainId) {
  return load().has(chainId)
}

export function createChain({ name, description, accessList }) {
  const chains = load()
  const id = Math.max(...chains.keys()) + 1
  chains.set(id, {
    id,
    guid: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    name,
    description,
    version: 1,
    accessList,
    rules: [],
  })
  return getChain(id)
}

export function updateChain(chainId, { name, description, accessList }) {
  const chain = load().get(chainId)
  if (!chain) return null
  if (name !== undefined) chain.name = name
  if (description !== undefined) chain.description = description
  // Matching the server: an access list is replaced only when the request carries one.
  if (accessList !== undefined) chain.accessList = accessList
  return getChain(chainId)
}

/** Each chain that loses a call gets a new version, so the client invalidates its copy. */
export function deleteChain(chainId) {
  const chains = load()
  if (!chains.has(chainId)) return null

  const updatedChains = []
  for (const chain of chains.values()) {
    if (chain.id === chainId) continue
    let touched = false
    for (const rule of chain.rules) {
      if ((rule.chainCalls ?? []).includes(chainId)) {
        rule.chainCalls = rule.chainCalls.filter((target) => target !== chainId)
        touched = true
      }
    }
    if (touched) {
      chain.version += 1
      updatedChains.push({ chainId: chain.id, version: chain.version })
    }
  }

  chains.delete(chainId)
  return { updatedChains }
}

/**
 * A stale `version` is rejected with the current one, so the client's 409 handling can be
 * exercised; an omitted `version` replaces unconditionally.
 */
export function replaceChainRules(chainId, { version, rules }) {
  const chain = load().get(chainId)
  if (!chain) return { status: 404, body: { error: `No such chain: ${chainId}` } }

  if (version !== undefined && version !== chain.version) {
    return {
      status: 409,
      body: {
        error: 'Version conflict: chain was modified by another session',
        currentVersion: chain.version,
      },
    }
  }

  chain.version += 1
  chain.rules = (rules ?? []).map((rule, index) => ({
    guid: rule.guid ?? `mock-${chainId}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    ...rule,
    ruleNumber: index + 1,
    chainId,
    chainCalls: rule.chainCalls ?? [],
  }))

  return {
    status: 200,
    body: { chainId, version: chain.version, ruleCount: chain.rules.length },
  }
}

/** Returns null when the `{chain-id}` segment is not a plain number. */
export function chainIdFromUrl(req) {
  const segments = req.url.split('?')[0].split('/')
  const index = segments.lastIndexOf('chains')
  const raw = index === -1 ? null : segments[index + 1]
  if (raw == null || !/^\d+$/.test(raw)) return null
  return Number(raw)
}
