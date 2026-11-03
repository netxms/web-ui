import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getServerStatus } from '@/api/serverApi'

// The probe never gives up: an unreachable server is an outage, not an expired session (only a
// real 401 ends one). After FAST_ATTEMPTS it only slows down.
export const FAST_ATTEMPTS = 10
const PROBE_INTERVAL_MS = 3000
const SLOW_PROBE_INTERVAL_MS = 15000

export const useConnectionStore = defineStore('connection', () => {
  const isReconnecting = ref(false)
  const isProbing = ref(false)
  const attemptCount = ref(0)
  const isSlowRetry = computed(() => attemptCount.value >= FAST_ATTEMPTS)
  // shape: { message: string, severity: 'warn'|'error'|'info', actions: [{ label, handler }] }
  const serverAlert = ref(null)

  let probeTimer = null
  // Date.now() when the failure that opened the outage was reported; sent with `app:reconnected`
  // so the resync can keep data that arrived after it.
  let outageStartedAt = null

  // getServerStatus suppresses the 401 logout: a probe must never sign the user out.
  async function startReconnecting() {
    if (isReconnecting.value || isProbing.value) return
    // Taken before the probe: responses that arrive while it waits came from a working server.
    const reportedAt = Date.now()
    isProbing.value = true
    const up = await getServerStatus()
    isProbing.value = false
    if (up) return // transient endpoint error, server is healthy
    outageStartedAt = reportedAt
    isReconnecting.value = true
    attemptCount.value = 0
    _scheduleProbe()
  }

  function _scheduleProbe() {
    const delay = isSlowRetry.value ? SLOW_PROBE_INTERVAL_MS : PROBE_INTERVAL_MS
    probeTimer = setTimeout(_probe, delay)
  }

  async function _probe() {
    attemptCount.value++
    const up = await getServerStatus()

    if (up) {
      isReconnecting.value = false
      attemptCount.value = 0
      window.dispatchEvent(new CustomEvent('app:reconnected', { detail: { outageStartedAt } }))
      outageStartedAt = null
      return
    }

    _scheduleProbe()
  }

  function stop() {
    clearTimeout(probeTimer)
    isReconnecting.value = false
    isProbing.value = false
    attemptCount.value = 0
    outageStartedAt = null
  }

  function showServerAlert({ message, severity = 'warn', actions = [] }) {
    serverAlert.value = { message, severity, actions }
  }

  function clearServerAlert() {
    serverAlert.value = null
  }

  return {
    isReconnecting,
    attemptCount,
    isSlowRetry,
    startReconnecting,
    stop,
    serverAlert,
    showServerAlert,
    clearServerAlert,
  }
})
