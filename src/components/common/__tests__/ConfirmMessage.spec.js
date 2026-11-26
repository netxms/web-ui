import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmMessage from '../ConfirmMessage.vue'

describe('ConfirmMessage', () => {
  it('shows a plain message with its icon, as before', () => {
    const wrapper = mount(ConfirmMessage, {
      props: { options: { message: 'Delete "x"?', icon: 'pi pi-exclamation-triangle' } },
    })
    expect(wrapper.find('.confirm-message__lead').text()).toBe('Delete "x"?')
    expect(wrapper.find('.p-confirmdialog-icon').classes()).toContain('pi-exclamation-triangle')
    expect(wrapper.find('.confirm-message__subject').exists()).toBe(false)
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('shows the subject on its own line and the details as a list', () => {
    const wrapper = mount(ConfirmMessage, {
      props: {
        options: { message: 'Start a new baseline for', subject: 'CPU', details: ['One', 'Two'] },
      },
    })
    expect(wrapper.find('.confirm-message__subject').text()).toBe('CPU')
    expect(wrapper.findAll('li').map((li) => li.text())).toEqual(['One', 'Two'])
    expect(wrapper.find('.p-confirmdialog-icon').exists()).toBe(false)
  })
})
