import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { ref, reactive } from 'vue'

// The real auth store resolves a vue-query client at setup, which needs an injection context.
const sessionGuid = ref(null)
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => reactive({ sessionGuid }) }))

const { usePerspectiveStore } = await import('@/stores/perspectiveStore')

describe('perspectiveStore', () => {
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    sessionGuid.value = 'session-a'
  })

  // Swapping the active pinia does not stop the previous one: its store watchers stay
  // subscribed to the shared auth refs and would answer the next test's session change.
  afterEach(() => {
    pinia._e.stop()
  })

  it('remembers the last path of each perspective', () => {
    const store = usePerspectiveStore()
    store.savePath('/dashboards', '/dashboards/42')

    expect(store.getLastPath('/dashboards')).toBe('/dashboards/42')
    expect(store.getLastPath('/logs')).toBeNull()
  })

  it('forgets the previous account paths when the session changes', async () => {
    const store = usePerspectiveStore()
    store.savePath('/dashboards', '/dashboards/42')

    sessionGuid.value = null
    sessionGuid.value = 'session-b'
    await flushPromises()

    expect(store.getLastPath('/dashboards')).toBeNull()
  })
})
