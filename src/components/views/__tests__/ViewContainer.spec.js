import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createRouter, createMemoryHistory, RouterView, useRoute } from 'vue-router'
import PrimeVue from 'primevue/config'
import ViewContainer from '../ViewContainer.vue'
import { clearWorkingState } from '@/composables/useWorkingState'

const Doc = defineComponent({ render: () => h('div', { class: 'doc' }, 'doc') })

const Host = defineComponent({
  setup() {
    const route = useRoute()
    return () =>
      h(ViewContainer, {
        key: route.params.viewId,
        stateKey: route.params.viewId || null,
        component: Doc,
      })
  },
})
const Elsewhere = defineComponent({ render: () => h('div', 'elsewhere') })

// jsdom has no layout: the container's content height is whatever a test says.
let contentHeight = 1000
const CLIENT_HEIGHT = 300

let frames = []
function runFrames() {
  const queued = frames
  frames = []
  queued.forEach((fn) => fn?.())
}

let wrapper
let router

async function mountAt(path) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/infrastructure/:objectId?/:viewId?', component: Host },
      { path: '/alarms', component: Elsewhere },
    ],
  })
  router.push(path)
  await router.isReady()
  wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router, PrimeVue] } })
  await flushPromises()
}

async function go(path) {
  await router.push(path)
  await flushPromises()
}

const container = () => wrapper.find('.view-container').element

beforeEach(() => {
  clearWorkingState()
  contentHeight = 1000
  frames = []
  vi.stubGlobal('requestAnimationFrame', (fn) => frames.push(fn))
  vi.stubGlobal('cancelAnimationFrame', (id) => (frames[id - 1] = null))
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
    return this.classList.contains('view-container') ? contentHeight : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
    return this.classList.contains('view-container') ? CLIENT_HEIGHT : 0
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ViewContainer scroll memory', () => {
  it('brings the offset back when the view comes back on the same object', async () => {
    await mountAt('/infrastructure/1/status')
    container().scrollTop = 400

    await go('/alarms')
    await go('/infrastructure/1/status')

    expect(container().scrollTop).toBe(400)
  })

  it('keeps one offset per view', async () => {
    await mountAt('/infrastructure/1/status')
    container().scrollTop = 400

    await go('/infrastructure/1/overview')
    expect(container().scrollTop).toBe(0)
    container().scrollTop = 120

    await go('/infrastructure/1/status')
    expect(container().scrollTop).toBe(400)
    await go('/infrastructure/1/overview')
    expect(container().scrollTop).toBe(120)
  })

  it('starts another object at the top', async () => {
    await mountAt('/infrastructure/1/status')
    container().scrollTop = 400

    await go('/infrastructure/2/status')

    expect(container().scrollTop).toBe(0)
  })

  it('waits for the content to grow tall enough', async () => {
    await mountAt('/infrastructure/1/status')
    container().scrollTop = 400

    await go('/alarms')
    contentHeight = 0
    await go('/infrastructure/1/status')
    expect(container().scrollTop).toBe(0)

    runFrames()
    expect(container().scrollTop).toBe(0)
    contentHeight = 1000
    runFrames()
    expect(container().scrollTop).toBe(400)
  })

  it('stops waiting once the user scrolls', async () => {
    await mountAt('/infrastructure/1/status')
    container().scrollTop = 400

    await go('/alarms')
    contentHeight = 0
    await go('/infrastructure/1/status')
    await wrapper.find('.view-container').trigger('wheel')
    contentHeight = 1000
    runFrames()

    expect(container().scrollTop).toBe(0)
  })

  it('gives up after a couple of seconds', async () => {
    await mountAt('/infrastructure/1/status')
    container().scrollTop = 400

    await go('/alarms')
    contentHeight = 0
    await go('/infrastructure/1/status')
    const now = performance.now()
    vi.spyOn(performance, 'now').mockReturnValue(now + 5000)
    runFrames()
    contentHeight = 1000
    runFrames()

    expect(container().scrollTop).toBe(0)
  })

  it('keeps an offset still waiting when the view is left again', async () => {
    await mountAt('/infrastructure/1/status')
    container().scrollTop = 400

    await go('/alarms')
    contentHeight = 0
    await go('/infrastructure/1/status')
    await go('/alarms')
    contentHeight = 1000
    await go('/infrastructure/1/status')

    expect(container().scrollTop).toBe(400)
  })

  it('remembers nothing without a stateKey', async () => {
    await mountAt('/infrastructure/1')
    container().scrollTop = 400

    await go('/alarms')
    await go('/infrastructure/1')

    expect(container().scrollTop).toBe(0)
  })
})
