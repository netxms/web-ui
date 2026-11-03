import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref, toValue, watchEffect } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

// syslog schema from `s_logs[]` in server/core/logs.cpp: a record id column the log does not
// return, and an integer severity that is not a NetXMS severity.
const syslogColumns = [
  { name: 'msg_timestamp', description: 'Time', type: 'timestamp', recordId: false, detail: false },
  {
    name: 'source_object_id',
    description: 'Source',
    type: 'objectId',
    recordId: false,
    detail: false,
  },
  { name: 'facility', description: 'Facility', type: 'integer', recordId: false, detail: false },
  { name: 'hostname', description: 'Host', type: 'text', recordId: false, detail: false },
  { name: 'msg_tag', description: 'Tag', type: 'text', recordId: false, detail: false },
  { name: 'msg_text', description: 'Text', type: 'text', recordId: false, detail: false },
]

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))

const capturedRequests = []
let queryPages
let hasNextPage

vi.mock('@/queries/useLogQueries', () => ({
  useLogSchema: vi.fn(() => ({
    data: ref({
      name: 'syslog',
      recordIdColumn: 'msg_id',
      objectIdColumn: 'source_object_id',
      columns: syslogColumns,
    }),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  })),
  useLogQuery: (name, request) => {
    // Tests read the last body: the first pass runs before the schema has loaded.
    watchEffect(() => {
      const value = toValue(request)
      if (value) capturedRequests.push(value)
    })
    return {
      data: queryPages,
      isLoading: ref(false),
      isFetching: ref(false),
      isFetchingNextPage: ref(false),
      hasNextPage,
      fetchNextPage: vi.fn(),
      error: ref(null),
      refetch: vi.fn(),
    }
  },
  useLogRecord: () => ({
    data: ref(null),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useLogQuerySql: () => ({
    mutate: vi.fn(),
    data: ref(null),
    isPending: ref(false),
    error: ref(null),
  }),
}))

vi.mock('@/composables/useLogValueResolver', () => ({
  useLogValueResolver: () =>
    ref({
      objectsById: new Map(),
      usersById: new Map(),
      eventsByCode: new Map(),
      zonesByUin: new Map(),
    }),
}))

vi.mock('@/queries/useObjectQueries', () => ({
  useZoneNames: () => ref(new Map()),
  useObjectsByIds: () => ({ objectsById: ref(new Map()) }),
}))
vi.mock('@/queries/useUserQueries', () => ({ useUsers: () => ({ data: ref([]) }) }))
vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({ data: ref([]) }),
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

const LogExplorer = (await import('@/components/logs/LogExplorer.vue')).default
const LogTimeRangePicker = (await import('@/components/logs/LogTimeRangePicker.vue')).default
const AppTable = (await import('@/components/common/AppTable.vue')).default
const { RESULT_MODE, useLogPrefsStore } = await import('@/stores/logPrefsStore')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/logs', name: 'logs', component: { template: '<div />' } },
    { path: '/logs/:logName', name: 'log', component: { template: '<div />' } },
    {
      path: '/infrastructure/:objectId?/:viewId?',
      name: 'infrastructure',
      component: { template: '<div />' },
    },
  ],
})

function makePage(count) {
  return {
    pages: [
      {
        offset: 0,
        count,
        records: Array.from({ length: count }, (_, i) => ({
          msg_timestamp: '2026-08-05T10:00:00.000Z',
          source_object_id: 10,
          facility: 3,
          hostname: `host-${i}`,
          msg_tag: 'sshd',
          msg_text: `message ${i}`,
        })),
      },
    ],
  }
}

async function mountExplorer(props = {}, route = '/logs/syslog') {
  await router.replace(route)
  await router.isReady()
  const wrapper = mount(LogExplorer, {
    props: { logName: 'syslog', ...props },
    global: { plugins: [router, PrimeVue], directives: { tooltip: Tooltip } },
  })
  await flushPromises()
  await nextTick()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  capturedRequests.length = 0
  queryPages = ref(makePage(3))
  hasNextPage = ref(false)
})

