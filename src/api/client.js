const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// JSON.parse rounds 64-bit integers to float64, so known 64-bit fields become strings before
// parsing and BigInt() gets the exact text.
function parseJsonSafe(text) {
  const patched = text.replace(/"(systemRights|systemAccessRights)"\s*:\s*(\d+)/g, '"$1":"$2"')
  return JSON.parse(patched)
}

// JSON.stringify throws on BigInt. Emit them as JSON numbers using a
// placeholder-replace so the server receives a proper integer, not a string.
function stringifyBody(body) {
  return JSON.stringify(body, (key, value) => {
    if (typeof value === 'bigint') return `__BIGINT__${value}__`
    return value
  }).replace(/"__BIGINT__(\d+)__"/g, '$1')
}

/**
 * The server is unreachable: the proxy gave up or timed out. These raise
 * `app:server-unavailable`, the only trigger for the reconnect probe; the retry policy in
 * `@/queries/config` derives its no-retry set from this one.
 */
export const SERVER_UNAVAILABLE_STATUSES = new Set([502, 503, 504])

class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/**
 * `reason` is the WebAPI's only structured error field (`Context::setErrorResponse`); some
 * responses carry `message` instead.
 *
 * @param {object|null} data - parsed response body
 * @param {string} fallback
 */
export function errorMessage(data, fallback) {
  const reason = data?.reason ?? data?.message
  return typeof reason === 'string' && reason.trim() !== '' ? reason : fallback
}

// Imported lazily to break the import cycle; cached so concurrent requests share one resolution.
let authStoreImport
function authStoreModule() {
  authStoreImport ??= import('@/stores/authStore')
  return authStoreImport
}

/**
 * Requests in flight at once, app-wide. Without a cap, fan-outs (a map's objects, an alarm
 * table's sources) land as one burst over HTTP/2 and time out against the WebAPI or its proxy.
 * `VITE_MAX_CONCURRENT_REQUESTS` overrides it.
 */
const MAX_CONCURRENT_REQUESTS = Number(import.meta.env.VITE_MAX_CONCURRENT_REQUESTS) || 6

/**
 * Two lanes rather than a sorted queue: background work must never delay an interactive
 * request. FIFO within a lane.
 */
const requestQueue = { interactive: [], background: [] }
let activeRequests = 0

function abortError() {
  return new DOMException('Request aborted', 'AbortError')
}

/**
 * @param {'interactive'|'background'} priority
 * @param {AbortSignal} [signal]
 */
