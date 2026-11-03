import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useObjectIconStore } from '@/stores/objectIconStore'
import { userPrefs } from '@/utils/appStorage'

describe('objectIconStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('shows custom icons by default', () => {
    expect(useObjectIconStore().showCustom).toBe(true)
  })

  it('stores only the opt-out, so the default is never pinned on the server', () => {
    const store = useObjectIconStore()
    store.setShowCustom(false)
    expect(store.showCustom).toBe(false)
    expect(userPrefs.get('objectIcons.showCustom')).toBe(false)

    store.setShowCustom(true)
    expect(store.showCustom).toBe(true)
    expect('objectIcons.showCustom' in userPrefs.read()).toBe(false)
  })

  it('re-reads the choice when another account signs in', async () => {
    const store = useObjectIconStore()
    userPrefs.replace({ 'objectIcons.showCustom': false }, 'someone-else')
    await Promise.resolve()
    expect(store.showCustom).toBe(false)
  })

  it('holds one previewed draft at a time, normalising missing images to null', () => {
    const store = useObjectIconStore()
    expect(store.isPreviewing).toBe(false)

    store.startPreview({ categoryId: 4, name: 'Routers', iconImageId: 'icon' })
    expect(store.isPreviewing).toBe(true)
    expect(store.preview).toEqual({
      categoryId: 4,
      name: 'Routers',
      iconImageId: 'icon',
      mapImageId: null,
    })

    store.stopPreview()
    expect(store.preview).toBeNull()
  })
})
