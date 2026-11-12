// Reproduce native ctrl/cmd+click and middle-click new-tab behaviour on non-anchor elements.
import router from '@/router'

/**
 * Middle click fires `auxclick`, never `click`.
 *
 * @param {MouseEvent} event
 * @returns {boolean}
 */
export function shouldOpenInNewTab(event) {
  if (!event) return false
  if (event.type === 'auxclick') return event.button === 1
  return event.button === 1 || !!(event.ctrlKey || event.metaKey)
}

/**
 * @param {MouseEvent} event
 * @returns {boolean}
 */
export function isPlainLeftClick(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (event.button !== 0) return false
  return !event.defaultPrevented
}

/**
 * @param {import('vue-router').RouteLocationRaw} to
 * @returns {string}
 */
export function resolveHref(to) {
  return router.resolve(to).href
}

/**
 * Call synchronously from a user gesture (popup blockers). `opener` is cleared instead of passing
 * 'noopener': a non-empty feature string makes Chrome open a popup window instead of a tab.
 *
 * @param {import('vue-router').RouteLocationRaw} to
 */
export function openInNewTab(to) {
  const opened = window.open(resolveHref(to), '_blank')
  if (opened) opened.opener = null
}

/** A spec mocks this module: jsdom's `location` cannot be redefined. */
export function reloadPage() {
  window.location.reload()
}
