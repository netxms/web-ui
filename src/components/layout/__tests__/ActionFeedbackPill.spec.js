import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ActionFeedbackPill from '@/components/layout/ActionFeedbackPill.vue'
import { notifyAction } from '@/utils/notify'

describe('ActionFeedbackPill', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows nothing until an action reports one', () => {
    const wrapper = mount(ActionFeedbackPill)
    expect(wrapper.find('.action-pill').exists()).toBe(false)
  })

  it('shows the message an action reports, with its icon', async () => {
    const wrapper = mount(ActionFeedbackPill)
    notifyAction('3 rules copied from Main', 'pi pi-copy')
    await nextTick()
    expect(wrapper.find('.action-pill').text()).toBe('3 rules copied from Main')
    expect(wrapper.find('.action-pill i').classes()).toContain('pi-copy')
  })

  it('replaces the message rather than stacking, and restarts the timer', async () => {
    const wrapper = mount(ActionFeedbackPill)
    notifyAction('1 rule copied')
    await nextTick()
    vi.advanceTimersByTime(2000)
    notifyAction('2 rules copied')
    await nextTick()
    expect(wrapper.findAll('.action-pill')).toHaveLength(1)
    expect(wrapper.find('.action-pill').text()).toBe('2 rules copied')

    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(wrapper.find('.action-pill').exists()).toBe(true)
  })

  it('goes away on its own', async () => {
    const wrapper = mount(ActionFeedbackPill)
    notifyAction('1 rule cut')
    await nextTick()
    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(wrapper.find('.action-pill').exists()).toBe(false)
  })

  it('stops listening once unmounted', async () => {
    const wrapper = mount(ActionFeedbackPill)
    wrapper.unmount()
    expect(() => notifyAction('1 rule copied')).not.toThrow()
  })
})
