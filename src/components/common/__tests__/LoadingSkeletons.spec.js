import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartSkeleton from '../ChartSkeleton.vue'
import TableSkeleton from '../TableSkeleton.vue'

describe('ChartSkeleton', () => {
  it('takes the height of the chart it stands in for', () => {
    const wrapper = mount(ChartSkeleton, { props: { height: '280px' } })

    expect(wrapper.attributes('style')).toContain('height: 280px')
  })

  it('announces what is loading, and nothing of its drawing', () => {
    const wrapper = mount(ChartSkeleton, { props: { label: 'Loading history' } })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.find('.sr-only').text()).toBe('Loading history')
    expect(wrapper.findAll('[aria-hidden="true"]')).toHaveLength(3)
  })
})

describe('TableSkeleton', () => {
  it('lays out a header and the given rows in the given columns', () => {
    const wrapper = mount(TableSkeleton, { props: { columns: ['180fr', '320fr'], rows: 4 } })

    expect(wrapper.attributes('style')).toContain('grid-template-columns: 180fr 320fr')
    expect(wrapper.findAll('.table-skeleton__cell--head')).toHaveLength(2)
    expect(wrapper.findAll('.table-skeleton__cell')).toHaveLength(2 + 4 * 2)
  })

  it('varies the bar lengths from row to row', () => {
    const wrapper = mount(TableSkeleton, { props: { columns: ['1fr'], rows: 3 } })
    const widths = wrapper
      .findAll('.table-skeleton__cell:not(.table-skeleton__cell--head) .table-skeleton__bar')
      .map((bar) => bar.attributes('style'))

    expect(new Set(widths).size).toBe(3)
  })
})
