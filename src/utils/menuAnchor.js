// PrimeVue's ContextMenu positions itself from the event's pageX/pageY, which a keyboard-fired
// click reports as 0/0; these build the event PrimeVue reads, anchored to an element instead.

function hasPointerPosition(event) {
  return (
    Number.isFinite(event.pageX) &&
    Number.isFinite(event.pageY) &&
    (event.pageX !== 0 || event.pageY !== 0)
  )
}

// Rounded: PrimeVue's open animation puts the panel on a layer Chrome rasterises on whole device
// pixels, so a fractional offset jumps when the animation ends.
function menuEvent(pageX, pageY, sourceEvent) {
  return {
    pageX: Math.round(pageX),
    pageY: Math.round(pageY),
    preventDefault: () => sourceEvent?.preventDefault?.(),
    stopPropagation: () => sourceEvent?.stopPropagation?.(),
  }
}

/**
 * @param {Element} element
 * @param {Event} [sourceEvent] - so PrimeVue's `preventDefault`/`stopPropagation` reach it
 */
export function anchorEventAt(element, sourceEvent = null) {
  const rect = element?.getBoundingClientRect?.()
  return menuEvent(
    (rect?.left ?? 0) + window.scrollX,
    (rect?.bottom ?? 0) + window.scrollY,
    sourceEvent,
  )
}

/** Wrap any `menu.show(event)` whose event can come from a button. */
export function menuAnchorEvent(event) {
  if (!event) return event
  if (!hasPointerPosition(event)) return anchorEventAt(event.currentTarget ?? event.target, event)
  return menuEvent(event.pageX, event.pageY, event)
}
