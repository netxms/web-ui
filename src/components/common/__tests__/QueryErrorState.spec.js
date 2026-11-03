import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import QueryErrorState from '@/components/common/QueryErrorState.vue'

describe('QueryErrorState', () => {
  it('renders the error message', () => {
    const wrapper = mount(QueryErrorState, {
      props: { error: { message: 'Request failed: 500' } },
    })
    expect(wrapper.text()).toContain('Request failed: 500')
  })

  it('falls back to a default message when no error or message is given', () => {
    const wrapper = mount(QueryErrorState)
    expect(wrapper.text()).toContain('Failed to load data')
  })

  it('prefers the explicit message prop over the error message', () => {
    const wrapper = mount(QueryErrorState, {
      props: { error: { message: 'Request failed: 500' }, message: 'Could not load interfaces' },
    })
    expect(wrapper.text()).toContain('Could not load interfaces')
    expect(wrapper.text()).not.toContain('Request failed: 500')
  })

  it('emits retry when the Retry button is clicked', async () => {
    const wrapper = mount(QueryErrorState)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
