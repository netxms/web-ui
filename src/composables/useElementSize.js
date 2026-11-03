import { ref, watch, onBeforeUnmount } from 'vue'

/**
 * An element's content box as reactive refs. ResizeObserver reports layout sizes, so a scaled
 * element still reports its untransformed size, which keeps fit-to-space calculations stable.
 * Callers must treat 0 as "not measured yet".
 *
 * @param {import('vue').Ref<HTMLElement|null>} elementRef
 * @returns {{ width: import('vue').Ref<number>, height: import('vue').Ref<number> }}
 */
export function useElementSize(elementRef) {
  const width = ref(0)
  const height = ref(0)
  let observer = null

  function disconnect() {
    observer?.disconnect()
    observer = null
  }

  watch(
    elementRef,
    (el) => {
      disconnect()
      if (!el || typeof ResizeObserver === 'undefined') {
        width.value = 0
        height.value = 0
        return
      }
      observer = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect
        if (!rect) return
        width.value = rect.width
        height.value = rect.height
      })
      observer.observe(el)
    },
    { immediate: true },
  )

  onBeforeUnmount(disconnect)

  return { width, height }
}
