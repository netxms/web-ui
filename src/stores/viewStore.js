import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { userPrefs, viewState } from '@/utils/appStorage'

// Where the tab is (active views, view per class, tree expansion) goes to sessionStorage so tabs
// do not overwrite each other; what the user configured follows the account (`userPrefs`).

// Only Infrastructure let users add and remove tabs in the old `views.visible` lists, so only
// there does a missing view mean the user removed it.
const LEGACY_DEFAULT_VIEW_IDS = { infrastructure: ['status', 'alarms', 'dcis', 'performance'] }

/**
 * Converts the old `views.visible` preference (a full tab list per perspective) into overrides
 * and an order.
 *
 * @param {Record<string, string[]>} visible
 * @returns {{ overrides: Record<string, Record<string, boolean>>,
 *   order: Record<string, string[]> }}
 */
export function convertVisibleViewLists(visible) {
  const overrides = {}
  const order = {}
  for (const [perspective, ids] of Object.entries(visible ?? {})) {
    if (!Array.isArray(ids)) continue
    const defaults = LEGACY_DEFAULT_VIEW_IDS[perspective]
    if (!defaults) {
      order[perspective] = [...ids]
      continue
    }
    const changed = {}
    for (const id of defaults) if (!ids.includes(id)) changed[id] = false
    for (const id of ids) if (!defaults.includes(id)) changed[id] = true
    if (Object.keys(changed).length > 0) overrides[perspective] = changed
    // Kept only where the user dragged, so new defaults can take their own place.
    const natural = [
      ...defaults.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !defaults.includes(id)),
    ]
    if (natural.some((id, i) => id !== ids[i])) order[perspective] = [...ids]
  }
  return { overrides, order }
}

