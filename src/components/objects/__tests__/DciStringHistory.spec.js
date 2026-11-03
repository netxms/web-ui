import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import DciStringHistory from '@/components/objects/DciStringHistory.vue'

function makeHistory(count) {
  const base = Date.parse('2026-08-04T06:00:00.000Z')
  return {
    description: 'Config saved',
    unitName: '',
    values: Array.from({ length: count }, (_, i) => ({
      timestamp: new Date(base + i * 60_000).toISOString(),
      value: i === count - 1 ? 'Yes' : 'No',
    })),
  }
}

function mountHistory(historyData) {
  return mount(DciStringHistory, {
    props: { historyData },
    global: { plugins: [PrimeVue] },
  })
}

describe('DciStringHistory', () => {
  it('renders only one page of rows for a large sample set', () => {
    const wrapper = mountHistory(makeHistory(500))
    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
  })

  it('sorts newest sample first', () => {
    // Newest sample is the only 'Yes' - it must be on the first page, in the first row.
    const wrapper = mountHistory(makeHistory(500))
    expect(wrapper.findAll('tbody tr')[0].text()).toContain('Yes')
  })

  it('shows the empty state when there are no samples', () => {
    const wrapper = mountHistory({ values: [] })
    expect(wrapper.text()).toContain('No history available.')
  })

  it('tolerates a response without a values array', () => {
    const wrapper = mountHistory({})
    expect(wrapper.text()).toContain('No history available.')
  })
})
