import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
  messages,
  can,
  setStatus,
  removeMessage,
  toastAdd,
  confirmRequire,
  request,
  report,
  mountTab,
  rowOf,
  panel,
  footerLabels,
  footerButton,
  resetHarness,
} from './aiMessagesTabHarness'

beforeEach(resetHarness)
afterEach(() => {
  vi.useRealTimers()
})

describe('AiMessagesTab panel', () => {
  it('stays closed until a row is clicked', async () => {
    const wrapper = mountTab()
    expect(panel(wrapper).classes()).not.toContain('is-open')

    await rowOf(wrapper, 'Restart the agent').trigger('click')

    expect(panel(wrapper).classes()).toContain('is-open')
    expect(wrapper.find('.message-title').text()).toBe('Restart the agent')
  })

  it('offers a decision only on a request that needs one', async () => {
    const wrapper = mountTab()

    await rowOf(wrapper, 'Restart the agent').trigger('click')
    expect(footerLabels(wrapper)).toEqual(['Delete', 'Reject', 'Approve'])

    await rowOf(wrapper, 'Weekly report').trigger('click')
    expect(footerLabels(wrapper)).toEqual(['Delete'])
  })

  it('still offers a decision after the request has been read', async () => {
    messages.value = [{ ...request, status: 'read' }]
    const wrapper = mountTab()

    await rowOf(wrapper, 'Restart the agent').trigger('click')

    expect(footerLabels(wrapper)).toContain('Approve')
  })

  it('does not show the task prompt', async () => {
    const wrapper = mountTab()

    await rowOf(wrapper, 'Restart the agent').trigger('click')

    expect(wrapper.find('.message-text').text()).toBe('The agent stopped answering.')
    expect(wrapper.find('.message-section').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('recovery playbook')
  })

  it('renders the text as markdown', async () => {
    messages.value = [{ ...request, text: 'Restart **now**' }]
    const wrapper = mountTab()

    await rowOf(wrapper, 'Restart the agent').trigger('click')

    expect(wrapper.find('.message-text strong').text()).toBe('now')
  })

  it('takes the buttons away and names the outcome once decided', async () => {
    const wrapper = mountTab()
    await rowOf(wrapper, 'Restart the agent').trigger('click')

    await footerButton(wrapper, 'Approve').trigger('click')
    await flushPromises()

    expect(setStatus).toHaveBeenCalledWith({ messageId: 1, status: 'approved' })
    expect(footerLabels(wrapper)).toEqual(['Delete'])
    expect(wrapper.find('.record-list').text()).toContain('Approved')
    expect(toastAdd.mock.calls[0][0]).toMatchObject({ severity: 'success', summary: 'Approved' })
    expect(toastAdd.mock.calls[0][0].detail).toContain('AI task')
  })

  it('does not claim a task for a request that starts none', async () => {
    messages.value = [{ ...request, spawnTaskData: undefined }]
    const wrapper = mountTab()
    await rowOf(wrapper, 'Restart the agent').trigger('click')

    await footerButton(wrapper, 'Approve').trigger('click')
    await flushPromises()

    expect(toastAdd.mock.calls[0][0].detail).toBeUndefined()
  })

  it('explains a request someone else has already decided', async () => {
    setStatus.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }))
    const wrapper = mountTab()
    await rowOf(wrapper, 'Restart the agent').trigger('click')

    await footerButton(wrapper, 'Reject').trigger('click')
    await flushPromises()

    expect(toastAdd.mock.calls[0][0]).toMatchObject({
      severity: 'error',
      summary: 'Could not reject',
    })
    expect(toastAdd.mock.calls[0][0].detail).toContain('already approved or rejected')
  })

  it('removes the buttons when the deadline passes while it is open', async () => {
    messages.value = [{ ...request, expirationTime: '2026-11-03T12:00:20Z' }]
    const wrapper = mountTab()
    await rowOf(wrapper, 'Restart the agent').trigger('click')
    expect(footerLabels(wrapper)).toContain('Approve')

    vi.advanceTimersByTime(30 * 1000)
    await nextTick()

    expect(footerLabels(wrapper)).not.toContain('Approve')
  })

  it('stays on a message that has gone, says so, and offers nothing', async () => {
    const wrapper = mountTab()
    await rowOf(wrapper, 'Restart the agent').trigger('click')

    messages.value = [report]
    await nextTick()

    expect(panel(wrapper).classes()).toContain('is-open')
    expect(wrapper.find('.message-title').text()).toBe('Restart the agent')
    expect(wrapper.find('.message-gone').text()).toContain('no longer available')
    expect(wrapper.find('.record-footer').exists()).toBe(false)
  })

  it('does not call a message gone just because the filter hides it', async () => {
    const wrapper = mountTab()
    await rowOf(wrapper, 'Weekly report').trigger('click')

    wrapper.vm.$.setupState.viewFilter = 'waiting'
    await nextTick()

    expect(rowOf(wrapper, 'Weekly report')).toBeUndefined()
    expect(wrapper.find('.message-gone').exists()).toBe(false)
  })

  it('offers Delete only to those the server would allow', async () => {
    messages.value = [{ ...report, isInitiator: false }]
    const wrapper = mountTab()

    await rowOf(wrapper, 'Weekly report').trigger('click')
    expect(wrapper.find('.record-footer').exists()).toBe(false)

    can.value = { manageAiTasks: true }
    await nextTick()
    expect(footerLabels(wrapper)).toEqual(['Delete'])
  })

  it('confirms a delete, says who it affects, and closes the panel', async () => {
    messages.value = [report]
    removeMessage.mockImplementation(async ({ messageId }) => {
      messages.value = messages.value.filter((m) => m.id !== messageId)
    })
    const wrapper = mountTab()
    await rowOf(wrapper, 'Weekly report').trigger('click')

    await footerButton(wrapper, 'Delete').trigger('click')
    expect(removeMessage).not.toHaveBeenCalled()
    const dialog = confirmRequire.mock.calls[0][0]
    expect(dialog.message).toContain('for everyone who received it')

    await dialog.accept()
    await flushPromises()

    expect(removeMessage).toHaveBeenCalledWith({ messageId: 2 })
    expect(panel(wrapper).classes()).not.toContain('is-open')
  })
})
