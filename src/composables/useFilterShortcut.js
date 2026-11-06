import { onMounted, onUnmounted } from 'vue'
import { isTypingTarget } from '@/composables/useActionShortcuts'
import { focusWithRing } from '@/utils/focusRing'

/**
 * `/` focuses the filter field nearest to where the user is, searching outward from the focused
 * element (or the last click that focused nothing, e.g. on a canvas). Inside a dialog only the
 * dialog's filter is reachable. Escape on an empty field returns focus to where `/` took it from,
 * or just leaves the field when it was reached some other way, except inside a dialog, where
 * Escape closes the dialog.
 *
 * Filter fields are marked with `data-filter-input`; disabled, read-only and hidden ones are
 * skipped.
 */

const FILTER_FIELD_ATTRIBUTE = 'data-filter-input'

const FILTER_FIELD_SELECTOR = `[${FILTER_FIELD_ATTRIBUTE}]`

const EDITABLE_SELECTOR = 'input, textarea'

// Every dialog in this app is modal; a non-modal overlay added later would need excluding here.
const MODAL_SELECTOR = '.p-dialog'

// Not `checkVisibility()`: missing in some supported browsers and differs under jsdom.
function isRendered(element) {
  for (let node = element; node instanceof Element; node = node.parentElement) {
    if (node.hidden) return false
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}

function usableField(marked) {
  const field = marked.matches(EDITABLE_SELECTOR) ? marked : marked.querySelector(EDITABLE_SELECTOR)
  if (!field || field.disabled || field.readOnly) return null
  return isRendered(field) ? field : null
}

// SmartFilterInput sets the marker to `active` while it holds chips: the text box looks empty,
// but Escape must still clear the filter.
function isNarrowing(field) {
  return field.closest(FILTER_FIELD_SELECTOR)?.dataset.filterInput === 'active'
}

function isEmptyFilter(target) {
  const marked = target instanceof Element ? target.closest(FILTER_FIELD_SELECTOR) : null
  if (!marked || usableField(marked) !== target) return false
  return target.value === '' && !isNarrowing(target)
}

function fieldWithin(root) {
  for (const marked of root.querySelectorAll(FILTER_FIELD_SELECTOR)) {
    const field = usableField(marked)
    if (field) return field
  }
  return null
}

export function hasFilterField(root) {
  return !!root && !!fieldWithin(root)
}

/** The topmost open modal, which is the last in the DOM - overlays stack by append. */
function openModal() {
  const modals = [...document.querySelectorAll(MODAL_SELECTOR)].filter(isRendered)
  return modals.at(-1) ?? null
}

function findFilterField(origin) {
  const modal = openModal()

  let node = origin instanceof Element ? origin : null
  // Focus outside the modal (or nowhere at all) still resolves within it.
  if (modal && (!node || !modal.contains(node))) node = modal

  for (; node; node = node.parentElement) {
    const field = fieldWithin(node)
    if (field) return field
    if (node === modal) return null
  }
  return null
}

export function useFilterShortcut() {
  let field = null
  let returnTo = null

  // Where the user is while focus says nothing: the last click that focused nothing (a canvas
  // surface such as a network map or chart), or the filter Escape just left. Cleared by the next
  // `focusin`; the pointer listener captures so that ordering holds even where the surface focuses
  // itself on `pointerdown`.
  let anchor = null

  function rememberPointer(event) {
    anchor = event.target instanceof Element ? event.target : null
  }

  function forgetAnchor() {
    anchor = null
  }

  function origin() {
    if (anchor?.isConnected) return anchor
    return document.activeElement
  }

  function focusFilter(event) {
    const target = findFilterField(origin())
    if (!target) return

    event.preventDefault()
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    field = target
    // Optional call: jsdom does not implement scrollIntoView.
    target.scrollIntoView?.({ block: 'nearest' })
    target.focus()
    target.select?.()
  }

  // Read before the field's own handlers: by the time the bubbling listener runs, a filter's clear
  // has already re-rendered it empty (the browser runs microtasks between listeners of a key).
  let emptyOnEscape = null

  function noteEscape(event) {
    emptyOnEscape = event.key === 'Escape' && isEmptyFilter(event.target) ? event.target : null
  }

  // Only on a field that was empty, so the first Escape still belongs to the filter's own "clear".
  // The focus check yields to an overlay that already handled Escape (a popover refocuses its
  // button).
  function releaseFilter(target) {
    const wasEmpty = target === emptyOnEscape
    emptyOnEscape = null
    if (!wasEmpty || document.activeElement !== target) return
    if (target.closest(MODAL_SELECTOR)) return

    const destination = target === field ? returnTo : null
    field = null
    returnTo = null
    if (destination?.isConnected && isRendered(destination)) {
      // Focus moved by script does not match `:focus-visible` on its own.
      focusWithRing(destination)
      return
    }
    target.blur()
    anchor = target
  }

  function handleKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    // In a text field `/` is just a character (`10.0.0.0/24` is a valid filter).
    if (isTypingTarget(event.target)) {
      if (event.key === 'Escape') releaseFilter(event.target)
      return
    }
    if (event.key === '/') focusFilter(event)
  }

  onMounted(() => {
    window.addEventListener('keydown', noteEscape, true)
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('pointerdown', rememberPointer, true)
    document.addEventListener('focusin', forgetAnchor)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', noteEscape, true)
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('pointerdown', rememberPointer, true)
    document.removeEventListener('focusin', forgetAnchor)
    anchor = null
    emptyOnEscape = null
    field = null
    returnTo = null
  })
}
