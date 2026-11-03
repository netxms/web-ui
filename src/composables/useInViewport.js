import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * Whether an element is on screen, as a ref that flips in both directions.
 *
 * @param {import('vue').Ref<HTMLElement|null>} elementRef
 * @param {object} [options]
 * @param {string} [options.rootMargin='300px'] - how far outside the viewport still counts
 * @param {boolean} [options.initial=false] - assumed until the first (asynchronous) callback:
 *   `false` for lazy loading, `true` where the work already runs and only its repeat is gated,
 *   so a visible element does not flash its empty state
 * @returns {import('vue').Ref<boolean>}
 */
export function useInViewport(elementRef, { rootMargin = '300px', initial = false } = {}) {
  const inViewport = ref(initial)
  let observer = null

  onMounted(() => {
    // Fails open: a gate that reports "never visible" would stop what it guards for good.
    if (typeof IntersectionObserver === 'undefined' || !elementRef.value) {
      inViewport.value = true
      return
    }

    observer = new IntersectionObserver(
      (entries) => {
        inViewport.value = entries.some((entry) => entry.isIntersecting)
      },
      { rootMargin },
    )
    observer.observe(elementRef.value)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return inViewport
}
