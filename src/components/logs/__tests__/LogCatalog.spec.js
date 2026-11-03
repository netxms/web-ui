import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import LogCatalog from '@/components/logs/LogCatalog.vue'
import LogSidebar from '@/components/logs/LogSidebar.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/logs', name: 'logs', component: { template: '<div />' } },
    { path: '/logs/:logName', name: 'log', component: { template: '<div />' } },
  ],
})

const logs = [
  { name: 'EventLog', description: 'NetXMS system event log.', objectIdColumn: 'event_source' },
  { name: 'syslog', description: 'RFC 5424 syslog messages.', objectIdColumn: 'source_object_id' },
  { name: 'AuditLog', description: 'Audit log of user actions.', objectIdColumn: 'object_id' },
  { name: 'NotificationLog', description: 'Notification delivery log.', objectIdColumn: null },
]

const globalOptions = { plugins: [router, PrimeVue], directives: { tooltip: Tooltip } }

beforeEach(async () => {
  await router.replace('/logs')
  await router.isReady()
})

describe('LogCatalog', () => {
  async function mountCatalog(props = {}) {
    const wrapper = mount(LogCatalog, { props: { logs, ...props }, global: globalOptions })
    await flushPromises()
    return wrapper
  }

  it('renders one card per log, grouped by family, with the server description', async () => {
    const wrapper = await mountCatalog()
    expect(wrapper.findAll('.log-card')).toHaveLength(4)
    expect(wrapper.findAll('.family-title').map((n) => n.text())).toEqual([
      'Events and Alerts',
      'Audit and Changes',
      'Server Activity',
    ])
    expect(wrapper.text()).toContain('RFC 5424 syslog messages.')
  })

  it('makes every card a real anchor, so ctrl+click opens a new tab', async () => {
    const wrapper = await mountCatalog()
    const hrefs = wrapper.findAll('.log-card').map((card) => card.attributes('href'))
    expect(hrefs).toContain('/logs/syslog')
    expect(hrefs.every(Boolean)).toBe(true)
  })

  it('shows an actionable empty state when the account can read no log', async () => {
    const wrapper = await mountCatalog({ logs: [] })
    expect(wrapper.text()).toContain('No logs available')
    expect(wrapper.text()).toContain('view rights')
  })

  it('surfaces a load error with a retry', async () => {
    const wrapper = await mountCatalog({ logs: [], error: new Error('boom') })
    expect(wrapper.find('.query-error-state').exists()).toBe(true)
  })

  it('renders placeholders rather than an empty state while loading', async () => {
    const wrapper = await mountCatalog({ logs: [], loading: true })
    expect(wrapper.findAll('.log-card--skeleton').length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('No logs available')
  })
})

describe('LogSidebar', () => {
  async function mountSidebar(props = {}) {
    const wrapper = mount(LogSidebar, {
      props: { logs, activeLog: 'syslog', ...props },
      global: globalOptions,
    })
    await flushPromises()
    return wrapper
  }

  it('lists every log grouped by family and marks the open one', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.findAll('.menu-item')).toHaveLength(4)
    expect(wrapper.find('.menu-item.active').text()).toBe('Syslog')
  })

  it('navigates on a plain click - navBindings only covers new-tab clicks', async () => {
    const wrapper = await mountSidebar()
    await wrapper.findAll('.menu-item')[0].trigger('click')
    await flushPromises()

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(router.currentRoute.value.params.logName).toBe('EventLog')
  })

  it('leaves the query alone when the already-open log is clicked', async () => {
    // Re-navigating would push a bare logTarget() and silently wipe the active filters.
    await router.replace('/logs/syslog?t=last7d')
    const wrapper = await mountSidebar()

    await wrapper.find('.menu-item.active').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/logs/syslog?t=last7d')
  })

  it('links back to the catalog from the header', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.find('.sidebar-header a').attributes('href')).toBe('/logs')
  })
})
