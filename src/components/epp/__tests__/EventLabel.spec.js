import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EventLabel from '@/components/epp/EventLabel.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'

describe('EventLabel', () => {
  it('draws the name after the icon of its severity', () => {
    const wrapper = mount(EventLabel, { props: { name: 'SYS_NODE_DOWN', severity: 4 } })
    expect(wrapper.text()).toBe('SYS_NODE_DOWN')
    expect(wrapper.findComponent(StatusIcon).props('status')).toBe(4)
  })

  it('falls back to the Unknown icon without a severity', () => {
    const wrapper = mount(EventLabel, { props: { name: '#99' } })
    expect(wrapper.findComponent(StatusIcon).props('status')).toBe(5)
  })
})
