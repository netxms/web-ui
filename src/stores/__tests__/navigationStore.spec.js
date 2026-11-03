import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { ref, reactive } from 'vue'

vi.mock('@/api/objectsApi', () => ({ getObjects: vi.fn() }))

// The real auth store resolves a vue-query client at setup, which needs an injection context.
// `reactive` unwraps the refs on property access, the way a Pinia store instance does.
const user = ref(null)
const sessionGuid = ref(null)
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => reactive({ user, sessionGuid }) }))

// server-info `components`. Empty by default: the rail as it is on a server with no AI.
const serverComponents = ref([])
vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({ has: (id) => serverComponents.value.includes(id) }),
}))

const { useNavigationStore } = await import('@/stores/navigationStore')
const objectsApi = await import('@/api/objectsApi')

const ALL_RIGHTS = (1n << 59n) - 1n

const ROOTS = [
  { id: 1, class: 'Network', name: 'Entire Network' },
  { id: 2, class: 'ServiceRoot', name: 'Infrastructure Services' },
  { id: 3, class: 'TemplateRoot', name: 'Templates' },
  { id: 4, class: 'DashboardRoot', name: 'Dashboards' },
  { id: 5, class: 'BusinessServiceRoot', name: 'Business Services' },
  { id: 6, class: 'NetworkMapRoot', name: 'Network Maps' },
  { id: 7, class: 'AssetRoot', name: 'Assets' },
]

function sectionIds(store) {
  return store.navSections.map((section) => section.id)
}

function routesOf(store, id) {
  return store.navSections.find((section) => section.id === id).items.map((item) => item.route)
}

