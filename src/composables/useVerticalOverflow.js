import { onBeforeUnmount, ref, watch } from 'vue'

/** Same half-pixel allowance as the tab strips (see `useTabOverflow`). */
const EDGE_TOLERANCE = 1

/**
 * @param {{ scrollTop: number, scrollHeight: number, clientHeight: number }} viewport
 * @returns {{ canScrollUp: boolean, canScrollDown: boolean }}
 */
export function getVerticalScrollState(viewport) {
  return {
    canScrollUp: viewport.scrollTop > EDGE_TOLERANCE,
    canScrollDown:
      viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - EDGE_TOLERANCE,
  }
}

/**
 * A target counts as gone once its middle has crossed into an edge's faded band.
 *
 * @param {{ top: number, bottom: number }} target - client rect
 * @param {{ top: number, bottom: number }} viewport - client rect of the scroller
 * @param {{ inset: number, canScrollUp: boolean, canScrollDown: boolean }} edges
 * @returns {'above'|'below'|null}
 */
export function findTargetSide(target, viewport, edges) {
  const middle = (target.top + target.bottom) / 2
  if (edges.canScrollUp && middle < viewport.top + edges.inset) return 'above'
  if (edges.canScrollDown && middle > viewport.bottom - edges.inset) return 'below'
  return null
}

/**
 * How far to scroll so the target clears the faded bands; negative is up.
 *
 * @param {{ top: number, bottom: number }} target - client rect
 * @param {{ top: number, bottom: number }} viewport - client rect of the scroller
 * @param {number} inset - height of a faded band
 * @returns {number}
 */
export function revealDistance(target, viewport, inset) {
  const top = viewport.top + inset
  const bottom = viewport.bottom - inset
  if (target.top < top) return target.top - top
  if (target.bottom > bottom) return target.bottom - bottom
  return 0
}

/**
 * Overflow state for a vertical list with a hidden scrollbar: which edges have content past
 * them, and which side the target element has scrolled off to.
 *
 * The fade height is read from the scroller's `scroll-padding-top`, which the CSS sets to the
 * fade length so keyboard focus stops clear of the fade too.
 *
 * @param {import('vue').Ref<HTMLElement|null>} scrollRef
 * @param {import('vue').Ref<HTMLElement|null>} contentRef - observed for height changes
 * @param {string} targetSelector
 */
export function useVerticalOverflow(scrollRef, contentRef, targetSelector) {
  const canScrollUp = ref(false)
  const canScrollDown = ref(false)
  const targetSide = ref(null)
  let observer = null

  function readInset(el) {
    return parseFloat(getComputedStyle(el).scrollPaddingTop) || 0
  }

  function measure() {
    const el = scrollRef.value
    if (!el) {
      canScrollUp.value = false
      canScrollDown.value = false
      targetSide.value = null
      return
    }
    const state = getVerticalScrollState(el)
    canScrollUp.value = state.canScrollUp
    canScrollDown.value = state.canScrollDown
    const target = el.querySelector(targetSelector)
    targetSide.value = target
      ? findTargetSide(target.getBoundingClientRect(), el.getBoundingClientRect(), {
          inset: readInset(el),
          ...state,
        })
      : null
  }

  // Not `scrollIntoView`, which would also scroll every ancestor including the page.
  function revealTarget() {
    const el = scrollRef.value
    const target = el?.querySelector(targetSelector)
    if (target) {
      const distance = revealDistance(
        target.getBoundingClientRect(),
        el.getBoundingClientRect(),
        readInset(el),
      )
      if (distance !== 0) el.scrollTop += distance
    }
    measure()
  }

  /** @param {number} direction - -1 up, 1 down. A page less both fades. */
  function scrollPage(direction) {
    const el = scrollRef.value
    if (!el) return
    const inset = readInset(el)
    el.scrollTop += direction * Math.max(el.clientHeight - 2 * inset, inset)
  }

  function detach(el) {
    el?.removeEventListener('scroll', measure)
    observer?.disconnect()
    observer = null
  }

  watch(
    [scrollRef, contentRef],
    ([el, content], previous) => {
      // `previous` is undefined on the immediate run.
      detach(previous?.[0])
      if (!el) {
        measure()
        return
      }
      el.addEventListener('scroll', measure, { passive: true })
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure)
        observer.observe(el)
        if (content) observer.observe(content)
      }
      measure()
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(() => detach(scrollRef.value))

  return { canScrollUp, canScrollDown, targetSide, measure, revealTarget, scrollPage }
}
