import { get, post, put, del } from './client'

/**
 * The event processing policy is a set of rule chains. Chain 0 is the main chain — the entry
 * point of event processing; a rule enters another chain by listing its id in `chainCalls`.
 * There is no whole-policy endpoint: every read and write is scoped to one chain.
 * Chain constants and helpers live in `@/utils/eppChains`.
 */
const BASE = '/v1/event-processing-policy'

/** Chain registry: every chain without its rules, but with `ruleCount` and `callerCount`. */
export function getEppChains() {
  return get(`${BASE}/chains`)
}

/** One chain together with its rules in evaluation order, and the version to save against. */
export function getEppChain(chainId) {
  return get(`${BASE}/chains/${chainId}`)
}

/**
 * Create an empty chain.
 * @param {{ name: string, description?: string, accessList?: object[] }} payload
 */
export function createEppChain(payload) {
  return post(`${BASE}/chains`, payload)
}

/**
 * Change a chain's name, description, or access list. Absent fields keep their current value;
 * a present `accessList` replaces the whole list. Rejected with 405 for the main chain.
 * @param {{ name?: string, description?: string, accessList?: object[] }} payload
 */
export function updateEppChain(chainId, payload) {
  return put(`${BASE}/chains/${chainId}`, payload)
}

/**
 * Delete a chain and its rules. Calls to it are removed from rules in every other chain; the
 * response lists those chains' new versions in `updatedChains`. Rejected with 405 for the
 * main chain.
 */
export function deleteEppChain(chainId) {
  return del(`${BASE}/chains/${chainId}`)
}

/**
 * Replace the rules of one chain. `version` must match the chain's current version, or the
 * request is rejected with 409 carrying `currentVersion`.
 * @param {{ version?: number, rules: object[] }} payload
 */
export function updateEppChainRules(chainId, payload) {
  return put(`${BASE}/chains/${chainId}/rules`, payload)
}

/** Rules, in any chain, whose `chainCalls` include this chain. */
export function getEppChainCallers(chainId) {
  return get(`${BASE}/chains/${chainId}/callers`)
}
