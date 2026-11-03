import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import WelcomeHeader from '@/components/home/WelcomeHeader.vue'

const authUser = ref(null)

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    get user() {
      return authUser.value
    },
  }),
}))

function nameText() {
  return mount(WelcomeHeader).find('.welcome-name').text()
}

describe('WelcomeHeader', () => {
  beforeEach(() => {
    authUser.value = { id: 7, username: 'jdoe' }
  })

  it('greets by the full name the session carries', () => {
    authUser.value = { id: 7, username: 'jdoe', fullName: 'Jane Doe' }
    expect(nameText()).toBe('Jane Doe')
  })

  it('falls back to the login name when the full name is blank', () => {
    authUser.value = { id: 7, username: 'jdoe', fullName: '  ' }
    expect(nameText()).toBe('jdoe')
  })

  // A session stored before the server sent `fullName`, or an older server.
  it('falls back to the login name when the session has no full name', () => {
    expect(nameText()).toBe('jdoe')
  })
})
