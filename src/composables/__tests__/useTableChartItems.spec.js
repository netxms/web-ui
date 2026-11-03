import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/objectsApi', () => ({
  getDciTableValue: vi.fn(),
}))

const objectsApi = await import('@/api/objectsApi')
const { useTableChartItems } = await import('../useTableChartItems')

const theme = { seriesColor: (i) => `#color${i}` }

function tableValue() {
  return {
    id: 88,
    timestamp: '2026-09-23T10:00:00.000Z',
    table: {
      columns: [{ name: 'IFNAME' }, { name: 'BYTES', unitName: 'B' }],
      data: [
        { values: [{ value: 'eth0' }, { value: '30' }] },
        { values: [{ value: 'eth1' }, { value: '0' }] },
        { values: [{ value: 'eth2' }, { value: '12' }] },
      ],
    },
  }
}

function config(overrides = {}) {
  return ref({
    nodeId: 730,
    dciId: 88,
    instanceColumn: 'IFNAME',
    dataColumn: 'BYTES',
    refreshRate: 30,
    ...overrides,
  })
}

let queryClient

function withComposable(composable) {
  let api
  mount(
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

describe('useTableChartItems', () => {
  it('builds one chart item per table row, coloured by series index', async () => {
    objectsApi.getDciTableValue.mockResolvedValue(tableValue())
    const api = withComposable(() => useTableChartItems(config(), theme))
    await settle()

    expect(api.items.value).toEqual([
      { name: 'eth0', value: 30, color: '#color0', unitName: 'B' },
      { name: 'eth1', value: 0, color: '#color1', unitName: 'B' },
      { name: 'eth2', value: 12, color: '#color2', unitName: 'B' },
    ])
  })

  it('reads one table, not one request per row', async () => {
    objectsApi.getDciTableValue.mockResolvedValue(tableValue())
    withComposable(() => useTableChartItems(config(), theme))
    await settle()

    expect(objectsApi.getDciTableValue).toHaveBeenCalledTimes(1)
    expect(objectsApi.getDciTableValue).toHaveBeenCalledWith(730, 88)
  })

  it('drops zero-valued rows when ignoreZeroValues is set', async () => {
    objectsApi.getDciTableValue.mockResolvedValue(tableValue())
    const api = withComposable(() => useTableChartItems(config({ ignoreZeroValues: true }), theme))
    await settle()

    expect(api.items.value.map((i) => i.name)).toEqual(['eth0', 'eth2'])
  })

  it('sorts on the data column when asked, descending included', async () => {
    objectsApi.getDciTableValue.mockResolvedValue(tableValue())
    const api = withComposable(() =>
      useTableChartItems(config({ sortOnDataColumn: true, sortDescending: true }), theme),
    )
    await settle()

    expect(api.items.value.map((i) => i.value)).toEqual([30, 12, 0])
  })

  it('leaves row order alone when sorting is off', async () => {
    objectsApi.getDciTableValue.mockResolvedValue(tableValue())
    const api = withComposable(() => useTableChartItems(config(), theme))
    await settle()

    expect(api.items.value.map((i) => i.value)).toEqual([30, 0, 12])
  })

  it('is unconfigured, and issues no request, until both columns are chosen', async () => {
    objectsApi.getDciTableValue.mockResolvedValue(tableValue())
    const api = withComposable(() => useTableChartItems(config({ dataColumn: '' }), theme))
    await settle()

    expect(api.isConfigured.value).toBe(false)
    expect(api.items.value).toEqual([])
    expect(objectsApi.getDciTableValue).not.toHaveBeenCalled()
  })

  it('yields no items when a configured column is absent from the table', async () => {
    objectsApi.getDciTableValue.mockResolvedValue(tableValue())
    const api = withComposable(() => useTableChartItems(config({ dataColumn: 'GONE' }), theme))
    await settle()

    expect(api.isConfigured.value).toBe(true)
    expect(api.items.value).toEqual([])
  })

  it('surfaces a failed read', async () => {
    objectsApi.getDciTableValue.mockRejectedValue(new Error('boom'))
    const api = withComposable(() => useTableChartItems(config(), theme))
    await settle()

    expect(api.hasError.value).toBe(true)
    expect(api.firstError.value).toBeInstanceOf(Error)
  })

  it('treats a table DCI with no collected value as empty, not an error', async () => {
    objectsApi.getDciTableValue.mockResolvedValue({ id: 88, timestamp: null, table: null })
    const api = withComposable(() => useTableChartItems(config(), theme))
    await settle()

    expect(api.hasError.value).toBe(false)
    expect(api.items.value).toEqual([])
  })
})
