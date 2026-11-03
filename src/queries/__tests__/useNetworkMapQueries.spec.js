import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, computed, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/networkMapsApi', () => ({
  getNetworkMap: vi.fn(),
  getNetworkMapTree: vi.fn(),
  saveNetworkMap: vi.fn(),
  isDemoMapId: () => false,
}))

vi.mock('@/api/objectsApi', () => ({
  getObject: vi.fn(),
  getDciCurrentValues: vi.fn(),
  getDciValues: vi.fn(),
}))

vi.mock('@/api/mappingTablesApi', () => ({
  getMappingTables: vi.fn(),
  getMappingTable: vi.fn(),
}))

const networkMapsApi = await import('@/api/networkMapsApi')
const objectsApi = await import('@/api/objectsApi')
const mappingTablesApi = await import('@/api/mappingTablesApi')
const { useNetworkMap, useMapDciValues } = await import('../useNetworkMapQueries')
const { dciSourceKey, dciValueKey } = await import('@/utils/dciValues')
const { useNetworkMapEditor } = await import('@/composables/useNetworkMapEditor')

/** A raw map document: three object elements plus a link whose endpoints are interfaces. */
function rawMap() {
  return {
    id: 700,
    name: 'Core',
    elements: [
      { id: 1, type: 1, objectId: 101, posX: 0, posY: 0 },
      { id: 2, type: 1, objectId: 102, posX: 100, posY: 0 },
      { id: 3, type: 1, objectId: 103, posX: 200, posY: 0 },
    ],
    links: [{ element1: 1, element2: 2, interface1: 201, interface2: 202, config: '' }],
  }
}

const rawObject = (id, name) => ({ id, class: 'Node', name, status: 0 })

let queryClient

function withComposable(composable) {
  let api
  const wrapper = mount(
    defineComponent({
      setup() {
        api = composable()
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return { api, wrapper }
}

async function settle(turns = 12) {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    await nextTick()
  }
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  vi.clearAllMocks()
})

afterEach(() => {
  queryClient.clear()
})

// Object resolution is cached per object, outside the map's own queryFn.
describe('useNetworkMap object resolution', () => {
  it('resolves element objects and link endpoints through the object cache', async () => {
    networkMapsApi.getNetworkMap.mockResolvedValue(rawMap())
    objectsApi.getObject.mockImplementation((id) => Promise.resolve(rawObject(id, `obj-${id}`)))

    const { api } = withComposable(() => useNetworkMap(computed(() => 700)))
    await settle()

    // The link interfaces are not map elements, so nothing else would resolve them.
    const requested = objectsApi.getObject.mock.calls.map(([id]) => id).sort((a, b) => a - b)
    expect(requested).toEqual([101, 102, 103, 201, 202])

    expect(api.data.value.elements.map((el) => el.objectName)).toEqual([
      'obj-101',
      'obj-102',
      'obj-103',
    ])
  })

  it('reuses cached objects instead of re-fetching them for a second map', async () => {
    networkMapsApi.getNetworkMap.mockResolvedValue(rawMap())
    objectsApi.getObject.mockImplementation((id) => Promise.resolve(rawObject(id, `obj-${id}`)))

    const first = withComposable(() => useNetworkMap(computed(() => 700)))
    await settle()
    const afterFirst = objectsApi.getObject.mock.calls.length

    withComposable(() => useNetworkMap(computed(() => 700)))
    await settle()

    expect(objectsApi.getObject).toHaveBeenCalledTimes(afterFirst)
    first.wrapper.unmount()
  })

  it('renders the map document before its objects resolve', async () => {
    networkMapsApi.getNetworkMap.mockResolvedValue(rawMap())
    let release
    objectsApi.getObject.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve(rawObject(101, 'late')))),
    )

    const { api } = withComposable(() => useNetworkMap(computed(() => 700)))
    await settle()

    expect(api.isLoading.value).toBe(false)
    expect(api.data.value.elements).toHaveLength(3)
    release?.()
  })

  it('leaves an element degraded when its object cannot be read', async () => {
    networkMapsApi.getNetworkMap.mockResolvedValue(rawMap())
    objectsApi.getObject.mockImplementation((id) =>
      id === 102
        ? Promise.reject(Object.assign(new Error('Access denied'), { status: 403 }))
        : Promise.resolve(rawObject(id, `obj-${id}`)),
    )

    const { api } = withComposable(() => useNetworkMap(computed(() => 700)))
    await settle()

    const names = api.data.value.elements.map((el) => el.objectName)
    expect(names[0]).toBe('obj-101')
    expect(names[1]).toBe('') // adaptApiElement's default - the map still draws
    expect(names[2]).toBe('obj-103')
  })

  it('reads the map objects through the map, for users with delegated read', async () => {
    networkMapsApi.getNetworkMap.mockResolvedValue(rawMap())
    objectsApi.getObject.mockImplementation((id) => Promise.resolve(rawObject(id, `obj-${id}`)))

    withComposable(() => useNetworkMap(computed(() => '700')))
    await settle()

    expect(objectsApi.getObject).toHaveBeenCalled()
    for (const [, options] of objectsApi.getObject.mock.calls) {
      expect(options).toMatchObject({ delegate: 700 })
    }
  })

  // The save-time concurrent-edit check compares the baseline against `(await refetch()).data`.
  it('refetch resolves to the adapted map, the same shape as data', async () => {
    networkMapsApi.getNetworkMap.mockResolvedValue(rawMap())
    objectsApi.getObject.mockImplementation((id) => Promise.resolve(rawObject(id, `obj-${id}`)))

    const { api } = withComposable(() => useNetworkMap(computed(() => 700)))
    await settle()

    const editor = useNetworkMapEditor()
    editor.enter(api.data.value)
    const { data: fresh } = await api.refetch()

    expect(fresh.elements.map((el) => el.id)).toEqual(['e-1', 'e-2', 'e-3'])
    expect(editor.baselineDivergedFrom(fresh)).toBe(false)
  })
})