function acquireRequestSlot(priority, signal) {
  if (signal?.aborted) return Promise.reject(abortError())

  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++
    return Promise.resolve()
  }

  const lane = requestQueue[priority] ?? requestQueue.interactive
  return new Promise((resolve, reject) => {
    const waiter = {
      start() {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      },
    }
    // A request cancelled while queued never reaches the network.
    function onAbort() {
      const index = lane.indexOf(waiter)
      if (index >= 0) lane.splice(index, 1)
      reject(abortError())
    }
    lane.push(waiter)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Hand the slot to the next waiter, or give it back to the pool. */
function releaseRequestSlot() {
  const waiter = requestQueue.interactive.shift() ?? requestQueue.background.shift()
  if (waiter) waiter.start()
  else activeRequests--
}

/**
 * @param {string} method
 * @param {string} path
 * @param {object} [options]
 * @param {object} [options.body] - JSON request body
 * @param {BodyInit} [options.rawBody] - raw body for uploads (skips JSON encoding)
 * @param {object} [options.headers] - extra headers; these win over the injected ones
 * @param {'json'|'text'|'blob'} [options.responseType]
 * @param {AbortSignal} [options.signal] - cancels the request, also while it is queued
 * @param {'interactive'|'background'} [options.priority] - default 'interactive';
 *   'background' for polling and list resolution
 * @param {boolean} [options.suppressForbidden] - no global 403 toast, for a query-shaped POST
 *   whose 403 the caller renders inline (only writes toast by default)
 * @param {boolean} [options.suppressUnauthorized] - on 401, throw instead of logging out; for
 *   server probes such as `getServerStatus`
 * @param {boolean} [options.suppressUnavailable] - no `app:server-unavailable` for a 502/503/504
 *   that is the endpoint's own answer (`POST /v1/ai/chat` answers 503 without an AI provider)
 */
async function request(method, path, options = {}) {
  await acquireRequestSlot(options.priority ?? 'interactive', options.signal)
  try {
    // The slot is held until the body is read, not just until headers arrive - a large
    // response occupies the connection for the whole download.
    return await sendRequest(method, path, options)
  } finally {
    releaseRequestSlot()
  }
}

async function sendRequest(
  method,
  path,
  {
    body,
    rawBody,
    headers = {},
    responseType,
    signal,
    suppressForbidden,
    suppressUnauthorized,
    suppressUnavailable,
  } = {},
) {
  const { useAuthStore } = await authStoreModule()
  const authStore = useAuthStore()

  const storeAuth = authStore.sessionGuid
    ? { Authorization: `Bearer ${authStore.sessionGuid}` }
    : {}
  const isRawUpload = rawBody != null
  const opts = {
    method,
    signal,
    headers: {
      ...(isRawUpload ? {} : { 'Content-Type': 'application/json' }),
      ...storeAuth,
      ...headers, // caller-supplied headers win (e.g. explicit token on logout)
    },
  }

  if (isRawUpload) {
    opts.body = rawBody
  } else if (body !== undefined) {
    opts.body = stringifyBody(body)
  }

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, opts)
  } catch (error) {
    // An abort says nothing about the server; rethrowing the AbortError unchanged marks the
    // query cancelled rather than failed.
    if (error?.name === 'AbortError' || signal?.aborted) throw error ?? abortError()
    window.dispatchEvent(new CustomEvent('app:server-unavailable'))
    throw new ApiError('Network error', 0, null)
  }

  if (response.status === 401) {
    const data = await response.json().catch(() => null)
    if (!suppressUnauthorized && path !== '/v1/logout' && path !== '/v1/login') {
      authStore.logout()
      const { default: router } = await import('@/router')
      router.push('/login')
    }
    throw new ApiError(errorMessage(data, 'Unauthorized'), 401, {
      ...data,
      wwwAuthenticate: response.headers.get('WWW-Authenticate'),
    })
  }

  if (response.status === 403) {
    const data = await response.json().catch(() => null)
    // Only writes toast a 403: a failed read is rendered inline by its panel. Query-shaped POSTs
    // opt out via `suppressForbidden`.
    if (!suppressForbidden && method !== 'GET') {
      window.dispatchEvent(new CustomEvent('app:forbidden', { detail: { ...data, method, path } }))
    }
    throw new ApiError(errorMessage(data, 'Access denied'), 403, data)
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    if (SERVER_UNAVAILABLE_STATUSES.has(response.status) && !suppressUnavailable) {
      window.dispatchEvent(new CustomEvent('app:server-unavailable'))
    }
    throw new ApiError(
      errorMessage(data, `Request failed: ${response.status}`),
      response.status,
      data,
    )
  }

  if (response.status === 204) return null
  if (responseType === 'blob') return response.blob()
  return response
    .text()
    .then(parseJsonSafe)
    .catch(() => null)
}

export function get(path, options) {
  return request('GET', path, options)
}

export function post(path, body, options) {
  return request('POST', path, { ...options, body })
}

export function put(path, body, options) {
  return request('PUT', path, { ...options, body })
}

export function patch(path, body, options) {
  return request('PATCH', path, { ...options, body })
}

export function del(path, options) {
  return request('DELETE', path, options)
}

export function getBlob(path, options) {
  return request('GET', path, { ...options, responseType: 'blob' })
}

export function postRaw(path, rawBody, options) {
  return request('POST', path, { ...options, rawBody })
}

export function putRaw(path, rawBody, options) {
  return request('PUT', path, { ...options, rawBody })
}

export { ApiError }
