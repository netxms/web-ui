import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useLogPrefsStore } from '@/stores/logPrefsStore'
import { createBucket, userPrefs } from '@/utils/appStorage'

const logPrefsBucket = createBucket('log-prefs', 'local')

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('logPrefsStore', () => {
  it('keeps the time range with the account and widths in this browser', async () => {
    const prefs = useLogPrefsStore()
    prefs.setTimePreset('syslog', 'last7d')
    prefs.setColumnWidths('syslog', { hostname: 200 })
    prefs.setColumnWidths('syslog', { msg_text: 400 })
    await nextTick()

    expect(userPrefs.get('logs.presentation')).toEqual({ syslog: { time: 'last7d' } })
    expect(logPrefsBucket.read().byLog).toEqual({
      syslog: { widths: { hostname: 200, msg_text: 400 } },
    })

    setActivePinia(createPinia())
    const reloaded = useLogPrefsStore()
    expect(reloaded.getTimePreset('syslog')).toBe('last7d')
    expect(reloaded.getColumnWidths('syslog')).toEqual({ hostname: 200, msg_text: 400 })
  })

  it('ignores a custom range and anything that is not a preset', () => {
    const prefs = useLogPrefsStore()
    prefs.setTimePreset('syslog', 'custom')
    prefs.setTimePreset('syslog', 'nonsense')
    expect(prefs.getTimePreset('syslog')).toBeNull()

    userPrefs.set('logs.presentation', { syslog: { time: 'custom' } })
    setActivePinia(createPinia())
    expect(useLogPrefsStore().getTimePreset('syslog')).toBeNull()
  })
})
