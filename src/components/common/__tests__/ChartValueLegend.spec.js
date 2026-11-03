import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartValueLegend from '@/components/common/ChartValueLegend.vue'

const items = [
  { name: 'Used memory', value: 75, color: '#22c55e', unitName: 'MB' },
  { name: 'Free memory', value: 25, color: '#3b82f6', unitName: 'MB' },
]

function mountLegend(props = {}) {
  return mount(ChartValueLegend, { props: { items, ...props } })
}

describe('ChartValueLegend', () => {
  it('lists names only in the plain form', () => {
    const wrapper = mountLegend()

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.findAll('.chart-legend__item')).toHaveLength(2)
    expect(wrapper.text()).toContain('Used memory')
    expect(wrapper.text()).not.toContain('75')
  })

  it('adds value and share columns in the extended form', () => {
    const wrapper = mountLegend({ extended: true })
    const cells = wrapper.findAll('tbody td').map((c) => c.text())

    expect(cells).toEqual(['75 MB', '75.00%', '25 MB', '25.00%'])
  })

  it('drops the share column when the percent option is off', () => {
    const wrapper = mountLegend({ extended: true, showPercent: false })

    expect(wrapper.findAll('thead th')).toHaveLength(2)
    expect(wrapper.findAll('tbody td').map((c) => c.text())).toEqual(['75 MB', '25 MB'])
  })

  it('shows no share where the parts do not add up to a whole', () => {
    const wrapper = mount(ChartValueLegend, {
      props: {
        items: [
          { name: 'Delta', value: -5, color: '#ef4444' },
          { name: 'Load', value: 10, color: '#22c55e' },
        ],
        extended: true,
      },
    })

    expect(wrapper.findAll('tbody td').map((c) => c.text())).toEqual(['-5', '-', '10', '-'])
  })

  it('places itself on the edge it was given', () => {
    expect(mountLegend({ place: 'right' }).classes()).toContain('chart-legend--right')
    expect(mountLegend().classes()).toContain('chart-legend--bottom')
  })
})
