import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { Router, Server } from 'lucide-vue-next'

vi.mock('@/api/objectCategoriesApi', () => ({
  getObjectCategories: vi.fn(async () => [
    { id: 1, name: 'Routers', iconImageId: 'icon-1', mapImageId: 'map-1' },
    { id: 2, name: 'Gone', iconImageId: 'deleted', mapImageId: null },
  ]),
}))

vi.mock('@/api/imageLibraryApi', () => ({
  // 'deleted' stands for a guid the library no longer has: the API resolves null for it.
  getImageDataUrl: vi.fn(async (guid) => (guid === 'deleted' ? null : `blob:${guid}`)),
  getImageBlobInfo: vi.fn(() => ({ size: 1000, type: 'image/png' })),
}))

vi.mock('@/utils/iconImageAnalysis', async (importOriginal) => ({
  ...(await importOriginal()),
  // map-* images are full colour, everything else a one-colour glyph.
  analyzeIconImage: vi.fn(async (url) => ({
    width: 48,
    height: 48,
    style: url.includes('map-') ? 'picture' : 'glyph',
  })),
}))

const { createObjectIconRegistry } = await import('@/composables/useObjectIcons')
const { useObjectIconStore } = await import('@/stores/objectIconStore')
const { getImageDataUrl } = await import('@/api/imageLibraryApi')

let pinia

function mountRegistry() {
  let registry
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mount(
    defineComponent({
      setup() {
        registry = createObjectIconRegistry()
        return () => h('div')
      },
    }),
    { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } },
  )
  return registry
}

const router = { class: 'Node', category: 1, capabilities: { isRouter: true } }

describe('object icon registry', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('stays built-in until the image is fetched and analysed, then draws it', async () => {
    const registry = mountRegistry()
    expect(registry.resolve(router)).toMatchObject({ kind: 'builtin', component: Server })

    await flushPromises()
    await flushPromises()
    expect(registry.resolve(router)).toMatchObject({
      kind: 'glyph',
      guid: 'icon-1',
      url: 'blob:icon-1',
    })
  })

  it('loads every category icon up front, but map images only on request', async () => {
    const registry = mountRegistry()
    await flushPromises()
    const fetched = () => getImageDataUrl.mock.calls.map(([guid]) => guid)
    expect(fetched()).toEqual(expect.arrayContaining(['icon-1', 'deleted']))
    expect(fetched()).not.toContain('map-1')
    // The map surface falls back to the device icon while its image is not loaded.
    expect(registry.resolve(router, 'map')).toMatchObject({ kind: 'builtin', component: Router })

    registry.request(['map-1'])
    await flushPromises()
    await flushPromises()
    expect(fetched()).toContain('map-1')
    expect(registry.resolve(router, 'map')).toMatchObject({ kind: 'picture', guid: 'map-1' })
  })

  it('keeps the built-in icon for an image the library no longer has, and says so', async () => {
    const registry = mountRegistry()
    await flushPromises()
    await flushPromises()
    expect(registry.resolve({ class: 'Node', category: 2 }).kind).toBe('builtin')
    expect(registry.imageState('deleted')).toMatchObject({ missing: true, loading: false })
  })

  it('shows built-in icons for a user who switched custom ones off, except a previewed category', async () => {
    const registry = mountRegistry()
    await flushPromises()
    await flushPromises()
    const store = useObjectIconStore()
    store.setShowCustom(false)
    expect(registry.resolve(router).kind).toBe('builtin')

    store.startPreview({ categoryId: 1, name: 'Routers', iconImageId: 'icon-1', mapImageId: null })
    expect(registry.resolve(router).kind).toBe('glyph')
  })

  it("draws a previewed category's draft instead of its stored images", async () => {
    const registry = mountRegistry()
    useObjectIconStore().startPreview({
      categoryId: 1,
      name: 'Routers',
      iconImageId: 'draft-icon',
      mapImageId: null,
    })
    await flushPromises()
    await flushPromises()
    expect(registry.resolve(router)).toMatchObject({ kind: 'glyph', guid: 'draft-icon' })
    expect(registry.resolve(router, 'map').kind).toBe('builtin')
  })
})
