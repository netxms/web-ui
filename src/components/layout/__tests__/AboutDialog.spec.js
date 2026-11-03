import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import AboutDialog from '@/components/layout/AboutDialog.vue'

const state = vi.hoisted(() => ({ manifest: null, vendor: false }))

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

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { username: 'admin' } }),
}))

vi.mock('@/queries/useServerQueries', async () => {
  const { ref } = await import('vue')
  return {
    useServerInfo: () => ({
      data: ref({ name: 'srv1', version: '5.2.3', build: '123', id: 'abc' }),
    }),
  }
})

const NETXMS_BRAND = {
  productName: 'NetXMS',
  logo: { color: '/netxms-logo.png', white: '/netxms-logo.png' },
  about: { productLine: 'NetXMS Management Console', copyright: null },
  whatsNew: true,
}
const CLIENT_BRAND = {
  productName: 'Acme Monitor',
  logo: { color: '/brand-color.svg', white: '/brand-white.svg' },
  about: { productLine: 'Acme Monitor', copyright: null },
  whatsNew: false,
}

const DialogStub = {
  props: ['header'],
  template: '<div><h2 class="dialog-header">{{ header }}</h2><slot /><slot name="footer" /></div>',
}

const mountAbout = () =>
  mount(AboutDialog, { global: { plugins: [PrimeVue], stubs: { Dialog: DialogStub } } })

// The template's &copy;, by code point to keep this file ASCII.
const COPYRIGHT_SIGN = String.fromCharCode(0xa9)
const copyrightLines = (wrapper) =>
  wrapper
    .findAll('.about-details .about-copyright p')
    .map((line) => line.text().replace(COPYRIGHT_SIGN, '(c)'))

describe('AboutDialog brand', () => {
  it('stays as it was for the NetXMS brand', () => {
    state.manifest = NETXMS_BRAND
    state.vendor = false
    const wrapper = mountAbout()
    expect(wrapper.find('.dialog-header').text()).toBe('About NetXMS')
    expect(wrapper.find('.about-product').text()).toBe('NetXMS Management Console 0.0.0-test')
    expect(copyrightLines(wrapper)).toEqual(['Copyright (c) 2003-2026 Raden Solutions'])
    expect(wrapper.find('.about-details .about-changelog').exists()).toBe(true)
    expect(wrapper.find('.about-vendor').exists()).toBe(false)
  })

  it('leads with the client brand and credits NetXMS below while the mark is on', () => {
    state.manifest = CLIENT_BRAND
    state.vendor = true
    const wrapper = mountAbout()
    expect(wrapper.find('.dialog-header').text()).toBe('About Acme Monitor')
    expect(wrapper.find('.about-logo').attributes('src')).toBe('/brand-color.svg')
    expect(wrapper.find('.about-product').text()).toBe('Acme Monitor 0.0.0-test')
    expect(wrapper.find('.about-details .about-changelog').exists()).toBe(false)
    const vendor = wrapper.find('.about-vendor')
    expect(vendor.text()).toContain('Built on NetXMS')
    expect(vendor.find('.about-changelog').exists()).toBe(true)
  })

  it('drops every NetXMS reference when the mark is off and keeps the copyright', () => {
    state.manifest = CLIENT_BRAND
    state.vendor = false
    const wrapper = mountAbout()
    expect(wrapper.find('.about-vendor').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('NetXMS')
    expect(copyrightLines(wrapper)).toEqual(['Copyright (c) 2003-2026 Raden Solutions'])
  })

  it('puts a client copyright line above the software copyright', () => {
    state.manifest = { ...CLIENT_BRAND, about: { productLine: 'X', copyright: '2026 Acme Corp' } }
    state.vendor = false
    expect(copyrightLines(mountAbout())).toEqual([
      'Copyright (c) 2026 Acme Corp',
      'Copyright (c) 2003-2026 Raden Solutions',
    ])
  })
})
