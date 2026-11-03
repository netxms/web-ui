import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { userPrefs } from '@/utils/appStorage'
import { ONBOARDING_STEPS } from '@/config/onboardingSteps'

const FIELD = 'onboarding'

/** Folded in once so nobody's collapsed panel springs open. */
const LEGACY_COLLAPSED_KEY = 'home-onboarding-collapsed'

const STATE_VERSION = 1

const PERSIST_DEBOUNCE_MS = 400

function emptyState() {
  return {
    v: STATE_VERSION,
    hidden: false,
    collapsed: false,
    completed: [],
    skipped: [],
    toursSeen: [],
  }
}

/**
 * Anything unrecognized is discarded rather than trusted.
 *
 * @param {*} stored
 */
function parseState(stored) {
  const base = emptyState()
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return base

  const list = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [])

  return {
    v: STATE_VERSION,
    hidden: stored.hidden === true,
    collapsed: stored.collapsed === true,
    completed: list(stored.completed),
    skipped: list(stored.skipped),
    toursSeen: list(stored.toursSeen),
  }
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const state = ref(emptyState())

  // Serialized state as storage last saw it. An "am I hydrating" flag does not work: the deep
  // watcher flushes after hydrate() would have cleared it.
  let lastPersisted = null
  let persistTimer = null

  function flush() {
    persistTimer = null
    const serialized = JSON.stringify(state.value)
    if (serialized === lastPersisted) return
    lastPersisted = serialized
    userPrefs.set(FIELD, state.value)
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(flush, PERSIST_DEBOUNCE_MS)
  }

  /** Also runs when sign-in brings another account's values. */
  function hydrate() {
    const next = parseState(userPrefs.get(FIELD))
    let folded = false

    try {
      const legacy = localStorage.getItem(LEGACY_COLLAPSED_KEY)
      if (legacy !== null) {
        next.collapsed = legacy === 'true'
        localStorage.removeItem(LEGACY_COLLAPSED_KEY)
        folded = true
      }
    } catch {
      // localStorage unavailable
    }

    // Set the baseline before the assignment, so the watcher this triggers writes nothing.
    lastPersisted = JSON.stringify(next)
    state.value = next
    if (folded) {
      lastPersisted = null
      schedulePersist()
    }
  }

  hydrate()
  watch(state, schedulePersist, { deep: true })
  watch(userPrefs.revision, hydrate)

  const hidden = computed(() => state.value.hidden)
  const collapsed = computed(() => state.value.collapsed)

  const skippedIds = computed(() => new Set(state.value.skipped))

  /** @param {string} stepId */
  function isRecordedComplete(stepId) {
    return state.value.completed.includes(stepId)
  }

  /** @param {string} stepId */
  function isSkipped(stepId) {
    return skippedIds.value.has(stepId)
  }

  /** @param {string} tourId */
  function hasSeenTour(tourId) {
    return state.value.toursSeen.includes(tourId)
  }

  /**
   * @param {string} stepId
   */
  function markCompleted(stepId) {
    if (!state.value.completed.includes(stepId)) {
      state.value.completed = [...state.value.completed, stepId]
    }
    state.value.skipped = state.value.skipped.filter((id) => id !== stepId)
  }

  /** @param {string} stepId */
  function markIncomplete(stepId) {
    state.value.completed = state.value.completed.filter((id) => id !== stepId)
  }

  /** @param {string} stepId */
  function skipStep(stepId) {
    if (!state.value.skipped.includes(stepId)) {
      state.value.skipped = [...state.value.skipped, stepId]
    }
  }

  /** @param {string} stepId */
  function unskipStep(stepId) {
    state.value.skipped = state.value.skipped.filter((id) => id !== stepId)
  }

  /** @param {string} tourId */
  function markTourSeen(tourId) {
    if (!state.value.toursSeen.includes(tourId)) {
      state.value.toursSeen = [...state.value.toursSeen, tourId]
    }
  }

  /** Reversible from the profile menu. */
  function hide() {
    state.value.hidden = true
  }

  function unhide() {
    state.value.hidden = false
  }

  /** @param {boolean} value */
  function setCollapsed(value) {
    state.value.collapsed = value
  }

  /** Steps with a server signal re-resolve as done immediately. */
  function reset() {
    state.value = emptyState()
  }

  /** Skipped steps are out of the denominator. */
  const trackedStepCount = computed(
    () => ONBOARDING_STEPS.filter((step) => !isSkipped(step.id)).length,
  )

  return {
    state,
    hidden,
    collapsed,
    trackedStepCount,
    isRecordedComplete,
    isSkipped,
    hasSeenTour,
    markCompleted,
    markIncomplete,
    skipStep,
    unskipStep,
    markTourSeen,
    hide,
    unhide,
    setCollapsed,
    reset,
  }
})
