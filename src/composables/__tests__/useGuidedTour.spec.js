import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const driverInstances = []
let afterEachHook = null

const routerPush = vi.fn(() => {
  // vue-router runs afterEach hooks before the push promise settles.
  afterEachHook?.()
  return Promise.resolve()
})

vi.mock('@/router', () => ({
  default: {
    push: routerPush,
    afterEach: vi.fn((hook) => {
      afterEachHook = hook
      return () => {
        afterEachHook = null
      }
    }),
  },
}))

vi.mock('driver.js', () => ({
  driver: vi.fn((config) => {
    let activeIndex = 0
    const instance = {
      config,
      destroyed: false,
      highlighted: [],
      drive: vi.fn((index) => {
        activeIndex = index
        instance.highlighted.push(config.steps[index].element)
      }),
      moveTo: vi.fn((index) => {
        activeIndex = index
        instance.highlighted.push(config.steps[index].element)
      }),
      getActiveIndex: () => activeIndex,
      destroy: vi.fn(() => {
        if (instance.destroyed) return
        instance.destroyed = true
        config.onDestroyed?.()
      }),
    }
    driverInstances.push(instance)
    return instance
  }),
}))

vi.mock('driver.js/dist/driver.css', () => ({}))

vi.mock('@/config/onboardingTours', () => ({
  getTourSteps: vi.fn((tourId, entryRoute) => {
    if (tourId === 'missing') return null
    const steps = [
      { target: '[data-tour="one"]', title: 'One', body: 'first' },
      { target: '[data-tour="two"]', title: 'Two', body: 'second', route: { name: 'elsewhere' } },
    ]
    if (entryRoute) steps[0] = { ...steps[0], route: entryRoute }
    return steps
  }),
}))

const { useGuidedTour, resetGuidedTourLibrary } = await import('@/composables/useGuidedTour')

// jsdom needs the rect faked.
function addAnchor(name) {
  const el = document.createElement('div')
  el.setAttribute('data-tour', name)
  el.getClientRects = () => [{ width: 10, height: 10 }]
  document.body.append(el)
  return el
}

function latestDriver() {
  return driverInstances.at(-1)
}

