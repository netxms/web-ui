import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import AlarmTable from '../AlarmTable.vue'
import { clearWorkingState } from '@/composables/useWorkingState'

const run = vi.fn()
const push = vi.fn()
const executeTool = vi.fn()
const sendMessage = vi.fn()
const notifyNotImplemented = vi.fn()
const downloadCsv = vi.fn()
const writeText = vi.fn(() => Promise.resolve())

const sourceObjects = ref(new Map())
const objectsById = ref(new Map())
const lastObjectLookup = ref([])
const dciId = ref(0)
const serverOptions = ref({})
const aiAvailable = ref(false)
const isAiChatOpen = ref(false)
const objectMenuItems = ref([])
const menuObjectId = ref(null)
const tools = ref([])

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

const MenuStub = defineComponent({
  name: 'ActionContextMenu',
  props: ['items'],
  methods: { show() {}, hide() {} },
  template: '<div class="menu-stub" />',
})

const ToolDialogStub = defineComponent({
  name: 'ToolInputDialog',
  props: ['visible', 'toolName', 'inputFields'],
  emits: ['update:visible', 'submit', 'cancel'],
  template: '<div class="tool-dialog-stub" />',
})

const IconStub = defineComponent({
  name: 'ObjectIcon',
  props: ['object'],
  template: '<i class="object-icon-stub" />',
})

function alarm(id, state, extra = {}) {
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

const ALARMS = [alarm(1, 0), alarm(2, 0), alarm(3, 1), alarm(4, 2)]

function mountTable(props = {}) {
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
const dataRows = (wrapper) => wrapper.findAll('tbody tr:not(.app-table__expansion-row)')

async function select(wrapper, ...indexes) {
  for (const index of indexes) await rowCheckboxes(wrapper)[index].trigger('click')
}

function selectionButton(wrapper, label) {
  return wrapper
    .findAll('.selection-actions button')
    .find((button) => button.attributes('aria-label') === label)
}

async function openMenu(wrapper, index) {
  await dataRows(wrapper)[index].trigger('contextmenu')
  await flushPromises()
  return wrapper.findComponent(MenuStub).props('items')
}

const labels = (items) => items.filter((item) => !item.separator).map((item) => item.label)
const item = (items, id) => items.find((entry) => entry.id === id)

beforeEach(() => {
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
})

describe('AlarmTable selection', () => {
  it('offers the actions the selection allows, with how many they reach', async () => {
    const wrapper = mountTable()

    await select(wrapper, 0, 2)

    expect(wrapper.find('.selection-actions').text()).toContain('2 selected')
    expect(selectionButton(wrapper, 'Acknowledge (1)')).toBeTruthy()
    expect(selectionButton(wrapper, 'Resolve (2)')).toBeTruthy()
    expect(selectionButton(wrapper, 'Terminate (2)')).toBeTruthy()
  })

  it('hides an action nothing selected can take', async () => {
    const wrapper = mountTable()

    await select(wrapper, 3)

    expect(
      wrapper.findAll('.selection-actions button').map((b) => b.attributes('aria-label')),
    ).not.toContain('Acknowledge (0)')
    expect(selectionButton(wrapper, 'Terminate (1)')).toBeTruthy()
  })

  it('runs an action on the alarms it fits and deselects the ones that changed', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 2)

    await selectionButton(wrapper, 'Acknowledge (1)').trigger('click')
    await flushPromises()

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: 'acknowledge', ids: [1] }))
    expect(wrapper.find('.selection-actions').text()).toContain('1 selected')
  })

  it('drops an alarm from the selection when it leaves the list', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    await wrapper.setProps({ alarms: ALARMS.slice(1) })

    expect(wrapper.find('.selection-actions').text()).toContain('1 selected')
  })

  it('drops an alarm from the selection when the filter hides it', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    await wrapper.find('.filter-stub').setValue('Message 2')
    await nextTick()

    expect(wrapper.find('.selection-actions').text()).toContain('1 selected')
  })

  it('offers everything the filter shows once a whole page is selected', async () => {
    const many = Array.from({ length: 150 }, (_, i) => alarm(i + 1, 0))
    const wrapper = mountTable({ alarms: many })

    await select(wrapper, 0)
    expect(selectionButton(wrapper, 'Select all 150')).toBeUndefined()

    await wrapper.find('.app-table__checkbox-th .app-table__checkbox-wrap').trigger('click')
    await selectionButton(wrapper, 'Select all 150').trigger('click')

    expect(wrapper.find('.selection-actions').text()).toContain('150 selected')
    expect(selectionButton(wrapper, 'Select all 150')).toBeUndefined()
  })

  it('has no select-all offer when one page already holds everything', async () => {
    const wrapper = mountTable()

    await wrapper.find('.app-table__checkbox-th .app-table__checkbox-wrap').trigger('click')

    expect(selectionButton(wrapper, 'Select all 4')).toBeUndefined()
  })
})

