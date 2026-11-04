import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import AppTable from '@/components/common/AppTable.vue'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const NOW = Date.parse('2026-11-03T12:00:00Z')

const messages = ref([])
const can = ref({})
const setStatus = vi.fn()
const markOpened = vi.fn()
const removeMessage = vi.fn()
const refetch = vi.fn()
const toastAdd = vi.fn()
const confirmRequire = vi.fn()

vi.mock('@/queries/useAiQueries', () => {
  // The tab's first status mutation marks an opened message read, the second acts on request.
  let statusCalls = 0
  return {
    useAiMessages: () => ({
      data: messages,
      isLoading: ref(false),
      isFetching: ref(false),
      error: ref(null),
      refetch,
    }),
    useSetAiMessageStatus: () =>
      statusCalls++ % 2 === 0
        ? { mutate: markOpened }
        : { mutateAsync: setStatus, isPending: ref(false) },
    useDeleteAiMessage: () => ({ mutateAsync: removeMessage, isPending: ref(false) }),
  }
})

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: () => ({
    objectsById: ref(new Map([[10, { id: 10, name: 'web-server-02', class: 'Node' }]])),
  }),
}))

vi.mock('@/composables/usePermissions', () => ({ usePermissions: () => ({ can }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))

const AiMessagesTab = (await import('@/components/ai/AiMessagesTab.vue')).default

const base = {
  relatedObjectId: 0,
  isInitiator: true,
  creationTime: '2026-11-03T10:00:00Z',
  expirationTime: '2026-11-04T10:00:00Z',
  text: 'Message text',
}
const request = {
  ...base,
  id: 1,
  type: 'approvalRequest',
  status: 'pending',
  title: 'Restart the agent',
  text: 'The agent stopped answering.',
  relatedObjectId: 10,
  spawnTaskData: { userPrompt: 'Run the recovery playbook.' },
}
const report = { ...base, id: 2, type: 'informational', status: 'read', title: 'Weekly report' }
const alert = {
  ...base,
  id: 3,
  type: 'alert',
  status: 'pending',
  title: 'Disk filling up',
  creationTime: '2026-11-03T11:00:00Z',
}

const ContextMenuStub = {
  name: 'EntityContextMenu',
  props: ['items'],
  data: () => ({ contextData: null }),
  methods: {
    show(_event, row) {
      this.contextData = row
    },
  },
  template: '<div />',
}

function mountTab() {
  return mount(AiMessagesTab, {
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      mocks: { $plural: (n, word) => `${n} ${n === 1 ? word : `${word}s`}` },
      stubs: {
        AppLink: { template: '<a><slot /></a>' },
        ColumnChooser: true,
        EntityContextMenu: ContextMenuStub,
        SelectionActions: {
          name: 'SelectionActions',
          props: ['count', 'actions'],
          template: '<div class="selection-actions" />',
        },
        SmartFilterInput: true,
      },
    },
  })
}

const dataRows = (wrapper) => wrapper.findAll('tbody tr')
const rowOf = (wrapper, title) => dataRows(wrapper).find((tr) => tr.text().includes(title))
const panel = (wrapper) => wrapper.find('.record-panel')
const footerLabels = (wrapper) => wrapper.findAll('.record-footer button').map((b) => b.text())
const footerButton = (wrapper, label) =>
  wrapper.findAll('.record-footer button').find((b) => b.text() === label)

async function menuFor(wrapper, title) {
  const tr = rowOf(wrapper, title)
  await tr.trigger('contextmenu')
  await nextTick()
  return wrapper.findComponent(ContextMenuStub).props('items')
}

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW,
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  })
  setActivePinia(createPinia())
  localStorage.clear()
  ;[setStatus, markOpened, removeMessage, refetch, toastAdd, confirmRequire].forEach((mock) =>
    mock.mockReset(),
  )
  setStatus.mockImplementation(async ({ messageId, status }) => {
    messages.value = messages.value.map((m) => (m.id === messageId ? { ...m, status } : m))
  })
  messages.value = [report, request, alert]
  can.value = {}
})

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
