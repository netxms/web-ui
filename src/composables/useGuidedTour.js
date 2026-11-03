import { ref } from 'vue'
import router from '@/router'
import { getTourSteps } from '@/config/onboardingTours'
import { useOnboardingStore } from '@/stores/onboardingStore'

// A tour crosses routes, so every driver.js advance is intercepted: navigate, wait for the
// anchor to mount, then highlight. Only one tour runs at a time, hence module-level state.

const ANCHOR_TIMEOUT_MS = 4000

const activeTourId = ref(null)

/** @type {import('driver.js').Driver|null} */
let driverObj = null

/** True while this module is the one navigating, so the route guard ignores it. */
let navigatingForTour = false

let stopRouteGuard = null

/** Tells "finished" from "closed early". */
let reachedEnd = false

/** @type {Promise<{ driver: Function }>|null} */
let libraryPromise = null

function loadLibrary() {
  libraryPromise ??= Promise.all([import('driver.js'), import('driver.js/dist/driver.css')]).then(
    ([lib]) => lib,
  )
  return libraryPromise
}

/**
 * Waits until the element is rendered, not just present: a collapsed teleported sidebar keeps
 * zero-size nodes in the DOM.
 *
 * @param {string} selector
 * @param {number} timeout
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeout = ANCHOR_TIMEOUT_MS) {
  function visible() {
    const el = document.querySelector(selector)
    return el && el.getClientRects().length > 0 ? el : null
  }

  const immediate = visible()
  if (immediate) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    let settled = false

    function finish(result) {
      if (settled) return
      settled = true
      observer.disconnect()
      clearTimeout(timer)
      resolve(result)
    }

    const observer = new MutationObserver(() => {
      const el = visible()
      if (el) finish(el)
    })

    const timer = setTimeout(() => finish(null), timeout)

    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
  })
}

/**
 * @param {object} step
 * @returns {Promise<boolean>} false when the anchor never appeared
 */
async function prepareStep(step) {
  if (step.route) {
    navigatingForTour = true
    try {
      await router.push(step.route)
    } catch {
      // Redirected or aborted by a guard: let the anchor wait decide.
    } finally {
      // Yield past the afterEach hook so our own push is not taken for the user leaving.
      await Promise.resolve()
      navigatingForTour = false
    }
  }

  const anchor = await waitForElement(step.target)
  if (!anchor && import.meta.env.DEV) {
    console.warn(`[guided tour] anchor never appeared: ${step.target}`)
  }
  return !!anchor
}

function toDriverStep(step) {
  return {
    element: step.target,
    popover: {
      title: step.title,
      description: step.body,
      ...(step.side ? { side: step.side } : {}),
      ...(step.align ? { align: step.align } : {}),
    },
  }
}

/** Drop our own state. Never touches driver.js, so it is safe to call from its hooks. */
function cleanup() {
  stopRouteGuard?.()
  stopRouteGuard = null
  driverObj = null
  activeTourId.value = null
}

/** Drops the handle before destroy(), so the onDestroyed that follows only cleans up. */
function stopTour() {
  const instance = driverObj
  cleanup()
  instance?.destroy()
}

export function useGuidedTour() {
  const onboarding = useOnboardingStore()

  /**
   * @param {string} tourId - key in ONBOARDING_TOURS
   * @param {object} [options]
   * @param {import('vue-router').RouteLocationRaw} [options.entryRoute] - first step's route,
   *   when it depends on a runtime object id
   * @param {string} [options.stepId] - onboarding step to mark complete when the tour finishes
   */
  async function startTour(tourId, { entryRoute, stepId } = {}) {
    const steps = getTourSteps(tourId, entryRoute)
    if (!steps?.length) return

    stopTour()
    activeTourId.value = tourId
    reachedEnd = false

    const { driver } = await loadLibrary()

    // The user may have navigated or started another tour while the chunk loaded.
    if (activeTourId.value !== tourId) return

    if (!(await prepareStep(steps[0]))) {
      stopTour()
      return
    }

    async function advance(delta) {
      const current = driverObj?.getActiveIndex()
      if (current == null) return

      const index = current + delta
      const next = steps[index]

      if (!next) {
        reachedEnd = delta > 0
        stopTour()
        return
      }

      if (await prepareStep(next)) {
        driverObj?.moveTo(index)
      } else {
        stopTour()
      }
    }

    driverObj = driver({
      showProgress: steps.length > 1,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'nx-tour',
      allowClose: true,
      steps: steps.map(toDriverStep),
      // Defining these hooks turns off driver.js's own advancing.
      onNextClick: () => advance(1),
      onPrevClick: () => advance(-1),
      onDestroyed: () => {
        onboarding.markTourSeen(tourId)
        if (reachedEnd && stepId) onboarding.markCompleted(stepId)
        cleanup()
      },
    })

    // A stranded overlay would block the view the user navigated to.
    stopRouteGuard = router.afterEach(() => {
      if (!navigatingForTour) stopTour()
    })

    driverObj.drive(0)
  }

  return { startTour, stopTour, activeTourId }
}

/** Test seam: each test loads its own mock. */
export function resetGuidedTourLibrary() {
  libraryPromise = null
  driverObj = null
  activeTourId.value = null
  stopRouteGuard?.()
  stopRouteGuard = null
}
