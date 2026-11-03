import { mapConcurrent } from '@/utils/concurrencyLimit'
import { dciValueKey } from '@/utils/dciValues'

/** Must match MAX_BULK_DCI_ITEMS in the server's webapi/datacoll.cpp. */
export const BULK_MAX_DCI_ITEMS = 500

/** Objects read at a time on a server without the bulk endpoint. */
const FALLBACK_CONCURRENCY = 3

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/**
 * Coalesces DCI value reads: `load()` defers to the end of the tick and sends everything queued
 * as one POST /v1/data-collection/current-values per delegate, in chunks of `maxItems`. Each
 * call resolves with its own values keyed by `dciValueKey`; an item the server cannot serve is
 * absent. A refused (403) or gone (404) delegate is dropped and the batch retried without it. A
 * server without the endpoint (404/405) gets per-object list reads from then on, which carry a
 * table DCI's value summary, not the requested cell.
 *
 * @param {object} deps
 * @param {(body: {items: object[], delegate?: number}, options: object) => Promise<object>}
 *   deps.fetchBulk
 * @param {(objectId: number, options: object) => Promise<object>} deps.fetchObjectValues
 * @param {number} [deps.maxItems]
 * @param {number} [deps.delayMs]
 */
export function createDciValueBatcher({
  fetchBulk,
  fetchObjectValues,
  maxItems = BULK_MAX_DCI_ITEMS,
  delayMs = 0,
}) {
  let bulkSupported = true
  /** @type {Map<number, {items: Map<string, object>, calls: object[]}>} delegate (0 = none) */
  let pending = new Map()
  let timer = null

  function settle(call, outcome) {
    if (call.settled) return
    call.settled = true
    outcome()
  }

  /**
   * @param {Array<{objectId: number, dciId: number, column?: string, instance?: string}>} items
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {'interactive'|'background'} [options.priority]
   * @param {number} [options.delegate] - network map or dashboard id for delegated read
   * @returns {Promise<Record<string, object>>} DCIValue rows keyed by `dciValueKey`
   */
  function load(items, { signal, priority = 'interactive', delegate = 0 } = {}) {
    if (signal?.aborted) return Promise.reject(abortError())
    if (!items?.length) return Promise.resolve({})
    return new Promise((resolve, reject) => {
      const call = { keys: [], resolve, reject, signal, priority, settled: false }
      signal?.addEventListener('abort', () => settle(call, () => reject(abortError())), {
        once: true,
      })
      let batch = pending.get(delegate)
      if (!batch) pending.set(delegate, (batch = { items: new Map(), calls: [] }))
      for (const item of items) {
        const key = dciValueKey(item)
        call.keys.push(key)
        batch.items.set(key, item)
      }
      batch.calls.push(call)
      timer ??= setTimeout(flush, delayMs)
    })
  }

  function flush() {
    timer = null
    const batches = pending
    pending = new Map()
    for (const [delegate, batch] of batches) run(delegate, batch)
  }

  async function run(delegate, { items, calls }) {
    if (calls.every((call) => call.settled)) return

    // The shared request serves every call, so only the last one leaving may cancel it.
    const controller = new AbortController()
    for (const call of calls) {
      call.signal?.addEventListener(
        'abort',
        () => {
          if (calls.every((c) => c.settled)) controller.abort()
        },
        { once: true },
      )
    }
    const options = {
      signal: controller.signal,
      priority: calls.some((call) => call.priority === 'interactive')
        ? 'interactive'
        : 'background',
    }

    let values
    try {
      values = await fetchValues([...items.values()], delegate, options)
    } catch (error) {
      for (const call of calls) settle(call, () => call.reject(error))
      return
    }
    for (const call of calls) {
      const own = {}
      for (const key of call.keys) if (Object.hasOwn(values, key)) own[key] = values[key]
      settle(call, () => call.resolve(own))
    }
  }

  async function fetchValues(items, delegate, options) {
    if (!bulkSupported) return fetchPerObject(items, options)
    try {
      return await fetchInBulk(items, delegate, options)
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      // An unreadable or deleted delegate: read without it. With a delegate a 404 may also be the
      // missing route; the second try tells which.
      if (delegate && (error?.status === 403 || error?.status === 404)) {
        return fetchValues(items, 0, options)
      }
      if (error?.status !== 404 && error?.status !== 405) throw error
      bulkSupported = false
      return fetchPerObject(items, options)
    }
  }

  async function fetchInBulk(items, delegate, options) {
    const chunks = []
    for (let i = 0; i < items.length; i += maxItems) chunks.push(items.slice(i, i + maxItems))
    const responses = await Promise.all(
      chunks.map((chunk) =>
        fetchBulk(delegate ? { items: chunk, delegate } : { items: chunk }, options),
      ),
    )
    const values = {}
    responses.forEach((response, i) => {
      // Values answer request items by position; unservable items are in `errors` instead.
      for (const { index, ...value } of response?.values ?? []) {
        const item = chunks[i][index]
        if (item) values[dciValueKey(item)] = value
      }
    })
    return values
  }

  async function fetchPerObject(items, options) {
    const byObject = new Map()
    for (const item of items) {
      if (!byObject.has(item.objectId)) byObject.set(item.objectId, [])
      byObject.get(item.objectId).push(item)
    }
    const values = {}
    await mapConcurrent(
      [...byObject.keys()],
      async (objectId) => {
        let response
        try {
          response = await fetchObjectValues(objectId, options)
        } catch (error) {
          // One unreadable object must not fail every other value in the batch.
          if (error?.name === 'AbortError') throw error
          return
        }
        const rows = new Map((response?.values ?? []).map((row) => [Number(row.id), row]))
        for (const item of byObject.get(objectId)) {
          const row = rows.get(item.dciId)
          if (row) values[dciValueKey(item)] = row
        }
      },
      FALLBACK_CONCURRENCY,
    )
    return values
  }

  return { load }
}
