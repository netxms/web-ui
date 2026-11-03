import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/objectsApi', () => ({
  getChassisLayout: vi.fn(),
  getObject: vi.fn(),
  getDciHistory: vi.fn(),
  getDciValues: vi.fn(),
}))

const objectsApi = await import('@/api/objectsApi')
const {
  useChassisLayout,
  useObjectsByIds,
  useDciHistory,
  usePrefetchDciHistory,
  useDciValues,
  objectKeys,
} = await import('../useObjectQueries')

/** One element 10 HP wide, 1 RU high, at HP/RU origin offsets - as the server sends it. */
function rawChassisLayout() {
  return {
    chassisId: 500,
    name: 'Chassis',
    controllerId: 0,
    status: 0,
    objects: [
      {
        id: 501,
        name: 'card',
        objectClass: 2,
        status: 0,
        placement: {
          positionWidth: 2,
          positionWidthUnits: 0,
          positionHeight: 1,
          positionHeightUnits: 0,
          width: 10,
          widthUnits: 0,
          height: 1,
          heightUnits: 0,
          orientation: 1,
        },
      },
    ],
  }
}

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

// The unit system is part of the cached value: a chassis opened before its detail resolves
// reads the 'hp-ru' default, and the cache must not keep serving HP/RU numbers once it is mm.
describe('useChassisLayout unit system', () => {
  it('re-adapts to mm when the chassis unit system resolves after first render', async () => {
    objectsApi.getChassisLayout.mockResolvedValue(rawChassisLayout())

    const unitSystem = ref('hp-ru')
    const { api } = withComposable(() => useChassisLayout(500, unitSystem))
    await settle()

    expect(api.data.value.elements[0]).toMatchObject({ x: 2, y: 1, width: 10, height: 1 })

    unitSystem.value = 'mm'
    await settle()

    const element = api.data.value.elements[0]
    expect(element.x).toBeCloseTo(2 * 5.08, 5)
    expect(element.y).toBeCloseTo(44.45, 5)
    expect(element.width).toBeCloseTo(10 * 5.08, 5)
    expect(element.height).toBeCloseTo(44.45, 5)
  })

  it('keys mm and hp-ru layouts separately, and the id-only key matches both', () => {
    expect(objectKeys.chassisLayout(500, 'mm')).not.toEqual(objectKeys.chassisLayout(500, 'hp-ru'))
    const prefix = objectKeys.chassisLayout(500)
    expect(objectKeys.chassisLayout(500, 'mm').slice(0, prefix.length)).toEqual(prefix)
  })
})

// Partial documents (objects the user cannot fully read) must never land in objectKeys.detail.
describe('useObjectsByIds with a delegate', () => {
  it('asks through the delegate and keeps partial documents out of the detail cache', async () => {
    objectsApi.getObject.mockImplementation((id) =>
      Promise.resolve(
        id === 2
          ? { id, class: 'Node', name: 'n2', partial: true }
          : { id, class: 'Node', name: `n${id}` },
      ),
    )

    const { api } = withComposable(() => useObjectsByIds([1, 2], { delegate: 700 }))
    await settle()

    expect(objectsApi.getObject).toHaveBeenCalledWith(1, expect.objectContaining({ delegate: 700 }))
    expect(api.objectsById.value.get(2).name).toBe('n2')
    expect(queryClient.getQueryData(objectKeys.delegated(700, 2))).toMatchObject({
      partial: true,
    })
    expect(queryClient.getQueryData(objectKeys.detail(2))).toBeUndefined()
    // A full document is shared with every other view.
    expect(queryClient.getQueryData(objectKeys.detail(1))).toMatchObject({ name: 'n1' })
  })

  it('starts from an object already in the detail cache', async () => {
    queryClient.setQueryData(objectKeys.detail(1), { id: 1, class: 'Node', name: 'cached' })
    objectsApi.getObject.mockResolvedValue({ id: 1, class: 'Node', name: 'fetched' })

    const { api } = withComposable(() => useObjectsByIds([1], { delegate: 700 }))
    await settle()

    expect(objectsApi.getObject).not.toHaveBeenCalled()
    expect(api.objectsById.value.get(1).name).toBe('cached')
  })

  it('reads the detail cache directly without a delegate', async () => {
    objectsApi.getObject.mockResolvedValue({ id: 3, class: 'Node', name: 'n3' })

    withComposable(() => useObjectsByIds([3]))
    await settle()

    expect(objectsApi.getObject).toHaveBeenCalledWith(
      3,
      expect.not.objectContaining({ delegate: expect.anything() }),
    )
    expect(queryClient.getQueryData(objectKeys.detail(3))).toMatchObject({ name: 'n3' })
  })
})

