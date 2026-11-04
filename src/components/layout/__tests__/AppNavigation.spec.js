import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import PrimeVue from 'primevue/config'
import AppNavigation from '../AppNavigation.vue'

// The hrefs come from the app's router singleton, not the router the test installs.
vi.mock('@/router', () => ({ default: { resolve: (to) => ({ href: String(to) }) } }))

const Icon = defineComponent({ render: () => h('svg') })

vi.mock('@/stores/navigationStore', () => ({
  useNavigationStore: () => ({
    navSections: [
      {
        id: 'main',
        label: 'Main',
        items: [
          { label: 'Infrastructure', icon: Icon, route: '/infrastructure' },
          { label: 'Logs', icon: Icon, route: '/logs' },
          { label: 'Alarms', icon: Icon, route: '/alarms' },
          { label: 'AI', icon: Icon, route: '/ai' },
        ],
      },
    ],
    hiddenItems: [],
    loaded: true,
    loadNavigation: vi.fn(),
  }),
}))

// Where the user last *left* each perspective.
const lastPaths = { '/infrastructure': '/infrastructure/1', '/logs': '/logs/EventLog?t=1h' }
vi.mock('@/stores/perspectiveStore', () => ({
  usePerspectiveStore: () => ({ getLastPath: (root) => lastPaths[root] ?? null }),
}))

vi.mock('@/composables/useVerticalOverflow', () => ({
  useVerticalOverflow: () => ({
    canScrollUp: ref(false),
    canScrollDown: ref(false),
    targetSide: ref(null),
    revealTarget: vi.fn(),
    scrollPage: vi.fn(),
  }),
}))

const aiMessageCount = ref(0)
vi.mock('@/composables/useAiMessageAttention', () => ({
  useAiMessageAttention: () => ({ count: aiMessageCount }),
}))

const alarmCount = ref(0)
const worstSeverity = ref(null)
vi.mock('@/composables/useAlarmAttention', () => ({
  useAlarmAttention: () => ({ count: alarmCount, worstSeverity }),
}))

const isNavCollapsed = ref(false)
vi.mock('@/composables/useLayout', () => ({
  useLayout: () => ({ isNavCollapsed }),
}))

const Page = defineComponent({ render: () => h('div') })

let router

async function mountAt(path) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/infrastructure/:objectId?', component: Page },
      { path: '/logs/:logName?', component: Page },
    ],
  })
  router.push(path)
  await router.isReady()
  return mount(AppNavigation, {
    global: {
      plugins: [router, PrimeVue],
      directives: { tooltip: {} },
      stubs: { RestrictedDisclosure: true },
    },
  })
}

const railItem = (wrapper, label) =>
  wrapper.findAll('a.app-nav-button').find((a) => a.attributes('aria-label') === label)

beforeEach(() => {
  router = null
  aiMessageCount.value = 0
  alarmCount.value = 0
  worstSeverity.value = null
  isNavCollapsed.value = false
})

describe('AppNavigation', () => {
  it('counts what waits on the AI item, and on no other', async () => {
    aiMessageCount.value = 2
    const wrapper = await mountAt('/logs')

    expect(wrapper.findAll('.p-badge').map((badge) => badge.text())).toEqual(['2'])
    expect(railItem(wrapper, 'AI 2').find('.p-badge').exists()).toBe(true)
  })

  it('shows no badge while nothing waits', async () => {
    const wrapper = await mountAt('/logs')

    expect(wrapper.find('.p-badge').exists()).toBe(false)
  })

  it('caps the count so it stays on the icon', async () => {
    aiMessageCount.value = 120
    const wrapper = await mountAt('/logs')

    expect(wrapper.find('.p-badge').text()).toBe('99+')
  })

  it('colors the Alarms badge by the worst severity and says so in its name', async () => {
    alarmCount.value = 3
    worstSeverity.value = 'critical'
    const wrapper = await mountAt('/logs')

    const item = railItem(wrapper, 'Alarms 3, worst Critical')
    expect(item.find('.p-badge').text()).toBe('3')
    expect(item.element.style.getPropertyValue('--app-nav-badge-bg')).toBe(
      'var(--netxms-status-critical)',
    )
    expect(item.element.style.getPropertyValue('--app-nav-badge-fg')).toBe(
      'var(--netxms-status-critical-on-fill)',
    )
  })

  it('leaves the AI badge its fixed color', async () => {
    aiMessageCount.value = 2
    const wrapper = await mountAt('/logs')

    expect(railItem(wrapper, 'AI 2').element.style.getPropertyValue('--app-nav-badge-bg')).toBe('')
  })

  it('names every item in the narrow rail, which has no visible labels', async () => {
    isNavCollapsed.value = true
    aiMessageCount.value = 2
    const wrapper = await mountAt('/logs')

    const names = wrapper.findAll('a.app-nav-button').map((a) => a.attributes('aria-label'))
    expect(wrapper.find('.p-button-label').exists()).toBe(false)
    expect(names).toEqual(expect.arrayContaining(['Infrastructure', 'Logs', 'Alarms', 'AI 2']))
    expect(names.every(Boolean)).toBe(true)
  })

  it('stays where the user is when the current perspective is clicked', async () => {
    const wrapper = await mountAt('/infrastructure/2')

    await railItem(wrapper, 'Infrastructure').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/infrastructure/2')
  })

  it('returns to where the user left another perspective', async () => {
    const wrapper = await mountAt('/infrastructure/2')

    await railItem(wrapper, 'Logs').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/logs/EventLog?t=1h')
  })
})