describe('LogExplorer', () => {
  it('mounts and renders the loaded records', async () => {
    const wrapper = await mountExplorer()
    expect(wrapper.text()).toContain('3 records loaded')
    expect(wrapper.text()).toContain('message 0')
  })

  it('defaults syslog to stream mode, per the catalog', async () => {
    const wrapper = await mountExplorer()
    expect(wrapper.find('.log-stream').exists()).toBe(true)
  })

  it('builds a request with no time bound by default, newest first', async () => {
    await mountExplorer()
    const request = capturedRequests.at(-1)
    expect(request.filters).toEqual([])
    expect(request.orderBy).toEqual([{ column: 'msg_timestamp', descending: true }])
    expect(request.offset).toBe(0)
  })

  it('reads the query model out of the URL', async () => {
    await mountExplorer({}, '/logs/syslog?t=last7d')
    expect(capturedRequests.at(-1).filters).toEqual([
      { column: 'msg_timestamp', type: 'relative', value: 7, unit: 'day' },
    ])
  })

  it('turns ?object= into a filter on the log related-object column', async () => {
    await mountExplorer(
      { log: { name: 'syslog', objectIdColumn: 'source_object_id', recordIdColumn: 'msg_id' } },
      '/logs/syslog?object=42&objectName=web-01',
    )
    expect(capturedRequests.at(-1).filters).toContainEqual({
      column: 'source_object_id',
      type: 'equals',
      value: 42,
    })
  })

  it('always sends a locked filter, which is how the object tab pins its object', async () => {
    await mountExplorer({
      compact: true,
      lockedFilters: [
        {
          column: 'source_object_id',
          conditions: [{ id: 1, operatorId: 'is', value: 7, display: 'core-sw' }],
        },
      ],
    })
    expect(capturedRequests.at(-1).filters).toContainEqual({
      column: 'source_object_id',
      type: 'equals',
      value: 7,
    })
  })

  it('offers Load more only while the server keeps filling the page', async () => {
    expect((await mountExplorer()).text()).toContain('End of results')

    hasNextPage = ref(true)
    expect((await mountExplorer()).text()).toContain('Load 250 more')
  })

  it('projects a text filter from the URL as an editable omnibar token', async () => {
    const f = JSON.stringify([{ c: 'hostname', o: 'or', x: [{ op: 'contains', value: 'web' }] }])
    const wrapper = await mountExplorer({}, `/logs/syslog?f=${encodeURIComponent(f)}`)

    expect(wrapper.find('.filter-chip').text()).toContain('web')
    expect(wrapper.text()).not.toContain('Advanced (')
    expect(capturedRequests.at(-1).filters).toContainEqual({
      column: 'hostname',
      type: 'like',
      value: '%web%',
    })
  })

  it('counts conditions the omnibar cannot express instead of listing one chip each', async () => {
    const f = JSON.stringify([
      { c: 'facility', o: 'or', x: [{ op: 'between', from: 1, to: 5 }] },
      { c: 'source_object_id', o: 'or', x: [{ op: 'below', value: 3, display: 'Production' }] },
    ])
    const wrapper = await mountExplorer({}, `/logs/syslog?f=${encodeURIComponent(f)}`)

    expect(wrapper.text()).toContain('Advanced (2)')
    expect(wrapper.findAll('.explorer-scope')).toHaveLength(0)
  })

  it('renders the advanced panel with a card per filtered column', async () => {
    const f = JSON.stringify([{ c: 'facility', o: 'or', x: [{ op: 'between', from: 1, to: 5 }] }])
    const wrapper = await mountExplorer({}, `/logs/syslog?f=${encodeURIComponent(f)}`)

    await wrapper.find('.explorer-filters button:last-child').trigger('click')
    await nextTick()

    expect(wrapper.find('.advanced-filters').exists()).toBe(true)
    expect(wrapper.find('.filter-card-title').text()).toBe('Facility')
    expect(wrapper.find('.condition-row').exists()).toBe(true)
  })

  it('renders a locked filter read-only, with no way to remove it', async () => {
    const wrapper = await mountExplorer({
      compact: true,
      lockedFilters: [
        {
          column: 'source_object_id',
          conditions: [{ id: 1, operatorId: 'is', value: 7, display: 'core-sw' }],
        },
      ],
    })

    expect(wrapper.find('.explorer-scope').text()).toContain('core-sw')
    expect(wrapper.text()).not.toContain('Advanced (')

    await wrapper.find('.explorer-filters button:last-child').trigger('click')
    await nextTick()

    const card = wrapper.find('.filter-card--locked')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('core-sw')
    expect(card.find('.condition-row').exists()).toBe(false)
  })

  it('rewrites ?object= into the canonical filter parameter and drops the shorthand', async () => {
    await mountExplorer(
      { log: { name: 'syslog', objectIdColumn: 'source_object_id', recordIdColumn: 'msg_id' } },
      '/logs/syslog?object=42&objectName=web-01&keepme=1',
    )
    await flushPromises()

    expect(router.currentRoute.value.query.object).toBeUndefined()
    expect(router.currentRoute.value.query.f).toContain('source_object_id')
    expect(router.currentRoute.value.query.keepme).toBe('1')
  })

  it('shows an access-denied message rather than an empty table on 403', async () => {
    const { useLogSchema } = await import('@/queries/useLogQueries')
    useLogSchema.mockReturnValueOnce({
      data: ref(null),
      isLoading: ref(false),
      error: ref(Object.assign(new Error('Access denied'), { status: 403 })),
      refetch: vi.fn(),
    })
    const wrapper = await mountExplorer()
    expect(wrapper.text()).toContain('You do not have permission to read this log')
  })
})