describe('useDciValues', () => {
  /** Answer as objectsApi.getDciValues does: rows keyed by `objectId:dciId`. */
  const answer = (items) =>
    Promise.resolve(
      Object.fromEntries(
        items.map((i) => [`${i.objectId}:${i.dciId}`, { id: i.dciId, type: i.dciId > 8 ? 2 : 1 }]),
      ),
    )

  it('asks once for each distinct DCI and adapts the rows', async () => {
    objectsApi.getDciValues.mockImplementation(answer)
    const a = { objectId: 1, dciId: 2 }
    const table = { objectId: 1, dciId: 9 }

    const { api } = withComposable(() => useDciValues([a, null, table, { ...a }], { delegate: 7 }))
    await settle()

    expect(objectsApi.getDciValues).toHaveBeenCalledTimes(1)
    const [items, options] = objectsApi.getDciValues.mock.calls[0]
    expect(items).toEqual([a, table])
    expect(options.delegate).toBe(7)
    expect(api.valueOf(a).isTable).toBe(false)
    expect(api.valueOf(table).isTable).toBe(true)
    expect(api.valueOf({ objectId: 1, dciId: 3 })).toBeNull()
    expect(api.valueOf(null)).toBeNull()
  })

  it('shares the cache between lists naming the same DCIs in another order', async () => {
    objectsApi.getDciValues.mockImplementation(answer)
    const a = { objectId: 1, dciId: 2 }
    const b = { objectId: 3, dciId: 4 }

    withComposable(() => useDciValues([a, b]))
    await settle()
    const { api } = withComposable(() => useDciValues([b, a]))
    await settle()

    expect(objectsApi.getDciValues).toHaveBeenCalledTimes(1)
    expect(api.valueOf(b).id).toBe(4)
  })

  it('asks nothing for an empty list', async () => {
    withComposable(() => useDciValues([null]))
    await settle()

    expect(objectsApi.getDciValues).not.toHaveBeenCalled()
  })
})

describe('useDciHistory window', () => {
  it('ends the window at endAt when one is given', async () => {
    objectsApi.getDciHistory.mockResolvedValue({ values: [] })

    withComposable(() => useDciHistory(7, 9, { endAt: 1_000_000 }))
    await settle()

    expect(objectsApi.getDciHistory).toHaveBeenCalledWith(7, 9, {
      timeFrom: 1_000_000 - 24 * 60 * 60,
      timeTo: 1_000_000,
      maxRows: 500,
    })
  })

  it('caches an anchored window apart from the window ending now', async () => {
    objectsApi.getDciHistory.mockResolvedValue({ values: [] })

    withComposable(() => useDciHistory(7, 9))
    withComposable(() => useDciHistory(7, 9, { endAt: 1_000_000 }))
    await settle()

    expect(objectsApi.getDciHistory).toHaveBeenCalledTimes(2)
  })

  it('serves a prefetched window without fetching it again', async () => {
    objectsApi.getDciHistory.mockResolvedValue({ values: [{ timestamp: 1, value: '5' }] })

    const { api: prefetch } = withComposable(() => usePrefetchDciHistory())
    await prefetch(7, 9, { endAt: 1_000_000 })
    const { api } = withComposable(() => useDciHistory(7, 9, { endAt: 1_000_000 }))
    await settle()

    expect(objectsApi.getDciHistory).toHaveBeenCalledTimes(1)
    expect(api.data.value.values[0].value).toBe('5')
  })
})
