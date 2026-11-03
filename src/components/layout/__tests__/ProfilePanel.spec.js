import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive } from 'vue'
import { mount } from '@vue/test-utils'

// The real auth store needs a vue-query injection context at setup.
const user = ref(null)
const authStoreStub = reactive({ user, logout: () => {} })
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => authStoreStub,
}))

const ProfilePanel = (await import('@/components/layout/ProfilePanel.vue')).default

beforeEach(() => {
  user.value = null
})

function mountPanel() {
  return mount(ProfilePanel, {
    global: {
      stubs: {
        Popover: { template: '<div><slot /></div>' },
        Button: true,
        RouterLink: true,
      },
      mocks: { $router: { push() {} } },
    },
  })
}

describe('ProfilePanel identity block', () => {
  it('derives the avatar initial from the username', () => {
    user.value = { id: 1, username: 'admin' }
    expect(mountPanel().text()).toContain('A')
  })

  it('renders the username exactly once', () => {
    user.value = { id: 1, username: 'admin' }
    const matches = mountPanel().text().match(/admin/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('falls back to a placeholder when no user is loaded', () => {
    user.value = null
    expect(mountPanel().text()).toContain('?')
  })
})
