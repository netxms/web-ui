import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

// A partial mock is enough: other exports are only dereferenced inside queryFns not run here.
vi.mock('@/api/alarmsApi', () => ({
  acknowledgeAlarm: vi.fn(),
  resolveAlarm: vi.fn(),
  terminateAlarm: vi.fn(),
}))

const alarmsApi = await import('@/api/alarmsApi')
const { useAcknowledgeAlarm, useResolveAlarm, useTerminateAlarm, alarmKeys } =
  await import('../useAlarmQueries')

let queryClient

function withMutation(useMutationHook) {
  let api
  mount(
    defineComponent({
      setup() {
        api = useMutationHook()
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

describe.each([
  ['useAcknowledgeAlarm', useAcknowledgeAlarm, 'acknowledgeAlarm'],
  ['useResolveAlarm', useResolveAlarm, 'resolveAlarm'],
  ['useTerminateAlarm', useTerminateAlarm, 'terminateAlarm'],
])('%s', (_, useMutationHook, apiName) => {
  it('calls the alarm API with the alarm id', async () => {
    alarmsApi[apiName].mockResolvedValue(undefined)
    const mutation = withMutation(useMutationHook)

    await mutation.mutateAsync(42)

    expect(alarmsApi[apiName]).toHaveBeenCalledWith(42)
  })

  it('invalidates every alarm query on success', async () => {
    alarmsApi[apiName].mockResolvedValue(undefined)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const mutation = withMutation(useMutationHook)

    await mutation.mutateAsync(42)

    expect(invalidate).toHaveBeenCalledWith({ queryKey: alarmKeys.all() })
  })

  it('invalidates nothing when the call fails', async () => {
    alarmsApi[apiName].mockRejectedValue(new Error('Access denied'))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const mutation = withMutation(useMutationHook)

    await expect(mutation.mutateAsync(42)).rejects.toThrow('Access denied')

    expect(invalidate).not.toHaveBeenCalled()
  })
})
