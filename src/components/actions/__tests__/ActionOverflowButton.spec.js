import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ActionOverflowButton from '@/components/actions/ActionOverflowButton.vue'

describe('ActionOverflowButton', () => {
  // PrimeVue's `.p-button-icon-only.p-button-rounded` is injected later and wins a tie on
  // specificity, turning the button into an ellipse.
  it('renders the classes the square-sizing rule depends on', () => {
    const wrapper = mount(ActionOverflowButton, { global: { plugins: [PrimeVue] } })
    expect(wrapper.get('button').classes()).toEqual(
      expect.arrayContaining(['p-button-icon-only', 'p-button-rounded']),
    )
  })

  // Tree rows take the button out of the tab order on every row but the one holding the
  // tree's tab stop, which only works if the attribute survives the PrimeVue Button.
  it('passes tabindex through to the rendered button', () => {
    const wrapper = mount(ActionOverflowButton, {
      attrs: { tabindex: -1 },
      global: { plugins: [PrimeVue] },
    })
    expect(wrapper.get('button').attributes('tabindex')).toBe('-1')
  })
})
