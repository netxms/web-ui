import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
  messages,
  setStatus,
  markOpened,
  refetch,
  toastAdd,
  request,
  report,
  ContextMenuStub,
  mountTab,
  dataRows,
  rowOf,
  menuFor,
  resetHarness,
} from './aiMessagesTabHarness'
import AppTable from '@/components/common/AppTable.vue'

beforeEach(resetHarness)
afterEach(() => {
  vi.useRealTimers()
})

describe('AiMessagesTab list', () => {
  it('puts undecided requests on top, then the newest', () => {
    const titles = dataRows(mountTab()).map((tr) => tr.text())

    expect(titles[0]).toContain('Restart the agent')
    expect(titles[1]).toContain('Disk filling up')
    expect(titles[2]).toContain('Weekly report')
  })

  it('shows a read request as still awaiting a decision', () => {
    messages.value = [{ ...request, status: 'read' }]

    expect(rowOf(mountTab(), 'Restart the agent').text()).toContain('Awaiting decision')
  })

  it('marks unread rows, which a read one is not', () => {
    const wrapper = mountTab()

    expect(rowOf(wrapper, 'Disk filling up').classes()).toContain('row--unread')
    expect(rowOf(wrapper, 'Weekly report').classes()).not.toContain('row--unread')
  })

  it('hides the ID column until it is asked for', () => {
    const labels = mountTab()
      .findAll('thead th')
      .map((th) => th.text())

    expect(labels).not.toContain('ID')
    expect(labels).toContain('Status')
  })

  it('refetches from the toolbar button', async () => {
    const wrapper = mountTab()

    await wrapper.find('button[aria-label="Refresh"]').trigger('click')

    expect(refetch).toHaveBeenCalledOnce()
  })

  it('says when there is nothing yet, and when the filter hides everything', async () => {
    messages.value = []
    const wrapper = mountTab()
    expect(wrapper.find('.table-empty').text()).toContain('appear here until they expire')

    messages.value = [report]
    wrapper.vm.$.setupState.viewFilter = 'waiting'
    await nextTick()

    expect(wrapper.find('.table-empty').text()).toBe('No messages match the filter.')
  })

  it('filters on what is on screen, not on the hidden task prompt', async () => {
    const wrapper = mountTab()

    wrapper.vm.$.setupState.filterState = { text: 'stopped answering', tokens: [] }
    await nextTick()
    expect(wrapper.find('.table-empty').exists()).toBe(false)

    wrapper.vm.$.setupState.filterState = { text: 'recovery playbook', tokens: [] }
    await nextTick()
    expect(wrapper.find('.table-empty').text()).toBe('No messages match the filter.')
  })
})

describe('AiMessagesTab marking as read', () => {
  it('marks an open unread message after three seconds, not before', async () => {
    const wrapper = mountTab()
    await rowOf(wrapper, 'Disk filling up').trigger('click')

    vi.advanceTimersByTime(2999)
    expect(markOpened).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(markOpened).toHaveBeenCalledWith({ messageId: 3, status: 'read' })
  })

  it('leaves a message unread when the panel moves on or closes first', async () => {
    const wrapper = mountTab()
    await rowOf(wrapper, 'Disk filling up').trigger('click')
    vi.advanceTimersByTime(2000)

    await rowOf(wrapper, 'Weekly report').trigger('click')
    vi.advanceTimersByTime(5000)
    expect(markOpened).not.toHaveBeenCalled()

    await rowOf(wrapper, 'Disk filling up').trigger('click')
    await rowOf(wrapper, 'Disk filling up').trigger('click')
    vi.advanceTimersByTime(5000)
    expect(markOpened).not.toHaveBeenCalled()
  })

  it('does not fire after the tab is gone', async () => {
    const wrapper = mountTab()
    await rowOf(wrapper, 'Disk filling up').trigger('click')

    wrapper.unmount()
    vi.advanceTimersByTime(5000)

    expect(markOpened).not.toHaveBeenCalled()
  })

  it('leaves an already read message alone', async () => {
    const wrapper = mountTab()
    await rowOf(wrapper, 'Weekly report').trigger('click')

    vi.advanceTimersByTime(5000)

    expect(markOpened).not.toHaveBeenCalled()
  })
})

describe('AiMessagesTab context menu', () => {
  const labels = (items) => items.map((item) => item.label)

  it('offers a decision only on a request that needs one', async () => {
    const wrapper = mountTab()

    expect(labels(await menuFor(wrapper, 'Restart the agent'))).toEqual([
      'Approve',
      'Reject',
      'Mark as read',
      'Delete',
    ])
    expect(labels(await menuFor(wrapper, 'Weekly report'))).toEqual(['Delete'])
    expect(labels(await menuFor(wrapper, 'Disk filling up'))).toEqual(['Mark as read', 'Delete'])
  })

  it('approves and rejects from the menu', async () => {
    const wrapper = mountTab()

    const items = await menuFor(wrapper, 'Restart the agent')
    items.find((item) => item.label === 'Reject').command()
    await flushPromises()

    expect(setStatus).toHaveBeenCalledWith({ messageId: 1, status: 'rejected' })
    expect(toastAdd.mock.calls[0][0].summary).toBe('Rejected')
  })

  it('opens nothing on a row with no action for this account', async () => {
    messages.value = [{ ...report, isInitiator: false }]
    const wrapper = mountTab()

    expect(await menuFor(wrapper, 'Weekly report')).toEqual([])
    expect(wrapper.findComponent(ContextMenuStub).vm.contextData).toBeNull()
  })

  it('acts on the whole selection, without offering a bulk decision', async () => {
    const wrapper = mountTab()
    wrapper.findComponent(AppTable).vm.$emit('selection-change', new Set([1, 3]))
    await nextTick()

    expect(labels(await menuFor(wrapper, 'Disk filling up'))).toEqual([
      'Mark as read (2)',
      'Delete (2)',
    ])
  })
})

describe('AiMessagesTab selection', () => {
  const actions = (wrapper) => wrapper.findComponent({ name: 'SelectionActions' }).props('actions')

  async function select(wrapper, ids) {
    wrapper.findComponent(AppTable).vm.$emit('selection-change', new Set(ids))
    await nextTick()
  }

  it('offers only what applies, and counts it', async () => {
    const wrapper = mountTab()

    await select(wrapper, [2, 3])

    expect(actions(wrapper).map((action) => action.label)).toEqual([
      'Mark as read (1)',
      'Delete (2)',
    ])
  })

  it('marks only the unread ones and goes on past a failure', async () => {
    setStatus.mockRejectedValueOnce(new Error('Database failure'))
    const wrapper = mountTab()
    await select(wrapper, [1, 2, 3])

    await actions(wrapper)[0].command()
    await flushPromises()

    expect(setStatus.mock.calls.map(([vars]) => vars.messageId).sort()).toEqual([1, 3])
    expect(toastAdd).toHaveBeenCalledOnce()
    expect(toastAdd.mock.calls[0][0].detail).toBe('Database failure')
  })

  it('drops a selected message from the selection when it goes away', async () => {
    const wrapper = mountTab()
    await select(wrapper, [2, 3])

    messages.value = [report, request]
    await nextTick()
    await nextTick()

    expect(wrapper.findComponent({ name: 'SelectionActions' }).props('count')).toBe(1)
  })
})
