import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { buildWsUrl } from '@/api/outputStream'
import { createSshTerminalSession } from '@/api/sshTerminalApi'
import { createSshTerminalController } from '@/utils/sshTerminalController'
import { LIVE_PHASES, parseSshViewId } from '@/utils/sshTerminalProtocol'

const controllerDeps = {
  createSession: createSshTerminalSession,
  openSocket(wsPath) {
    const socket = new WebSocket(buildWsUrl(wsPath))
    socket.binaryType = 'arraybuffer'
    return socket
  },
  // xterm.js is loaded when the first terminal opens, not with the app.
  createEmulator: async (callbacks) =>
    (await import('@/utils/sshTerminalEmulator')).createEmulator(callbacks),
  isPageVisible: () => document.visibilityState !== 'hidden',
}

/** Ctrl+W deletes a word in a shell and closes a browser tab, and pages cannot intercept it. */
function warnBeforeLeaving(event) {
  event.preventDefault()
  event.returnValue = ''
}

export const useSshTerminalStore = defineStore('sshTerminal', () => {
  // Only the controllers' reactive state. The controllers hold the emulator, socket and password,
  // which do not belong in Pinia state.
  const sessions = shallowRef([])
  const controllers = new Map()

  const liveSessions = computed(() => sessions.value.filter((s) => LIVE_PHASES.has(s.phase)))

  function notifyPageVisible() {
    if (document.visibilityState === 'hidden') return
    for (const controller of controllers.values()) controller.onPageVisible()
  }

  watch(
    () => liveSessions.value.length > 0,
    (live) => {
      if (live) {
        window.addEventListener('beforeunload', warnBeforeLeaving)
        document.addEventListener('visibilitychange', notifyPageVisible)
      } else {
        window.removeEventListener('beforeunload', warnBeforeLeaving)
        document.removeEventListener('visibilitychange', notifyPageVisible)
      }
    },
    { flush: 'sync' },
  )

  function sessionKey(objectId, viewId) {
    return `${objectId}/${viewId}`
  }

  function getSession(key) {
    return controllers.get(key)?.state ?? null
  }

  function controller(key) {
    return controllers.get(key) ?? null
  }

  function sessionsForObject(objectId) {
    return sessions.value.filter((s) => s.objectId === objectId)
  }

  function createSession(object, index, autoConnect) {
    const viewId = `ssh:${index}`
    const key = sessionKey(object.id, viewId)
    const created = createSshTerminalController({
      key,
      viewId,
      objectId: object.id,
      objectName: object.name,
      label: index === 1 ? 'SSH Terminal' : `SSH Terminal ${index}`,
      deps: controllerDeps,
    })
    created.state.autoConnect = autoConnect
    controllers.set(key, created)
    sessions.value = [...sessions.value, created.state]
    return viewId
  }

  /**
   * Tools > SSH terminal. A tab with no live shell is reused, so dead tabs do not pile up.
   *
   * @param {{ id: number, name: string }} object
   * @returns {string} view id of the tab to show
   */
  function openFromMenu(object) {
    const own = sessionsForObject(object.id)
    const reusable = own.find((s) => !LIVE_PHASES.has(s.phase))
    if (reusable) {
      controllers.get(reusable.key).showForm()
      reusable.autoConnect = true
      return reusable.viewId
    }
    const index = Math.max(0, ...own.map((s) => parseSshViewId(s.viewId))) + 1
    return createSession(object, index, true)
  }

  /**
   * A link or reload lands on the form; only the menu opens a shell straight away.
   *
   * @param {{ id: number, name: string }} object
   * @param {string} viewId
   */
  function ensureSession(object, viewId) {
    if (controllers.has(sessionKey(object.id, viewId))) return
    createSession(object, parseSshViewId(viewId), false)
  }

  function closeSession(key) {
    controllers.get(key)?.dispose()
    controllers.delete(key)
    sessions.value = sessions.value.filter((s) => s.key !== key)
  }

  /** Closes every shell. For sign-out: Pinia outlives it and the sockets would too. */
  function reset() {
    for (const created of controllers.values()) created.dispose()
    controllers.clear()
    sessions.value = []
  }

  return {
    sessions,
    liveSessions,
    sessionKey,
    getSession,
    controller,
    sessionsForObject,
    openFromMenu,
    ensureSession,
    closeSession,
    reset,
  }
})
