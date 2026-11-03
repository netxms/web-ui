import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, nextTick, effectScope } from 'vue'

const toastAdd = vi.fn()
const alarmData = ref(null)

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@/queries/useAlarmQueries', () => ({ useAlarms: () => ({ data: alarmData }) }))

const { useAlarmFeed, ALARM_TOAST_GROUP, MAX_ALARM_TOASTS } = await import('../useAlarmFeed')
const { useAlarmNotifications, NOTIFY_OFF, reloadAlarmNotificationPrefs } =
  await import('../useAlarmNotifications')

const { setMinSeverity } = useAlarmNotifications()

/** @param {number} id @param {number} severity */
function alarm(id, severity, extra = {}) {
  return { id, severity, sourceName: `node-${id}`, message: `message ${id}`, ...extra }
}

async function poll(alarms) {
  alarmData.value = alarms
  await nextTick()
}

/** Everything but the overflow summary. */
function alarmToasts() {
  return toastAdd.mock.calls.map((c) => c[0]).filter((m) => !m.isSummary)
}

function summaryToast() {
  return toastAdd.mock.calls.map((c) => c[0]).find((m) => m.isSummary)
}

describe('useAlarmFeed', () => {
  // The watcher outlives the call; without a scope each test would stack another one.
  let scope

  beforeEach(() => {
    toastAdd.mockClear()
    alarmData.value = null
    localStorage.clear()
    reloadAlarmNotificationPrefs()
    // Default is "major and above".
    setMinSeverity(0)
    scope = effectScope()
    scope.run(() => useAlarmFeed())
  })

  afterEach(() => scope.stop())

  it('stays silent on the first result, which is a baseline and not news', async () => {
    await poll([alarm(1, 4), alarm(2, 3)])
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('notifies only for ids that were not in the previous result', async () => {
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), alarm(2, 3)])

    expect(alarmToasts()).toHaveLength(1)
    expect(alarmToasts()[0]).toMatchObject({
      group: ALARM_TOAST_GROUP,
      summary: 'node-2',
      detail: 'message 2',
      alarmId: 2,
      alarmSeverity: 'major',
    })
  })

  it('drops alarms below the configured threshold', async () => {
    setMinSeverity(3)
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), alarm(2, 4), alarm(3, 2), alarm(4, 1)])

    expect(alarmToasts().map((m) => m.alarmId)).toEqual([2])
  })

  it('accepts string severities from the API', async () => {
    setMinSeverity(3)
    await poll([alarm(1, 'normal')])
    await poll([alarm(1, 'normal'), alarm(2, 'CRITICAL'), alarm(3, 'minor')])

    expect(alarmToasts().map((m) => m.alarmId)).toEqual([2])
  })

  it('shows nothing at all when notifications are off', async () => {
    setMinSeverity(NOTIFY_OFF)
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), alarm(2, 4)])

    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('does not replay the backlog accumulated while it was off', async () => {
    setMinSeverity(NOTIFY_OFF)
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), alarm(2, 4), alarm(3, 4)])

    setMinSeverity(0)
    await poll([alarm(1, 4), alarm(2, 4), alarm(3, 4), alarm(4, 4)])

    expect(alarmToasts().map((m) => m.alarmId)).toEqual([4])
  })

  it('caps individual toasts and collapses the rest into one summary', async () => {
    const burst = Array.from({ length: MAX_ALARM_TOASTS + 3 }, (_, i) => alarm(i + 2, 4))
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), ...burst])

    expect(alarmToasts()).toHaveLength(MAX_ALARM_TOASTS)
    expect(summaryToast()).toMatchObject({
      group: ALARM_TOAST_GROUP,
      summary: '+3 more new alarms',
    })
    expect(summaryToast().alarmId).toBeUndefined()
  })

  it('singularizes the summary for a single overflowing alarm', async () => {
    const burst = Array.from({ length: MAX_ALARM_TOASTS + 1 }, (_, i) => alarm(i + 2, 4))
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), ...burst])

    expect(summaryToast().summary).toBe('+1 more new alarm')
  })

  it('spends the cap on the most severe alarms', async () => {
    const burst = [alarm(2, 1), alarm(3, 4), alarm(4, 2), alarm(5, 3), alarm(6, 4), alarm(7, 0)]
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), ...burst])

    expect(alarmToasts().map((m) => m.alarmSeverity)).toEqual([
      'critical',
      'critical',
      'major',
      'minor',
    ])
    expect(summaryToast().summary).toBe('+2 more new alarms')
  })

  it('truncates a long message rather than filling the screen with it', async () => {
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), alarm(2, 4, { message: 'x'.repeat(400) })])

    expect(alarmToasts()[0].detail.length).toBeLessThanOrEqual(110)
  })

  it('falls back to a placeholder when the alarm names no source', async () => {
    await poll([alarm(1, 4)])
    await poll([alarm(1, 4), { id: 2, severity: 4 }])

    expect(alarmToasts()[0]).toMatchObject({ summary: 'Unknown', detail: '' })
  })

  it('ignores an undefined result without losing the previous baseline', async () => {
    await poll([alarm(1, 4)])
    await poll(undefined)
    await poll([alarm(1, 4), alarm(2, 4)])

    expect(alarmToasts().map((m) => m.alarmId)).toEqual([2])
  })
})