// One request for the displayed DCIs, as legacy CMD_GET_DCI_VALUES does.
describe('useMapDciValues', () => {
  const sources = [
    { nodeId: 11, dciId: 1, type: 1 },
    { nodeId: 11, dciId: 2, type: 1 },
    { nodeId: 11, dciId: 2, type: 1 }, // the same DCI on a second link
    { nodeId: 12, dciId: 3, type: 2, column: 'In', instance: 'C:' },
  ]

  /** Answer as objectsApi.getDciValues does: rows keyed by dciValueKey. */
  const answer = (items) =>
    Promise.resolve(
      Object.fromEntries(
        items.map((item) => [
          dciValueKey(item),
          { ownerId: item.objectId, id: item.dciId, value: item.column ?? `v${item.dciId}` },
        ]),
      ),
    )

  it('asks once for exactly the displayed DCIs, through the map', async () => {
    objectsApi.getDciValues.mockImplementation(answer)

    const { api } = withComposable(() =>
      useMapDciValues(
        computed(() => sources),
        { delegate: computed(() => 700) },
      ),
    )
    await settle()

    expect(objectsApi.getDciValues).toHaveBeenCalledTimes(1)
    const [items, options] = objectsApi.getDciValues.mock.calls[0]
    expect(items).toEqual([
      { objectId: 11, dciId: 1 },
      { objectId: 11, dciId: 2 },
      { objectId: 12, dciId: 3, column: 'In', instance: 'C:' },
    ])
    expect(options).toMatchObject({ delegate: 700, priority: 'background' })
    expect(objectsApi.getDciCurrentValues).not.toHaveBeenCalled()
    expect(api.valuesByDci.value.get(dciSourceKey(sources[1])).value).toBe('v2')
    // A table cell is its own value, not the table's summary.
    expect(api.valuesByDci.value.get(dciSourceKey(sources[3])).value).toBe('In')
    expect(api.valuesByDci.value.has('12:3')).toBe(false)
  })

  it('reads without a delegate when the map has none', async () => {
    objectsApi.getDciValues.mockImplementation(answer)

    withComposable(() => useMapDciValues(computed(() => sources.slice(0, 1))))
    await settle()

    expect(objectsApi.getDciValues.mock.calls[0][1].delegate).toBe(0)
  })

  it('carries the mapped value of a DCI the map shows', async () => {
    objectsApi.getDciValues.mockResolvedValue({
      '11:1': { id: 1, ownerId: 11, value: '2', mappingTableId: 5 },
      '11:2': { id: 2, ownerId: 11, value: '7', mappingTableId: 5 },
      '12:3': { id: 3, ownerId: 12, value: '2' },
    })
    mappingTablesApi.getMappingTable.mockResolvedValue({
      id: 5,
      elements: [{ key: '2', value: 'down', description: '' }],
    })

    const plain = [
      { nodeId: 11, dciId: 1 },
      { nodeId: 11, dciId: 2 },
      { nodeId: 12, dciId: 3 },
    ]
    const { api } = withComposable(() => useMapDciValues(computed(() => plain)))
    await settle()

    expect(mappingTablesApi.getMappingTable.mock.calls.map(([id]) => id)).toEqual([5])
    expect(api.valuesByDci.value.get('11:1').mappedValue).toBe('down')
    expect(api.valuesByDci.value.get('11:2').mappedValue).toBeUndefined()
    expect(api.valuesByDci.value.get('12:3').mappedValue).toBeUndefined()
  })

  it('polls nothing when the map displays no DCIs', async () => {
    withComposable(() => useMapDciValues(computed(() => [])))
    await settle()

    expect(objectsApi.getDciValues).not.toHaveBeenCalled()
  })
})
