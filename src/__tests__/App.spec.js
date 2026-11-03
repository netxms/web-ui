import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import App from '../App.vue'

describe('App', () => {
  it('renders router-view', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), VueQueryPlugin, PrimeVue, ToastService, ConfirmationService],
        stubs: { RouterView: true },
      },
    })
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })
})
