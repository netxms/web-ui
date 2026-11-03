import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'

const valuesByNode = {
  10: [
    // 1240 B/s, multipliers on by default: "1.24 kB/s" (thin space before the unit)
    { id: 1, value: '1240', dataType: 0, unitName: 'B/s', multiplier: 0, flags: 0 },
    // mapped by the table the mapping mock knows: 2 -> "down"
    { id: 2, value: '2', dataType: 0, unitName: '', multiplier: 0, flags: 0, mappingTableId: 5 },
    // never collected
    { id: 3, value: '', dataType: 0, unitName: '%', multiplier: 0, flags: 0, noValue: true },
    // percent is never scaled; the entry's display format applies
    { id: 4, value: '42.567', dataType: 5, unitName: '%', multiplier: 0, flags: 0 },
  ],
}

const useDciValues = vi.fn(() => ({
  isLoading: ref(false),
  isError: ref(false),
  error: ref(null),
  refetch: vi.fn(),
  valueOf: (item) => {
    const row = (valuesByNode[item?.objectId] ?? []).find((v) => v.id === item.dciId)
    // A table cell answers with the cell's own value.
    return row && item.column ? { ...row, value: '55' } : row
  },
}))
vi.mock('@/queries/useObjectQueries', () => ({ useDciValues }))
vi.mock('@/composables/useDashboardContext', () => ({
  useDashboardContext: () => ({ dashboardId: computed(() => 42) }),
}))
vi.mock('@/queries/useMappingTableQueries', () => ({
  useDciValueMapping: () => ({
    mappedValue: (row) => (row?.mappingTableId === 5 && row.value === '2' ? 'down' : null),
  }),
}))
vi.mock('@/composables/useWidgetActive', () => ({ useWidgetActive: () => ref(true) }))
vi.mock('@/composables/useRuntimeDciList', () => ({
  useRuntimeDciList: (cfg) => ({
    dciList: computed(() => cfg.value.dciList),
    isResolving: ref(false),
    resolveError: ref(null),
  }),
}))

const { useDciCurrentItems } = await import('../useDciCurrentItems')

const theme = { seriesColor: (i) => `#color${i}` }

function itemsFor(dciList) {
  return useDciCurrentItems(ref({ dciList }), theme).items.value
}

describe('useDciCurrentItems displayValue', () => {
  it('formats with the DCI unit and multipliers, as Last Values does', () => {
    const [item] = itemsFor([{ nodeId: 10, dciId: 1, name: 'Traffic' }])
    expect(item.value).toBe(1240)
    expect(item.displayValue).toBe('1.24 kB/s')
  })

  it('prefers the mapping table text', () => {
    const [item] = itemsFor([{ nodeId: 10, dciId: 2, name: 'Oper status' }])
    expect(item.mappedValue).toBe('down')
    expect(item.displayValue).toBe('down')
  })

  it('applies the entry display format', () => {
    const [item] = itemsFor([{ nodeId: 10, dciId: 4, name: 'CPU', displayFormat: '%.1f%%' }])
    expect(item.displayValue).toBe('42.6%')
  })

  it('is null for a DCI without a value and for a missing DCI', () => {
    const items = itemsFor([
      { nodeId: 10, dciId: 3, name: 'Never collected' },
      { nodeId: 10, dciId: 99, name: 'Deleted' },
    ])
    expect(items.map((item) => item.displayValue)).toEqual([null, null])
  })
})

describe('useDciCurrentItems requests', () => {
  it('asks for exactly the listed DCIs, through the dashboard', () => {
    useDciValues.mockClear()
    itemsFor([
      { nodeId: 10, dciId: 1 },
      { nodeId: 10, dciId: 4 },
    ])

    const [items, options] = useDciValues.mock.calls[0]
    expect(items.value).toEqual([
      { objectId: 10, dciId: 1 },
      { objectId: 10, dciId: 4 },
    ])
    expect(options.delegate.value).toBe(42)
    expect(options.refetchInterval.value).toBe(30000)
  })

  it('has no cap on the number of DCIs', () => {
    const list = Array.from({ length: 12 }, () => ({ nodeId: 10, dciId: 1 }))
    expect(itemsFor(list)).toHaveLength(12)
  })

  it('plots the cell of a table entry', () => {
    const [item] = itemsFor([
      { nodeId: 10, dciId: 4, type: 2, column: 'FREE', instance: 'C:', name: 'Disk' },
    ])
    expect(useDciValues.mock.lastCall[0].value).toEqual([
      { objectId: 10, dciId: 4, column: 'FREE', instance: 'C:' },
    ])
    expect(item.value).toBe(55)
  })
})
