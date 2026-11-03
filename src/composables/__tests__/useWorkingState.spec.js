import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { useWorkingState, clearWorkingState } from '@/composables/useWorkingState'

/** The live refs of whichever probe mounted last. */
let probe = null

/** Keeps a filter (per view) and a selection (per object). */
function makeProbe(name, extraFields = () => ({})) {
  return defineComponent({
    name,
    setup() {
      const filter = ref('')
      const selection = ref(new Set())
      const extra = extraFields()
      useWorkingState(
        'probe',
        {
          view: { filter, ...extra.view },
          object: { selection, ...extra.object },
        },
        extra.options,
      )
      probe = { filter, selection, ...extra.refs }
      return () => h('div', name)
    },
  })
}

// Distinct components per perspective: RouterView reuses an instance when two records render
// the same one.
const InfrastructureProbe = makeProbe('InfrastructureProbe')
const TemplatesProbe = makeProbe('TemplatesProbe')
const Elsewhere = defineComponent({ render: () => h('div', 'elsewhere') })

async function setup(routes) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: routes ?? [
      { path: '/infrastructure/:objectId?/:viewId?', component: InfrastructureProbe },
      { path: '/templates/:objectId?', component: TemplatesProbe },
      { path: '/alarms', component: Elsewhere },
    ],
  })
  router.push('/infrastructure/1')
  await router.isReady()
  mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
  await flushPromises()
  return router
}

async function go(router, path) {
  await router.push(path)
  await flushPromises()
}

beforeEach(() => {
  clearWorkingState()
  probe = null
})

describe('useWorkingState', () => {
  it('gives a view its filter and selection back after leaving the perspective', async () => {
    const router = await setup()
    probe.filter.value = 'cpu'
    probe.selection.value = new Set([7, 8])

    await go(router, '/alarms')
    expect(probe).not.toBeNull()
    await go(router, '/infrastructure/1')

    expect(probe.filter.value).toBe('cpu')
    expect([...probe.selection.value]).toEqual([7, 8])
  })

  it('files the selection under the object shown when the route unmounts the view', async () => {
    const router = await setup()
    probe.selection.value = new Set([3])

    await go(router, '/templates/2')
    await go(router, '/infrastructure/1')

    expect([...probe.selection.value]).toEqual([3])
  })

  it('carries the filter to another object, but not the selection', async () => {
    const router = await setup()
    probe.filter.value = 'cpu'
    probe.selection.value = new Set([7])

    await go(router, '/alarms')
    await go(router, '/infrastructure/2')

    expect(probe.filter.value).toBe('cpu')
    expect(probe.selection.value.size).toBe(0)
  })

  it('starts the next object fresh when the view stays on screen', async () => {
    const router = await setup()
    const mounted = probe
    probe.filter.value = 'cpu'
    probe.selection.value = new Set([7])

    await go(router, '/infrastructure/2')

    expect(probe).toBe(mounted)
    expect(probe.filter.value).toBe('cpu')
    expect(probe.selection.value.size).toBe(0)
  })

  it('leaves the state alone when only the view tab changes on the same object', async () => {
    const router = await setup()
    probe.selection.value = new Set([7])

    await go(router, '/infrastructure/1/dcis')

    expect([...probe.selection.value]).toEqual([7])
  })

  it('keeps each perspective apart', async () => {
    const router = await setup()
    probe.filter.value = 'cpu'

    await go(router, '/templates/1')

    expect(probe.filter.value).toBe('')
  })

  it('forgets everything on clearWorkingState', async () => {
    const router = await setup()
    probe.filter.value = 'cpu'
    probe.selection.value = new Set([7])

    await go(router, '/alarms')
    clearWorkingState()
    await go(router, '/infrastructure/1')

    expect(probe.filter.value).toBe('')
    expect(probe.selection.value.size).toBe(0)
  })

  it('reads and writes get/set fields', async () => {
    let stored = 0
    const set = vi.fn((value) => (stored = value))
    const Probe = makeProbe('AccessorProbe', () => ({
      object: { offset: { get: () => stored, set } },
    }))
    const router = await setup([
      { path: '/infrastructure/:objectId?', component: Probe },
      { path: '/alarms', component: Elsewhere },
    ])
    stored = 120

    await go(router, '/alarms')
    stored = 0
    await go(router, '/infrastructure/1')

    expect(set).toHaveBeenCalledWith(120)
    expect(stored).toBe(120)
  })

  it('saves values that hold reactive proxies, as a detached copy', async () => {
    const Probe = makeProbe('ProxyProbe', () => {
      const keys = ref([{ field: 'name', order: 1 }])
      return { view: { keys }, refs: { keys } }
    })
    const router = await setup([
      { path: '/infrastructure/:objectId?', component: Probe },
      { path: '/alarms', component: Elsewhere },
    ])
    // A spread of a reactive array holds proxies of its items.
    probe.keys.value = [...probe.keys.value, { field: 'ip', order: -1 }]

    await go(router, '/alarms')
    await go(router, '/infrastructure/1')
    const restored = probe.keys.value
    expect(restored).toEqual([
      { field: 'name', order: 1 },
      { field: 'ip', order: -1 },
    ])

    await go(router, '/alarms')
    await go(router, '/infrastructure/1')
    expect(probe.keys.value).toEqual(restored)
    expect(probe.keys.value).not.toBe(restored)
  })

  it('files the per-object part under the owner it is given instead of the route', async () => {
    // e.g. an alarm's related events: the route is /alarms whichever alarm is open.
    const owner = ref('a')
    const Probe = makeProbe('OwnedProbe', () => ({ options: { objectKey: () => owner.value } }))
    const router = await setup([
      { path: '/infrastructure/:objectId?', component: Probe },
      { path: '/alarms', component: Elsewhere },
    ])
    probe.selection.value = new Set([7])

    owner.value = 'b'
    await flushPromises()
    expect(probe.selection.value.size).toBe(0)
    probe.selection.value = new Set([9])

    await go(router, '/alarms')
    await go(router, '/infrastructure/1')
    expect([...probe.selection.value]).toEqual([9])

    await go(router, '/alarms')
    owner.value = 'a'
    await go(router, '/infrastructure/1')
    expect(probe.selection.value.size).toBe(0)
  })

  it('does nothing without a router', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Probe = makeProbe('RouterlessProbe')

    const wrapper = mount(Probe)
    probe.filter.value = 'cpu'
    wrapper.unmount()
    mount(Probe)

    expect(probe.filter.value).toBe('')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
