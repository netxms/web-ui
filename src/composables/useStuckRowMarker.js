import { onBeforeUnmount, onMounted } from 'vue'

/** Styled in tree-rows.css. */
export const STUCK_ATTR = 'data-stuck'

/**
 * The lowest expanded row pinned to its sticky offset (CSS cannot tell). Leaf and collapsed rows
 * pass through their offset for one frame on the way out, which would flash the shadow.
 *
 * @param {HTMLElement} container the scrolling tree
 * @returns {HTMLElement|null}
 */
export function findLastStuckRow(container) {
  if (!container || container.scrollTop <= 0) return null
  const edge = container.getBoundingClientRect().top + container.clientTop
  let last = null
  let lastTop = -Infinity
  for (const row of container.querySelectorAll('[role="treeitem"][aria-expanded="true"]')) {
    const top = parseFloat(getComputedStyle(row).top)
    if (Number.isNaN(top)) continue
    const offset = row.getBoundingClientRect().top - edge
    if (Math.abs(offset - top) < 1 && offset > lastTop) {
      last = row
      lastTop = offset
    }
  }
  return last
}

/**
 * @param {import('vue').Ref<HTMLElement|null>} containerRef
 */
export function useStuckRowMarker(containerRef) {
  let marked = null
  let frame = 0
  let observer = null

  function update() {
    frame = 0
    const row = findLastStuckRow(containerRef.value)
    if (row === marked) return
    marked?.removeAttribute(STUCK_ATTR)
    row?.setAttribute(STUCK_ATTR, '')
    marked = row
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update)
  }

  onMounted(() => {
    const container = containerRef.value
    if (!container) return
    container.addEventListener('scroll', schedule, { passive: true })
    // Only structural changes: a row's own attribute changing (including ours) is not one.
    observer = new MutationObserver(schedule)
    observer.observe(container, { childList: true, subtree: true })
  })

  onBeforeUnmount(() => {
    containerRef.value?.removeEventListener('scroll', schedule)
    observer?.disconnect()
    if (frame) cancelAnimationFrame(frame)
  })

  return { update }
}
