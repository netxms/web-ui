// Mocks, stubs and helpers the AlarmTable specs share. Its vi.mock calls apply only to what
// loads after it, so a spec imports it before anything that reaches the mocked modules.
import { vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import AlarmTable from '../AlarmTable.vue'
import { clearWorkingState } from '@/composables/useWorkingState'

export const run = vi.fn()
const push = vi.fn()
export const executeTool = vi.fn()
export const sendMessage = vi.fn()
export const notifyNotImplemented = vi.fn()
export const downloadCsv = vi.fn()
export const writeText = vi.fn(() => Promise.resolve())

export const sourceObjects = ref(new Map())
export const objectsById = ref(new Map())
export const lastObjectLookup = ref([])
export const dciId = ref(0)
export const serverOptions = ref({})
export const aiAvailable = ref(false)
export const isAiChatOpen = ref(false)
export const objectMenuItems = ref([])
export const menuObjectId = ref(null)
export const tools = ref([])

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/router', () => ({
  default: { resolve: () => ({ href: '/resolved' }), push: vi.fn(), replace: vi.fn() },
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))

vi.mock('@/queries/useAlarmQueries', () => ({
  useAlarmBulkAction: () => ({
    mutateAsync: async (args) => {
      run(args)
      return { succeeded: args.ids, failed: [] }
    },
  }),
  useAlarmSourceObjects: () => ({ data: sourceObjects }),
  useAlarmDci: () => ({ data: dciId }),
}))
vi.mock('@/queries/useServerQueries', () => ({
  useServerInfo: () => ({ data: computed(() => ({ options: serverOptions.value })) }),
}))
vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: (ids) => ({
    objectsById: computed(() => {
      lastObjectLookup.value = ids.value
      return objectsById.value
    }),
  }),
  useZoneNames: () => computed(() => new Map([[2, 'Branch']])),
}))
vi.mock('@/queries/useObjectToolQueries', () => ({
  useObjectToolsForObject: () => ({ data: tools, isLoading: ref(false) }),
  useObjectToolIcons: () => ({ iconByToolId: ref(new Map()) }),
}))
vi.mock('@/composables/useObjectActionMenu', () => ({
  useObjectActionMenu: () => ({
    objectId: menuObjectId,
    object: ref(null),
    isLoading: ref(false),
    menuItems: objectMenuItems,
  }),
}))
vi.mock('@/composables/useToolExecution', () => ({
  useToolExecution: () => ({ executeTool }),
}))
vi.mock('@/composables/useAiChat', () => ({
  useAiChat: () => ({ sendMessage, isThinking: ref(false) }),
}))
vi.mock('@/composables/useLayout', () => ({ useLayout: () => ({ isAiChatOpen }) }))
vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({ has: () => aiAvailable.value }),
}))
vi.mock('@/utils/notImplemented', () => ({
  notifyNotImplemented: (...args) => notifyNotImplemented(...args),
}))
vi.mock('@/utils/csvExport', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: (...args) => downloadCsv(...args),
}))

const FilterStub = defineComponent({
  props: ['modelValue', 'filterDefs', 'placeholder', 'size'],
  emits: ['update:modelValue'],
  template: `<input
    class="filter-stub"
    :value="modelValue.text"
    @input="$emit('update:modelValue', { text: $event.target.value, tokens: [] })"
  />`,
})

export const MenuStub = defineComponent({
  name: 'ActionContextMenu',
  props: ['items'],
  methods: { show() {}, hide() {} },
  template: '<div class="menu-stub" />',
})

export const ToolDialogStub = defineComponent({
  name: 'ToolInputDialog',
  props: ['visible', 'toolName', 'inputFields'],
  emits: ['update:visible', 'submit', 'cancel'],
  template: '<div class="tool-dialog-stub" />',
})

export const IconStub = defineComponent({
  name: 'ObjectIcon',
  props: ['object'],
  template: '<i class="object-icon-stub" />',
})

export function alarm(id, state, extra = {}) {
  return {
    id,
    severity: 2,
    state,
    source: 10 + id,
    sourceName: `node-${id}`,
    zoneUIN: 0,
    message: `Message ${id}`,
    ...extra,
  }
}

export const ALARMS = [alarm(1, 0), alarm(2, 0), alarm(3, 1), alarm(4, 2)]

export function mountTable(props = {}) {
  return mount(AlarmTable, {
    props: { alarms: ALARMS, ...props },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: {} },
      stubs: {
        SmartFilterInput: FilterStub,
        ColumnChooser: true,
        RefetchIndicator: true,
        ActionContextMenu: MenuStub,
        ToolInputDialog: ToolDialogStub,
        CreateIncidentDialog: true,
        ObjectIcon: IconStub,
        Paginator: true,
      },
      config: {
        globalProperties: {
          $plural: (count, singular) => `${count} ${singular}${count === 1 ? '' : 's'}`,
          $route: { path: '/alarms', params: {} },
        },
      },
    },
  })
}

/** Index 0 of the wrappers is the select-all in the header. */
const rowCheckboxes = (wrapper) =>
  wrapper.findAll('.app-table__checkbox-td .app-table__checkbox-wrap')
export const dataRows = (wrapper) => wrapper.findAll('tbody tr:not(.app-table__expansion-row)')

export async function select(wrapper, ...indexes) {
  for (const index of indexes) await rowCheckboxes(wrapper)[index].trigger('click')
}

export function selectionButton(wrapper, label) {
  return wrapper
    .findAll('.selection-actions button')
    .find((button) => button.attributes('aria-label') === label)
}

export async function openMenu(wrapper, index) {
  await dataRows(wrapper)[index].trigger('contextmenu')
  await flushPromises()
  return wrapper.findComponent(MenuStub).props('items')
}

export const labels = (items) => items.filter((item) => !item.separator).map((item) => item.label)
export const item = (items, id) => items.find((entry) => entry.id === id)

export function resetHarness() {
  setActivePinia(createPinia())
  localStorage.clear()
  clearWorkingState()
  vi.clearAllMocks()
  sourceObjects.value = new Map()
  objectsById.value = new Map()
  dciId.value = 0
  serverOptions.value = {}
  aiAvailable.value = false
  isAiChatOpen.value = false
  objectMenuItems.value = []
  menuObjectId.value = null
  tools.value = []
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}
