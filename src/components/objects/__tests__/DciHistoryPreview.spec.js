import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, toValue } from 'vue'
import DciHistoryPreview from '../DciHistoryPreview.vue'

let historyData
let historyLoading
let lastOptions

vi.mock('@/queries/useObjectQueries', () => ({
  useDciHistory: (objectId, dciId, options) => {
    lastOptions = options
    return { data: historyData, isLoading: historyLoading }
  },
}))

const DAY = 24 * 60 * 60
const iso = (unixSeconds) => new Date(unixSeconds * 1000).toISOString()
const nowSeconds = () => Math.floor(Date.now() / 1000)

function mountPreview(props) {
  return mount(DciHistoryPreview, {
    props: { objectId: 1, dciId: 2, ...props },
    global: {
      stubs: {
        DciHistoryChart: { template: '<div class="chart-stub" />' },
        DciStringHistory: { template: '<div class="string-stub" />' },
        ChartSkeleton: {
          props: ['height'],
          template: '<div class="chart-skeleton-stub">{{ height }}</div>',
        },
        TableSkeleton: {
          props: ['rows'],
          template: '<div class="table-skeleton-stub">{{ rows }}</div>',
        },
      },
    },
  })
}

beforeEach(() => {
  historyData = ref({ values: [{ timestamp: '2026-10-16T10:00:00Z', value: '1' }] })
  historyLoading = ref(false)
  lastOptions = null
})

describe('DciHistoryPreview', () => {
  it('draws the history of a DCI that is still collecting, ending now', () => {
    const wrapper = mountPreview({ lastTimestamp: iso(nowSeconds() - 60) })

    expect(wrapper.find('.chart-stub').exists()).toBe(true)
    expect(toValue(lastOptions.endAt)).toBeNull()
    expect(wrapper.text()).not.toContain('No values collected since')
  })

  it("stands in for the chart, at the chart's height, while the history loads", () => {
    historyData.value = undefined
    historyLoading.value = true
    const wrapper = mountPreview({ lastTimestamp: iso(nowSeconds() - 60) })

    expect(wrapper.find('.chart-skeleton-stub').text()).toBe('200px')
    expect(wrapper.find('.table-skeleton-stub').exists()).toBe(false)
    expect(wrapper.find('.chart-stub').exists()).toBe(false)
  })

  it('stands in for a page of the table while a string DCI loads', () => {
    historyData.value = undefined
    historyLoading.value = true
    const wrapper = mountPreview({ lastTimestamp: iso(nowSeconds() - 60), isString: true })

    expect(wrapper.find('.table-skeleton-stub').text()).toBe('10')
    expect(wrapper.find('.chart-skeleton-stub').exists()).toBe(false)
  })

  it('lists rather than draws a string DCI', () => {
    const wrapper = mountPreview({ lastTimestamp: iso(nowSeconds() - 60), isString: true })

    expect(wrapper.find('.string-stub').exists()).toBe(true)
    expect(wrapper.find('.chart-stub').exists()).toBe(false)
  })

  it('shows the day before the last value once nothing was collected for longer', () => {
    const last = nowSeconds() - 17 * DAY
    const wrapper = mountPreview({ lastTimestamp: iso(last) })

    expect(toValue(lastOptions.endAt)).toBe(last)
    expect(wrapper.text()).toContain('No values collected since')
    expect(wrapper.text()).toContain('Showing the 24 hours before that.')
    expect(wrapper.find('.chart-stub').exists()).toBe(true)
  })

  it('shows the empty state, not an empty chart, when the window holds no values', () => {
    historyData.value = { unitName: '%', values: [] }
    const wrapper = mountPreview({ lastTimestamp: iso(nowSeconds() - 60) })

    expect(wrapper.find('.chart-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('No history data available.')
  })

  it('says so when the DCI never collected a value', () => {
    historyData.value = { values: [] }
    const wrapper = mountPreview({ lastTimestamp: '1970-01-01T00:00:00Z' })

    expect(wrapper.find('.chart-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('No values have been collected for this DCI yet.')
  })
})
