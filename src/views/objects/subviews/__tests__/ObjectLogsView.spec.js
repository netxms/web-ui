import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

let logs
let routeQuery

vi.mock('@/queries/useLogQueries', () => ({
  useLogs: () => ({ data: logs }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get query() {
      return routeQuery
    },
  }),
}))

// The explorer's descendants pull in the router singleton (for new-tab hrefs), which
// cannot be constructed against the mocked vue-router.
vi.mock('@/router', () => ({
  default: { resolve: () => ({ href: '/' }), push: vi.fn(), replace: vi.fn() },
}))

const ObjectLogsView = (await import('@/views/objects/subviews/ObjectLogsView.vue')).default

const LogExplorerStub = {
  name: 'LogExplorer',
  props: {
    logName: String,
    log: Object,
    switchableLogs: Array,
    lockedFilters: Array,
    compact: Boolean,
  },
  template: '<div class="explorer-stub" />',
}

function mountView(object) {
  return mount(ObjectLogsView, {
    props: { object },
    global: { stubs: { LogExplorer: LogExplorerStub } },
  })
}

function explorer(wrapper) {
  return wrapper.findComponent(LogExplorerStub)
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  routeQuery = {}
  logs = ref([
    { name: 'syslog', objectIdColumn: 'source_object_id' },
    { name: 'AuditLog', objectIdColumn: 'object_id' },
    { name: 'WindowsEventLog', objectIdColumn: 'node_id' },
    { name: 'NotificationLog', objectIdColumn: null },
  ])
})

describe('ObjectLogsView', () => {
  it('offers only the logs that apply to the object class', async () => {
    const wrapper = mountView({ id: 42, name: 'web-01', class: 'Node', platformName: 'Linux' })
    await flushPromises()

    const names = explorer(wrapper)
      .props('switchableLogs')
      .map((l) => l.name)
    expect(names).toEqual(['syslog', 'AuditLog'])
    expect(names).not.toContain('NotificationLog')
    expect(names).not.toContain('WindowsEventLog')
  })

  it('pins the object with a locked filter on that log related-object column', async () => {
    const wrapper = mountView({ id: 42, name: 'web-01', class: 'Node' })
    await flushPromises()

    expect(explorer(wrapper).props('lockedFilters')).toEqual([
      expect.objectContaining({
        column: 'source_object_id',
        locked: true,
        conditions: [expect.objectContaining({ operatorId: 'is', value: 42, display: 'web-01' })],
      }),
    ])
    expect(explorer(wrapper).props('compact')).toBe(true)
  })

  it('re-targets the locked filter when the switcher changes log', async () => {
    const wrapper = mountView({ id: 42, name: 'web-01', class: 'Node' })
    await flushPromises()

    explorer(wrapper).vm.$emit('switch-log', 'AuditLog')
    await flushPromises()

    expect(explorer(wrapper).props('logName')).toBe('AuditLog')
    expect(explorer(wrapper).props('lockedFilters')[0].column).toBe('object_id')
  })

  it('keeps showing the log the user last opened when the object supports it', async () => {
    const wrapper = mountView({ id: 42, name: 'web-01', class: 'Node' })
    await flushPromises()
    explorer(wrapper).vm.$emit('switch-log', 'AuditLog')
    await flushPromises()

    const next = mountView({ id: 43, name: 'web-02', class: 'Node' })
    await flushPromises()
    expect(explorer(next).props('logName')).toBe('AuditLog')
  })

  it('falls back to the first applicable log when the remembered one does not apply', async () => {
    mountView({ id: 42, name: 'web-01', class: 'Node' })
    await flushPromises()

    const wrapper = mountView({ id: 7, name: 'Ops', class: 'Dashboard' })
    await flushPromises()
    expect(explorer(wrapper).props('logName')).toBe('AuditLog')
  })

  it('opens the log named by the route over the remembered one', async () => {
    const wrapper = mountView({ id: 42, name: 'web-01', class: 'Node' })
    await flushPromises()
    explorer(wrapper).vm.$emit('switch-log', 'AuditLog')
    await flushPromises()

    routeQuery = { log: 'syslog' }
    const next = mountView({ id: 43, name: 'web-02', class: 'Node' })
    await flushPromises()
    expect(explorer(next).props('logName')).toBe('syslog')
  })

  it('does not re-apply the routed log after the user switches', async () => {
    routeQuery = { log: 'syslog' }
    const wrapper = mountView({ id: 42, name: 'web-01', class: 'Node' })
    await flushPromises()
    expect(explorer(wrapper).props('logName')).toBe('syslog')

    explorer(wrapper).vm.$emit('switch-log', 'AuditLog')
    await flushPromises()
    expect(explorer(wrapper).props('logName')).toBe('AuditLog')
  })

  it('ignores a routed log the object does not support', async () => {
    routeQuery = { log: 'WindowsEventLog' }
    const wrapper = mountView({ id: 7, name: 'Ops', class: 'Dashboard' })
    await flushPromises()
    expect(explorer(wrapper).props('logName')).toBe('AuditLog')
  })

  it('shows an empty state instead of an explorer when no log applies', async () => {
    logs = ref([{ name: 'NotificationLog', objectIdColumn: null }])
    const wrapper = mountView({ id: 42, name: 'web-01', class: 'Node' })
    await flushPromises()

    expect(explorer(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain('No logs available for this object')
  })
})
