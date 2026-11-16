import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/dataCenterApi', async (importOriginal) => ({
  ...(await importOriginal()),
  isDemoDataCenterId: vi.fn((id) => id >= 9000),
  findTaggedDcis: vi.fn(),
  listObjectDcis: vi.fn(),
  getDataCenterValues: vi.fn(),
}))

const { useTaggedDcis, useDataCenterValues } = await import('../useDataCenterQueries')
const { findTaggedDcis, listObjectDcis, getDataCenterValues } = await import('@/api/dataCenterApi')

function mountComposable(use) {
  let result
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mount(
    defineComponent({
      setup() {
        result = use()
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return result
}

const LISTS = {
  1: [
    { id: 11, systemTag: 'heat.export', unitName: 'kW' },
    { id: 12, name: 'ENTSOE.CarbonIntensity(DE_LU)', unitName: 'g/kWh' },
  ],
  2: [{ id: 21, systemTag: 'power.feed/A', unitName: 'kW' }],
}

describe('useTaggedDcis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listObjectDcis.mockImplementation((id) => Promise.resolve(LISTS[id] ?? []))
  })

  it('reads every object without a root', async () => {
    const result = mountComposable(() => useTaggedDcis([1, 2], ['power.feed']))
    await flushPromises()
    expect(findTaggedDcis).not.toHaveBeenCalled()
    expect(listObjectDcis.mock.calls.map(([id]) => id)).toEqual([1, 2])
    expect(result.items.value).toEqual([
      { objectId: 2, dciId: 21, base: 'power.feed', qualifier: 'A', unitName: 'kW' },
    ])
  })

  it('reads tags once under the root, and names from the root alone', async () => {
    findTaggedDcis.mockResolvedValue([
      { ownerId: 2, dciId: 21, tag: 'power.feed/A', unit: 'kW' },
      { ownerId: 3, dciId: 31, tag: 'power.feed', unit: 'kW' },
    ])
    const result = mountComposable(() =>
      useTaggedDcis([1, 2], ['power.feed', 'heat.export'], {
        namePrefixes: ['ENTSOE.CarbonIntensity('],
        rootId: 1,
      }),
    )
    await flushPromises()
    expect(findTaggedDcis).toHaveBeenCalledWith(1, ['heat.export', 'power.feed'], expect.anything())
    expect(listObjectDcis.mock.calls.map(([id]) => id)).toEqual([1])
    expect(result.items.value.map((item) => [item.objectId, item.dciId, item.base])).toEqual([
      [2, 21, 'power.feed'],
      [1, 12, 'ENTSOE.CarbonIntensity('],
    ])
    expect(result.isLoading.value).toBe(false)
  })

  it('falls back to every object when the read under the root fails', async () => {
    findTaggedDcis.mockRejectedValue({ status: 404 })
    const result = mountComposable(() =>
      useTaggedDcis([1, 2], ['power.feed', 'heat.export'], { rootId: 1 }),
    )
    await flushPromises()
    expect(listObjectDcis.mock.calls.map(([id]) => id)).toEqual([1, 2])
    expect(result.items.value.map((item) => item.dciId)).toEqual([11, 21])
    expect(result.isError.value).toBe(false)
  })

  it('reads a demo root object by object', async () => {
    mountComposable(() => useTaggedDcis([9001], ['power.feed'], { rootId: 9000 }))
    await flushPromises()
    expect(findTaggedDcis).not.toHaveBeenCalled()
    expect(listObjectDcis).toHaveBeenCalledWith(9001)
  })
})

describe('useDataCenterValues', () => {
  it('drops disabled DCIs, whose last value is stale', async () => {
    getDataCenterValues.mockResolvedValue({
      '2:21': { id: 21, value: '3.5', status: 'active' },
      '2:22': { id: 22, value: '9', status: 'disabled' },
    })
    const result = mountComposable(() =>
      useDataCenterValues([
        { objectId: 2, dciId: 21 },
        { objectId: 2, dciId: 22 },
      ]),
    )
    await flushPromises()
    expect(result.valueOf({ objectId: 2, dciId: 21 })?.value).toBe('3.5')
    expect(result.valueOf({ objectId: 2, dciId: 22 })).toBeNull()
  })
})
