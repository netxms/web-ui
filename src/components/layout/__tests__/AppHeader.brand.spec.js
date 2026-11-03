import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import { setActivePinia, createPinia } from 'pinia'
import AppHeader from '@/components/layout/AppHeader.vue'

const state = vi.hoisted(() => ({ dark: true, divider: true }))

// AboutDialog is stubbed, but its module still imports the vendor exports.
vi.mock('@/brands', () => ({
  get brand() {
    return {
      productName: 'Acme Monitor',
      logo: { color: '/brand-color.svg', white: '/brand-white.svg' },
      header: { divider: state.divider },
    }
  },
  VENDOR_MARK_ENABLED: false,
  NETXMS_VENDOR: {
    name: 'NetXMS',
    logo: '/netxms-logo.png',
    copyright: '2003-2026 Raden Solutions',
  },
}))

vi.mock('@/composables/useTheme', async () => {
  const { computed } = await import('vue')
  return {
    useTheme: () => ({
      themeIcon: computed(() => 'pi pi-moon'),
      themeLabel: computed(() => 'Switch to dark mode'),
      toggleTheme: () => {},
      isHeaderDark: computed(() => state.dark),
    }),
  }
})

vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({ has: () => false }),
}))

function mountHeader() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(AppHeader, {
    global: {
      plugins: [PrimeVue, pinia],
      directives: { tooltip: Tooltip },
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        ProfilePanel: true,
        AboutDialog: true,
        AiChatPanel: true,
      },
    },
  })
}

describe('AppHeader brand', () => {
  it('uses the white logo on a dark header', () => {
    state.dark = true
    expect(mountHeader().find('.app-header-logo').attributes('src')).toBe('/brand-white.svg')
  })

  it('uses the color logo on a light header', () => {
    state.dark = false
    expect(mountHeader().find('.app-header-logo').attributes('src')).toBe('/brand-color.svg')
  })

  it('names the product and sets it off from a wordmark logo', () => {
    state.divider = true
    const wrapper = mountHeader()
    expect(wrapper.find('.app-header-title').text()).toBe('Acme Monitor')
    expect(wrapper.find('.app-header-divider').exists()).toBe(true)
  })

  it('draws no divider when the brand does not ask for one', () => {
    state.divider = false
    expect(mountHeader().find('.app-header-divider').exists()).toBe(false)
  })

  it('names the theme toggle by what a click does', () => {
    const toggle = mountHeader().find('button[aria-label="Switch to dark mode"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.find('.pi-moon').exists()).toBe(true)
  })
})
