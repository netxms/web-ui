import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useSessionSync } from '@/composables/useSessionSync'

const reload = vi.fn()
vi.mock('@/utils/navigation', () => ({ reloadPage: () => reload() }))

// Torn down after each test, or the `storage` listeners pile up across tests.
let mounted = []

function host(router, authStore) {
  const wrapper = mount({
    setup() {
      useSessionSync(router, authStore)
      return () => null
    },
  })
  mounted.push(wrapper)
  return wrapper
}

function makeRouter(currentName = 'home') {
  return {
    push: vi.fn(),
    currentRoute: ref({ name: currentName }),
  }
}

function makeAuthStore(guid = 'session-a') {
  const sessionGuid = ref(guid)
  return {
    sessionGuid,
    clearSession: vi.fn(() => {
      sessionGuid.value = null
    }),
  }
}

// The browser fires this only in other tabs, so it is synthesised.
function fireStorage({ key, newValue = null, storageArea = localStorage }) {
  const event = new Event('storage')
  Object.assign(event, { key, newValue, storageArea })
  window.dispatchEvent(event)
  return event
}

beforeEach(() => {
  localStorage.clear()
  reload.mockClear()
})

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted = []
  vi.restoreAllMocks()
})

describe('useSessionSync', () => {
  it('clears the session and routes to login when another tab logs out', () => {
    const router = makeRouter()
    const auth = makeAuthStore()
    host(router, auth)

    fireStorage({ key: 'sessionGuid', newValue: null })

    expect(auth.clearSession).toHaveBeenCalledOnce()
    expect(router.push).toHaveBeenCalledWith({ name: 'login' })
  })

  it('does not redirect when already on the login route', () => {
    const router = makeRouter('login')
    const auth = makeAuthStore()
    host(router, auth)

    fireStorage({ key: 'sessionGuid', newValue: null })

    expect(auth.clearSession).toHaveBeenCalledOnce()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('is a no-op when this tab already has no session', () => {
    const router = makeRouter('login')
    const auth = makeAuthStore(null)
    host(router, auth)

    fireStorage({ key: 'sessionGuid', newValue: null })

    expect(auth.clearSession).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('treats localStorage.clear() (key === null) as the session going away', () => {
    const router = makeRouter()
    const auth = makeAuthStore()
    host(router, auth)

    // localStorage is already empty, so the session key reads back as null.
    fireStorage({ key: null })

    expect(auth.clearSession).toHaveBeenCalledOnce()
    expect(router.push).toHaveBeenCalledWith({ name: 'login' })
  })

  it('reloads when another tab logs in as a different user', () => {
    const router = makeRouter()
    const auth = makeAuthStore('session-a')
    host(router, auth)

    fireStorage({ key: 'sessionGuid', newValue: 'session-b' })

    expect(reload).toHaveBeenCalledOnce()
    expect(auth.clearSession).not.toHaveBeenCalled()
  })

  it('ignores a write that re-affirms the session this tab already holds', () => {
    const router = makeRouter()
    const auth = makeAuthStore('session-a')
    host(router, auth)

    fireStorage({ key: 'sessionGuid', newValue: 'session-a' })

    expect(reload).not.toHaveBeenCalled()
    expect(auth.clearSession).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('ignores unrelated keys and sessionStorage writes', () => {
    const router = makeRouter()
    const auth = makeAuthStore()
    host(router, auth)

    fireStorage({ key: 'theme', newValue: 'dark' })
    fireStorage({ key: 'sessionGuid', newValue: null, storageArea: sessionStorage })

    expect(auth.clearSession).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('stops listening once the component is unmounted', () => {
    const router = makeRouter()
    const auth = makeAuthStore()
    const wrapper = host(router, auth)

    wrapper.unmount()
    fireStorage({ key: 'sessionGuid', newValue: null })

    expect(auth.clearSession).not.toHaveBeenCalled()
  })
})
