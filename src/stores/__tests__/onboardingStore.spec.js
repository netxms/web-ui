import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { userPrefs } from '@/utils/appStorage'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { ONBOARDING_STEPS } from '@/config/onboardingSteps'

const FIELD = 'onboarding'
const LEGACY_COLLAPSED_KEY = 'home-onboarding-collapsed'

/** Stands in for the server: every change `userPrefs` would send there. */
const writer = vi.fn()

function stored() {
  return userPrefs.get(FIELD)
}

/** Run the debounced persist without waiting out its timer. */
async function flushPersist() {
  await vi.runAllTimersAsync()
}

let pinia

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  writer.mockClear()
  userPrefs.connect(writer)
  pinia = createPinia()
  setActivePinia(pinia)
})

afterEach(() => {
  // Stores outlive their pinia otherwise, and would keep reacting to later replaces.
  pinia._e.stop()
  userPrefs.connect(null)
  vi.useRealTimers()
})

describe('onboardingStore', () => {
  it('starts from defaults when nothing is stored', () => {
    const store = useOnboardingStore()

    expect(store.hidden).toBe(false)
    expect(store.collapsed).toBe(false)
  })

  it('loads stored progress', () => {
    userPrefs.set(FIELD, { v: 1, hidden: true, collapsed: true, completed: ['add-node'] })

    const store = useOnboardingStore()

    expect(store.hidden).toBe(true)
    expect(store.collapsed).toBe(true)
    expect(store.isRecordedComplete('add-node')).toBe(true)
  })

  it('falls back to defaults on a stored value that is not an object', () => {
    userPrefs.set(FIELD, ['add-node'])

    const store = useOnboardingStore()

    expect(store.hidden).toBe(false)
    expect(store.isRecordedComplete('add-node')).toBe(false)
  })

  it('discards stored fields of the wrong type instead of trusting them', () => {
    userPrefs.set(FIELD, { hidden: 'yes', completed: 'add-node', skipped: [1, 'add-user', null] })

    const store = useOnboardingStore()

    expect(store.hidden).toBe(false)
    expect(store.isRecordedComplete('add-node')).toBe(false)
    // Only the string survives the filter.
    expect(store.isSkipped('add-user')).toBe(true)
  })

  it("re-reads when sign-in brings another account's values", async () => {
    const store = useOnboardingStore()
    expect(store.isRecordedComplete('add-node')).toBe(false)

    userPrefs.replace({ [FIELD]: { completed: ['add-node'] } }, '7')
    await nextTick()

    expect(store.isRecordedComplete('add-node')).toBe(true)
  })

  it('does not write back what sign-in just loaded', async () => {
    useOnboardingStore()
    userPrefs.replace({ [FIELD]: { completed: ['add-node'] } }, '7')
    await nextTick()
    await flushPersist()

    expect(writer).not.toHaveBeenCalled()
  })

  it('folds the standalone collapse key into stored state and removes it', async () => {
    localStorage.setItem(LEGACY_COLLAPSED_KEY, 'true')

    const store = useOnboardingStore()
    await flushPersist()

    expect(store.collapsed).toBe(true)
    expect(localStorage.getItem(LEGACY_COLLAPSED_KEY)).toBeNull()
    expect(stored().collapsed).toBe(true)
  })

  it('migrates a false collapse key without inventing a true', async () => {
    localStorage.setItem(LEGACY_COLLAPSED_KEY, 'false')

    const store = useOnboardingStore()

    expect(store.collapsed).toBe(false)
    expect(localStorage.getItem(LEGACY_COLLAPSED_KEY)).toBeNull()
  })

  it('leaves stored state alone when there is no legacy key', async () => {
    userPrefs.set(FIELD, { collapsed: true })
    writer.mockClear()

    const store = useOnboardingStore()
    await flushPersist()

    expect(store.collapsed).toBe(true)
    expect(writer).not.toHaveBeenCalled()
  })

  it('persists a change to the account as one value', async () => {
    const store = useOnboardingStore()

    store.markCompleted('add-node')
    await flushPersist()

    expect(stored().completed).toEqual(['add-node'])
    expect(writer).toHaveBeenCalledWith(FIELD, expect.objectContaining({ completed: ['add-node'] }))
  })

  it('coalesces rapid changes into one write', async () => {
    const store = useOnboardingStore()

    store.markCompleted('add-node')
    store.skipStep('add-user')
    store.setCollapsed(true)
    await flushPersist()

    expect(writer).toHaveBeenCalledTimes(1)
  })

  it('does not write what it loaded', async () => {
    userPrefs.set(FIELD, { completed: ['add-node'] })
    writer.mockClear()

    useOnboardingStore()
    await flushPersist()

    expect(writer).not.toHaveBeenCalled()
  })

  it('records a completion once, however many times it is marked', async () => {
    const store = useOnboardingStore()

    store.markCompleted('add-node')
    store.markCompleted('add-node')

    expect(store.state.completed).toEqual(['add-node'])
  })

  it('un-skips a step that is then completed', async () => {
    const store = useOnboardingStore()

    store.skipStep('add-node')
    store.markCompleted('add-node')

    expect(store.isSkipped('add-node')).toBe(false)
    expect(store.isRecordedComplete('add-node')).toBe(true)
  })

  it('markIncomplete clears a recorded completion', async () => {
    const store = useOnboardingStore()

    store.markCompleted('add-node')
    store.markIncomplete('add-node')

    expect(store.isRecordedComplete('add-node')).toBe(false)
  })

  // Skipped steps leave the denominator too, or a skip would make 100% unreachable.
  it('drops skipped steps from the tracked count', async () => {
    const store = useOnboardingStore()

    expect(store.trackedStepCount).toBe(ONBOARDING_STEPS.length)

    store.skipStep('add-user')
    expect(store.trackedStepCount).toBe(ONBOARDING_STEPS.length - 1)

    store.unskipStep('add-user')
    expect(store.trackedStepCount).toBe(ONBOARDING_STEPS.length)
  })

  it('skips a step once, however many times it is skipped', async () => {
    const store = useOnboardingStore()

    store.skipStep('add-user')
    store.skipStep('add-user')

    expect(store.state.skipped).toEqual(['add-user'])
  })

  it('hides and shows, persisting each way', async () => {
    const store = useOnboardingStore()

    store.hide()
    await flushPersist()
    expect(stored().hidden).toBe(true)

    store.unhide()
    await flushPersist()
    expect(stored().hidden).toBe(false)
  })

  it('remembers which tours have been seen', async () => {
    const store = useOnboardingStore()

    expect(store.hasSeenTour('add-node')).toBe(false)
    store.markTourSeen('add-node')
    store.markTourSeen('add-node')

    expect(store.hasSeenTour('add-node')).toBe(true)
    expect(store.state.toursSeen).toEqual(['add-node'])
  })

  it('reset clears progress, skips, tours and the hidden flag', async () => {
    userPrefs.set(FIELD, {
      hidden: true,
      collapsed: true,
      completed: ['add-node'],
      skipped: ['add-user'],
      toursSeen: ['add-node'],
    })

    const store = useOnboardingStore()
    store.reset()
    await flushPersist()

    expect(store.hidden).toBe(false)
    expect(store.collapsed).toBe(false)
    expect(store.isRecordedComplete('add-node')).toBe(false)
    expect(store.isSkipped('add-user')).toBe(false)
    expect(store.hasSeenTour('add-node')).toBe(false)
    expect(stored()).toMatchObject({ completed: [], skipped: [], toursSeen: [] })
  })

  it('survives a reset then a fresh store round trip', async () => {
    const store = useOnboardingStore()

    store.markCompleted('add-node')
    store.hide()
    await flushPersist()

    store.reset()
    await flushPersist()
    pinia._e.stop()
    pinia = createPinia()
    setActivePinia(pinia)
    const fresh = useOnboardingStore()

    expect(fresh.hidden).toBe(false)
    expect(fresh.isRecordedComplete('add-node')).toBe(false)
  })
})
