/**
 * Script-moved focus after a mouse click does not match `:focus-visible`, and
 * `focusVisible: true` is not implemented everywhere, so `data-focus-ring` (paired with
 * `:focus-visible` in stylesheets) forces the ring until blur. Only for focus moved *for* the
 * user, never in a click handler on the element itself.
 *
 * @param {HTMLElement | null | undefined} element
 * @param {FocusOptions} [options]
 */
export function focusWithRing(element, options) {
  if (!element) return
  element.focus({ ...options, focusVisible: true })
  if (document.activeElement !== element) return

  element.setAttribute('data-focus-ring', '')
  element.addEventListener('blur', () => element.removeAttribute('data-focus-ring'), {
    once: true,
  })
}