describe('LogExplorer remembered time range', () => {
  const lastHour = { column: 'msg_timestamp', type: 'relative', value: 1, unit: 'hour' }

  it('opens a log on the range last picked for it', async () => {
    useLogPrefsStore().setTimePreset('syslog', 'last1h')
    await mountExplorer()
    await flushPromises()

    expect(capturedRequests.at(-1).filters).toEqual([lastHour])
    expect(router.currentRoute.value.query.t).toBe('last1h')
  })

  it('leaves a link that states a query alone', async () => {
    useLogPrefsStore().setTimePreset('syslog', 'last1h')
    const f = JSON.stringify([{ c: 'hostname', o: 'or', x: [{ op: 'contains', value: 'web' }] }])
    await mountExplorer({}, `/logs/syslog?f=${encodeURIComponent(f)}`)

    expect(capturedRequests.at(-1).filters).not.toContainEqual(lastHour)
  })

  it('applies in the object tab, where nothing comes from the URL', async () => {
    useLogPrefsStore().setTimePreset('syslog', 'last1h')
    await mountExplorer({ compact: true }, '/logs/syslog?f=x')

    expect(capturedRequests.at(-1).filters).toEqual([lastHour])
  })

  it('remembers a preset picked in the picker, not a custom range or one from a link', async () => {
    const prefs = useLogPrefsStore()
    const wrapper = await mountExplorer({}, '/logs/syslog?t=last7d')
    expect(prefs.getTimePreset('syslog')).toBeNull()

    const picker = wrapper.findComponent(LogTimeRangePicker)
    picker.vm.$emit('update:modelValue', { preset: 'last4h', from: null, to: null })
    await flushPromises()
    expect(prefs.getTimePreset('syslog')).toBe('last4h')
    expect(capturedRequests.at(-1).filters).toEqual([
      { column: 'msg_timestamp', type: 'relative', value: 4, unit: 'hour' },
    ])

    picker.vm.$emit('update:modelValue', {
      preset: 'custom',
      from: '2026-08-01T00:00:00Z',
      to: null,
    })
    await flushPromises()
    expect(prefs.getTimePreset('syslog')).toBe('last4h')
  })
})

describe('LogExplorer table layout', () => {
  beforeEach(() => useLogPrefsStore().setMode('syslog', RESULT_MODE.TABLE))

  it('keeps dragged column widths per log and starts the table on them', async () => {
    const prefs = useLogPrefsStore()
    const first = await mountExplorer()
    first.findComponent(AppTable).vm.$emit('column-resize', { hostname: 321 })
    expect(prefs.getColumnWidths('syslog')).toEqual({ hostname: 321 })
    first.unmount()

    const wrapper = await mountExplorer()
    const columns = wrapper.findComponent(AppTable).props('columns')
    expect(columns.find((c) => c.id === 'hostname').width).toBe(321)
    expect(prefs.getColumnWidths('EventLog')).toEqual({})
  })

  it('fetches by the page size picked in the paginator, and keeps it', async () => {
    const wrapper = await mountExplorer()
    wrapper.findComponent(AppTable).vm.$emit('page-size-change', 500)
    await flushPromises()

    expect(useLogPrefsStore().getPageSize('syslog')).toBe(500)
    expect(capturedRequests.at(-1).limit).toBe(500)
  })
})
