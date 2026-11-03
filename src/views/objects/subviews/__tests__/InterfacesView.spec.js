import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import InterfacesView from '../InterfacesView.vue'
import { useInterfaceTableStore } from '@/stores/interfaceTableStore'
import { clearWorkingState } from '@/composables/useWorkingState'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Links and the action registry pull in the router singleton, which cannot be constructed
// against the mocked vue-router.
vi.mock('@/router', () => ({
  default: {
    resolve: () => ({ href: '/' }),
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { params: {} } },
  },
}))

const PHYSICAL_PORT = 0x02

const interfaces = [
  {
    id: 183,
    class: 'Interface',
    name: 'ether1',
    status: 0,
    flags: PHYSICAL_PORT,
    macAddress: '08:55:31:23:6F:F1',
    ipAddressList: [],
    expectedState: 0,
    expectedStateText: 'UP',
    inboundUtilization: 153,
    outboundUtilization: -1,
    peerNodeId: 300,
    peerInterfaceId: 301,
  },
  {
    id: 184,
    class: 'Interface',
    name: 'ether2',
    status: 6,
    flags: PHYSICAL_PORT,
    macAddress: '08:55:31:23:6F:F2',
    ipAddressList: ['10.5.4.2/24'],
    expectedState: 2,
    expectedStateText: 'IGNORE',
    inboundUtilization: -1,
    outboundUtilization: -1,
    peerNodeId: 0,
    peerInterfaceId: 0,
  },
  {
    id: 185,
    class: 'Interface',
    name: 'ether3',
    status: 4,
    flags: PHYSICAL_PORT,
    macAddress: null,
    ipAddressList: [],
    expectedState: 0,
    expectedStateText: 'UP',
    inboundUtilization: -1,
    outboundUtilization: -1,
    peerNodeId: 0,
    peerInterfaceId: 0,
  },
]

const peers = new Map([
  [300, { id: 300, class: 'Node', name: 'core-switch', ipAddress: { address: '10.0.0.1' } }],
  [301, { id: 301, class: 'Interface', name: 'Gi0/1', macAddress: 'AA:BB:CC:00:00:01' }],
])

vi.mock('@/queries/useObjectQueries', async (importOriginal) => ({
  ...(await importOriginal()),
  useObjectChildren: () => ({
    data: ref(interfaces),
    isLoading: ref(false),
    isFetching: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useObjectsByIds: () => ({
    objectsById: computed(() => peers),
    isFetching: ref(false),
    unresolvedIds: ref([]),
  }),
}))

vi.mock('@/queries/useObjectToolQueries', () => ({
  useObjectToolsForObject: () => ({ data: ref([]), isLoading: ref(false) }),
  useObjectToolIcons: () => ({ iconByToolId: computed(() => new Map()) }),
}))

const ActionContextMenuStub = defineComponent({
  name: 'ActionContextMenu',
  props: ['items'],
  setup(_, { expose }) {
    expose({ show: vi.fn(), hide: vi.fn() })
    return {}
  },
  template: '<div class="ctx-menu-stub" />',
})

/** @param {object} [route] - an app `$route`, which turns on working state */
function mountView(route) {
  return mount(InterfacesView, {
    props: { object: { id: 100, class: 'Node', name: 'sw-core' } },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: {} },
      stubs: {
        RefetchIndicator: true,
        ColumnChooser: true,
        ActionContextMenu: ActionContextMenuStub,
      },
      config: {
        globalProperties: {
          $plural: (count, singular) => `${count} ${singular}${count === 1 ? '' : 's'}`,
          ...(route && { $route: route }),
        },
      },
    },
  })
}

const dataRows = (wrapper) => wrapper.findAll('tbody tr[aria-selected]')
const menuItems = (wrapper) => wrapper.findComponent(ActionContextMenuStub).props('items')
const topLabels = (wrapper) =>
  menuItems(wrapper)
    .filter((item) => !item.separator)
    .map((item) => item.label)

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  clearWorkingState()
})

