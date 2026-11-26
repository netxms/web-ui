import { get, post, patch, put, del } from './client'

// AI operator instances (perpetual monitoring loops); the interactive assistant is in aiApi.js.

/**
 * Servers before netxms 2a49dc61c1 (7.1 included) call the cycle count of an operator and of an
 * instructions history record `iteration`.
 *
 * @template {object} T
 * @param {T} item
 * @returns {T & { cycle: number }}
 */
export function withCycle(item) {
  if (!item || item.cycle != null) return item
  return { ...item, cycle: item.iteration ?? 0 }
}

export async function getAiOperators() {
  const operators = await get('/v1/ai/operators')
  return Array.isArray(operators) ? operators.map(withCycle) : operators
}

export async function getAiOperator(operatorId) {
  return withCycle(await get(`/v1/ai/operators/${operatorId}`))
}

export function createAiOperator(data) {
  return post('/v1/ai/operators', data)
}

/** Partial update - only the fields present in `data` are changed. */
export function updateAiOperator(operatorId, data) {
  return patch(`/v1/ai/operators/${operatorId}`, data)
}

export function deleteAiOperator(operatorId) {
  return del(`/v1/ai/operators/${operatorId}`)
}

/** Clear memento, current focus, watch list, standing instructions and cycle counter. */
export function resetAiOperatorMemento(operatorId) {
  return post(`/v1/ai/operators/${operatorId}/reset-memento`)
}

// Standing checks (NXSL the server runs on schedule without the LLM) and instruction history;
// both need "manage AI operators".

export function getAiOperatorChecks(operatorId) {
  return get(`/v1/ai/operators/${operatorId}/checks`)
}

export function createAiOperatorCheck(operatorId, data) {
  return post(`/v1/ai/operators/${operatorId}/checks`, data)
}

/** Partial update: only the fields present change, and a changed source is compiled first. */
export function updateAiOperatorCheck(operatorId, checkId, data) {
  return patch(`/v1/ai/operators/${operatorId}/checks/${checkId}`, data)
}

export function deleteAiOperatorCheck(operatorId, checkId) {
  return del(`/v1/ai/operators/${operatorId}/checks/${checkId}`)
}

export async function getAiOperatorInstructionsHistory(operatorId) {
  const records = await get(`/v1/ai/operators/${operatorId}/instructions-history`)
  return Array.isArray(records) ? records.map(withCycle) : records
}

// Observations: reading needs "view event log"; changing state needs "update alarms" on the
// source object, or "manage AI operators" for server-level ones.

/**
 * @param {object} [params]
 * @param {number} [params.instance] - only this operator instance
 * @param {number} [params.object] - only observations about this object
 * @param {boolean} [params.includeChildren] - with `object`, also its descendants (servers
 *   without support ignore it and match the object exactly)
 * @param {string} [params.state] - 'new' | 'acknowledged' | 'dismissed'
 * @param {string} [params.since] - unix timestamp, ISO 8601, or relative ('-1h')
 * @param {number} [params.limit] - 0 means unlimited
 */
export function getAiObservations(params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  }
  const qs = query.toString()
  return get(`/v1/ai/observations${qs ? `?${qs}` : ''}`, { suppressForbidden: true })
}

/** @param {'new'|'acknowledged'|'dismissed'} state */
export function setAiObservationState(observationId, state) {
  return put(`/v1/ai/observations/${observationId}/state`, { state })
}
