import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
import { SERVER_UNAVAILABLE_STATUSES } from '@/api/client'
import * as logsApi from '@/api/logsApi'
import { toApiTimestamp } from '@/utils/timeFormat'
import { LOG_FILTER_TYPE } from '@/utils/logColumnTypes'

const MAX_BACKOFF_MS = 30_000

// The WebAPI closes the connection after every request, so an uncapped catch-up turns a burst
// into dozens of requests per interval, which the proxy answers with 502s.
const MAX_CATCHUP_PAGES = 8

// Nothing else re-arms the tail after a proxy blip (it is not a TanStack query), so transient
// failures are retried. Status 0 is client.js's network failure; no status at all is a bug.
function isTransient(error) {
  return error?.status === 0 || SERVER_UNAVAILABLE_STATUSES.has(error?.status)
}

/**
 * Live tail of a log (the legacy client's trace views), by polling: each poll asks for records
 * after the newest one held. The cursor is the record id column when the log returns one,
 * otherwise the time column backed off by one second - timestamps have one-second resolution,
 * so a strict `greater` would drop rows written in the same second; `identify()` removes the
 * overlap.
 *
 * @param {import('vue').MaybeRefOrGetter<string|null>} logName
 * @param {import('vue').MaybeRefOrGetter<object|null>} request - LogQueryRequest without `offset`
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled] - false drops the buffer;
 *   enabling again re-seeds from the newest records
 * @param {import('vue').MaybeRefOrGetter<string|null>} [options.recordIdColumn]
 * @param {import('vue').MaybeRefOrGetter<string|null>} [options.timeColumn]
 * @param {number} [options.intervalMs]
 * @param {import('vue').MaybeRefOrGetter<number>} [options.bufferLimit]
 */