describe('InterfacesView columns', () => {
  it('shows utilization in percent from tenths, and peer addresses from the peer objects', async () => {
    const wrapper = mountView()
    useInterfaceTableStore().visibleColumnIds = ['name', 'inUtil', 'peerMac', 'peerIp', 'status']
    await flushPromises()

    const first = dataRows(wrapper)[0].text()
    expect(first).toContain('15.3%')
    expect(first).toContain('AA:BB:CC:00:00:01')
    expect(first).toContain('10.0.0.1')
    expect(dataRows(wrapper)[1].text()).toContain('Unmanaged')
  })

  it('keeps the Name column when every column is turned off', async () => {
    const wrapper = mountView()
    useInterfaceTableStore().visibleColumnIds = []
    await flushPromises()

    const headers = wrapper.findAll('thead th[scope="col"]').map((th) => th.text())
    expect(headers).toEqual(['Name'])
  })

  it('shows the columns in the order a header drag leaves them', async () => {
    const wrapper = mountView()
    const store = useInterfaceTableStore()
    store.visibleColumnIds = ['name', 'mac', 'status']
    await flushPromises()

    wrapper
      .findComponent({ name: 'AppTable' })
      .vm.$emit('column-move', { id: 'status', targetId: 'name', after: false })
    await flushPromises()

    const headers = wrapper.findAll('thead th[scope="col"]').map((th) => th.text())
    expect(headers).toEqual(['Status', 'Name', 'MAC Address'])
  })
})

describe('InterfacesView selection and menu', () => {
  it('selects the clicked row, and extends the selection with ctrl', async () => {
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[2].trigger('click', { ctrlKey: true })

    expect(wrapper.find('.interfaces-count').text()).toBe('3 interfaces, 2 selected')
  })

  it('acts on the clicked row alone when it is outside the selection', async () => {
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[1].trigger('contextmenu')

    expect(wrapper.find('.interfaces-count').text()).toBe('3 interfaces, 1 selected')
    const labels = topLabels(wrapper)
    expect(labels).toContain('Expected State')
    expect(labels).toContain('Properties')
    expect(labels).toContain('Copy')
  })

  it('acts on the whole selection from a row inside it', async () => {
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[1].trigger('click', { ctrlKey: true })
    await dataRows(wrapper)[1].trigger('contextmenu')

    const labels = topLabels(wrapper)
    expect(labels).toContain('Expected State')
    expect(labels).toContain('Delete')
    expect(labels).not.toContain('Properties')
    expect(labels).not.toContain('Rename')
  })

  it('copies one MAC address per selected row', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[2].trigger('click', { ctrlKey: true })
    await dataRows(wrapper)[0].trigger('contextmenu')

    const copy = menuItems(wrapper).find((item) => item.id === 'interfaces.copy')
    copy.items.find((item) => item.id === 'interfaces.copy.mac').command()

    expect(writeText).toHaveBeenCalledWith('08:55:31:23:6F:F1\n')
  })
})

describe('InterfacesView working state', () => {
  const routeTo = (objectId) => ({
    path: `/infrastructure/${objectId}/interfaces`,
    params: { objectId: String(objectId), viewId: 'interfaces' },
  })
  const filterInput = (wrapper) => wrapper.find('input[data-filter-input]')

  it('comes back with its filter and selection on the same node', async () => {
    const first = mountView(routeTo(100))
    await flushPromises()
    await dataRows(first)[0].trigger('click')
    await dataRows(first)[1].trigger('click', { ctrlKey: true })
    await filterInput(first).setValue('ether')
    first.unmount()

    const again = mountView(routeTo(100))
    await flushPromises()

    expect(filterInput(again).element.value).toBe('ether')
    expect(again.find('.interfaces-count').text()).toBe('3 interfaces, 2 selected')
  })

  it('takes the filter to the next node, but not the selection', async () => {
    const first = mountView(routeTo(100))
    await flushPromises()
    await dataRows(first)[0].trigger('click')
    await filterInput(first).setValue('ether')
    first.unmount()

    const other = mountView(routeTo(200))
    await flushPromises()

    expect(filterInput(other).element.value).toBe('ether')
    expect(other.find('.interfaces-count').text()).toBe('3 interfaces')
  })
})
