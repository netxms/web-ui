// Mocks, stubs and helpers the AiMessagesTab specs share. Its vi.mock calls apply only to what
// loads after it, so a spec imports it before anything that reaches the mocked modules.
import { vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const NOW = Date.parse('2026-11-03T12:00:00Z')

export const messages = ref([])
export const can = ref({})
export const setStatus = vi.fn()
export const markOpened = vi.fn()
export const removeMessage = vi.fn()
export const refetch = vi.fn()
export const toastAdd = vi.fn()
export const confirmRequire = vi.fn()

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
export const request = {
  ...base,
  id: 1,
  type: 'approvalRequest',
  status: 'pending',
  title: 'Restart the agent',
  text: 'The agent stopped answering.',
  relatedObjectId: 10,
  spawnTaskData: { userPrompt: 'Run the recovery playbook.' },
}
export const report = {
  ...base,
  id: 2,
  type: 'informational',
  status: 'read',
  title: 'Weekly report',
}
const alert = {
  ...base,
  id: 3,
  type: 'alert',
  status: 'pending',
  title: 'Disk filling up',
  creationTime: '2026-11-03T11:00:00Z',
}

export const ContextMenuStub = {
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

export function mountTab() {
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

export const dataRows = (wrapper) => wrapper.findAll('tbody tr')
export const rowOf = (wrapper, title) => dataRows(wrapper).find((tr) => tr.text().includes(title))
export const panel = (wrapper) => wrapper.find('.record-panel')
export const footerLabels = (wrapper) =>
  wrapper.findAll('.record-footer button').map((b) => b.text())
export const footerButton = (wrapper, label) =>
  wrapper.findAll('.record-footer button').find((b) => b.text() === label)

export async function menuFor(wrapper, title) {
  const tr = rowOf(wrapper, title)
  await tr.trigger('contextmenu')
  await nextTick()
  return wrapper.findComponent(ContextMenuStub).props('items')
}

export function resetHarness() {
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
}
