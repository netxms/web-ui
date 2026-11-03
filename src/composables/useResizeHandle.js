import { computed, onUnmounted, ref, toValue } from 'vue'

/**
 * Drag-to-resize handle for a docked panel, with a keyboard equivalent and window-splitter ARIA.
 * `'vertical'` is a right-docked panel (grip on its left border, `size` is a width),
 * `'horizontal'` a bottom-docked one (grip on top, `size` is a height). A left- or top-docked
 * panel would invert the sign in `onMove` and swap the arrow keys.
 *
 * @example
 * const { isResizing, handleBindings } = useResizeHandle({
 *   size: () => panelWidth.value,
 *   setSize: (px) => (panelWidth.value = px),
 *   min: 380,
 *   max: 1200,
 *   label: 'Resize tools panel',
 * })
 * // <div class="tools-resize-handle" v-bind="handleBindings" />
 *
 * @param {object} options
 * @param {(() => number)|import('vue').Ref<number>} options.size - px
 * @param {(px: number) => void} options.setSize
 * @param {number|(() => number)} options.min - px
 * @param {number|(() => number)} options.max - px
 * @param {string} options.label - accessible name for the handle
 * @param {number} [options.step=24] - px per arrow keypress
 * @param {'vertical'|'horizontal'} [options.orientation='vertical']
 */
export function useResizeHandle({
  size,
  setSize,
  min,
  max,
  label,
  step = 24,
  orientation = 'vertical',
}) {
  const isResizing = ref(false)
  const isVertical = orientation === 'vertical'

  // Set only while a drag is live, so an unmount mid-drag cannot leak window listeners.
  let stopListening = null

  const clamp = (px) => Math.min(toValue(max), Math.max(toValue(min), Math.round(px)))

  function onMousedown(event) {
    event.preventDefault()
    const start = isVertical ? event.clientX : event.clientY
    const startSize = toValue(size)
    isResizing.value = true

    const onMove = (moveEvent) => {
      const position = isVertical ? moveEvent.clientX : moveEvent.clientY
      setSize(clamp(startSize + start - position))
    }
    const onUp = () => {
      isResizing.value = false
      stopListening?.()
    }

    stopListening = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      stopListening = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onKeydown(event) {
    const grow = isVertical ? 'ArrowLeft' : 'ArrowUp'
    const shrink = isVertical ? 'ArrowRight' : 'ArrowDown'
    const current = toValue(size)
    let next
    if (event.key === grow) next = current + step
    else if (event.key === shrink) next = current - step
    else if (event.key === 'Home') next = toValue(max)
    else if (event.key === 'End') next = toValue(min)
    else return

    event.preventDefault()
    setSize(clamp(next))
  }

  onUnmounted(() => stopListening?.())

  return {
    isResizing,
    handleBindings: computed(() => ({
      role: 'separator',
      'aria-orientation': orientation,
      'aria-label': label,
      'aria-valuenow': toValue(size),
      'aria-valuemin': toValue(min),
      'aria-valuemax': toValue(max),
      tabindex: 0,
      onMousedown,
      onKeydown,
    })),
  }
}
