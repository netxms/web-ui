import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/alarmsApi', () => ({ getAlarms: vi.fn(), getAlarm: vi.fn() }))

const alarmsApi = await import('@/api/alarmsApi')
const { alarmKeys, useAlarmDci, useAlarmSourceObjects } = await import('../useAlarmQueries')

let queryClient

function withQuery(useHook) {
  let api
  mount(
    defineComponent({
      setup() {
        api = useHook()
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return api
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
})

afterEach(() => {
  queryClient.clear()
})

describe('useAlarmSourceObjects', () => {
  const NODE = { id: 10, class: 'Node', category: 3 }
  const SENSOR = { id: 11, class: 'Sensor', category: 0 }

  it('indexes the source objects by id, which only the detailed list carries', async () => {
    alarmsApi.getAlarms.mockResolvedValue([
      { id: 1, source: 10, sourceObject: NODE },
      { id: 2, source: 11, sourceObject: SENSOR },
      { id: 3, source: 10, sourceObject: NODE },
    ])

    const { data } = withQuery(useAlarmSourceObjects)
    await flushPromises()

    expect(alarmsApi.getAlarms).toHaveBeenCalledWith({ includeObjectDetails: true })
    expect([...data.value.keys()]).toEqual([10, 11])
    expect(data.value.get(10)).toEqual(NODE)
  })

  it('tolerates a server that leaves the object out', async () => {
    alarmsApi.getAlarms.mockResolvedValue([{ id: 1, source: 10 }])

    const { data } = withQuery(useAlarmSourceObjects)
    await flushPromises()

    expect(data.value.size).toBe(0)
  })

  // Every state change invalidates the alarm keys; this list is too heavy to come along.
  it('stays out of the refetch an alarm state change triggers', async () => {
    alarmsApi.getAlarms.mockResolvedValue([])
    withQuery(useAlarmSourceObjects)
    await flushPromises()

    await queryClient.invalidateQueries({ queryKey: alarmKeys.all() })
    await flushPromises()

    expect(alarmsApi.getAlarms).toHaveBeenCalledTimes(1)
  })
})

describe('useAlarmDci', () => {
  it('reads the DCI from the alarm details', async () => {
    alarmsApi.getAlarm.mockResolvedValue({ id: 5, dci: 77 })

    const { data } = withQuery(() => useAlarmDci(() => 5))
    await flushPromises()

    expect(alarmsApi.getAlarm).toHaveBeenCalledWith(5)
    expect(data.value).toBe(77)
  })

  it('asks for nothing until there is an alarm', async () => {
    const id = ref(null)
    withQuery(() => useAlarmDci(id))
    await flushPromises()

    expect(alarmsApi.getAlarm).not.toHaveBeenCalled()
  })
})
