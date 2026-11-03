import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import { useLogPrefsStore } from '@/stores/logPrefsStore'

let fetchedRecord

vi.mock('@/queries/useLogQueries', () => ({
  useLogRecord: () => ({
    data: fetchedRecord,
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
}))

const LogRecordDrawer = (await import('@/components/logs/LogRecordDrawer.vue')).default

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    {
      path: '/infrastructure/:objectId?/:viewId?',
      name: 'infrastructure',
      component: { template: '<div />' },
    },
  ],
})

const columns = [
  { name: 'alarm_id', description: 'Alarm ID', type: 'integer', detail: false },
  { name: 'alarm_state', description: 'State', type: 'alarmState', detail: false },
  { name: 'message', description: 'Message', type: 'text', detail: false },
  { name: 'rule_description', description: 'Rule Description', type: 'text', detail: false },
  { name: 'raw_data', description: 'Raw data', type: 'jsonDetails', detail: true },
]

const row = {
  id: 40345,
  alarm_id: 40345,
  alarm_state: 3,
  message: 'Node down',
  rule_description:
    'Cisco performance template: raise alarms for configuration and environmental faults, well past sixty characters.',
}

function mountDrawer(props = {}) {
  return mount(LogRecordDrawer, {
    props: {
      visible: true,
      logName: 'AlarmLog',
      row,
      columns,
      recordIdColumn: 'alarm_id',
      ...props,
    },
    global: { plugins: [router, PrimeVue], directives: { tooltip: Tooltip } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  fetchedRecord = ref(null)
})

describe('LogRecordDrawer', () => {
  it('lays short fields out as label/value rows and long ones full width', () => {
    const wrapper = mountDrawer()
    const field = (name) => wrapper.findAll('.record-row').find((f) => f.text().startsWith(name))

    expect(field('Alarm ID').classes()).not.toContain('record-row--wide')
    expect(field('State').classes()).not.toContain('record-row--wide')
    expect(field('Rule Description').classes()).toContain('record-row--wide')
  })

  it('never emits an invalid width, so the stylesheet default can take over', () => {
    // `width: undefinedpx` is dropped by the browser and the panel shrink-wraps its content.
    const prefs = useLogPrefsStore()
    prefs.drawerWidth = undefined

    const wrapper = mountDrawer()
    expect(wrapper.attributes('style') ?? '').not.toContain('undefined')
  })

  it('opens at the same width whatever the record holds', () => {
    const wide = mountDrawer()
    const narrow = mountDrawer({ row: { id: 1, alarm_id: 1, alarm_state: 3, message: 'up' } })
    expect(wide.attributes('style')).toBe(narrow.attributes('style'))
  })

  it('shows detail columns only once the single-record fetch lands', () => {
    const wrapper = mountDrawer()
    expect(wrapper.text()).not.toContain('Raw data')

    fetchedRecord = ref({ ...row, raw_data: { key: 'value' } })
    const loaded = mountDrawer()
    expect(loaded.text()).toContain('Raw data')
  })

  it('names the record in the header', () => {
    expect(mountDrawer().find('.record-title').text()).toContain('40345')
  })

  it('explains itself for a log with no usable record id, rather than looking broken', () => {
    // syslog and SNMP traps declare a record id column they never return.
    const wrapper = mountDrawer({ recordIdColumn: 'msg_id' })
    expect(wrapper.find('.record-note').exists()).toBe(true)
    expect(wrapper.find('.record-title').text()).toContain('Record details')
  })

  it('takes its width from the store and persists a drag', async () => {
    const wrapper = mountDrawer()
    expect(wrapper.attributes('style')).toContain('560px')

    await wrapper.find('.record-resize-handle').trigger('mousedown', { clientX: 800 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    await wrapper.vm.$nextTick()

    expect(wrapper.attributes('style')).toContain('760px')
    expect(JSON.parse(localStorage.getItem('netxms.log-prefs')).drawerWidth).toBe(760)
  })

  it('closes on Escape', async () => {
    const wrapper = mountDrawer()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:visible').at(-1)).toEqual([false])
  })
})
