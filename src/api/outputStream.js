/**
 * The WebSocket half of the WebAPI's streaming executions.
 *
 * Object tools (`POST /v1/object-tools/{id}/execute`) and ad-hoc scripts
 * (`POST /v1/objects/{id}/execute-script`) answer `stream: true` with 202 and a `wsUrl` that
 * embeds a single-use token; the execution starts when that socket connects. Both speak one
 * frame vocabulary, JSON text frames: `output` (`data`: a chunk), `result` (`data`: the return
 * value), `completed`, `stopped` (scripts only) and `error` (`message`, plus `diagnostic` for
 * scripts). The server closes the socket after the last of them, and a client that closes it
 * stops the execution.
 */

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
 * @param {string} wsPath - `wsUrl` from the 202 answer
 * @param {object} handlers
 * @param {(frame: {type: string, data?: any, message?: string, diagnostic?: object}) => void} handlers.onFrame
 * @param {(event: CloseEvent) => void} [handlers.onClose]
 * @param {() => void} [handlers.onError]
 * @returns {WebSocket}
 */
export function openOutputStream(wsPath, { onFrame, onClose, onError }) {
  const ws = new WebSocket(buildWsUrl(wsPath))

  ws.addEventListener('message', (event) => {
    let frame
    try {
      frame = JSON.parse(event.data)
    } catch {
      frame = null
    }
    if (frame === null || typeof frame !== 'object') frame = { type: 'output', data: event.data }
    onFrame(frame)
  })
  if (onClose) ws.addEventListener('close', onClose)
  if (onError) ws.addEventListener('error', onError)

  return ws
}