export function useLogLiveTail(logName, request, options = {}) {
  const {
    enabled = true,
    recordIdColumn = null,
    timeColumn = null,
    intervalMs = 3000,
    bufferLimit = 2000,
  } = options

  /** Newest first. */
  const rows = ref([])
  const pending = ref([])
  // Merged across polls: each poll only resolves the ids in its own batch.
  const resolved = ref({ objects: {}, users: {} })
  const paused = ref(false)
  const isLoading = ref(false)
  const isFetching = ref(false)
  /** Terminal failures only; transient ones show as `reconnecting`. */
  const error = ref(null)
  const lastUpdate = ref(null)
  const failureCount = ref(0)

  // Trimmed with the buffer, oldest first (Set iteration order). Unbounded, it leaked: for
  // syslog and traps the key is the whole record. Keys older than the buffer are below the
  // cursor and can never come back.
  let seen = new Set()
  let cursor = null
  let timer = null
  // Not `timer !== null`: that is false while a request is in flight, and resume() would start
  // a second loop.
  let loopActive = false
  // Discards a slow poll that lands after a restart.
  let generation = 0

  const cursorColumn = computed(() => toValue(recordIdColumn) ?? toValue(timeColumn) ?? null)
  const cursorIsTime = computed(() => toValue(recordIdColumn) == null)

  const supported = computed(() => cursorColumn.value != null)

  const pendingCount = computed(() => pending.value.length)

  const reconnecting = computed(() => failureCount.value > 0)

  function identify(row) {
    const idColumn = toValue(recordIdColumn)
    if (idColumn != null && row[idColumn] != null) return String(row[idColumn])
    return JSON.stringify(row)
  }

  function advanceCursor(batch) {
    const newest = extremeValue(batch, 1)
    if (newest === null) return
    cursor = cursorIsTime.value ? backOffOneSecond(newest) : newest
  }

  /** The newest (`1`) or oldest (`-1`) cursor-column value in a batch, or null. */
  function extremeValue(batch, direction) {
    const column = cursorColumn.value
    if (!column || batch.length === 0) return null
    let found = null
    for (const row of batch) {
      const value = row[column]
      if (value == null) continue
      if (found === null || compare(value, found) * direction > 0) found = value
    }
    return found
  }

  function compare(a, b) {
    if (cursorIsTime.value) return new Date(a).getTime() - new Date(b).getTime()
    return Number(a) - Number(b)
  }

  // toApiTimestamp, not toISOString(): the server's filter parser rejects milliseconds.
  function backOffOneSecond(value) {
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? toApiTimestamp(ms - 1000) : value
  }

  // `less` is strict; for timestamps the bound moves a second forward so rows of the boundary
  // second are not lost across a page edge (`seen` drops the re-read ones).
  function pageBelow(value) {
    if (!cursorIsTime.value) return value
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? toApiTimestamp(ms + 1000) : value
  }

  function buildRequest(below = null) {
    const base = toValue(request)
    if (!base) return null
    if (cursor === null && below === null) return { ...base, offset: 0 }
    const filters = [...(base.filters ?? [])]
    if (cursor !== null) {
      filters.push({ column: cursorColumn.value, type: LOG_FILTER_TYPE.GREATER, value: cursor })
    }
    if (below !== null) {
      filters.push({ column: cursorColumn.value, type: LOG_FILTER_TYPE.LESS, value: below })
    }
    return { ...base, offset: 0, filters }
  }

  // `arrivedAt` drives the arrival highlight (utils/logArrival.js); null marks the seed so a
  // mount does not flash every row.
  function stamp(list, at) {
    return list.map((row) => ({ ...row, arrivedAt: at }))
  }

  /** @returns {number} how many rows were new */
  function accept(records) {
    const batch = records ?? []
    const fresh = []
    // Oldest first, so keys enter `seen` in the order trimSeen() drops them; the other way, a
    // page larger than the buffer would evict the newest keys and the cursor overlap would
    // duplicate rows on screen.
    for (let i = batch.length - 1; i >= 0; i--) {
      const record = batch[i]
      const key = identify(record)
      if (seen.has(key)) continue
      seen.add(key)
      fresh.push({ ...record, id: key, arrivedAt: cursor === null ? null : Date.now() })
    }
    if (fresh.length === 0) return 0
    fresh.reverse()

    if (paused.value) {
      pending.value = [...fresh, ...pending.value].slice(0, toValue(bufferLimit))
    } else {
      rows.value = [...fresh, ...rows.value].slice(0, toValue(bufferLimit))
    }
    trimSeen()
    return fresh.length
  }

  function trimSeen() {
    const limit = Math.max(Number(toValue(bufferLimit)) || 0, 1)
    while (seen.size > limit) seen.delete(seen.values().next().value)
  }

  // Older servers send no resolved values.
  function mergeResolved(values) {
    if (!values) return
    resolved.value = {
      objects: { ...resolved.value.objects, ...values.objects },
      users: { ...resolved.value.users, ...values.users },
    }
  }

  function isFullPage(records, body) {
    return body.limit != null && records.length >= body.limit
  }

  /**
   * A full page means more arrived than one page holds, and the rest is older than what came
   * back. Pages down from the oldest row read until a short page, a page with nothing new (one
   * second holding more than a page would repeat forever), the buffer is full, or
   * MAX_CATCHUP_PAGES.
   *
   * @returns {Promise<boolean>} false if a restart overtook the poll
   */
  async function catchUp(name, body, firstPage, takenSoFar, mine) {
    let taken = takenSoFar
    let below = extremeValue(firstPage, -1)

    for (let i = 0; i < MAX_CATCHUP_PAGES; i++) {
      if (below === null || taken >= toValue(bufferLimit)) return true

      const page = await logsApi.queryLog(name, buildRequest(pageBelow(below)))
      if (mine !== generation) return false

      const records = page?.records ?? []
      const fresh = accept(records)
      mergeResolved(page?.resolvedValues)
      if (fresh === 0 || !isFullPage(records, body)) return true

      taken += fresh
      below = extremeValue(records, -1)
    }
    return true
  }

  async function poll() {
    const name = toValue(logName)
    const body = buildRequest()
    if (!name || !body) return

    const mine = generation
    const seeding = cursor === null
    isFetching.value = true
    try {
      const page = await logsApi.queryLog(name, body)
      if (mine !== generation) return
      const records = page?.records ?? []
      const taken = accept(records)
      mergeResolved(page?.resolvedValues)

      if (!seeding && isFullPage(records, body)) {
        if (!(await catchUp(name, body, records, taken, mine))) return
      }

      // Only on success, so a retry after a transient failure asks the same question again.
      advanceCursor(records)
      error.value = null
      failureCount.value = 0
      lastUpdate.value = Date.now()
    } catch (err) {
      if (mine !== generation) return
      if (isTransient(err)) {
        failureCount.value += 1
      } else {
        // Resuming re-arms the loop.
        error.value = err
        failureCount.value = 0
        stopLoop()
      }
    } finally {
      if (mine === generation) {
        isFetching.value = false
        isLoading.value = false
        // setTimeout rather than setInterval: room for backoff, and a slow response cannot
        // stack a second poll.
        if (loopActive) timer = setTimeout(poll, nextDelay())
      }
    }
  }

  function nextDelay() {
    if (failureCount.value === 0) return intervalMs
    return Math.min(intervalMs * 2 ** (failureCount.value - 1), MAX_BACKOFF_MS)
  }

  function startLoop() {
    stopLoop()
    loopActive = true
    poll()
  }

  function stopLoop() {
    loopActive = false
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function restart() {
    generation += 1
    stopLoop()
    rows.value = []
    pending.value = []
    resolved.value = { objects: {}, users: {} }
    seen = new Set()
    cursor = null
    error.value = null
    failureCount.value = 0

    if (!toValue(enabled) || !supported.value || !toValue(request)) {
      isLoading.value = false
      return
    }
    isLoading.value = true
    startLoop()
  }

  /** Freezes the visible feed; polling continues. */
  function pause() {
    paused.value = true
  }

  function resume() {
    paused.value = false
    if (pending.value.length > 0) {
      const released = stamp(pending.value, Date.now())
      rows.value = [...released, ...rows.value].slice(0, toValue(bufferLimit))
      pending.value = []
    }
    // A terminal failure stopped the loop, so resuming is also the retry.
    if (toValue(enabled) && supported.value && !loopActive) {
      error.value = null
      failureCount.value = 0
      startLoop()
    }
  }

  function togglePause() {
    if (paused.value) resume()
    else pause()
  }

  /** Empties the feed but keeps the cursor. */
  function clear() {
    rows.value = []
    pending.value = []
  }

  watch(
    [() => toValue(logName), () => toValue(request), () => toValue(enabled), supported],
    restart,
    { immediate: true },
  )

  onScopeDispose(() => {
    generation += 1
    stopLoop()
  })

  return {
    rows,
    resolvedPages: computed(() => [resolved.value]),
    isLoading,
    isFetching,
    error,
    reconnecting,
    paused,
    pendingCount,
    supported,
    lastUpdate,
    pause,
    resume,
    togglePause,
    clear,
  }
}