describe('AlarmTable under strict alarm flow', () => {
  it('terminates only resolved alarms', async () => {
    serverOptions.value = { strictAlarmStatusFlow: true }
    const wrapper = mountTable()

    await select(wrapper, 0, 3)

    expect(selectionButton(wrapper, 'Terminate (1)')).toBeTruthy()
  })
})

describe('AlarmTable menu on one alarm', () => {
  it('mirrors the legacy list, leaving out what does not apply', async () => {
    const wrapper = mountTable()

    const items = await openMenu(wrapper, 0)

    expect(labels(items)).toEqual([
      'Acknowledge',
      'Sticky acknowledge',
      'Resolve',
      'Terminate',
      'Go to Object',
      'Copy to clipboard',
      'Copy message to clipboard',
      'Export to CSV',
      'Details',
      'Create incident',
      'Object',
    ])
  })

  it('offers no acknowledge on an acknowledged alarm', async () => {
    const wrapper = mountTable()

    const items = await openMenu(wrapper, 2)

    expect(labels(items)).not.toContain('Acknowledge')
    expect(labels(items)).not.toContain('Sticky acknowledge')
  })

  it('acts on that alarm alone', async () => {
    const wrapper = mountTable()

    const items = await openMenu(wrapper, 1)
    await item(items, 'alarm.resolve').command()
    await flushPromises()

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: 'resolve', ids: [2] }))
  })

  it('leaves the selection alone when opened outside it', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 2)

    expect(labels(items)).toContain('Details')
    expect(wrapper.find('.selection-actions').text()).toContain('2 selected')
  })

  it('offers Go to DCI only for an alarm that has one', async () => {
    const wrapper = mountTable()
    expect(labels(await openMenu(wrapper, 0))).not.toContain('Go to DCI')

    dciId.value = 77
    await nextTick()
    const items = wrapper.findComponent(MenuStub).props('items')

    expect(labels(items)).toContain('Go to DCI')
    expect(item(items, 'alarm.goToDci').url).toBe('/resolved')
  })

  it('gives Go to Object a real link, for a new tab', async () => {
    const items = await openMenu(mountTable(), 0)

    expect(item(items, 'alarm.goToObject').url).toBe('/resolved')
  })

  it('hides Go to Object for the object being viewed, not for its children', async () => {
    const wrapper = mountTable({ ownerObjectId: 11 })

    expect(labels(await openMenu(wrapper, 0))).not.toContain('Go to Object')
    expect(labels(await openMenu(wrapper, 1))).toContain('Go to Object')
  })

  it('shows sticky acknowledge as not yet available', async () => {
    const items = await openMenu(mountTable(), 0)

    item(items, 'alarm.stickyAcknowledge').command()

    expect(notifyNotImplemented).toHaveBeenCalledWith('Sticky acknowledge')
    expect(run).not.toHaveBeenCalled()
  })

  it('offers the timed variant only when the server has it on', async () => {
    serverOptions.value = { timedAlarmAckEnabled: true }
    const items = await openMenu(mountTable(), 0)

    const timed = item(items, 'alarm.stickyAcknowledgeFor')
    expect(labels(timed.items)).toEqual(['1 hour', '4 hours', '1 day', '2 days', 'Other...'])

    timed.items[0].command()
    expect(notifyNotImplemented).toHaveBeenCalledWith('Sticky acknowledge for 1 hour')
  })
})

