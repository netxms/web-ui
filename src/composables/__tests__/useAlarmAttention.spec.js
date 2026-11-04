import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import * as alarmsApi from '@/api/alarmsApi'
import { useAlarmAttention } from '@/composables/useAlarmAttention'
import { useAlarms } from '@/queries/useAlarmQueries'

vi.mock('@/api/alarmsApi')

const POLL_MS = 30 * 1000

let queryClient

function setup(useHook) {
  let result
  const Host = defineComponent({
    setup() {
      result = useHook()
      return () => h('div')
    },
  })
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })
  return result
}

const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  queryClient = new QueryClient()
})

afterEach(() => {
  queryClient.clear()
  vi.useRealTimers()
})

describe('useAlarmAttention', () => {
  it('counts outstanding alarms and takes the worst severity among them', async () => {
    alarmsApi.getAlarms.mockResolvedValue([
      { id: 1, state: 0, severity: 1 },
      { id: 2, state: 0, severity: 2 },
      { id: 3, state: 1, severity: 4 },
      { id: 4, state: 2, severity: 3 },
    ])
    setup(() => useAlarms())
    const { count, worstSeverity } = setup(useAlarmAttention)

    await settle()

    expect(count.value).toBe(2)
    expect(worstSeverity.value).toBe('minor')
  })

  it('has no severity with nothing outstanding', async () => {
    alarmsApi.getAlarms.mockResolvedValue([{ id: 1, state: 1, severity: 4 }])
    setup(() => useAlarms())
    const { count, worstSeverity } = setup(useAlarmAttention)

    await settle()

    expect(count.value).toBe(0)
    expect(worstSeverity.value).toBeNull()
  })

  it('never fetches by itself', async () => {
    setup(useAlarmAttention)

    await vi.advanceTimersByTimeAsync(POLL_MS * 2)

    expect(alarmsApi.getAlarms).not.toHaveBeenCalled()
  })

  it('follows the poll without adding a timer of its own', async () => {
    alarmsApi.getAlarms.mockResolvedValue([{ id: 1, state: 0, severity: 1 }])
    setup(() => useAlarms())
    await settle()
    expect(alarmsApi.getAlarms).toHaveBeenCalledTimes(1)

    // A late start, as an active observer's timer would then fire apart from the poll's.
    await vi.advanceTimersByTimeAsync(1000)
    const { count, worstSeverity } = setup(useAlarmAttention)
    expect(count.value).toBe(1)

    alarmsApi.getAlarms.mockResolvedValue([
      { id: 1, state: 0, severity: 1 },
      { id: 2, state: 0, severity: 4 },
    ])
    await vi.advanceTimersByTimeAsync(POLL_MS - 1000)
    expect(alarmsApi.getAlarms).toHaveBeenCalledTimes(2)
    expect(count.value).toBe(2)
    expect(worstSeverity.value).toBe('critical')

    await vi.advanceTimersByTimeAsync(1000)
    expect(alarmsApi.getAlarms).toHaveBeenCalledTimes(2)
  })
})
