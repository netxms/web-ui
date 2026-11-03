import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import InputOtp from 'primevue/inputotp'
import LoginView from '@/views/auth/LoginView.vue'

const state = vi.hoisted(() => ({ manifest: null, vendor: false, store: null }))

vi.mock('@/brands', () => ({
  get brand() {
    return state.manifest
  },
  get VENDOR_MARK_ENABLED() {
    return state.vendor
  },
  NETXMS_VENDOR: {
    name: 'NetXMS',
    logo: '/netxms-logo.png',
    copyright: '2003-2026 Raden Solutions',
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () =>
    state.store ?? {
      twoFactorStep: null,
      twoFactor: null,
      error: null,
      loading: false,
      login: vi.fn(),
    },
}))

afterEach(() => {
  state.store = null
})

const NETXMS_BRAND = {
  productName: 'NetXMS',
  logo: { color: '/netxms-logo.png', white: '/netxms-logo.png' },
  login: { logo: null },
}
const CLIENT_BRAND = {
  productName: 'Acme Monitor',
  logo: { color: '/brand-color.svg', white: '/brand-white.svg' },
  login: { logo: 'color' },
}

const mountLogin = () => mount(LoginView, { global: { plugins: [PrimeVue] } })

describe('LoginView brand', () => {
  it('keeps the NetXMS title for the NetXMS brand', () => {
    state.manifest = NETXMS_BRAND
    state.vendor = false
    const wrapper = mountLogin()
    expect(wrapper.find('.login-title').text()).toBe('NetXMS')
    expect(wrapper.find('.login-brand-logo').exists()).toBe(false)
    expect(wrapper.find('.login-vendor').exists()).toBe(false)
  })

  it('shows the brand logo and product name for a client brand', () => {
    state.manifest = CLIENT_BRAND
    state.vendor = false
    const wrapper = mountLogin()
    expect(wrapper.find('.login-brand-logo').attributes('src')).toBe('/brand-color.svg')
    expect(wrapper.find('.login-product').text()).toBe('Acme Monitor')
    expect(wrapper.find('.login-title').exists()).toBe(false)
  })

  it('credits NetXMS below the card only while the vendor mark is on', () => {
    state.manifest = CLIENT_BRAND
    state.vendor = true
    expect(mountLogin().find('.login-vendor').text()).toBe('Built on NetXMS')
    state.vendor = false
    const wrapper = mountLogin()
    expect(wrapper.find('.login-vendor').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('NetXMS')
  })
})

describe('LoginView code entry', () => {
  // The field would otherwise open pre-filled with a code that already failed.
  it('clears a rejected code', async () => {
    state.manifest = NETXMS_BRAND
    state.vendor = false
    state.store = {
      twoFactorStep: 'enter-code',
      twoFactor: { method: 'TOTP', qrLabel: null },
      error: null,
      loading: false,
      submitTwoFactorCode: vi.fn().mockResolvedValue(false),
    }
    const wrapper = mountLogin()
    const otp = wrapper.findComponent(InputOtp)

    otp.vm.$emit('update:modelValue', '123456')
    await flushPromises()

    expect(state.store.submitTwoFactorCode).toHaveBeenCalledWith('123456')
    expect(otp.props('modelValue')).toBe('')
  })
})
