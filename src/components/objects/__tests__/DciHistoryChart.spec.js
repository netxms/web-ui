import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DciHistoryChart from '../DciHistoryChart.vue'
import { useChartTheme } from '@/utils/chartTheme'

// The canvas never draws under jsdom; what matters is the option handed to it.
vi.mock('vue-echarts', () => ({
  default: { name: 'VChart', props: ['option'], template: '<div class="vchart-stub" />' },
}))

function optionFor(values, unitName = 'b/s') {
  const wrapper = mount(DciHistoryChart, { props: { historyData: { unitName, values } } })
  return wrapper.findComponent({ name: 'VChart' }).props('option')
}

const numeric = [
  { timestamp: '2026-10-26T10:00:00Z', value: '61384' },
  { timestamp: '2026-10-26T10:01:00Z', value: '330000.5' },
  { timestamp: '2026-10-26T10:02:00Z', value: '1500.25' },
]

describe('DciHistoryChart', () => {
  it('draws at once, without an entrance animation', () => {
    const option = optionFor(numeric)

    expect(option.animation).toBe(false)
    expect(option.tooltip.axisPointer.animation).toBe(false)
  })

  it('uses the chart theme rather than the ECharts defaults', () => {
    const option = optionFor(numeric)

    expect(option.series[0].lineStyle.color).toBe(useChartTheme().seriesColor(0))
    expect(option.yAxis.axisLabel.formatter(350000)).toBe('350 K')
    expect(option.yAxis.name).toBe('b/s')
  })

  it('labels a boolean series Yes and No', () => {
    const option = optionFor(
      [
        { timestamp: '2026-10-26T10:00:00Z', value: '0' },
        { timestamp: '2026-10-26T10:01:00Z', value: '1' },
      ],
      '',
    )

    expect(option.yAxis.axisLabel.formatter(1)).toBe('Yes')
    expect(option.yAxis.axisLabel.formatter(0)).toBe('No')
  })
})