beforeEach(() => {
  document.body.innerHTML = ''
  driverInstances.length = 0
  afterEachHook = null
  routerPush.mockClear()
  setActivePinia(createPinia())
  resetGuidedTourLibrary()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useGuidedTour', () => {
  it('waits for the anchor before highlighting the first step', async () => {
    addAnchor('one')
    const { startTour, activeTourId } = useGuidedTour()

    await startTour('demo')

    expect(latestDriver().highlighted).toEqual(['[data-tour="one"]'])
    expect(activeTourId.value).toBe('demo')
  })

  it('navigates to the entry route before looking for the anchor', async () => {
    addAnchor('one')
    const entryRoute = { name: 'infrastructure' }
    const { startTour } = useGuidedTour()

    await startTour('demo', { entryRoute })

    expect(routerPush).toHaveBeenCalledWith(entryRoute)
  })

  it('does nothing for an unknown tour', async () => {
    const { startTour, activeTourId } = useGuidedTour()
    await startTour('missing')

    expect(driverInstances).toHaveLength(0)
    expect(activeTourId.value).toBeNull()
  })

  it('gives up quietly when the first anchor never appears', async () => {
    vi.useFakeTimers()
    const { startTour, activeTourId } = useGuidedTour()

    const pending = startTour('demo')
    await vi.runAllTimersAsync()
    await pending

    expect(driverInstances).toHaveLength(0)
    expect(activeTourId.value).toBeNull()
  })

  it('resolves an anchor that mounts after the tour starts', async () => {
    const { startTour } = useGuidedTour()

    const pending = startTour('demo')
    await Promise.resolve()
    addAnchor('one')
    await pending

    expect(latestDriver().highlighted).toEqual(['[data-tour="one"]'])
  })

  it('ignores an anchor that is in the DOM but not rendered', async () => {
    vi.useFakeTimers()
    const hidden = document.createElement('div')
    hidden.setAttribute('data-tour', 'one')
    hidden.getClientRects = () => []
    document.body.append(hidden)

    const { startTour } = useGuidedTour()
    const pending = startTour('demo')
    await vi.runAllTimersAsync()
    await pending

    expect(driverInstances).toHaveLength(0)
  })

  it('navigates, waits, then highlights on Next', async () => {
    addAnchor('one')
    const { startTour } = useGuidedTour()
    await startTour('demo')

    const driverObj = latestDriver()
    routerPush.mockClear()

    const advancing = driverObj.config.onNextClick()
    await Promise.resolve()
    // The route for step two has been requested before its anchor exists.
    expect(routerPush).toHaveBeenCalledWith({ name: 'elsewhere' })
    expect(driverObj.moveTo).not.toHaveBeenCalled()

    addAnchor('two')
    await advancing

    expect(driverObj.moveTo).toHaveBeenCalledWith(1)
    expect(driverObj.highlighted).toEqual(['[data-tour="one"]', '[data-tour="two"]'])
  })

  it('ends the tour when a later step has no anchor', async () => {
    vi.useFakeTimers()
    addAnchor('one')
    const { startTour, activeTourId } = useGuidedTour()
    await startTour('demo')

    const driverObj = latestDriver()
    const advancing = driverObj.config.onNextClick()
    await vi.runAllTimersAsync()
    await advancing

    expect(driverObj.moveTo).not.toHaveBeenCalled()
    expect(driverObj.destroyed).toBe(true)
    expect(activeTourId.value).toBeNull()
  })

  it('marks the tour seen and the step complete after the last step', async () => {
    const { useOnboardingStore } = await import('@/stores/onboardingStore')
    const onboarding = useOnboardingStore()

    addAnchor('one')
    addAnchor('two')
    const { startTour } = useGuidedTour()
    await startTour('demo', { stepId: 'add-node' })

    const driverObj = latestDriver()
    await driverObj.config.onNextClick() // → step two
    await driverObj.config.onNextClick() // → past the end

    expect(onboarding.hasSeenTour('demo')).toBe(true)
    expect(onboarding.isRecordedComplete('add-node')).toBe(true)
  })

  it('marks the tour seen but not complete when closed early', async () => {
    const { useOnboardingStore } = await import('@/stores/onboardingStore')
    const onboarding = useOnboardingStore()

    addAnchor('one')
    const { startTour, stopTour } = useGuidedTour()
    await startTour('demo', { stepId: 'add-node' })

    stopTour()

    expect(onboarding.hasSeenTour('demo')).toBe(true)
    expect(onboarding.isRecordedComplete('add-node')).toBe(false)
  })

  // destroy() fires onDestroyed, which must not re-enter the teardown that called destroy().
  it('destroys exactly once when the user closes the popover', async () => {
    addAnchor('one')
    const { startTour } = useGuidedTour()
    await startTour('demo')

    const driverObj = latestDriver()
    driverObj.destroy() // what driver.js does on its own close button

    expect(driverObj.destroy).toHaveBeenCalledTimes(1)
    expect(driverObj.destroyed).toBe(true)
  })

  it('aborts when the user navigates somewhere the tour did not ask for', async () => {
    addAnchor('one')
    const { startTour, activeTourId } = useGuidedTour()
    await startTour('demo')

    const driverObj = latestDriver()
    afterEachHook() // user clicks a nav item

    expect(driverObj.destroyed).toBe(true)
    expect(activeTourId.value).toBeNull()
  })

  it('does not abort on its own navigation between steps', async () => {
    addAnchor('one')
    addAnchor('two')
    const { startTour, activeTourId } = useGuidedTour()
    await startTour('demo')

    const driverObj = latestDriver()
    await driverObj.config.onNextClick()

    expect(driverObj.destroyed).toBe(false)
    expect(activeTourId.value).toBe('demo')
    expect(driverObj.moveTo).toHaveBeenCalledWith(1)
  })

  it('replaces a running tour rather than stacking overlays', async () => {
    addAnchor('one')
    const { startTour } = useGuidedTour()
    await startTour('demo')
    const first = latestDriver()

    await startTour('demo')

    expect(first.destroyed).toBe(true)
    expect(driverInstances).toHaveLength(2)
    expect(latestDriver().destroyed).toBe(false)
  })

  it('tags the popover so the theme overrides can win the cascade', async () => {
    addAnchor('one')
    const { startTour } = useGuidedTour()
    await startTour('demo')

    expect(latestDriver().config.popoverClass).toBe('nx-tour')
  })

  it('passes step copy and placement through to driver.js', async () => {
    addAnchor('one')
    const { startTour } = useGuidedTour()
    await startTour('demo')

    expect(latestDriver().config.steps[0]).toEqual({
      element: '[data-tour="one"]',
      popover: { title: 'One', description: 'first' },
    })
  })
})