describe('AlarmTable menu on a selection', () => {
  it('keeps what works on many and drops what needs one alarm', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 0)

    expect(labels(items)).toEqual([
      'Acknowledge (2)',
      'Sticky acknowledge',
      'Resolve (2)',
      'Terminate (2)',
      'Copy to clipboard',
      'Copy message to clipboard',
      'Export to CSV',
    ])
  })

  it('runs on the whole selection', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 0)
    await item(items, 'alarm.resolve').command()
    await flushPromises()

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: 'resolve', ids: [1, 2] }))
  })

  it('does not look up an object for the menu', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    await openMenu(wrapper, 0)

    expect(menuObjectId.value).toBeNull()
  })
})

describe('AlarmTable copy and export', () => {
  it('copies severity, source and message lines', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 0)
    await item(items, 'alarm.copy').command()

    expect(writeText).toHaveBeenCalledWith('[Minor]\tnode-1\tMessage 1\n[Minor]\tnode-2\tMessage 2')
  })

  it('copies messages alone', async () => {
    const items = await openMenu(mountTable(), 0)

    await item(items, 'alarm.copyMessage').command()

    expect(writeText).toHaveBeenCalledWith('Message 1')
  })

  it('exports the targets as CSV with the shown columns', async () => {
    const items = await openMenu(mountTable(), 0)

    item(items, 'alarm.export').command()

    const [filename, csv] = downloadCsv.mock.calls[0]
    expect(filename).toBe('alarms')
    expect(csv.split('\r\n')[0]).toContain('Sev,State,Source')
    expect(csv.split('\r\n')[1]).toContain('Minor,Outstanding,node-1')
  })

  it('exports what the filter shows from the toolbar, or the selection when there is one', async () => {
    const wrapper = mountTable()

    await wrapper.find('.alarm-export').trigger('click')
    expect(downloadCsv.mock.calls[0][1].split('\r\n')).toHaveLength(5)

    await select(wrapper, 0)
    await wrapper.find('.alarm-export').trigger('click')
    expect(downloadCsv.mock.calls[1][1].split('\r\n')).toHaveLength(2)
  })
})

describe('AlarmTable tools', () => {
  const PING = { id: 5, name: 'Ping', type: 'action' }
  const ASK = {
    id: 6,
    name: 'Ask',
    type: 'action',
    inputFields: [{ name: 'host', sequence: 0, type: 0 }],
  }
  const objectToolsSlot = {
    id: 'object.tools',
    label: 'Tools',
    items: [{ id: 'object.tools.executeScript', label: 'Execute script' }],
  }

  it('leaves Tools off a source that has none', async () => {
    const items = await openMenu(mountTable(), 0)

    expect(item(items, 'alarm.tools')).toBeUndefined()
  })

  it('runs a top-level tool with the alarm, for its macros', async () => {
    tools.value = [PING]
    const items = await openMenu(mountTable(), 0)

    item(items, 'alarm.tools').items[0].command()

    expect(executeTool).toHaveBeenCalledWith({ id: 11, name: 'node-1' }, PING, {}, { alarmId: 1 })
  })

  it('runs the same tool under Object without the alarm', async () => {
    tools.value = [PING]
    objectMenuItems.value = [objectToolsSlot]
    const items = await openMenu(mountTable(), 0)

    const objectTools = item(item(items, 'alarm.object').items, 'object.tools')
    objectTools.items.find((entry) => entry.label === 'Ping').command()

    expect(executeTool).toHaveBeenCalledWith({ id: 11, name: 'node-1' }, PING, {}, {})
  })

  it('asks for input first, then runs with what was entered and the alarm', async () => {
    tools.value = [ASK]
    const wrapper = mountTable()
    const items = await openMenu(wrapper, 0)

    item(items, 'alarm.tools').items[0].command()
    await nextTick()

    const dialog = wrapper.findComponent(ToolDialogStub)
    expect(executeTool).not.toHaveBeenCalled()
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('inputFields')).toEqual(ASK.inputFields)

    dialog.vm.$emit('submit', { host: 'a' })
    await flushPromises()

    expect(executeTool).toHaveBeenCalledWith(
      { id: 11, name: 'node-1' },
      ASK,
      { host: 'a' },
      { alarmId: 1 },
    )
  })

  it('offers no tools on a selection', async () => {
    tools.value = [PING]
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 0)

    expect(item(items, 'alarm.tools')).toBeUndefined()
  })
})

