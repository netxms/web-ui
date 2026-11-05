/**
 * One SSH terminal: its socket, emulator and reconnect logic. Lives outside any component because
 * object views unmount on every tab switch and the shell must survive that. The password stays in
 * this closure, out of `state`, which Pinia and devtools can read.
 *
 * Phases: idle (the connect form) > connecting > connected > ended, with reconnecting after a lost
 * connection. A socket that drops takes its shell with it on the server, so a reconnect always
 * opens a new shell, and says so in the scrollback.
 */
import { reactive } from 'vue'
import { formatTimeShort } from '@/utils/timeFormat'
import {
  HEARTBEAT_FRAME,
  HEARTBEAT_INTERVAL_MS,
  MAX_FAILED_LOGINS,
  MAX_RECONNECT_ATTEMPTS,
  TERMINAL_RESET,
  TERMINAL_TYPE,
  binaryStringToBytes,
  chunkBytes,
  classifyClose,
  describeConnectError,
  reconnectDelayMs,
} from './sshTerminalProtocol'

const SOCKET_OPEN = 1
const DEFAULT_SIZE = { columns: 80, rows: 24 }
const PACE_MS = 10

function parseControl(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function toMessage({ severity, title, detail }) {
  return { severity, title, detail }
}

/**
 * @param {object} options
 * @param {string} options.key
 * @param {string} options.viewId
 * @param {number} options.objectId
 * @param {string} options.objectName
 * @param {string} options.label
 * @param {object} options.deps
 * @param {(objectId: number, body: object, options: { signal: AbortSignal }) => Promise<{ wsUrl: string }>} options.deps.createSession
 * @param {(wsUrl: string) => WebSocket} options.deps.openSocket
 * @param {(callbacks: object) => Promise<object>} options.deps.createEmulator
 * @param {() => boolean} options.deps.isPageVisible
 */
export function createSshTerminalController({ key, viewId, objectId, objectName, label, deps }) {
  const state = reactive({
    key,
    viewId,
    objectId,
    objectName,
    label,
    phase: 'idle',
    login: '',
    usesStored: false,
    message: null,
    attempt: 0,
    autoConnect: false,
    hasSelection: false,
    // Until true there is no terminal worth showing, so a login attempt stays on the form.
    hadSession: false,
  })

  let emulator = null
  let emulatorLoad = null
  let viewHandlers = {}
  let attachToken = 0
  let disposed = false

  let credentials = null
  let socket = null
  // Bumped whenever an attempt or socket stops mattering, so its late callbacks do nothing.
  let generation = 0
  let abortController = null
  let lastSize = DEFAULT_SIZE
  let sentSize = null

  let attempts = 0
  let failedLogins = 0
  let lastFailure = null
  let retryTimer = null
  let waitingForVisible = false

  let heartbeatTimer = null
  let paceTimer = null
  let sendQueue = []

  function notice(text) {
    emulator?.write(`\r\n\x1b[2m--- ${text} ---\x1b[0m\r\n`)
  }

  function now() {
    return formatTimeShort(new Date())
  }

  // Input

  function drainQueue() {
    paceTimer = null
    if (socket?.readyState !== SOCKET_OPEN) {
      sendQueue = []
      return
    }
    const chunk = sendQueue.shift()
    if (chunk) socket.send(chunk)
    if (sendQueue.length > 0) paceTimer = setTimeout(drainQueue, PACE_MS)
  }

  function sendInput(bytes) {
    sendQueue.push(...chunkBytes(bytes))
    if (paceTimer === null) drainQueue()
  }

  function handleData(text) {
    if (state.phase === 'connected') sendInput(new TextEncoder().encode(text))
    else if (state.phase === 'ended' && text === '\r' && credentials) reconnect()
  }

  function handleBinary(text) {
    if (state.phase === 'connected') sendInput(binaryStringToBytes(text))
  }

  // Emulator and view

  async function ensureEmulator() {
    if (emulator) return emulator
    emulatorLoad ??= deps.createEmulator({
      onPaste: (text) => viewHandlers.onPaste?.(text),
      onFind: () => viewHandlers.onFind?.(),
      onSelectionChange: (hasSelection) => {
        state.hasSelection = hasSelection
      },
    })
    const created = await emulatorLoad
    if (disposed) {
      created.dispose()
      return null
    }
    if (!emulator) {
      emulator = created
      emulator.onData(handleData)
      emulator.onBinary(handleBinary)
    }
    return emulator
  }

  /**
   * @param {HTMLElement} host
   * @param {{ onPaste?: (text: string) => void, onFind?: () => void }} [handlers]
   * @param {(emulator: object) => void} [prepare] - runs before the first measurement
   */
  async function attach(host, handlers = {}, prepare) {
    const token = ++attachToken
    const term = await ensureEmulator()
    if (!term || token !== attachToken) return
    viewHandlers = handlers
    prepare?.(term)
    term.attach(host)
    resize()
  }

  function detach() {
    attachToken++
    viewHandlers = {}
    emulator?.detach()
  }

  function resize() {
    const size = emulator?.fit()
    if (!size) return
    lastSize = size
    if (state.phase !== 'connected' || socket?.readyState !== SOCKET_OPEN) return
    if (sentSize?.columns === size.columns && sentSize?.rows === size.rows) return
    sentSize = size
    socket.send(JSON.stringify({ type: 'resize', columns: size.columns, rows: size.rows }))
  }

  // Session

  function requestBody(size) {
    const body = { columns: size.columns, rows: size.rows, terminalType: TERMINAL_TYPE }
    if (credentials?.login == null) return body
    return {
      ...body,
      login: credentials.login,
      password: credentials.password ?? '',
      keyId: credentials.keyId ?? 0,
    }
  }

  function stopTraffic() {
    clearInterval(heartbeatTimer)
    clearTimeout(paceTimer)
    heartbeatTimer = null
    paceTimer = null
    sendQueue = []
  }

  function stopRetrying() {
    clearTimeout(retryTimer)
    retryTimer = null
    waitingForVisible = false
  }

  function closeSocket() {
    const closing = socket
    socket = null
    closing?.close()
  }

  /** Stops everything an attempt or a session has running. */
  function abandon() {
    generation++
    abortController?.abort()
    abortController = null
    stopRetrying()
    stopTraffic()
    closeSocket()
  }

  function end(message) {
    stopRetrying()
    stopTraffic()
    state.phase = 'ended'
    state.attempt = 0
    state.message = toMessage(message)
    notice(credentials ? `${message.title}. Press Enter to reconnect` : message.title)
  }

  function scheduleRetry() {
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      end(lastFailure)
      return
    }
    state.phase = 'reconnecting'
    state.attempt = attempts + 1
    retryTimer = setTimeout(runRetry, reconnectDelayMs(attempts))
  }

  function runRetry() {
    retryTimer = null
    if (!deps.isPageVisible()) {
      waitingForVisible = true
      return
    }
    attempts++
    attempt('reconnecting')
  }

  function onPageVisible() {
    if (!waitingForVisible) return
    waitingForVisible = false
    runRetry()
  }

  function attemptFailed(failure) {
    if (state.phase === 'connecting') {
      if (state.hadSession) {
        end(failure)
      } else {
        state.phase = 'idle'
        state.message = toMessage(failure)
      }
      return
    }

    lastFailure = failure
    if (!failure.retryable) {
      end(failure)
      return
    }
    if (failure.mayHaveReachedDevice && ++failedLogins >= MAX_FAILED_LOGINS) {
      end(failure)
      return
    }
    scheduleRetry()
  }

  function sessionStarted(size) {
    if (state.hadSession) {
      emulator.write(TERMINAL_RESET)
      notice(`New shell at ${now()}`)
    }
    state.hadSession = true
    attempts = 0
    failedLogins = 0
    state.phase = 'connected'
    state.attempt = 0
    state.message = null
    sentSize = size
    heartbeatTimer = setInterval(() => {
      if (socket?.readyState === SOCKET_OPEN) socket.send(HEARTBEAT_FRAME)
    }, HEARTBEAT_INTERVAL_MS)
    resize()
  }

  function sessionClosed(outcome) {
    stopTraffic()
    if (!outcome.autoReconnect) {
      end(outcome)
      return
    }
    notice(`Connection lost at ${now()}`)
    attempts = 0
    failedLogins = 0
    lastFailure = outcome
    scheduleRetry()
  }

  function startSocket(current, wsUrl, size) {
    const ws = deps.openSocket(wsUrl)
    socket = ws
    let closeReason = null
    let ready = false

    ws.addEventListener('message', (event) => {
      if (current !== generation) return
      if (typeof event.data !== 'string') {
        emulator.write(new Uint8Array(event.data))
        return
      }
      const message = parseControl(event.data)
      if (message?.type === 'connected') {
        ready = true
        sessionStarted(size)
      } else if (message?.type === 'close') {
        closeReason = message.reason
      }
    })

    ws.addEventListener('close', (event) => {
      if (current !== generation) return
      socket = null
      const outcome = classifyClose({ reason: closeReason, code: event.code })
      if (ready) {
        sessionClosed(outcome)
      } else {
        attemptFailed({
          ...outcome,
          retryable: outcome.autoReconnect,
          mayHaveReachedDevice: false,
        })
      }
    })
  }

  /** The channel on the proxy agent stays open until its token is used or expires. */
  function releaseChannel(answer) {
    if (!answer?.wsUrl) return
    const ws = deps.openSocket(answer.wsUrl)
    if (!ws) return
    if (ws.readyState === SOCKET_OPEN) ws.close()
    else ws.addEventListener('open', () => ws.close())
  }

  async function attempt(phase) {
    const current = ++generation
    state.phase = phase
    abortController = new AbortController()
    const size = emulator.fit() ?? lastSize
    lastSize = size

    let answer
    try {
      answer = await deps.createSession(objectId, requestBody(size), {
        signal: abortController.signal,
      })
    } catch (err) {
      if (current === generation) attemptFailed(describeConnectError(err))
      return
    }

    if (current !== generation) {
      releaseChannel(answer)
      return
    }
    startSocket(current, answer.wsUrl, size)
  }

  /** @param {{ login: string|null, password?: string, keyId?: number }} newCredentials - a null login means the ones stored on the node */
  async function connect(newCredentials) {
    abandon()
    credentials = newCredentials
    state.hadSession = false
    attempts = 0
    failedLogins = 0
    state.login = newCredentials.login ?? ''
    state.usesStored = newCredentials.login == null
    state.message = null
    state.phase = 'connecting'
    if (await ensureEmulator()) await attempt('connecting')
  }

  async function reconnect() {
    if (!credentials) return
    abandon()
    attempts = 0
    failedLogins = 0
    state.message = null
    await attempt('connecting')
  }

  /** Disconnect, or Cancel while it is still connecting. */
  function disconnect() {
    abandon()
    state.attempt = 0
    if (!state.hadSession) {
      state.phase = 'idle'
      state.message = null
      return
    }
    end({ severity: 'info', title: 'Disconnected' })
  }

  /** Back to the form, to log in differently. */
  function showForm() {
    abandon()
    credentials = null
    state.hadSession = false
    state.hasSelection = false
    state.phase = 'idle'
    state.message = null
    state.attempt = 0
    emulator?.reset()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    abandon()
    credentials = null
    state.phase = 'disposed'
    emulator?.dispose()
    emulator = null
  }

  return {
    state,
    attach,
    detach,
    resize,
    connect,
    reconnect,
    disconnect,
    showForm,
    onPageVisible,
    dispose,
    get emulator() {
      return emulator
    },
  }
}
