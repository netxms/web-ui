import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { userPrefs } from '@/utils/appStorage'
import { convertVisibleViewLists, useViewStore } from '@/stores/viewStore'

describe('viewStore tab locks', () => {
  let pinia

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => pinia._e.stop())

  it('has nothing locked by default', () => {
    expect(useViewStore().getLockedViewIds('objects')).toEqual([])
  })

  it('locks and unlocks a view per perspective', () => {
    const store = useViewStore()
    store.toggleViewLock('objects', 'alarms')
    store.toggleViewLock('objects', 'dcis')
    store.toggleViewLock('templates', 'alarms')
    expect(store.getLockedViewIds('objects')).toEqual(['alarms', 'dcis'])

    store.toggleViewLock('objects', 'alarms')
    expect(store.getLockedViewIds('objects')).toEqual(['dcis'])
    expect(store.getLockedViewIds('templates')).toEqual(['alarms'])
  })

  it('persists locks to the account preferences', async () => {
    const store = useViewStore()
    store.toggleViewLock('objects', 'alarms')
    await nextTick()
    expect(userPrefs.get('views.locked')).toEqual({ objects: ['alarms'] })
  })

  it('drops a perspective from the preference once its last lock is gone', async () => {
    const store = useViewStore()
    store.toggleViewLock('objects', 'alarms')
    await nextTick()
    store.toggleViewLock('objects', 'alarms')
    await nextTick()
    expect(userPrefs.get('views.locked')).toEqual({})
  })

  it('restores locks in a fresh store instance', () => {
    userPrefs.set('views.locked', { objects: ['status'] })
    pinia._e.stop()
    pinia = createPinia()
    setActivePinia(pinia)
    expect(useViewStore().getLockedViewIds('objects')).toEqual(['status'])
  })

  it("follows the account's locks when sign-in brings them", async () => {
    const store = useViewStore()
    store.toggleViewLock('objects', 'alarms')
    userPrefs.replace({ 'views.locked': { objects: ['dcis'] } }, '7')
    await nextTick()
    expect(store.getLockedViewIds('objects')).toEqual(['dcis'])
  })

  it('drops the locks of a sign-out that brings none', async () => {
    const store = useViewStore()
    store.toggleViewLock('objects', 'alarms')
    userPrefs.replace({}, null)
    await nextTick()
    expect(store.getLockedViewIds('objects')).toEqual([])
  })

  it('resetPerspective clears that perspective only', () => {
    const store = useViewStore()
    store.toggleViewLock('objects', 'alarms')
    store.toggleViewLock('templates', 'dcis')
    store.resetPerspective('objects')
    expect(store.getLockedViewIds('objects')).toEqual([])
    expect(store.getLockedViewIds('templates')).toEqual(['dcis'])
  })

  it('resetAll clears every lock', () => {
    const store = useViewStore()
    store.toggleViewLock('objects', 'alarms')
    store.toggleViewLock('templates', 'dcis')
    store.resetAll()
    expect(store.lockedViewIdsByPerspective).toEqual({})
  })
})

describe('viewStore tab state on sign-out', () => {
  let pinia

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => pinia._e.stop())

  it('forgets where this tab was and keeps the account preferences', async () => {
    const store = useViewStore()
    store.setActiveView('infrastructure', 'dcis')
    store.setActiveViewForClass('infrastructure', 'Node', 'dcis')
    store.setExpandedIds('infrastructure', ['2', '2-100'])
    store.removeView('infrastructure', 'alarms', ['status', 'alarms', 'dcis'])
    store.toggleViewLock('infrastructure', 'dcis')
    await nextTick()

    store.resetTabState()
    await nextTick()

    expect(store.getActiveView('infrastructure')).toBeNull()
    expect(store.getActiveViewForClass('infrastructure', 'Node')).toBeNull()
    expect(store.getExpandedIds('infrastructure')).toEqual([])
    expect(JSON.parse(sessionStorage.getItem('netxms.view-state'))).toEqual({
      activeViews: {},
      classViews: {},
      treeExpanded: {},
    })
    expect(store.getVisibleViewIds('infrastructure', ['status', 'alarms', 'dcis'])).toEqual([
      'status',
      'dcis',
    ])
    expect(store.getLockedViewIds('infrastructure')).toEqual(['dcis'])
  })
})

