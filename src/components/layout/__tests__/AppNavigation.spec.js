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
})

describe('AppNavigation', () => {
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
