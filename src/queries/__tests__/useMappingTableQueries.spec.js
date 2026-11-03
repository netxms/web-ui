import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/mappingTablesApi', () => ({
  getMappingTables: vi.fn(),
  getMappingTable: vi.fn(),
  createMappingTable: vi.fn(),
  updateMappingTable: vi.fn(),
  deleteMappingTable: vi.fn(),
}))

const mappingTablesApi = await import('@/api/mappingTablesApi')
const {
  mappingTableKeys,
  useCreateMappingTable,
  useUpdateMappingTable,
  useDeleteMappingTable,
  useDciValueMapping,
} = await import('../useMappingTableQueries')

const table = (id, elements) => ({
  id,
  guid: `guid-${id}`,
  name: `table-${id}`,
  description: '',
  flags: 1,
  elements,
})

// The editor reloads from the detail cache after a save, so it must hold the stored table.
describe('mapping table mutation caching', () => {
  let queryClient
  let wrapper

  function withMutation(composable) {
    let api
    wrapper = mount(
      defineComponent({
        setup() {
          api = composable()
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    return api
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    queryClient.clear()
  })

  it('seeds the detail cache with the table a create returns', async () => {
    const created = table(7, [])
    mappingTablesApi.createMappingTable.mockResolvedValue(created)

    const { mutate } = withMutation(useCreateMappingTable)
    mutate({ name: 'table-7' })
    await flushPromises()

    expect(queryClient.getQueryData(mappingTableKeys.detail(7))).toEqual(created)
  })

  it('replaces the detail cache with the table as stored after an update', async () => {
    queryClient.setQueryData(mappingTableKeys.detail(3), table(3, [{ key: '0x10', value: 'a' }]))
    const stored = table(3, [{ key: '16', value: 'a', description: '' }])
    mappingTablesApi.updateMappingTable.mockResolvedValue(stored)

    const { mutate } = withMutation(useUpdateMappingTable)
    mutate({ id: 3, data: { elements: [{ key: '0x10', value: 'a' }] } })
    await flushPromises()

    expect(queryClient.getQueryData(mappingTableKeys.detail(3))).toEqual(stored)
  })

  it('drops the detail cache of a deleted table', async () => {
    queryClient.setQueryData(mappingTableKeys.detail(3), table(3, []))
    mappingTablesApi.deleteMappingTable.mockResolvedValue(undefined)

    const { mutate } = withMutation(useDeleteMappingTable)
    mutate(3)
    await flushPromises()

    expect(queryClient.getQueryData(mappingTableKeys.detail(3))).toBeUndefined()
  })
})

// A table the user cannot read formats the value as if it had no table.
describe('useDciValueMapping', () => {
  let queryClient
  let wrapper

  function withMapping(rows) {
    let api
    wrapper = mount(
      defineComponent({
        setup() {
          api = useDciValueMapping(rows)
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    return api
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    wrapper?.unmount()
    queryClient.clear()
  })

  const status = table(5, [
    { key: '1', value: 'up', description: '' },
    { key: '2', value: 'down', description: '' },
  ])

  it('loads each distinct table once and maps raw values through it', async () => {
    mappingTablesApi.getMappingTable.mockResolvedValue(status)
    const rows = [
      { id: 1, value: '1', mappingTableId: 5 },
      { id: 2, value: '2', mappingTableId: 5 },
      { id: 3, value: '9', mappingTableId: 5 },
      { id: 4, value: '1', mappingTableId: 0 },
    ]

    const { mappedValue } = withMapping(rows)
    await flushPromises()

    expect(mappingTablesApi.getMappingTable).toHaveBeenCalledTimes(1)
    expect(mappingTablesApi.getMappingTable).toHaveBeenCalledWith(5)
    expect(rows.map(mappedValue)).toEqual(['up', 'down', null, null])
  })

  it('reads a table the cache already holds without asking the server', async () => {
    queryClient.setQueryData(mappingTableKeys.detail(5), status)

    const { mappedValue } = withMapping([{ id: 1, value: '2', mappingTableId: 5 }])
    await flushPromises()

    expect(mappingTablesApi.getMappingTable).not.toHaveBeenCalled()
    expect(mappedValue({ value: '2', mappingTableId: 5 })).toBe('down')
  })

  it('maps nothing when the table cannot be read', async () => {
    const gone = Object.assign(new Error('gone'), { status: 404 })
    mappingTablesApi.getMappingTable.mockRejectedValue(gone)

    const { mappedValue } = withMapping([{ id: 1, value: '1', mappingTableId: 8 }])
    await flushPromises()

    expect(mappedValue({ value: '1', mappingTableId: 8 })).toBeNull()
  })

  it('loads a table once a row starts using it', async () => {
    mappingTablesApi.getMappingTable.mockResolvedValue(status)
    const rows = ref([{ id: 1, value: '1', mappingTableId: 0 }])

    const { mappedValue } = withMapping(rows)
    await flushPromises()
    expect(mappingTablesApi.getMappingTable).not.toHaveBeenCalled()

    rows.value = [{ id: 1, value: '1', mappingTableId: 5 }]
    await nextTick()
    await flushPromises()

    expect(mappedValue(rows.value[0])).toBe('up')
  })

  it('shows an edit saved in the editor without reloading the table', async () => {
    mappingTablesApi.getMappingTable.mockResolvedValue(status)
    const row = { id: 1, value: '1', mappingTableId: 5 }

    const { mappedValue } = withMapping([row])
    await flushPromises()
    queryClient.setQueryData(
      mappingTableKeys.detail(5),
      table(5, [{ key: '1', value: 'running', description: '' }]),
    )
    await nextTick()

    expect(mappedValue(row)).toBe('running')
    expect(mappingTablesApi.getMappingTable).toHaveBeenCalledTimes(1)
  })
})
