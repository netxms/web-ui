import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h, nextTick, ref, toValue, watchEffect } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

// The server declares `msg_id` as syslog's record id column but never returns it.
const syslogColumns = [
  { name: 'msg_timestamp', description: 'Time', type: 'timestamp', recordId: false, detail: false },
  {
    name: 'source_object_id',
    description: 'Source',
    type: 'objectId',
    recordId: false,
    detail: false,
  },
  { name: 'msg_text', description: 'Text', type: 'text', recordId: false, detail: false },
]

const snmpTrapColumns = [
  {
    name: 'trap_timestamp',
    description: 'Time',
    type: 'timestamp',
    recordId: false,
    detail: false,
  },
  { name: 'object_id', description: 'Source', type: 'objectId', recordId: false, detail: false },
  { name: 'trap_varlist', description: 'Varbinds', type: 'text', recordId: false, detail: false },
]

const eventLogColumns = [
  { name: 'event_id', description: 'ID', type: 'integer', recordId: true, detail: false },
  {
    name: 'event_timestamp',
    description: 'Time',
    type: 'timestamp',
    recordId: false,
    detail: false,
  },
  { name: 'event_source', description: 'Source', type: 'objectId', recordId: false, detail: false },
  { name: 'event_code', description: 'Event', type: 'eventCode', recordId: false, detail: false },
  {
    name: 'event_severity',
    description: 'Severity',
    type: 'severity',
    recordId: false,
    detail: false,
  },
  { name: 'event_message', description: 'Message', type: 'text', recordId: false, detail: false },
]

const SCHEMAS = {
  syslog: {
    name: 'syslog',
    recordIdColumn: 'msg_id',
    objectIdColumn: 'source_object_id',
    columns: syslogColumns,
  },
  SnmpTrapLog: {
    name: 'SnmpTrapLog',
    recordIdColumn: 'trap_id',
    objectIdColumn: 'object_id',
    columns: snmpTrapColumns,
  },
  EventLog: {
    name: 'EventLog',
    recordIdColumn: 'event_id',
    objectIdColumn: 'event_source',
    columns: eventLogColumns,
  },
}

window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))

const tailCalls = []
let tailRows
let tailApi

