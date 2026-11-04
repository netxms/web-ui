import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'

function mountState(props = {}) {
  return mount(EntityDetailState, { props, global: { plugins: [PrimeVue] } })
}

const title = (wrapper) => wrapper.findComponent(EntityDetailHeader).props('title')

describe('EntityDetailState', () => {
  it('shows a loading header and placeholder', () => {
    const wrapper = mountState({ loading: true, error: { message: 'stale' } })

    expect(title(wrapper)).toBe('Loading…')
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findComponent(QueryErrorState).exists()).toBe(false)
  })

  it('shows the error with a retry that is passed on', async () => {
    const wrapper = mountState({ error: { message: 'Request failed: 500' } })

    expect(title(wrapper)).toBe('Error')
    expect(wrapper.text()).toContain('Request failed: 500')

    wrapper.findComponent(QueryErrorState).vm.$emit('retry')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('says what was not found', () => {
    const wrapper = mountState({ notFoundText: 'Action not found.' })

    expect(title(wrapper)).toBe('Not Found')
    expect(wrapper.text()).toContain('Action not found.')
  })

  it('names the missing right instead of any other state', () => {
    const wrapper = mountState({
      loading: true,
      restrictedRight: 'manageActions',
      restrictedTitle: 'New Action',
      restrictedSubtitle: 'Server Action',
    })

    expect(title(wrapper)).toBe('New Action')
    expect(wrapper.findComponent(RestrictedState).props('right')).toBe('manageActions')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('emits back from the header in every state', () => {
    for (const props of [
      { loading: true },
      { error: { message: 'x' } },
      {},
      { restrictedRight: 'manageActions', restrictedTitle: 'New Action' },
    ]) {
      const wrapper = mountState(props)
      wrapper.findComponent(EntityDetailHeader).vm.$emit('back')
      expect(wrapper.emitted('back')).toHaveLength(1)
    }
  })
})
