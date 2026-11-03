import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PrimeVue from 'primevue/config'
import AlarmToast from '@/components/layout/AlarmToast.vue'
import {
  useAlarmNotifications,
  reloadAlarmNotificationPrefs,
} from '@/composables/useAlarmNotifications'

const { setPosition } = useAlarmNotifications()

function toastRoot() {
  return document.body.querySelector('.alarm-toast')
}

describe('AlarmToast', () => {
  let wrapper

  beforeEach(() => {
    localStorage.clear()
    reloadAlarmNotificationPrefs()
  })

  afterEach(() => {
    wrapper?.unmount()
    localStorage.clear()
    reloadAlarmNotificationPrefs()
  })

  // PrimeVue writes `false` for an unused inset, which Vue does not treat as removal.
  it('drops the previous corner insets when the position changes', async () => {
    setPosition('bottom-right')
    wrapper = mount(AlarmToast, { global: { plugins: [PrimeVue] }, attachTo: document.body })
    await nextTick()
    expect(toastRoot().style.bottom).toBe('20px')

    setPosition('top-right')
    await nextTick()

    const style = toastRoot().style
    expect(style.top).toBe('20px')
    expect(style.right).toBe('20px')
    expect(style.bottom).toBe('')
    expect(style.left).toBe('')
  })
})
