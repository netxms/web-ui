import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { userPrefs } from '@/utils/appStorage'
import { useNetworkMapStore } from '@/stores/networkMapStore'

const STORAGE_KEY = 'netxms.network-map-view'

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY))

describe('networkMapStore overflow tables', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('draws tables by default', () => {
    expect(useNetworkMapStore().overflowTablesEnabled(12)).toBe(true)
  })

  it('keeps the switch per map, in the view bucket', async () => {
    const store = useNetworkMapStore()
    store.setOverflowTablesEnabled(12, false)
    expect(store.overflowTablesEnabled(12)).toBe(false)
    expect(store.overflowTablesEnabled(13)).toBe(true)
    await nextTick()
    expect(stored().overflowTables).toEqual({ 12: { off: true } })
    // The canvas toggles follow the account instead.
    expect(stored().hideLinks).toBeUndefined()
  })

  it('drops a map that is back at the defaults', async () => {
    const store = useNetworkMapStore()
    store.setOverflowTablesEnabled(12, false)
    store.setOverflowTablesEnabled(12, true)
    await nextTick()
    expect(stored().overflowTables).toEqual({})
  })

  it('keeps offsets per map and per canvas, rounded', async () => {
    const store = useNetworkMapStore()
    store.setOverflowTableOffsets(12, 'graph', { 'e-1': { x: 10.4, y: -20.6 } })
    store.setOverflowTableOffsets(12, 'geo', { 'e-1': { x: 5, y: 5 } })
    expect(store.overflowTableOffsets(12, 'graph')).toEqual({ 'e-1': { x: 10, y: -21 } })
    expect(store.overflowTableOffsets(12, 'geo')).toEqual({ 'e-1': { x: 5, y: 5 } })
    expect(store.overflowTableOffsets(13, 'graph')).toEqual({})
    await nextTick()
    expect(stored().overflowTables[12].graph).toEqual({ 'e-1': { x: 10, y: -21 } })
  })

  it('hands out the same offsets object until they change', () => {
    const store = useNetworkMapStore()
    expect(store.overflowTableOffsets(12, 'graph')).toBe(store.overflowTableOffsets(12, 'graph'))
    store.setOverflowTableOffsets(12, 'graph', { a: { x: 1, y: 2 } })
    const offsets = store.overflowTableOffsets(12, 'graph')
    store.setOverflowTablesEnabled(13, false)
    expect(store.overflowTableOffsets(12, 'graph')).toBe(offsets)
  })

  it('forgets a canvas whose tables are all back in place', async () => {
    const store = useNetworkMapStore()
    store.setOverflowTableOffsets(12, 'graph', { a: { x: 1, y: 2 } })
    store.setOverflowTableOffsets(12, 'graph', {})
    await nextTick()
    expect(stored().overflowTables).toEqual({})
  })

  it('restores the switch and offsets in a fresh store', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ overflowTables: { 7: { off: true, graph: { n: { x: 3, y: 4 } } } } }),
    )
    setActivePinia(createPinia())
    const store = useNetworkMapStore()
    expect(store.overflowTablesEnabled(7)).toBe(false)
    expect(store.overflowTableOffsets(7, 'graph')).toEqual({ n: { x: 3, y: 4 } })
  })

  it('keeps canvas toggles in the account preferences, only while not at the default', async () => {
    const store = useNetworkMapStore()
    store.viewState.hideLinks = true
    await nextTick()
    expect(userPrefs.get('networkMap.hideLinks')).toBe(true)

    store.viewState.hideLinks = false
    await nextTick()
    expect(userPrefs.get('networkMap.hideLinks')).toBeUndefined()
  })

  it("follows the account's toggles when sign-in brings them", async () => {
    const store = useNetworkMapStore()
    store.setOverflowTablesEnabled(12, false)
    userPrefs.replace({ 'networkMap.showGrid': true }, '7')
    await nextTick()

    expect(store.viewState.showGrid).toBe(true)
    // Table positions belong to this browser and survive the switch.
    expect(store.overflowTablesEnabled(12)).toBe(false)
  })

  it('survives a corrupt stored value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ overflowTables: 'nope' }))
    setActivePinia(createPinia())
    const store = useNetworkMapStore()
    expect(store.overflowTablesEnabled(7)).toBe(true)
    expect(store.overflowTableOffsets(7, 'geo')).toEqual({})
  })
})