export const useViewStore = defineStore('view', () => {
  // e.g., { objects: 'alarms', dashboards: 'overview' }
  const activeViewByPerspective = ref({})

  // `true` shows a view the defaults leave out, `false` hides a default. Only differences are
  // kept, so a view that joins the defaults reaches everyone who has not hidden it.
  // e.g., { infrastructure: { interfaces: false, rack: true } }
  const viewOverridesByPerspective = ref({})

  // Set once the user drags a tab; unlisted shown views follow in default order.
  // e.g., { infrastructure: ['alarms', 'status', 'dcis'] }
  const viewOrderByPerspective = ref({})

  // e.g., { objects: ['alarms'] }
  const lockedViewIdsByPerspective = ref({})

  // e.g., { infrastructure: { Container: 'statusMap', Node: 'alarms' } }
  const activeViewByClassByPerspective = ref({})

  // e.g., { templates: ['3', '3-15'], 'business-services': ['9'] }
  const treeExpandedIdsByPerspective = ref({})

  // Keyed by InfoCard persistKey; only entries that differ from the card's default.
  // e.g., { 'status.identity': true, 'status.capabilities': false }
  const collapsedCardsByKey = ref({})

  const perTab = viewState.read()
  activeViewByPerspective.value = perTab.activeViews ?? {}
  activeViewByClassByPerspective.value = perTab.classViews ?? {}
  treeExpandedIdsByPerspective.value = perTab.treeExpanded ?? {}

  function loadPreferences() {
    const overrides = userPrefs.get('views.overrides')
    const order = userPrefs.get('views.order')
    if (overrides === undefined && order === undefined) {
      // The old field stays for consoles that still read it.
      const converted = convertVisibleViewLists(userPrefs.get('views.visible', {}))
      viewOverridesByPerspective.value = converted.overrides
      viewOrderByPerspective.value = converted.order
    } else {
      viewOverridesByPerspective.value = overrides ?? {}
      viewOrderByPerspective.value = order ?? {}
    }
    lockedViewIdsByPerspective.value = userPrefs.get('views.locked', {})
    collapsedCardsByKey.value = userPrefs.get('views.collapsedCards', {})
  }
  loadPreferences()
  watch(userPrefs.revision, loadPreferences)

  // Separate watchers: the two halves go to different backing stores.
  watch(
    [activeViewByPerspective, activeViewByClassByPerspective, treeExpandedIdsByPerspective],
    () => {
      viewState.write({
        activeViews: activeViewByPerspective.value,
        classViews: activeViewByClassByPerspective.value,
        treeExpanded: treeExpandedIdsByPerspective.value,
      })
    },
    { deep: true },
  )

  // Either field stored means the old list has been converted, so both are written.
  watch(
    [viewOverridesByPerspective, viewOrderByPerspective],
    ([overrides, order]) => {
      userPrefs.set('views.overrides', overrides)
      userPrefs.set('views.order', order)
    },
    { deep: true },
  )

  watch(lockedViewIdsByPerspective, (value) => userPrefs.set('views.locked', value), {
    deep: true,
  })

  watch(collapsedCardsByKey, (value) => userPrefs.set('views.collapsedCards', value), {
    deep: true,
  })

  /**
   * @param {string} perspective
   * @param {string} defaultView
   * @returns {string}
   */
  function getActiveView(perspective, defaultView = null) {
    return activeViewByPerspective.value[perspective] || defaultView
  }

  function setActiveView(perspective, viewId) {
    activeViewByPerspective.value[perspective] = viewId
  }

  /**
   * Defaults with the user's changes applied, in the user's order where there is one.
   * @param {string} perspective
   * @param {string[]} defaultIds - in default order
   * @returns {string[]}
   */
  function getVisibleViewIds(perspective, defaultIds = []) {
    const overrides = viewOverridesByPerspective.value[perspective] ?? {}
    const shown = [
      ...defaultIds.filter((id) => overrides[id] !== false),
      ...Object.keys(overrides).filter((id) => overrides[id] === true && !defaultIds.includes(id)),
    ]
    const order = viewOrderByPerspective.value[perspective]
    if (!order) return shown
    return [
      ...order.filter((id) => shown.includes(id)),
      ...shown.filter((id) => !order.includes(id)),
    ]
  }

  function setViewOrder(perspective, viewIds) {
    viewOrderByPerspective.value[perspective] = [...viewIds]
  }

  /**
   * Stores a difference from the defaults, or nothing.
   */
  function setViewShown(perspective, viewId, shown, defaultIds) {
    const next = { ...viewOverridesByPerspective.value[perspective] }
    if (shown === defaultIds.includes(viewId)) delete next[viewId]
    else next[viewId] = shown
    if (Object.keys(next).length > 0) viewOverridesByPerspective.value[perspective] = next
    else delete viewOverridesByPerspective.value[perspective]
  }

  function isViewVisible(perspective, viewId, defaultIds = []) {
    const visibleIds = getVisibleViewIds(perspective, defaultIds)
    return visibleIds.includes(viewId)
  }

  function addView(perspective, viewId, defaultIds = []) {
    setViewShown(perspective, viewId, true, defaultIds)
  }

  function removeView(perspective, viewId, defaultIds = []) {
    setViewShown(perspective, viewId, false, defaultIds)
  }

  function toggleView(perspective, viewId, defaultIds = []) {
    if (isViewVisible(perspective, viewId, defaultIds)) {
      removeView(perspective, viewId, defaultIds)
    } else {
      addView(perspective, viewId, defaultIds)
    }
  }

  function getLockedViewIds(perspective) {
    return lockedViewIdsByPerspective.value[perspective] ?? []
  }

  function toggleViewLock(perspective, viewId) {
    const current = getLockedViewIds(perspective)
    const next = current.includes(viewId)
      ? current.filter((id) => id !== viewId)
      : [...current, viewId]
    if (next.length > 0) lockedViewIdsByPerspective.value[perspective] = next
    else delete lockedViewIdsByPerspective.value[perspective]
  }

  function getExpandedIds(perspective) {
    return treeExpandedIdsByPerspective.value[perspective] ?? []
  }

  function setExpandedIds(perspective, ids) {
    treeExpandedIdsByPerspective.value[perspective] = ids
  }

  function resetPerspective(perspective) {
    delete activeViewByPerspective.value[perspective]
    delete viewOverridesByPerspective.value[perspective]
    delete viewOrderByPerspective.value[perspective]
    delete lockedViewIdsByPerspective.value[perspective]
    delete treeExpandedIdsByPerspective.value[perspective]
  }

  /**
   * @returns {string|null}
   */
  function getActiveViewForClass(perspective, objectClass) {
    return activeViewByClassByPerspective.value[perspective]?.[objectClass] ?? null
  }

  function setActiveViewForClass(perspective, objectClass, viewId) {
    if (!activeViewByClassByPerspective.value[perspective]) {
      activeViewByClassByPerspective.value[perspective] = {}
    }
    activeViewByClassByPerspective.value[perspective][objectClass] = viewId
  }

  /**
   * @param {string} key - InfoCard persist key
   * @param {boolean} fallback - the card's own default
   * @returns {boolean}
   */
  function isCardCollapsed(key, fallback = false) {
    return collapsedCardsByKey.value[key] ?? fallback
  }

  function setCardCollapsed(key, collapsed) {
    collapsedCardsByKey.value[key] = collapsed
  }

  function resetAll() {
    activeViewByPerspective.value = {}
    viewOverridesByPerspective.value = {}
    viewOrderByPerspective.value = {}
    lockedViewIdsByPerspective.value = {}
    activeViewByClassByPerspective.value = {}
    treeExpandedIdsByPerspective.value = {}
    collapsedCardsByKey.value = {}
  }

  // On sign-out: these name objects the previous account could read.
  function resetTabState() {
    activeViewByPerspective.value = {}
    activeViewByClassByPerspective.value = {}
    treeExpandedIdsByPerspective.value = {}
  }

  return {
    activeViewByPerspective,
    viewOverridesByPerspective,
    viewOrderByPerspective,
    lockedViewIdsByPerspective,
    activeViewByClassByPerspective,
    treeExpandedIdsByPerspective,
    collapsedCardsByKey,
    getActiveView,
    setActiveView,
    getActiveViewForClass,
    setActiveViewForClass,
    getVisibleViewIds,
    setViewOrder,
    isViewVisible,
    addView,
    removeView,
    toggleView,
    getLockedViewIds,
    toggleViewLock,
    getExpandedIds,
    setExpandedIds,
    isCardCollapsed,
    setCardCollapsed,
    resetPerspective,
    resetAll,
    resetTabState,
  }
})