describe('navigationStore', () => {
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(objectsApi.getObjects).mockReset()
    user.value = { systemAccessRights: ALL_RIGHTS.toString() }
    sessionGuid.value = 'session-a'
    serverComponents.value = []
  })

  // Swapping the active pinia does not stop the previous one: its store watchers stay
  // subscribed to the shared auth refs and would answer the next test's session change.
  afterEach(() => {
    pinia._e.stop()
  })

  it('shows only sections with static items before the roots load', () => {
    // `business` holds no static entries: it is a lone BusinessServiceRoot slot.
    expect(sectionIds(useNavigationStore())).toEqual(['general', 'monitoring', 'analysis', 'admin'])
  })

  it('slots object roots into their sections in declared order', async () => {
    vi.mocked(objectsApi.getObjects).mockResolvedValue(ROOTS)
    const store = useNavigationStore()
    await store.loadNavigation()

    expect(sectionIds(store)).toEqual([
      'general',
      'objects',
      'monitoring',
      'business',
      'analysis',
      'admin',
    ])
    expect(routesOf(store, 'objects')).toEqual(['/infrastructure', '/assets', '/templates'])
    expect(routesOf(store, 'monitoring')).toEqual([
      '/alarms',
      '/incidents',
      '/dashboards',
      '/network-maps',
    ])
    expect(routesOf(store, 'business')).toEqual(['/business-services'])
    expect(routesOf(store, 'analysis')).toEqual(['/logs', '/tools'])
  })

  it('drops missing roots and any section left empty by them', async () => {
    vi.mocked(objectsApi.getObjects).mockResolvedValue([ROOTS[3]])
    const store = useNavigationStore()
    await store.loadNavigation()

    expect(sectionIds(store)).not.toContain('objects')
    expect(routesOf(store, 'monitoring')).toEqual(['/alarms', '/incidents', '/dashboards'])
  })

  it('pins administration to the foot of the rail', () => {
    const store = useNavigationStore()
    const bottom = store.navSections.filter((section) => section.placement === 'bottom')
    expect(bottom.map((section) => section.id)).toEqual(['admin'])
  })

  it('records the error and stays unloaded when the request fails', async () => {
    vi.mocked(objectsApi.getObjects).mockRejectedValue(new Error('boom'))
    const store = useNavigationStore()
    await store.loadNavigation()

    expect(store.error).toBe('boom')
    expect(store.loaded).toBe(false)
    expect(sectionIds(store)).not.toContain('objects')
  })

  describe('session changes', () => {
    it('drops the roots when the session ends', async () => {
      vi.mocked(objectsApi.getObjects).mockResolvedValue(ROOTS)
      const store = useNavigationStore()
      await store.loadNavigation()

      sessionGuid.value = null
      await flushPromises()

      expect(store.loaded).toBe(false)
      expect(sectionIds(store)).not.toContain('objects')
      expect(objectsApi.getObjects).toHaveBeenCalledTimes(1)
    })

    it('refetches the roots for the account that signs in next', async () => {
      vi.mocked(objectsApi.getObjects).mockResolvedValue(ROOTS)
      const store = useNavigationStore()
      await store.loadNavigation()
      expect(sectionIds(store)).toContain('objects')

      vi.mocked(objectsApi.getObjects).mockResolvedValue([ROOTS[3]])
      sessionGuid.value = null
      sessionGuid.value = 'session-b'
      await flushPromises()

      expect(store.loaded).toBe(true)
      expect(sectionIds(store)).not.toContain('objects')
      expect(routesOf(store, 'monitoring')).toEqual(['/alarms', '/incidents', '/dashboards'])
    })

    it('ignores a concurrent load while the session fetch is in flight', async () => {
      vi.mocked(objectsApi.getObjects).mockResolvedValue(ROOTS)
      const store = useNavigationStore()

      sessionGuid.value = 'session-b'
      await Promise.resolve() // let the watcher start its fetch, but not finish it
      await store.loadNavigation() // what AppNavigation does on mount
      await flushPromises()

      expect(objectsApi.getObjects).toHaveBeenCalledTimes(1)
      expect(store.loaded).toBe(true)
    })
  })

  describe('permission gating', () => {
    // Find Object and Object Tools are ACL-filtered per object, not gated on a system right.
    it('keeps perspectives that retain a universally-readable entry', () => {
      user.value = { systemAccessRights: '0' }
      const store = useNavigationStore()

      expect(sectionIds(store)).toContain('admin')
      expect(routesOf(store, 'analysis')).toEqual(['/logs', '/tools'])
      expect(store.hiddenItems).toEqual([])
    })

    it('keeps Configuration when only one gated section is readable', () => {
      // MANAGE_SCRIPTS (bit 12) alone → Script Library, so the perspective must stay.
      user.value = { systemAccessRights: (1n << 12n).toString() }
      expect(sectionIds(useNavigationStore())).toContain('admin')
    })

    it('hides nothing for a full-privilege account', () => {
      expect(useNavigationStore().hiddenItems).toEqual([])
    })
  })

  describe('AI perspective', () => {
    const USE_AI_ASSISTANT = 53n
    const VIEW_EVENT_LOG = 10n

    it('leads the Analysis section on a server with the AI assistant', () => {
      serverComponents.value = ['CORE', 'AI-ASSISTANT']
      expect(routesOf(useNavigationStore(), 'analysis')).toEqual(['/ai', '/logs', '/tools'])
    })

    // Nothing an administrator grants brings it back, so it is not "hidden by permissions".
    it('is absent, not withheld, on a server without it', () => {
      user.value = { systemAccessRights: '0' }
      const store = useNavigationStore()

      expect(routesOf(store, 'analysis')).toEqual(['/logs', '/tools'])
      expect(store.hiddenItems).toEqual([])
    })

    it('opens for either the chat right or the event log right', () => {
      serverComponents.value = ['AI-ASSISTANT']
      for (const bit of [USE_AI_ASSISTANT, VIEW_EVENT_LOG]) {
        user.value = { systemAccessRights: (1n << bit).toString() }
        expect(routesOf(useNavigationStore(), 'analysis')).toContain('/ai')
        pinia._e.stop()
        pinia = createPinia()
        setActivePinia(pinia)
      }
    })

    it('is withheld from an account with neither right', () => {
      serverComponents.value = ['AI-ASSISTANT']
      user.value = { systemAccessRights: '0' }
      const store = useNavigationStore()

      expect(routesOf(store, 'analysis')).not.toContain('/ai')
      expect(store.hiddenItems.map((item) => item.route)).toEqual(['/ai'])
    })
  })
})
