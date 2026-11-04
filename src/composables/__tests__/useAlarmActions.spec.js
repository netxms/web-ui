import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const confirmRequire = vi.fn()
const notify = vi.fn()

vi.mock('@/api/alarmsApi', () => ({
  acknowledgeAlarm: vi.fn(),
  resolveAlarm: vi.fn(),
  terminateAlarm: vi.fn(),
}))
vi.mock('@/api/serverApi', () => ({ getServerInfo: vi.fn() }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))
vi.mock('@/utils/notify', () => ({ notify: (...args) => notify(...args) }))

const alarmsApi = await import('@/api/alarmsApi')
const serverApi = await import('@/api/serverApi')
const { useAlarmActions } = await import('../useAlarmActions')

let queryClient

async function setup(options) {
  let api
  mount(
    defineComponent({
      setup() {
        api = useAlarmActions(options)
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  await flushPromises()
  return api
}

const OUTSTANDING = { id: 1, state: 0 }
const ACKNOWLEDGED = { id: 2, state: 1 }
const RESOLVED = { id: 3, state: 2 }

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
  serverApi.getServerInfo.mockResolvedValue({ options: {} })
  for (const name of ['acknowledgeAlarm', 'resolveAlarm', 'terminateAlarm']) {
    alarmsApi[name].mockResolvedValue(undefined)
  }
})

afterEach(() => {
  queryClient.clear()
})

describe('useAlarmActions', () => {
  it('sends the action only to the alarms it applies to', async () => {
    const api = await setup()

    await api.run('acknowledge', [OUTSTANDING, ACKNOWLEDGED, RESOLVED])

    expect(alarmsApi.acknowledgeAlarm).toHaveBeenCalledTimes(1)
    expect(alarmsApi.acknowledgeAlarm.mock.calls[0][0]).toBe(1)
  })

  it('counts what an action applies to, under the server strict flow setting', async () => {
    serverApi.getServerInfo.mockResolvedValue({ options: { strictAlarmStatusFlow: true } })
    const api = await setup()

    expect(api.allowing('terminate', [OUTSTANDING, ACKNOWLEDGED, RESOLVED])).toEqual([RESOLVED])
  })

  it('reads whether timed acknowledgment is on', async () => {
    serverApi.getServerInfo.mockResolvedValue({ options: { timedAlarmAckEnabled: true } })
    const api = await setup()

    expect(api.timedAckEnabled.value).toBe(true)
  })

  it('tells the caller which alarms went through', async () => {
    const onSucceeded = vi.fn()
    alarmsApi.resolveAlarm.mockImplementation((id) =>
      id === 2 ? Promise.reject(new Error('nope')) : Promise.resolve(),
    )
    const api = await setup({ onSucceeded })

    await api.run('resolve', [OUTSTANDING, ACKNOWLEDGED])

    expect(onSucceeded).toHaveBeenCalledWith([1])
  })

  describe('terminate', () => {
    it('runs one alarm straight away', async () => {
      const api = await setup()

      await api.run('terminate', [OUTSTANDING])

      expect(confirmRequire).not.toHaveBeenCalled()
      expect(alarmsApi.terminateAlarm).toHaveBeenCalledTimes(1)
    })

    it('asks before terminating several, and does nothing unless accepted', async () => {
      const api = await setup()

      api.run('terminate', [OUTSTANDING, ACKNOWLEDGED])
      await flushPromises()

      expect(confirmRequire.mock.calls[0][0].message).toContain('Terminate 2 alarms')
      expect(alarmsApi.terminateAlarm).not.toHaveBeenCalled()

      confirmRequire.mock.calls[0][0].accept()
      await flushPromises()

      expect(alarmsApi.terminateAlarm).toHaveBeenCalledTimes(2)
    })

    it('counts only the alarms it applies to in the question', async () => {
      serverApi.getServerInfo.mockResolvedValue({ options: { strictAlarmStatusFlow: true } })
      const api = await setup()

      api.run('terminate', [OUTSTANDING, RESOLVED, { id: 4, state: 2 }])
      await flushPromises()

      expect(confirmRequire.mock.calls[0][0].message).toContain('Terminate 2 alarms')
    })
  })

  describe('reporting', () => {
    it('says nothing when one alarm changed: the row shows it', async () => {
      const api = await setup()

      await api.run('resolve', [OUTSTANDING])

      expect(notify).not.toHaveBeenCalled()
    })

    it('names the count when several changed', async () => {
      const api = await setup()

      await api.run('resolve', [OUTSTANDING, ACKNOWLEDGED])

      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success', summary: 'Resolved 2 alarms' }),
      )
    })

    it('names how many failed and why, once', async () => {
      const denied = Object.assign(new Error('Forbidden'), { status: 403 })
      alarmsApi.resolveAlarm.mockRejectedValue(denied)
      const api = await setup()

      await api.run('resolve', [OUTSTANDING, ACKNOWLEDGED])

      expect(notify).toHaveBeenCalledTimes(1)
      const report = notify.mock.calls[0][0]
      expect(report.severity).toBe('error')
      expect(report.summary).toBe('Could not resolve 2 of 2 alarms')
      expect(report.detail).toMatch(/access/i)
    })

    it('reports a single failure too, since nothing else will', async () => {
      alarmsApi.resolveAlarm.mockRejectedValue(new Error('Server error'))
      const api = await setup()

      await api.run('resolve', [OUTSTANDING])

      expect(notify.mock.calls[0][0]).toMatchObject({
        severity: 'error',
        summary: 'Could not resolve the alarm',
        detail: 'Server error',
      })
    })
  })

  describe('progress', () => {
    it('counts while running and clears afterwards', async () => {
      let release
      alarmsApi.resolveAlarm.mockImplementationOnce(
        () => new Promise((resolve) => (release = resolve)),
      )
      const api = await setup()

      const running = api.run('resolve', [OUTSTANDING, ACKNOWLEDGED])
      await flushPromises()

      expect(api.isRunning.value).toBe(true)
      expect(api.progressText.value).toBe('Resolving 1 of 2...')

      release()
      await running

      expect(api.isRunning.value).toBe(false)
      expect(api.progressText.value).toBeNull()
    })

    it('shows no count for one alarm', async () => {
      let release
      alarmsApi.resolveAlarm.mockImplementationOnce(
        () => new Promise((resolve) => (release = resolve)),
      )
      const api = await setup()

      const running = api.run('resolve', [OUTSTANDING])
      await flushPromises()

      expect(api.progressText.value).toBeNull()

      release()
      await running
    })

    it('refuses a second run while one is going', async () => {
      let release
      alarmsApi.resolveAlarm.mockImplementationOnce(
        () => new Promise((resolve) => (release = resolve)),
      )
      const api = await setup()

      const running = api.run('resolve', [OUTSTANDING])
      await flushPromises()
      await api.run('acknowledge', [OUTSTANDING])

      expect(alarmsApi.acknowledgeAlarm).not.toHaveBeenCalled()

      release()
      await running
    })
  })
})