describe('viewStore visible views', () => {
  const DEFAULTS = ['status', 'alarms', 'dcis']
  let pinia

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => pinia._e.stop())

  function freshStore() {
    pinia._e.stop()
    pinia = createPinia()
    setActivePinia(pinia)
    return useViewStore()
  }

  it('shows the defaults until the user changes something', () => {
    expect(useViewStore().getVisibleViewIds('infrastructure', DEFAULTS)).toEqual(DEFAULTS)
  })

  it('appends added views after the defaults, in the order they were added', () => {
    const store = useViewStore()
    store.addView('infrastructure', 'rack', DEFAULTS)
    store.addView('infrastructure', 'polls', DEFAULTS)
    expect(store.getVisibleViewIds('infrastructure', DEFAULTS)).toEqual([
      ...DEFAULTS,
      'rack',
      'polls',
    ])
  })

  it('stores only the differences from the defaults', async () => {
    const store = useViewStore()
    store.removeView('infrastructure', 'alarms', DEFAULTS)
    store.addView('infrastructure', 'rack', DEFAULTS)
    await nextTick()
    expect(userPrefs.get('views.overrides')).toEqual({
      infrastructure: { alarms: false, rack: true },
    })

    store.addView('infrastructure', 'alarms', DEFAULTS)
    store.removeView('infrastructure', 'rack', DEFAULTS)
    await nextTick()
    expect(userPrefs.get('views.overrides')).toEqual({})
  })

  // The preference holds differences, so views added to the defaults later still appear.
  it('shows a view that joins the defaults later, unless the user removed it', () => {
    const store = useViewStore()
    store.addView('infrastructure', 'rack', DEFAULTS)
    store.removeView('infrastructure', 'polls', [...DEFAULTS, 'polls'])
    expect(store.getVisibleViewIds('infrastructure', [...DEFAULTS, 'interfaces', 'polls'])).toEqual(
      [...DEFAULTS, 'interfaces', 'rack'],
    )
  })

  it('toggles a view on and off', () => {
    const store = useViewStore()
    store.toggleView('infrastructure', 'dcis', DEFAULTS)
    expect(store.isViewVisible('infrastructure', 'dcis', DEFAULTS)).toBe(false)
    store.toggleView('infrastructure', 'dcis', DEFAULTS)
    expect(store.isViewVisible('infrastructure', 'dcis', DEFAULTS)).toBe(true)
  })

  it('follows a dragged order, with views it does not list after it', () => {
    const store = useViewStore()
    store.setViewOrder('infrastructure', ['dcis', 'status', 'alarms'])
    store.addView('infrastructure', 'rack', DEFAULTS)
    expect(store.getVisibleViewIds('infrastructure', [...DEFAULTS, 'interfaces'])).toEqual([
      'dcis',
      'status',
      'alarms',
      'interfaces',
      'rack',
    ])
  })

  it('keeps the order without showing a view it lists that is hidden', () => {
    const store = useViewStore()
    store.setViewOrder('infrastructure', ['dcis', 'status', 'alarms'])
    store.removeView('infrastructure', 'status', DEFAULTS)
    expect(store.getVisibleViewIds('infrastructure', DEFAULTS)).toEqual(['dcis', 'alarms'])
  })

  it('restores overrides and order in a fresh store instance', async () => {
    const store = useViewStore()
    store.removeView('infrastructure', 'alarms', DEFAULTS)
    store.setViewOrder('infrastructure', ['dcis', 'status'])
    await nextTick()
    expect(freshStore().getVisibleViewIds('infrastructure', DEFAULTS)).toEqual(['dcis', 'status'])
  })

  it('converts the old full list against the old defaults', () => {
    userPrefs.set('views.visible', { infrastructure: ['status', 'dcis', 'performance', 'rack'] })
    const store = freshStore()
    const newDefaults = ['status', 'statusMap', 'alarms', 'dcis', 'performance', 'interfaces']
    expect(store.getVisibleViewIds('infrastructure', newDefaults)).toEqual([
      'status',
      'statusMap',
      'dcis',
      'performance',
      'interfaces',
      'rack',
    ])
  })

  it('writes both new fields on the first change after converting', async () => {
    userPrefs.set('views.visible', { infrastructure: ['status', 'alarms', 'dcis'] })
    const store = freshStore()
    store.setViewOrder('templates', ['b', 'a'])
    await nextTick()
    expect(userPrefs.get('views.overrides')).toEqual({ infrastructure: { performance: false } })
    expect(userPrefs.get('views.order')).toEqual({ templates: ['b', 'a'] })
  })

  it("follows the account's views when sign-in brings them", async () => {
    const store = useViewStore()
    store.removeView('infrastructure', 'alarms', DEFAULTS)
    userPrefs.replace({ 'views.overrides': { infrastructure: { rack: true } } }, '7')
    await nextTick()
    expect(store.getVisibleViewIds('infrastructure', DEFAULTS)).toEqual([...DEFAULTS, 'rack'])
  })
})

describe('convertVisibleViewLists', () => {
  it('records removed defaults and added views for Infrastructure', () => {
    expect(
      convertVisibleViewLists({ infrastructure: ['status', 'dcis', 'performance', 'rack'] }),
    ).toEqual({ overrides: { infrastructure: { alarms: false, rack: true } }, order: {} })
  })

  it('keeps the list as an order only where the user dragged', () => {
    expect(
      convertVisibleViewLists({ infrastructure: ['alarms', 'status', 'dcis', 'performance'] }),
    ).toEqual({
      overrides: {},
      order: { infrastructure: ['alarms', 'status', 'dcis', 'performance'] },
    })
  })

  // Elsewhere tabs could only be dragged, so a missing view is a newer one, not a removed one.
  it('reads other perspectives as an order only', () => {
    expect(convertVisibleViewLists({ templates: ['dcis', 'general'] })).toEqual({
      overrides: {},
      order: { templates: ['dcis', 'general'] },
    })
  })

  it('tolerates a missing or malformed preference', () => {
    expect(convertVisibleViewLists(undefined)).toEqual({ overrides: {}, order: {} })
    expect(convertVisibleViewLists({ infrastructure: 'status' })).toEqual({
      overrides: {},
      order: {},
    })
  })
})
