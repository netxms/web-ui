/**
 * The WebSocket half of the WebAPI's streaming executions.
 *
 * Object tools (`POST /v1/object-tools/{id}/execute`), ad-hoc scripts
 * (`POST /v1/objects/{id}/execute-script`) and forced polls (`POST /v1/objects/{id}/poll/{type}`)
 * answer with 202 and a `wsUrl` that embeds a single-use token; the execution starts when that
 * socket connects. All speak one frame vocabulary, JSON text frames: `output` (`data`: a chunk;
 * for polls one line without its terminator, plus `level` info/warning/error on highlighted
 * lines), `result` (`data`: the return value), `completed`, `stopped` (scripts only) and `error`
 * (`message`, plus `diagnostic` for scripts). The server closes the socket after the last of
 * them. A client that closes it stops a tool or script; a poll runs on and its output is dropped.
 */

const OUTPUT_INTERVAL_MS = 100

/**
 * The path already carries auth (a token embedded by the server). Handles both absolute and
 * relative VITE_API_BASE_URL.
 * @param {string} wsPath - Path portion returned by the server (e.g. /v1/object-tools/output/abc)
 * @returns {string} Full WebSocket URL (ws:// or wss://)
 */
export function buildWsUrl(wsPath) {
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  let wsBase
  if (base.startsWith('http://') || base.startsWith('https://')) {
    wsBase = base.replace(/^http/, 'ws')
  } else {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    wsBase = `${proto}//${window.location.host}${base}`
  }
  return `${wsBase}${wsPath}`
}

/**
 * Connect to a streaming execution and hand each frame to `onFrame`, parsed. A frame that is
 * not a JSON object arrives as `{ type: 'output', data: <its text> }`.
 *
 * The browser fires `close` after `error` as well, so `onClose` is the one place that sees
 * every way a stream can end without a final frame.
 *
 * Output is handed over merged, at most once per `OUTPUT_INTERVAL_MS`: a script printing in a loop
 * sends thousands of frames a second, and a render and layout for each would freeze the page. A
 * chunk after a quiet spell goes out at once, and any other frame or the close sends what is
 * waiting ahead of it.
 *
 * With `lines`, output frames are kept apart instead of joined, and handed over as
 * `{ type: 'output', lines: [{ text, level }] }` (`level` null on normal lines).
 *
 * @param {string} wsPath - `wsUrl` from the 202 answer
 * @param {object} handlers
 * @param {(frame: {type: string, data?: any, lines?: Array<{text: string, level: string|null}>, message?: string, diagnostic?: object}) => void} handlers.onFrame
 * @param {(event: CloseEvent) => void} [handlers.onClose]
 * @param {() => void} [handlers.onError]
 * @param {boolean} [handlers.lines]
 * @returns {WebSocket}
 */
export function openOutputStream(wsPath, { onFrame, onClose, onError, lines = false }) {
  const ws = new WebSocket(buildWsUrl(wsPath))
  let pendingOutput = lines ? [] : ''
  let flushTimer = null
  let lastFlush = 0

  function flushOutput() {
    clearTimeout(flushTimer)
    flushTimer = null
    if (pendingOutput.length === 0) return
    const batch = pendingOutput
    pendingOutput = lines ? [] : ''
    lastFlush = Date.now()
    onFrame(lines ? { type: 'output', lines: batch } : { type: 'output', data: batch })
  }

  ws.addEventListener('message', (event) => {
    let frame
    try {
      frame = JSON.parse(event.data)
    } catch {
      frame = null
    }
    if (frame === null || typeof frame !== 'object') frame = { type: 'output', data: event.data }

    if (frame.type === 'output' && typeof frame.data === 'string') {
      if (lines) pendingOutput.push({ text: frame.data, level: frame.level ?? null })
      else pendingOutput += frame.data
      if (flushTimer === null) {
        const wait = lastFlush + OUTPUT_INTERVAL_MS - Date.now()
        if (wait <= 0) flushOutput()
        else flushTimer = setTimeout(flushOutput, wait)
      }
      return
    }
    flushOutput()
    onFrame(frame)
  })
  ws.addEventListener('close', (event) => {
    flushOutput()
    onClose?.(event)
  })
  if (onError) ws.addEventListener('error', onError)

  return ws
}
