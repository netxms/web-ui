import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/serverApi', () => ({ getServerStatus: async () => false }))

const { useConnectionStore, FAST_ATTEMPTS } = await import('@/stores/connectionStore')
const { default: ReconnectingToast } = await import('@/components/layout/ReconnectingToast.vue')

const stubs = { ProgressSpinner: true, Transition: false }

describe('ReconnectingToast', () => {
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => pinia._e.stop())

  it('counts attempts against the fast-phase limit', async () => {
    const store = useConnectionStore()
    store.isReconnecting = true
    store.attemptCount = 4
    const wrapper = mount(ReconnectingToast, { global: { plugins: [pinia], stubs } })

    expect(wrapper.text()).toContain(`Attempt 4 of ${FAST_ATTEMPTS}`)
  })

  it('drops the countdown once the probe backs off', async () => {
    const store = useConnectionStore()
    store.isReconnecting = true
    store.attemptCount = FAST_ATTEMPTS
    const wrapper = mount(ReconnectingToast, { global: { plugins: [pinia], stubs } })

    expect(wrapper.text()).not.toContain('Attempt')
    expect(wrapper.text()).toContain('Still trying')
    expect(wrapper.find('.reconnect-progress-fill--indeterminate').exists()).toBe(true)
  })
})