vi.mock('@/queries/useLogQueries', () => ({
  useLogSchema: (name) => ({
    data: ref(SCHEMAS[toValue(name)] ?? null),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
}))

vi.mock('@/composables/useLogLiveTail', () => ({
  useLogLiveTail: (logName, request, options) => {
    watchEffect(() => {
      const value = toValue(request)
      if (value) tailCalls.push({ logName: toValue(logName), request: value, options })
    })
    const rows = tailRows
    const api = {
      rows,
      resolvedPages: ref([{ objects: {}, users: {} }]),
      isLoading: ref(false),
      isFetching: ref(false),
      error: ref(null),
      reconnecting: ref(false),
      paused: ref(false),
      pendingCount: ref(0),
      supported: ref(true),
      lastUpdate: ref(null),
      pause: vi.fn(),
      resume: vi.fn(),
      togglePause: vi.fn(),
      clear: vi.fn(() => {
        rows.value = []
      }),
    }
    tailApi = api
    return api
  },
}))

vi.mock('@/composables/useLogValueResolver', () => ({
  useLogValueResolver: () =>
    ref({
      objectsById: new Map([[10, { id: 10, name: 'Core Router' }]]),
      usersById: new Map(),
      eventsByCode: new Map([[29, 'SYS_NODE_DOWN']]),
      zonesByUin: new Map(),
    }),
}))

const LogMonitorWidget = (await import('@/components/dashboards/widgets/LogMonitorWidget.vue'))
  .default
const { provideWidgetActive } = await import('@/composables/useWidgetActive')
const { provideDashboardContext } = await import('@/composables/useDashboardContext')

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

async function mountWidget(type, config = {}, { active, contextObjectId } = {}) {
  await router.replace('/')
  await router.isReady()

  const Host = {
    setup() {
      if (active) provideWidgetActive(active)
      if (contextObjectId) provideDashboardContext({ dashboardId: 1, contextObjectId })
      return () => h(LogMonitorWidget, { widget: { id: 'w1', type, config } })
    },
  }

  const wrapper = mount(Host, {
    global: { plugins: [router, PrimeVue], directives: { tooltip: Tooltip } },
  })
  await flushPromises()
  await nextTick()
  return wrapper
}

/** Earlier requests are pre-schema passes. */
function lastRequest() {
  return tailCalls.at(-1)?.request ?? null
}

function filterFor(request, column) {
  return (request.filters ?? []).find((f) => f.column === column) ?? null
}

beforeEach(() => {
  tailCalls.length = 0
  tailRows = ref([])
  tailApi = null
})

describe('LogMonitorWidget', () => {
  describe('log selection', () => {
    it.each([
      ['syslog-monitor', 'syslog'],
      ['snmp-trap-monitor', 'SnmpTrapLog'],
      ['event-monitor', 'EventLog'],
    ])('%s tails %s', async (type, logName) => {
      await mountWidget(type)
      expect(tailCalls.at(-1).logName).toBe(logName)
    })
  })

  it('orders newest first, whatever the log', async () => {
    await mountWidget('syslog-monitor')
    expect(lastRequest().orderBy).toEqual([{ column: 'msg_timestamp', descending: true }])
  })

  it('does not bound the seed by a time range', async () => {
    await mountWidget('syslog-monitor')
    expect(filterFor(lastRequest(), 'msg_timestamp')).toBeNull()
  })

  describe('tail cursor', () => {
    it.each([
      ['syslog-monitor', 'msg_timestamp'],
      ['snmp-trap-monitor', 'trap_timestamp'],
    ])(
      '%s falls back to the time column, since its record id is never returned',
      async (type, timeColumn) => {
        await mountWidget(type)
        const { options } = tailCalls.at(-1)
        expect(toValue(options.recordIdColumn)).toBeNull()
        expect(toValue(options.timeColumn)).toBe(timeColumn)
      },
    )

    it('uses the record id when the log actually returns it', async () => {
      await mountWidget('event-monitor')
      const { options } = tailCalls.at(-1)
      expect(toValue(options.recordIdColumn)).toBe('event_id')
    })
  })

  describe('poll page size', () => {
    it.each([
      ['syslog-monitor', {}],
      ['event-monitor', { maxEvents: 1 }],
      ['event-monitor', { maxEvents: 5000 }],
    ])('%s asks for a full page regardless of config', async (type, config) => {
      await mountWidget(type, config)
      expect(lastRequest().limit).toBe(250)
    })

    it('bounds what the widget keeps by maxEvents instead', async () => {
      await mountWidget('event-monitor', { maxEvents: 25 })
      expect(toValue(tailCalls.at(-1).options.bufferLimit)).toBe(25)
    })
  })

  describe('object scope', () => {
    it('sends EQUALS or CHILDOF when an object is configured', async () => {
      await mountWidget('syslog-monitor', { objectId: 42, objectName: 'Core' })
      expect(filterFor(lastRequest(), 'source_object_id')).toEqual({
        column: 'source_object_id',
        type: 'set',
        operation: 'or',
        filters: [
          { type: 'equals', value: 42 },
          { type: 'childOf', value: 42 },
        ],
      })
    })

    it('sends no object filter when unset', async () => {
      await mountWidget('syslog-monitor', { objectId: 0 })
      expect(lastRequest().filters).toEqual([])
    })

    it('treats the legacy context sentinel as unset without a context object', async () => {
      await mountWidget('syslog-monitor', { objectId: 0xffffffff })
      expect(lastRequest().filters).toEqual([])
    })

    it('scopes the context sentinel to the object the dashboard is shown for', async () => {
      await mountWidget('syslog-monitor', { objectId: 0xffffffff }, { contextObjectId: 42 })
      expect(filterFor(lastRequest(), 'source_object_id')).toEqual({
        column: 'source_object_id',
        type: 'set',
        operation: 'or',
        filters: [
          { type: 'equals', value: 42 },
          { type: 'childOf', value: 42 },
        ],
      })
    })
  })

  describe('event monitor', () => {
    it('seeds over the configured window as a relative filter', async () => {
      await mountWidget('event-monitor', { timeRangeMinutes: 30 })
      expect(filterFor(lastRequest(), 'event_timestamp')).toEqual({
        column: 'event_timestamp',
        type: 'relative',
        value: 30,
        unit: 'minute',
      })
    })

    it('omits the window when it is zero', async () => {
      await mountWidget('event-monitor', { timeRangeMinutes: 0 })
      expect(filterFor(lastRequest(), 'event_timestamp')).toBeNull()
    })

    it('falls back to the legacy default window when the field is cleared', async () => {
      await mountWidget('event-monitor', { timeRangeMinutes: null })
      expect(filterFor(lastRequest(), 'event_timestamp')).toEqual({
        column: 'event_timestamp',
        type: 'relative',
        value: 60,
        unit: 'minute',
      })
    })

    it('turns an event code list into an or-set', async () => {
      await mountWidget('event-monitor', { eventCodes: [29, 30], timeRangeMinutes: 0 })
      expect(filterFor(lastRequest(), 'event_code')).toEqual({
        column: 'event_code',
        type: 'set',
        operation: 'or',
        filters: [
          { type: 'equals', value: 29 },
          { type: 'equals', value: 30 },
        ],
      })
    })

    it('sends a single event code without a set wrapper', async () => {
      await mountWidget('event-monitor', { eventCodes: [29], timeRangeMinutes: 0 })
      expect(filterFor(lastRequest(), 'event_code')).toEqual({
        column: 'event_code',
        type: 'equals',
        value: 29,
      })
    })

    it('caps the preload at 500 rows, as the legacy element does', async () => {
      await mountWidget('event-monitor', { maxEvents: 5000 })
      expect(toValue(tailCalls.at(-1).options.bufferLimit)).toBe(500)
    })

    it('falls back to the default preload when maxEvents is unset', async () => {
      await mountWidget('event-monitor')
      expect(toValue(tailCalls.at(-1).options.bufferLimit)).toBe(100)
    })

    describe('maxEvents 0 disables the preload', () => {
      it('sends no time filter at all', async () => {
        await mountWidget('event-monitor', { maxEvents: 0, timeRangeMinutes: 60 })
        expect(filterFor(lastRequest(), 'event_timestamp')).toBeNull()
      })

      it('asks the tail to hide its seed', async () => {
        await mountWidget('event-monitor', { maxEvents: 0 })
        expect(toValue(tailCalls.at(-1).options.history)).toBe(false)
      })

      it('still polls a full page, rather than asking for zero rows', async () => {
        await mountWidget('event-monitor', { maxEvents: 0 })
        expect(lastRequest().limit).toBe(250)
        expect(toValue(tailCalls.at(-1).options.bufferLimit)).toBe(500)
      })

      // A cleared InputNumber emits null, and `Number(null)` is 0.
      it('treats a cleared field as unset, not as zero', async () => {
        await mountWidget('event-monitor', { maxEvents: null })
        expect(toValue(tailCalls.at(-1).options.history)).toBe(true)
        expect(toValue(tailCalls.at(-1).options.bufferLimit)).toBe(100)
      })

      it('keeps the seed when history is wanted', async () => {
        await mountWidget('event-monitor', { maxEvents: 50 })
        expect(toValue(tailCalls.at(-1).options.history)).toBe(true)
      })
    })
  })

  describe('event monitor text filter', () => {
    const ROWS = [
      { id: '1', event_message: 'Link down on interface eth0', event_code: 1, event_source: 99 },
      { id: '2', event_message: 'Node unreachable', event_code: 29, event_source: 99 },
      { id: '3', event_message: 'Interface up', event_code: 1, event_source: 10 },
    ]

    it('sends no text filter to the server', async () => {
      tailRows = ref([...ROWS])
      await mountWidget('event-monitor', { filter: 'down', timeRangeMinutes: 0 })
      expect(filterFor(lastRequest(), 'event_message')).toBeNull()
      expect(lastRequest().filters).toEqual([])
    })

    it('matches the message, ignoring case', async () => {
      tailRows = ref([...ROWS])
      const wrapper = await mountWidget('event-monitor', { filter: 'LINK DOWN' })
      expect(wrapper.text()).toContain('Link down on interface eth0')
      expect(wrapper.text()).not.toContain('Node unreachable')
    })

    it('matches the resolved event name', async () => {
      tailRows = ref([...ROWS])
      const wrapper = await mountWidget('event-monitor', { filter: 'sys_node_down' })
      expect(wrapper.text()).toContain('Node unreachable')
      expect(wrapper.text()).not.toContain('Interface up')
    })

    it('matches the resolved source object name', async () => {
      tailRows = ref([...ROWS])
      const wrapper = await mountWidget('event-monitor', { filter: 'core router' })
      expect(wrapper.text()).toContain('Interface up')
      expect(wrapper.text()).not.toContain('Node unreachable')
    })

    it('requires every whitespace-separated token', async () => {
      tailRows = ref([...ROWS])
      const wrapper = await mountWidget('event-monitor', { filter: 'interface down' })
      expect(wrapper.text()).toContain('Link down on interface eth0')
      expect(wrapper.text()).not.toContain('Interface up')
    })

    it('ignores a whitespace-only filter', async () => {
      tailRows = ref([...ROWS])
      const wrapper = await mountWidget('event-monitor', { filter: '   ' })
      expect(wrapper.text()).toContain('Node unreachable')
      expect(wrapper.text()).toContain('Interface up')
    })

    it('does not filter the syslog monitor, which has no text filter', async () => {
      tailRows = ref([{ id: '1', msg_text: 'anything', source_object_id: 10 }])
      const wrapper = await mountWidget('syslog-monitor', { filter: 'no-such-text' })
      expect(wrapper.text()).toContain('anything')
    })
  })

  describe('failure states', () => {
    it('keeps the feed on screen while the tail is reconnecting', async () => {
      tailRows = ref([{ id: '1', msg_text: 'last message before the blip', source_object_id: 10 }])
      const wrapper = await mountWidget('syslog-monitor')

      tailApi.reconnecting.value = true
      await nextTick()

      expect(wrapper.text()).toContain('last message before the blip')
      expect(wrapper.find('[data-testid="live-state"]').text()).toContain('Reconnecting')
      expect(wrapper.text()).not.toContain('Retry')
    })

    it('reports paused over reconnecting', async () => {
      tailRows = ref([{ id: '1', msg_text: 'held', source_object_id: 10 }])
      const wrapper = await mountWidget('syslog-monitor')

      tailApi.reconnecting.value = true
      tailApi.paused.value = true
      await nextTick()

      expect(wrapper.find('[data-testid="live-state"]').text()).toContain('Paused')
    })

    it('replaces the feed for a terminal failure', async () => {
      tailRows = ref([{ id: '1', msg_text: 'gone', source_object_id: 10 }])
      const wrapper = await mountWidget('syslog-monitor')

      tailApi.error.value = Object.assign(new Error('Access denied'), { status: 403 })
      await nextTick()

      expect(wrapper.text()).not.toContain('gone')
    })
  })
})
