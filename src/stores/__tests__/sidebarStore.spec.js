import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { userPrefs } from '@/utils/appStorage'
import { useSidebarStore } from '@/stores/sidebarStore'

const STORAGE_KEY = 'netxms.sidebar'

describe('sidebarStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('defaults showAliases to true', () => {
    expect(useSidebarStore().showAliases).toBe(true)
  })

  it('defaults sidebarWidth to 280', () => {
    expect(useSidebarStore().sidebarWidth).toBe(280)
  })

  it('toggleAliases flips showAliases', () => {
    const store = useSidebarStore()
    store.toggleAliases()
    expect(store.showAliases).toBe(false)
    store.toggleAliases()
    expect(store.showAliases).toBe(true)
  })

  it('setSidebarWidth accepts an in-range value', () => {
    const store = useSidebarStore()
    store.setSidebarWidth(320)
    expect(store.sidebarWidth).toBe(320)
  })

  it('setSidebarWidth clamps below the minimum', () => {
    const store = useSidebarStore()
    store.setSidebarWidth(50)
    expect(store.sidebarWidth).toBe(200)
  })

  it('setSidebarWidth clamps above the maximum', () => {
    const store = useSidebarStore()
    store.setSidebarWidth(9000)
    expect(store.sidebarWidth).toBe(600)
  })

  it('persists the width here and the aliases choice to the account', () => {
    const store = useSidebarStore()
    store.toggleAliases()
    store.setSidebarWidth(400)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual({ sidebarWidth: 400 })
    expect(userPrefs.get('sidebar.showAliases')).toBe(false)
  })

  it('restores persisted values in a fresh store instance', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sidebarWidth: 350 }))
    userPrefs.set('sidebar.showAliases', false)
    setActivePinia(createPinia())
    const store = useSidebarStore()
    expect(store.showAliases).toBe(false)
    expect(store.sidebarWidth).toBe(350)
  })

  it("follows the account's aliases choice when sign-in brings it", async () => {
    const store = useSidebarStore()
    userPrefs.replace({ 'sidebar.showAliases': false }, '7')
    await nextTick()
    expect(store.showAliases).toBe(false)
  })

  it('re-clamps an out-of-range persisted width', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sidebarWidth: 9000 }))
    setActivePinia(createPinia())
    expect(useSidebarStore().sidebarWidth).toBe(600)
  })
})
