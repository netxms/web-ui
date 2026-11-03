import { onBeforeUnmount, ref, watch } from 'vue'

// Fractional layout sizes otherwise leave a strip permanently "scrollable" by half a pixel.
const EDGE_TOLERANCE = 1

/**
 * A tab clipped by an edge counts as past it.
 *
 * @param {{ offsetLeft: number, offsetWidth: number }} tab
 * @param {{ scrollLeft: number, clientWidth: number }} viewport
 * @returns {'left'|'right'|null}
 */
export function findTabSide(tab, viewport) {
  const left = viewport.scrollLeft
  const right = left + viewport.clientWidth
  if (tab.offsetLeft < left - EDGE_TOLERANCE) return 'left'
  if (tab.offsetLeft + tab.offsetWidth > right + EDGE_TOLERANCE) return 'right'
  return null
}

/**
 * @param {Array<{ key: string, offsetLeft: number, offsetWidth: number }>} tabs
 * @param {{ scrollLeft: number, clientWidth: number }} viewport
 * @returns {string[]} keys, in tab order
 */
export function findHiddenTabs(tabs, viewport) {
  return tabs.filter((tab) => findTabSide(tab, viewport) !== null).map((tab) => tab.key)
}

/**
 * @param {{ scrollLeft: number, scrollWidth: number, clientWidth: number }} viewport
 * @returns {{ canScrollLeft: boolean, canScrollRight: boolean }}
 */
export function getScrollState(viewport) {
  return {
    canScrollLeft: viewport.scrollLeft > EDGE_TOLERANCE,
    canScrollRight:
      viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - EDGE_TOLERANCE,
  }
}

// Firefox reports line-mode wheel events (deltaMode 1) with a delta of about 3 per notch.
const WHEEL_LINE_HEIGHT = 16

/**
 * Pixels a wheel event should move a horizontal strip; zero leaves it to the browser (already
 * horizontal, e.g. a trackpad swipe).
 *
 * @param {{ deltaX: number, deltaY: number, deltaMode: number }} event
 * @param {number} pageSize - the strip's visible width, for page-mode deltas
 * @returns {number}
 */
export function wheelScrollDistance(event, pageSize) {
  if (event.deltaY === 0 || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return 0
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_HEIGHT
  if (event.deltaMode === 2) return event.deltaY * pageSize
  return event.deltaY
}

function readTabGeometry(container) {
  return [...container.querySelectorAll('[data-tab-key]')].map((node) => ({
    key: node.dataset.tabKey,
    offsetLeft: node.offsetLeft,
    offsetWidth: node.offsetWidth,
  }))
}

/**
 * Overflow state for a horizontally scrolling tab strip. Tabs are found by their `data-tab-key`
 * attribute; `tabKeys` is watched only to know when to re-measure.
 *
 * @param {import('vue').Ref<HTMLElement|null>} scrollRef
 * @param {import('vue').Ref<string[]>} tabKeys
 * @param {import('vue').Ref<string|null>} [activeKey] - kept in view across resizes and tab-set
 *   changes, but scrolling the user does themselves is never undone
 */
export function useTabOverflow(scrollRef, tabKeys, activeKey = null) {
  const canScrollLeft = ref(false)
  const canScrollRight = ref(false)
  const hiddenKeys = ref([])
  const activeSide = ref(null)
  let observer = null

  function measure() {
    const el = scrollRef.value
    if (!el) {
      canScrollLeft.value = false
      canScrollRight.value = false
      hiddenKeys.value = []
      activeSide.value = null
      return
    }
    const state = getScrollState(el)
    canScrollLeft.value = state.canScrollLeft
    canScrollRight.value = state.canScrollRight

    // Scroll fires at frame rate: publish only a real change.
    const tabs = readTabGeometry(el)
    const next = findHiddenTabs(tabs, el)
    if (next.length !== hiddenKeys.value.length || next.some((k, i) => k !== hiddenKeys.value[i])) {
      hiddenKeys.value = next
    }
    const active = activeKey?.value ? tabs.find((tab) => tab.key === activeKey.value) : null
    activeSide.value = active ? findTabSide(active, el) : null
  }

  // An active tab the user scrolled away from stays where they left it.
  function remeasure() {
    const key = activeKey?.value
    const wasInView = !!key && !hiddenKeys.value.includes(key)
    measure()
    if (wasInView && hiddenKeys.value.includes(key)) scrollKeyIntoView(key)
  }

  /** Not `scrollIntoView`, which would also scroll every ancestor including the page. */
  function scrollKeyIntoView(key) {
    const el = scrollRef.value
    const node = key
      ? [...(el?.querySelectorAll('[data-tab-key]') ?? [])].find((n) => n.dataset.tabKey === key)
      : null
    if (!el || !node) return
    const left = node.offsetLeft
    const right = left + node.offsetWidth
    if (left < el.scrollLeft) el.scrollLeft = left
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth
    measure()
  }

  // Browsers map vertical wheel to horizontal scrolling unreliably (one stray pixel of vertical
  // scrollability loses it). At either end the event is left for the page.
  function onWheel(event) {
    const el = scrollRef.value
    if (!el) return
    const distance = wheelScrollDistance(event, el.clientWidth)
    if (distance === 0) return
    if (!(distance > 0 ? canScrollRight.value : canScrollLeft.value)) return
    event.preventDefault()
    el.scrollLeft += distance
    measure()
  }

  function detach(el) {
    el?.removeEventListener('scroll', measure)
    el?.removeEventListener('wheel', onWheel)
    observer?.disconnect()
    observer = null
  }

  watch(
    scrollRef,
    (el, previous) => {
      detach(previous)
      if (!el) {
        measure()
        return
      }
      el.addEventListener('scroll', measure, { passive: true })
      // Not passive: the handler has to be able to stop the page scrolling instead.
      el.addEventListener('wheel', onWheel, { passive: false })
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(remeasure)
        observer.observe(el)
      }
      measure()
    },
    { immediate: true, flush: 'post' },
  )

  watch(tabKeys, remeasure, { flush: 'post' })

  onBeforeUnmount(() => detach(scrollRef.value))

  return { canScrollLeft, canScrollRight, hiddenKeys, activeSide, scrollKeyIntoView, measure }
}
