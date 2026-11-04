import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import PrimeVue from 'primevue/config'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import Tooltip from 'primevue/tooltip'
import AppTable from '@/components/common/AppTable.vue'
import MappingTablesSection from '../MappingTablesSection.vue'
import SnmpTrapMappingsSection from '../SnmpTrapMappingsSection.vue'
import { clearWorkingState } from '@/composables/useWorkingState'

const confirmRequire = vi.fn()
const toastAdd = vi.fn()
const deleteApi = vi.fn()

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'configuration', params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '/' }), push: vi.fn() } }))

vi.mock('@/composables/useEntityDetail', () => ({
  useEntityDetail: () => ({
    entityId: ref(null),
    isDetailView: computed(() => false),
    detailTarget: () => ({ path: '/configuration' }),
    openDetail: vi.fn(),
    closeDetail: vi.fn(),
  }),
}))

const listRows = ref([])

function listQuery() {
  return {
    data: listRows,
    isLoading: ref(false),
    isFetching: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }
}

function detailQuery() {
  return { data: ref(null), isLoading: ref(false), error: ref(null), refetch: vi.fn() }
}

// The delete hooks stay real: TanStack's one-observer-per-hook behavior is what batch delete
// has to cope with.
vi.mock('@/queries/useMappingTableQueries', async (importOriginal) => ({
  ...(await importOriginal()),
  useMappingTables: listQuery,
  useMappingTable: detailQuery,
}))
vi.mock('@/api/mappingTablesApi', () => ({ deleteMappingTable: (id) => deleteApi(id) }))

vi.mock('@/queries/useSnmpTrapMappingQueries', async (importOriginal) => ({
  ...(await importOriginal()),
  useSnmpTrapMappings: listQuery,
  useSnmpTrapMapping: detailQuery,
}))
vi.mock('@/api/snmpTrapMappingsApi', () => ({ deleteSnmpTrapMapping: (id) => deleteApi(id) }))

vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({ data: ref([]) }),
}))

const ContextMenuStub = defineComponent({
  name: 'EntityContextMenu',
  props: { items: { type: Array, required: true } },
  setup(_, { expose }) {
    expose({ show: vi.fn() })
    return () => h('div')
  },
})

const SECTIONS = [
  {
    name: 'MappingTablesSection',
    component: MappingTablesSection,
    rows: [
      { id: 1, name: 'Alpha', description: '', flags: 0 },
      { id: 2, name: 'Beta', description: '', flags: 0 },
      { id: 3, name: 'Gamma', description: '', flags: 0 },
    ],
    selectedText: '2 tables selected',
    batchMessage: 'Delete 2 mapping tables? This cannot be undone.',
    failureFor: ['Failed to delete "Alpha".', 'Failed to delete "Beta".'],
  },
  {
    name: 'SnmpTrapMappingsSection',
    component: SnmpTrapMappingsSection,
    rows: [
      { id: 1, oid: '1.3.6.1.4.1.1', eventCode: 500, description: 'Link up' },
      { id: 2, oid: '1.3.6.1.4.1.2', eventCode: 501, description: 'Link down' },
      { id: 3, oid: '1.3.6.1.4.1.3', eventCode: 502, description: 'Fan' },
    ],
    selectedText: '2 mappings selected',
    batchMessage: 'Delete 2 SNMP traps? This cannot be undone.',
    failureFor: ['Failed to delete mapping 1.', 'Failed to delete mapping 2.'],
  },
]

beforeEach(() => {
  clearWorkingState()
  confirmRequire.mockReset()
  toastAdd.mockReset()
  deleteApi.mockReset()
  deleteApi.mockResolvedValue(undefined)
})

/** Rejects only after every delete of the batch has started, as a real request would. */
const failLater = () =>
  new Promise((_, reject) => {
    setTimeout(() => reject({ status: 500 }), 0)
  })

async function settle() {
  await flushPromises()
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
  await flushPromises()
}

