import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import InfoCard from '@/components/objects/InfoCard.vue'

function mountCard() {
  return mount(InfoCard, {
    props: { title: 'Identity', summary: '#182 / Node' },
    slots: { default: '<p class="body">content</p>' },
    global: { plugins: [PrimeVue] },
  })
}

describe('InfoCard', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('toggles when the header bar itself is clicked', async () => {
    const wrapper = mountCard()
    expect(wrapper.classes()).not.toContain('info-card-collapsed')
    await wrapper.get('.p-panel-header').trigger('click')
    expect(wrapper.classes()).toContain('info-card-collapsed')
    await wrapper.get('.info-card-summary').trigger('click')
    expect(wrapper.classes()).not.toContain('info-card-collapsed')
  })

  // The toggle button bubbles into the header; handling it twice would cancel out.
  it('toggles exactly once when the toggle button is clicked', async () => {
    const wrapper = mountCard()
    await wrapper.get('.p-panel-toggle-button').trigger('click')
    expect(wrapper.classes()).toContain('info-card-collapsed')
  })
})
