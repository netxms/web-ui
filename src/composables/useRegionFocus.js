import { onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isTypingTarget } from '@/composables/useActionShortcuts'
import { focusWithRing } from '@/utils/focusRing'

/**
 * Where the keyboard lands after a navigation, keyed off the route so it covers every way of
 * opening something:
 *
 * - new perspective (route name changed): the sidebar tree's roving tab stop
 * - same perspective, different entity: `<main>`, unless focus is already on a tree row
 * - only the view tab changed: nowhere
 *
 * Plus F6 / Shift+F6 to cycle the panes.
 */

/** Landmarks, in tab order. */
const REGIONS = [
  { selector: '[role="banner"]', label: 'Header' },
  { selector: '.default-layout > nav', label: 'Perspectives' },
  { selector: '.default-layout > aside', label: 'Sidebar' },
  { selector: '.default-layout > main', label: 'Content' },
]

const REGION_HINT_MS = 5000

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

const TREE_WAIT_MS = 4000

// The roving tabindex, not `aria-selected`: with nothing selected it sits on the root rows.
const TREE_STOP = '[role="tree"] [role="treeitem"][tabindex="0"]'

/** Everything but `viewId`: changing only the view tab is not opening a different thing. */
function entityKey(route) {
  return Object.entries(route.params)
    .filter(([name]) => name !== 'viewId')
    .map(([name, value]) => `${name}=${value}`)
    .sort()
    .join('&')
}

// The sidebar is `v-show`n; a hidden pane would cost a dead F6 press.
function regionElements() {
  return REGIONS.map(({ selector, label }) => ({
    element: document.querySelector(selector),
    label,
  })).filter(({ element }) => element && getComputedStyle(element).display !== 'none')
}

/**
 * A tree hands focus to its roving stop; any other pane takes it on the container. Only a row
 * gets a forced ring (script-moved focus does not match `:focus-visible`); a ring around a
 * whole pane marks nothing in particular.
 */
function focusRegion(element) {
  if (!element) return
  const row = element.querySelector(TREE_STOP)
  if (row) {
    focusWithRing(row)
    // Optional call: jsdom does not implement scrollIntoView.
    row.scrollIntoView?.({ block: 'nearest' })
    return
  }
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1')
  element.focus({ preventScroll: true })
}

// Focus stays on a tree row after opening from it, so arrows walk on to the next object.
function isOnSidebarTreeRow() {
  const row = document.activeElement?.closest?.('[role="treeitem"]')
  return !!row && !!document.querySelector('.default-layout > aside')?.contains(row)
}

/** Never pull focus out of a half-typed input or an open dialog. */
export function mayStealFocus() {
  const active = document.activeElement
  if (!active || active === document.body) return true
  if (isTypingTarget(active)) return false
  return !active.closest('.p-dialog')
}

export function useRegionFocus() {
  const route = useRoute()

  let observer = null
  let waitTimer = null

  /**
   * The pane F6 just moved to, or null.
   * @type {import('vue').Ref<{ element: HTMLElement, label: string } | null>}
   */
  const activeRegion = ref(null)

  /** The element our own focus move landed on, so the `focusin` it fires is not a dismissal. */
  let justFocused = null
  let hintTimer = null

  function clearRegion() {
    if (!activeRegion.value) return
    activeRegion.value.element.removeAttribute('data-region-focus')
    activeRegion.value = null
    justFocused = null
    clearTimeout(hintTimer)
    hintTimer = null
  }

  /**
   * Transient outline and label on the pane F6 landed on: the panes have their focus outline
   * suppressed, so otherwise F6 changes nothing on screen. Any user action dismisses it.
   */
  function showRegion(region) {
    clearRegion()
    region.element.setAttribute('data-region-focus', '')
    activeRegion.value = region
    justFocused = document.activeElement
    hintTimer = setTimeout(clearRegion, REGION_HINT_MS)
  }

  function dismissOnFocus(event) {
    if (!activeRegion.value) return
    if (event.target === justFocused) {
      justFocused = null
      return
    }
    clearRegion()
  }

  function dismissOnKey(event) {
    if (!activeRegion.value) return
    if (event.key === 'F6' || MODIFIER_KEYS.has(event.key)) return
    clearRegion()
  }

  function stopWaiting() {
    observer?.disconnect()
    observer = null
    clearTimeout(waitTimer)
    waitTimer = null
  }

  // The tree is fetched, so it is usually not rendered yet. The timeout keeps a tree that
  // never loads from stealing focus long after the user has moved on.
  function focusTreeWhenReady() {
    stopWaiting()
    const sidebar = document.querySelector('.default-layout > aside')
    if (!sidebar) return

    focusRegion(sidebar)
    if (sidebar.querySelector(TREE_STOP)) return

    observer = new MutationObserver(() => {
      if (!sidebar.querySelector(TREE_STOP)) return
      if (mayStealFocus()) focusRegion(sidebar)
      stopWaiting()
    })
    observer.observe(sidebar, { childList: true, subtree: true, attributeFilter: ['tabindex'] })
    waitTimer = setTimeout(stopWaiting, TREE_WAIT_MS)
  }

  watch(
    () => [route.name, entityKey(route)],
    ([name, entity], [previousName, previousEntity] = []) => {
      if (previousName === undefined) return
      clearRegion()
      if (!mayStealFocus()) return

      if (name !== previousName) {
        focusTreeWhenReady()
      } else if (entity !== previousEntity) {
        stopWaiting()
        if (isOnSidebarTreeRow()) return
        focusRegion(document.querySelector('.default-layout > main'))
      }
    },
  )

  function cycleRegions(event) {
    if (event.key !== 'F6') return
    const regions = regionElements()
    if (regions.length === 0) return
    event.preventDefault()

    const current = regions.findIndex(({ element }) => element.contains(document.activeElement))
    const step = event.shiftKey ? -1 : 1
    const next = (current + step + regions.length) % regions.length
    focusRegion(regions[next].element)
    showRegion(regions[next])
  }

  window.addEventListener('keydown', cycleRegions)
  // Scrolling or resizing moves the pane out from under the label's measured position.
  window.addEventListener('keydown', dismissOnKey)
  document.addEventListener('focusin', dismissOnFocus)
  document.addEventListener('pointerdown', clearRegion, true)
  window.addEventListener('scroll', clearRegion, true)
  window.addEventListener('resize', clearRegion)

  onUnmounted(() => {
    window.removeEventListener('keydown', cycleRegions)
    window.removeEventListener('keydown', dismissOnKey)
    document.removeEventListener('focusin', dismissOnFocus)
    document.removeEventListener('pointerdown', clearRegion, true)
    window.removeEventListener('scroll', clearRegion, true)
    window.removeEventListener('resize', clearRegion)
    clearRegion()
    stopWaiting()
  })

  return { activeRegion }
}
