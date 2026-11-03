import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'

function mountState(props) {
  return mount(MutationErrorState, { props, global: { plugins: [PrimeVue] } })
}

describe('MutationErrorState', () => {
  it('renders nothing when there is no error', () => {
    expect(mountState({ error: null }).html()).toBe('<!--v-if-->')
  })

  it('shows the message from an error object', () => {
    const wrapper = mountState({ error: { message: 'Name already in use' } })
    expect(wrapper.text()).toContain('Name already in use')
    expect(wrapper.findComponent(RestrictedState).exists()).toBe(false)
  })

  it('accepts a plain string', () => {
    expect(mountState({ error: 'Invalid configuration.' }).text()).toContain(
      'Invalid configuration.',
    )
  })

  it('falls back when an error object carries no message', () => {
    expect(mountState({ error: {} }).text()).toContain('The change could not be saved.')
  })

  it('renders a 403 through RestrictedState and names the right', () => {
    const wrapper = mountState({
      error: { status: 403, message: 'Forbidden' },
      right: 'manageUsers',
    })
    const restricted = wrapper.findComponent(RestrictedState)

    expect(restricted.exists()).toBe(true)
    expect(restricted.props('compact')).toBe(true)
    expect(restricted.props('right')).toBe('manageUsers')
    expect(wrapper.text()).not.toContain('Forbidden')
  })

  // Needs `inheritAttrs: false` plus an explicit bind to survive the branch.
  it('forwards the caller class to whichever branch renders', () => {
    const plain = mount(MutationErrorState, {
      props: { error: 'boom' },
      attrs: { class: 'grid-message' },
      global: { plugins: [PrimeVue] },
    })
    expect(plain.html()).toContain('grid-message')

    const forbidden = mount(MutationErrorState, {
      props: { error: { status: 403 } },
      attrs: { class: 'grid-message' },
      global: { plugins: [PrimeVue] },
    })
    expect(forbidden.html()).toContain('grid-message')
  })
})