describe('AlarmTable Object submenu', () => {
  const entry = (id, extra = {}) => ({ id, label: id, ...extra })

  it('keeps what works outside the object perspectives', async () => {
    objectMenuItems.value = [
      entry('object.open', { items: [entry('object.open.logs')] }),
      entry('object.create'),
      { separator: true },
      entry('object.poll'),
      entry('object.manage'),
      entry('object.maintenance'),
      { separator: true },
      entry('object.delete'),
    ]
    const items = await openMenu(mountTable(), 0)

    const submenu = item(items, 'alarm.object').items
    expect(submenu.filter((i) => !i.separator).map((i) => i.id)).toEqual([
      'object.open',
      'object.poll',
      'object.manage',
    ])
  })

  it('leaves no stray separators behind', async () => {
    objectMenuItems.value = [
      entry('object.create'),
      { separator: true },
      entry('object.poll'),
      { separator: true },
      entry('object.organize'),
      { separator: true },
      entry('object.manage'),
      { separator: true },
    ]
    const items = await openMenu(mountTable(), 0)

    const submenu = item(items, 'alarm.object').items
    expect(submenu.map((i) => i.separator ?? i.id)).toEqual(['object.poll', true, 'object.manage'])
  })

  it('drops inspection items whose dialog only the object perspectives host', async () => {
    objectMenuItems.value = [
      entry('object.open', {
        items: [entry('object.open.logs'), { separator: true }, entry('object.open.explainStatus')],
      }),
    ]
    const items = await openMenu(mountTable(), 0)

    const open = item(item(items, 'alarm.object').items, 'object.open')
    expect(open.items.map((i) => i.id)).toEqual(['object.open.logs'])
  })

  it('loads the object of the alarm the menu opened on', async () => {
    await openMenu(mountTable(), 1)

    expect(menuObjectId.value).toBe(12)
  })
})

describe('AlarmTable Ask AI assistant', () => {
  it('is left out without the AI component', async () => {
    const items = await openMenu(mountTable(), 0)

    expect(item(items, 'alarm.askAi')).toBeUndefined()
  })

  it('opens the chat and asks about the alarm with its object as context', async () => {
    aiAvailable.value = true
    const items = await openMenu(mountTable(), 0)

    item(items, 'alarm.askAi').command()

    expect(isAiChatOpen.value).toBe(true)
    const [prompt, context] = sendMessage.mock.calls[0]
    expect(prompt).toContain('Alarm ID: 1')
    expect(context).toEqual({ type: 'object', object_id: 11, object_name: 'node-1' })
  })
})

describe('AlarmTable source icons', () => {
  const NODE = { id: 11, class: 'Node', category: 0 }

  it('draws the source object icon next to its name', () => {
    sourceObjects.value = new Map([[11, NODE]])
    const wrapper = mountTable()

    const icon = dataRows(wrapper)[0].findComponent(IconStub)

    expect(icon.props('object')).toEqual(NODE)
    expect(dataRows(wrapper)[0].text()).toContain('node-1')
  })

  it('still holds the place of an icon it knows nothing about', () => {
    const wrapper = mountTable()

    expect(dataRows(wrapper)[0].findComponent(IconStub).props('object')).toBeNull()
  })

  it('looks up only sources the detailed list does not know yet', () => {
    sourceObjects.value = new Map([[11, NODE]])
    mountTable({ alarms: [alarm(1, 0), alarm(2, 0)] })

    expect(lastObjectLookup.value).toEqual([12])
  })

  it('looks up nothing until the detailed list has answered', () => {
    sourceObjects.value = undefined
    mountTable({ alarms: [alarm(1, 0)] })

    expect(lastObjectLookup.value).toEqual([])
  })

  it('takes a source it had to look up', () => {
    const fetched = { id: 12, class: 'Sensor', name: 'node-2' }
    sourceObjects.value = new Map([[11, NODE]])
    objectsById.value = new Map([[12, fetched]])
    const wrapper = mountTable()

    expect(dataRows(wrapper)[1].findComponent(IconStub).props('object')).toEqual(fetched)
  })
})
