import { ApiError } from './client'

/** Must match MAX_BULK_OBJECT_IDS in the server's webapi/objects.cpp. */
export const BULK_MAX_IDS = 500

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/**
 * Coalesce single-object reads: `load()` keeps the single-object contract (resolve with the
 * document, reject with an ApiError 403/404) but defers to the end of the tick, and everything
 * queued goes out as one POST /v1/objects/details per delegate, in chunks of `maxIds`. A server
 * without the endpoint answers 405; from then on calls go to `fetchOne`.
 *
 * @param {object} deps
 * @param {(body: {ids: number[], delegate?: number}, options: object) => Promise<object>}
 *   deps.fetchBulk
 * @param {(id: number, options: object) => Promise<object>} deps.fetchOne
 * @param {number} [deps.maxIds]
 * @param {number} [deps.delayMs]
 */
export function createObjectBatcher({ fetchBulk, fetchOne, maxIds = BULK_MAX_IDS, delayMs = 0 }) {
  let bulkSupported = true
  /** @type {Map<number, Map<number, object[]>>} delegate id (0 = none) -> id -> waiters */
  let pending = new Map()
  let timer = null

  function settle(waiter, outcome) {
    if (waiter.settled) return
    waiter.settled = true
    outcome()
  }

  function fallback(id, waiter) {
    fetchOne(id, { signal: waiter.signal, priority: waiter.priority }).then(
      (doc) => settle(waiter, () => waiter.resolve(doc)),
      (error) => settle(waiter, () => waiter.reject(error)),
    )
  }

  /**
   * @param {number} id
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {'interactive'|'background'} [options.priority]
   * @param {number} [options.delegate] - map or dashboard id for delegated read
   */
  function load(id, { signal, priority = 'interactive', delegate = 0 } = {}) {
    if (!bulkSupported) return fetchOne(id, { signal, priority })
    if (signal?.aborted) return Promise.reject(abortError())
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, priority, settled: false }
      signal?.addEventListener('abort', () => settle(waiter, () => reject(abortError())), {
        once: true,
      })
      let group = pending.get(delegate)
      if (!group) pending.set(delegate, (group = new Map()))
      if (!group.has(id)) group.set(id, [])
      group.get(id).push(waiter)
      timer ??= setTimeout(flush, delayMs)
    })
  }

  function flush() {
    timer = null
    const groups = pending
    pending = new Map()
    for (const [delegate, byId] of groups) {
      const ids = [...byId.keys()]
      for (let i = 0; i < ids.length; i += maxIds) {
        send(delegate, ids.slice(i, i + maxIds), byId)
      }
    }
  }

  async function send(delegate, ids, byId) {
    const waiters = ids.flatMap((id) => byId.get(id))
    if (waiters.every((waiter) => waiter.settled)) return

    // The shared request serves every waiter, so only the last one leaving may cancel it.
    const controller = new AbortController()
    for (const waiter of waiters) {
      waiter.signal?.addEventListener(
        'abort',
        () => {
          if (waiters.every((w) => w.settled)) controller.abort()
        },
        { once: true },
      )
    }
    const priority = waiters.some((waiter) => waiter.priority === 'interactive')
      ? 'interactive'
      : 'background'

    let response
    try {
      response = await fetchBulk(delegate ? { ids, delegate } : { ids }, {
        signal: controller.signal,
        priority,
      })
    } catch (error) {
      if (error?.name === 'AbortError') return // every waiter has already rejected itself
      const unsupported = error?.status === 405 || (error?.status === 404 && !delegate)
      if (unsupported) bulkSupported = false
      // An unreadable or deleted delegate: fetch without it.
      const delegateRefused = delegate && (error?.status === 403 || error?.status === 404)
      for (const id of ids) {
        for (const waiter of byId.get(id)) {
          if (unsupported || delegateRefused) fallback(id, waiter)
          else settle(waiter, () => waiter.reject(error))
        }
      }
      return
    }

    const docs = new Map((response?.objects ?? []).map((doc) => [doc.id, doc]))
    const denied = new Set(response?.denied ?? [])
    for (const id of ids) {
      const doc = docs.get(id)
      const error = doc
        ? null
        : denied.has(id)
          ? new ApiError('Access denied', 403, null)
          : new ApiError('Object not found', 404, null)
      for (const waiter of byId.get(id)) {
        settle(waiter, () => (doc ? waiter.resolve(doc) : waiter.reject(error)))
      }
    }
  }

  return { load }
}
