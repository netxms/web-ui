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
const { useAcknowledgeAlarm, useAlarmBulkAction, useResolveAlarm, useTerminateAlarm, alarmKeys } =
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

describe('useAlarmBulkAction', () => {
  it('sends one request per alarm and reports them as gone through', async () => {
    alarmsApi.resolveAlarm.mockResolvedValue(undefined)
    const mutation = withMutation(useAlarmBulkAction)

    const result = await mutation.mutateAsync({ action: 'resolve', ids: [1, 2, 3] })

    expect(alarmsApi.resolveAlarm).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ succeeded: [1, 2, 3], failed: [] })
  })

  it('carries on past a failure and names it', async () => {
    const denied = Object.assign(new Error('Access denied'), { status: 403 })
    alarmsApi.terminateAlarm.mockImplementation((id) =>
      id === 2 ? Promise.reject(denied) : Promise.resolve(),
    )
    const mutation = withMutation(useAlarmBulkAction)

    const result = await mutation.mutateAsync({ action: 'terminate', ids: [1, 2, 3] })

    expect(result).toEqual({ succeeded: [1, 3], failed: [{ id: 2, error: denied }] })
  })

  // The client toasts every 403 on a write; a selection would stack one toast per alarm.
  it('reports refusals itself instead of through the global toast', async () => {
    alarmsApi.acknowledgeAlarm.mockResolvedValue(undefined)
    const mutation = withMutation(useAlarmBulkAction)

    await mutation.mutateAsync({ action: 'acknowledge', ids: [7] })

    expect(alarmsApi.acknowledgeAlarm).toHaveBeenCalledWith(7, { suppressForbidden: true })
  })

  it('never has more than three requests open', async () => {
    let open = 0
    let peak = 0
    alarmsApi.resolveAlarm.mockImplementation(async () => {
      peak = Math.max(peak, ++open)
      await Promise.resolve()
      open--
    })
    const mutation = withMutation(useAlarmBulkAction)

    await mutation.mutateAsync({ action: 'resolve', ids: [1, 2, 3, 4, 5, 6, 7, 8] })

    expect(peak).toBe(3)
  })

  it('refetches the list once, not once per alarm', async () => {
    alarmsApi.resolveAlarm.mockResolvedValue(undefined)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const mutation = withMutation(useAlarmBulkAction)

    await mutation.mutateAsync({ action: 'resolve', ids: [1, 2, 3, 4] })

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: alarmKeys.all() })
  })

  it('refetches even when every alarm failed, since others may have changed them', async () => {
    alarmsApi.resolveAlarm.mockRejectedValue(new Error('nope'))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const mutation = withMutation(useAlarmBulkAction)

    await mutation.mutateAsync({ action: 'resolve', ids: [1] })

    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('reports progress as alarms finish', async () => {
    alarmsApi.resolveAlarm.mockResolvedValue(undefined)
    const onProgress = vi.fn()
    const mutation = withMutation(useAlarmBulkAction)

    await mutation.mutateAsync({ action: 'resolve', ids: [1, 2], onProgress })

    expect(onProgress.mock.calls.map(([done]) => done)).toEqual([1, 2])
  })
})
