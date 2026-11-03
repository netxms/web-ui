import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { userPrefs } from '@/utils/appStorage'
import {
  useAlarmNotifications,
  reloadAlarmNotificationPrefs,
  MIN_SEVERITY_OPTIONS,
  NOTIFY_POSITIONS,
  NOTIFY_OFF,
} from '../useAlarmNotifications'

const { minSeverity, position, enabled, setMinSeverity, setPosition, shouldNotify } =
  useAlarmNotifications()

describe('useAlarmNotifications', () => {
  beforeEach(() => {
    localStorage.clear()
    reloadAlarmNotificationPrefs()
  })

  it('defaults to major and above, top right', () => {
    expect(minSeverity.value).toBe(3)
    expect(position.value).toBe('top-right')
    expect(enabled.value).toBe(true)
  })

  it('persists both settings to the account preferences', () => {
    setMinSeverity(1)
    setPosition('bottom-left')

    expect(userPrefs.get('alarms.notify.minSeverity')).toBe(1)
    expect(userPrefs.get('alarms.notify.position')).toBe('bottom-left')

    reloadAlarmNotificationPrefs()
    expect(minSeverity.value).toBe(1)
    expect(position.value).toBe('bottom-left')
  })

  it('round-trips the off sentinel', () => {
    setMinSeverity(NOTIFY_OFF)
    reloadAlarmNotificationPrefs()

    expect(minSeverity.value).toBe(NOTIFY_OFF)
    expect(enabled.value).toBe(false)
  })

  it('falls back to the default rather than silencing alarms on corrupt storage', () => {
    userPrefs.set('alarms.notify.minSeverity', 'nonsense')
    userPrefs.set('alarms.notify.position', 'middle')
    reloadAlarmNotificationPrefs()

    expect(minSeverity.value).toBe(3)
    expect(position.value).toBe('top-right')
  })

  it("follows the account's settings when sign-in brings them", async () => {
    userPrefs.replace({ 'alarms.notify.minSeverity': 0, 'alarms.notify.position': 'top-left' }, '7')
    await nextTick()

    expect(minSeverity.value).toBe(0)
    expect(position.value).toBe('top-left')
  })

  it('rejects a position PrimeVue does not understand', () => {
    setPosition('bottom-left')
    setPosition('somewhere-else')

    expect(position.value).toBe('bottom-left')
  })

  describe('shouldNotify', () => {
    it('admits the threshold severity and everything above it', () => {
      setMinSeverity(3)

      expect(shouldNotify({ severity: 4 })).toBe(true)
      expect(shouldNotify({ severity: 3 })).toBe(true)
      expect(shouldNotify({ severity: 2 })).toBe(false)
    })

    it('admits everything at the lowest threshold', () => {
      setMinSeverity(0)

      expect(shouldNotify({ severity: 0 })).toBe(true)
      expect(shouldNotify({ severity: 4 })).toBe(true)
    })

    it('admits nothing when off', () => {
      setMinSeverity(NOTIFY_OFF)

      expect(shouldNotify({ severity: 4 })).toBe(false)
    })
  })

  it('offers off plus one threshold per severity, loudest first', () => {
    expect(MIN_SEVERITY_OPTIONS.map((o) => o.value)).toEqual([NOTIFY_OFF, 4, 3, 2, 1, 0])
    expect(MIN_SEVERITY_OPTIONS[1].label).toBe('Critical and above')
    expect(MIN_SEVERITY_OPTIONS.at(-1).label).toBe('All severities')
  })

  it('offers all four corners', () => {
    expect(NOTIFY_POSITIONS.map((p) => p.value)).toEqual([
      'top-right',
      'top-left',
      'bottom-right',
      'bottom-left',
    ])
  })
})
