import router from '@/router'
import { openInNewTab, shouldOpenInNewTab, isPlainLeftClick, resolveHref } from '@/utils/navigation'

/**
 * Middle mouse down opens the autoscroll cursor in Chrome and Firefox. Button 0 is left alone
 * so drag-to-reorder and canvas panning keep working.
 *
 * @param {MouseEvent} event
 */
function suppressAutoscroll(event) {
  if (event.button === 1) event.preventDefault()
}

// The browser already activates these on Enter; synthesizing would fire the handler twice.
const NATIVELY_ACTIVATABLE = 'a[href], button, input, select, textarea, [contenteditable]'

/**
 * A keypress inside a nested control belongs to that control.
 *
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isSynthesizableActivation(event) {
  if (event.target !== event.currentTarget) return false
  return !event.currentTarget?.matches?.(NATIVELY_ACTIVATABLE)
}

/**
 * New-tab-aware bindings for navigational elements:
 *
 * - `navBindings` for a non-anchor: synthesizes the new-tab behaviour and keyboard activation.
 * - `linkBindings` for a real `<a>` (or `Button as="a"`): the browser handles modified and
 *   middle clicks; a plain left click must route in-app instead of reloading the SPA.
 *
 * @example
 * const { navBindings, linkBindings } = useNavTarget()
 * // <div v-bind="navBindings(objectTarget(node), () => select(node))">
 * // <a v-bind="linkBindings(objectTarget(node))">
 */
export function useNavTarget() {
  /**
   * @param {import('vue-router').RouteLocationRaw} target
   * @param {(event: MouseEvent | KeyboardEvent) => void} [activate] - plain-click behaviour
   */
  function navBindings(target, activate) {
    /** @returns {boolean} true when the event was consumed as a new-tab request */
    function openIfRequested(event) {
      if (!target || !shouldOpenInNewTab(event)) return false
      event.preventDefault()
      event.stopPropagation()
      openInNewTab(target)
      return true
    }

    return {
      // Lists override this with a roving tabindex (see AppTable); bind it *after* the spread.
      tabindex: 0,
      onClick: (event) => {
        if (!openIfRequested(event)) activate?.(event)
      },
      onAuxclick: openIfRequested,
      onMousedown: suppressAutoscroll,
      onKeydown: (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if (!isSynthesizableActivation(event)) return
        event.preventDefault()
        // Ctrl/Cmd+Enter: `shouldOpenInNewTab` reads only modifier flags, which a
        // KeyboardEvent carries too.
        if (!openIfRequested(event)) activate?.(event)
      },
    }
  }

  /**
   * @param {import('vue-router').RouteLocationRaw} target
   * @param {(event: MouseEvent) => void} [onActivate] - extra work on a plain left click;
   *   navigation happens regardless
   */
  function linkBindings(target, onActivate) {
    return {
      href: resolveHref(target),
      onClick: (event) => {
        if (!isPlainLeftClick(event)) return
        event.preventDefault()
        onActivate?.(event)
        router.push(target)
      },
    }
  }

  return { navBindings, linkBindings }
}