describe.each(SECTIONS)('$name selection and batch delete', (section) => {
  function mountSection() {
    listRows.value = section.rows
    return mount(section.component, {
      global: {
        plugins: [PrimeVue, [VueQueryPlugin, { queryClient: new QueryClient() }]],
        directives: { tooltip: Tooltip },
        mocks: { $plural: (n, word) => `${n} ${n === 1 ? word : `${word}s`}` },
        stubs: {
          EntityContextMenu: ContextMenuStub,
          SmartFilterInput: true,
          MappingTableDetailView: true,
          SnmpTrapMappingDetailView: true,
        },
      },
    })
  }

  async function selectFirstTwo(wrapper) {
    wrapper.findComponent(AppTable).vm.$emit('selection-change', new Set([1, 2]))
    await wrapper.vm.$nextTick()
  }

  async function openMenuOn(wrapper, row) {
    const event = new MouseEvent('contextmenu')
    wrapper.findComponent(AppTable).vm.$emit('row-contextmenu', { event, row })
    await wrapper.vm.$nextTick()
    return wrapper.findComponent(ContextMenuStub).props('items')
  }

  const item = (items, prefix) => items.find((i) => i.label?.startsWith(prefix))

  it('hands the selection to the table and shows the selection bar', async () => {
    const wrapper = mountSection()
    expect(wrapper.find('.selection-bar').exists()).toBe(false)

    await selectFirstTwo(wrapper)

    expect(wrapper.findComponent(AppTable).props('selectedIds')).toEqual(new Set([1, 2]))
    expect(wrapper.find('.selection-bar').text()).toContain(section.selectedText)
  })

  it('aims the menu of a selected row at the whole selection', async () => {
    const wrapper = mountSection()
    await selectFirstTwo(wrapper)

    const items = await openMenuOn(wrapper, section.rows[0])

    expect(item(items, 'Edit').disabled).toBe(true)
    expect(item(items, 'Delete').label).toBe('Delete (2)')
  })

  const deletedIds = () => deleteApi.mock.calls.map(([id]) => id)

  async function deleteSelection(wrapper) {
    await wrapper.find('.selection-bar button').trigger('click')
    confirmRequire.mock.calls[0][0].accept()
    await settle()
  }

  it('aims the menu of an unselected row at that row alone', async () => {
    const wrapper = mountSection()
    await selectFirstTwo(wrapper)

    const items = await openMenuOn(wrapper, section.rows[2])
    item(items, 'Delete').command()
    confirmRequire.mock.calls[0][0].accept()
    await settle()

    expect(item(items, 'Edit').disabled).toBe(false)
    expect(deletedIds()).toEqual([3])
  })

  it('deletes nothing when the dialog is cancelled', async () => {
    const wrapper = mountSection()
    await selectFirstTwo(wrapper)

    item(await openMenuOn(wrapper, section.rows[0]), 'Delete').command()
    const dialog = confirmRequire.mock.calls[0][0]
    dialog.reject?.()
    await settle()

    expect(dialog.message).toBe(section.batchMessage)
    expect(deleteApi).not.toHaveBeenCalled()
    expect(wrapper.find('.selection-bar').exists()).toBe(true)
  })

  it('attempts every target and clears the selection on accept', async () => {
    const wrapper = mountSection()
    await selectFirstTwo(wrapper)

    await deleteSelection(wrapper)

    expect(deletedIds()).toEqual([1, 2])
    expect(wrapper.find('.selection-bar').exists()).toBe(false)
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('reports an earlier failed target while the others still delete', async () => {
    deleteApi.mockImplementation((id) => (id === 1 ? failLater() : Promise.resolve()))
    const wrapper = mountSection()
    await selectFirstTwo(wrapper)

    await deleteSelection(wrapper)

    expect(deletedIds()).toEqual([1, 2])
    expect(toastAdd).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ severity: 'error', detail: section.failureFor[0] }),
    )
  })

  it('reports every failed target', async () => {
    deleteApi.mockImplementation(failLater)
    const wrapper = mountSection()
    await selectFirstTwo(wrapper)

    await deleteSelection(wrapper)

    expect(toastAdd.mock.calls.map(([toast]) => toast.detail)).toEqual(section.failureFor)
  })
})
