import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { computed, ref, unref } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { objectTarget } from '@/utils/routeTargets'

// The test build compiles no modules. Its view applies to nodes flagged `isFake`.
const FAKE_MODULE = vi.hoisted(() => ({
  id: 'fake',
  label: 'Fake module',
  requiredComponent: 'FAKE',
  objectViews: [
    {
      group: 'monitoring',
      id: 'fakeView',
      label: 'Fake',
      icon: 'pi pi-box',
      objectClasses: ['Node'],
      objectFilter: (obj) => !!obj?.customAttributes?.some((a) => a.name === 'isFake'),
      component: () => Promise.resolve({ render: () => null }),
    },
  ],
}))

vi.mock('@/modules', async () => {
  const actual = await vi.importActual('@/modules')
  return { ...actual, moduleRegistry: actual.createModuleRegistry([FAKE_MODULE]) }
})

const OBJECTS = {
  1: { id: 1, name: 'Entire Network', class: 'Network' },
  2: { id: 2, name: 'Infrastructure Services', class: 'ServiceRoot' },
  10: { id: 10, name: 'Branch Office', class: 'Container' },
  108: { id: 108, name: 'netxms', class: 'Node' },
  109: {
    id: 109,
    name: 'flagged',
    class: 'Node',
    customAttributes: [{ name: 'isFake', value: '1' }],
  },
}

const TREES = {
  1: [],
  2: [
    { ...OBJECTS[10], children: [] },
    { ...OBJECTS[108], children: [] },
    { ...OBJECTS[109], children: [] },
    // In the tree but with no object document: `GET /v1/objects/{id}` pending or failed.
    { id: 111, name: 'no-details', class: 'Node', children: [] },
  ],
}

vi.mock('@/queries/useObjectQueries', () => ({
  useObjects: () => ({ data: ref([OBJECTS[1], OBJECTS[2]]) }),
  useObject: (id) => ({ data: computed(() => OBJECTS[Number(unref(id))] ?? null) }),
  useObjectTree: (rootId) => ({
    data: computed(() => TREES[unref(rootId)] ?? []),
    isLoading: ref(false),
    error: ref(null),
  }),
  useObjectsByIds: () => ({ objectsById: ref(new Map()), isFetching: ref(false) }),
  useBindObjectChild: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/queries/useObjectToolQueries', () => ({
  useObjectToolsForObject: () => ({ data: ref([]), isLoading: ref(false) }),
  useObjectToolIcons: () => ({ iconByToolId: ref(new Map()) }),
}))
vi.mock('@/composables/useContextMenu', () => ({
  useContextMenu: () => ({ menuItems: ref([]), contextRef: ref(null) }),
}))
vi.mock('@/composables/useActions', () => ({
  useActions: () => ({ menuItems: ref([]) }),
  extractPrimaryActions: () => [],
}))
vi.mock('@/composables/useTemplateBinding', () => ({ useTemplateBinding: () => ({}) }))
vi.mock('@/composables/useActionShortcuts', () => ({ useActionShortcuts: () => {} }))
vi.mock('@/composables/useObjectDeletionNavigation', () => ({
  useObjectDeletionNavigation: () => {},
}))
vi.mock('@/composables/useToolExecution', () => ({ useToolExecution: () => ({}) }))
vi.mock('@/composables/usePageTitle', () => ({ usePageTitle: () => {} }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

const ObjectsView = (await import('@/views/objects/ObjectsView.vue')).default
const ViewTabBar = (await import('@/components/views/ViewTabBar.vue')).default
const ViewAddMenu = (await import('@/components/views/ViewAddMenu.vue')).default
const ViewContainer = (await import('@/components/views/ViewContainer.vue')).default
const { moduleRegistry } = await import('@/modules')

async function mountAt(location) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/infrastructure/:objectId?/:viewId?/:entityId?',
        name: 'infrastructure',
        component: { render: () => null },
      },
    ],
  })
  router.push(location)
  await router.isReady()
  const wrapper = shallowMount(ObjectsView, {
    global: {
      plugins: [createPinia(), router],
      stubs: { teleport: true },
      directives: { tooltip: {} },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

const activeView = (wrapper) => wrapper.findComponent(ViewTabBar).props('activeView')

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  moduleRegistry.setServerComponents(null)
})

describe('ObjectsView - view resolution', () => {
  it('does not carry an unsupported view to an object linked without one', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/10/statusMap')
    expect(activeView(wrapper)).toBe('statusMap')

    await router.push(objectTarget(OBJECTS[108]))
    await flushPromises()

    expect(activeView(wrapper)).toBe('status')
  })

  it('keeps the last view when the linked object supports it', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/10/alarms')

    await router.push(objectTarget(OBJECTS[108]))
    await flushPromises()

    expect(activeView(wrapper)).toBe('alarms')
  })

  it('opens a linked view the new object supports even if the old one did not', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/108/status')

    await router.push(objectTarget(OBJECTS[10], 'statusMap'))
    await flushPromises()

    expect(activeView(wrapper)).toBe('statusMap')
    expect(router.currentRoute.value.params).toMatchObject({ objectId: '10', viewId: 'statusMap' })
  })

  it('replaces a linked view the new object does not support', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/10/status')

    await router.push(objectTarget(OBJECTS[108], 'statusMap'))
    await flushPromises()

    expect(activeView(wrapper)).toBe('status')
    expect(router.currentRoute.value.params).toMatchObject({ objectId: '108', viewId: 'status' })
  })
})

// The document lands before server-info here, so the module is still unknown when the details
// are checked.
describe('ObjectsView - module view deep links', () => {
  const viewIdInRoute = (router) => router.currentRoute.value.params.viewId

  it('waits on a deep-linked module view while server-info is pending', async () => {
    const { router } = await mountAt('/infrastructure/109/fakeView')

    expect(viewIdInRoute(router)).toBe('fakeView')
  })

  it('leaves a module view once server-info says the module is absent', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/109/fakeView')

    moduleRegistry.setServerComponents(['CORE'])
    await flushPromises()

    expect(viewIdInRoute(router)).toBe('status')
    expect(activeView(wrapper)).toBe('status')
  })

  it('leaves a module view the object fails once the module is confirmed', async () => {
    const { router } = await mountAt('/infrastructure/108/fakeView')

    moduleRegistry.setServerComponents(['CORE', 'FAKE'])
    await flushPromises()

    expect(viewIdInRoute(router)).toBe('status')
  })

  it('leaves a module view the server lacks even without the object document', async () => {
    const { router } = await mountAt('/infrastructure/111/fakeView')

    moduleRegistry.setServerComponents(['CORE'])
    await flushPromises()

    expect(viewIdInRoute(router)).toBe('status')
  })

  it('keeps a module view the object passes once the module is confirmed', async () => {
    const { router } = await mountAt('/infrastructure/109/fakeView')

    moduleRegistry.setServerComponents(['CORE', 'FAKE'])
    await flushPromises()

    expect(viewIdInRoute(router)).toBe('fakeView')
  })
})

describe('ObjectsView - manage views', () => {
  const tabIds = (wrapper) => wrapper.findComponent(ViewTabBar).props('visibleViewIds')
  const menuViewIds = (wrapper) =>
    Object.values(wrapper.findComponent(ViewAddMenu).props('groups')).flatMap((group) =>
      group.views.map((view) => view.id),
    )

  it('opens a node with Interfaces and a container with Status Map', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/108/status')
    expect(tabIds(wrapper)).toContain('interfaces')
    expect(tabIds(wrapper)).not.toContain('statusMap')

    await router.push(objectTarget(OBJECTS[10], 'status'))
    await flushPromises()
    expect(tabIds(wrapper)).toContain('statusMap')
    expect(tabIds(wrapper)).not.toContain('interfaces')
  })

  it('offers only the views the selected object supports', async () => {
    const { wrapper } = await mountAt('/infrastructure/10/status')
    expect(menuViewIds(wrapper)).toContain('statusMap')
    expect(menuViewIds(wrapper)).not.toContain('interfaces')
    expect(menuViewIds(wrapper)).not.toContain('dcis')
  })

  it('counts the supported views that have no tab yet', async () => {
    const { wrapper } = await mountAt('/infrastructure/108/status')
    const missing = menuViewIds(wrapper).filter((id) => !tabIds(wrapper).includes(id))
    expect(missing.length).toBeGreaterThan(0)
    expect(wrapper.findComponent(ViewTabBar).props('addableCount')).toBe(missing.length)
  })
})

describe('ObjectsView - closing tabs', () => {
  const viewIdInRoute = (router) => router.currentRoute.value.params.viewId
  const tabBar = (wrapper) => wrapper.findComponent(ViewTabBar)
  const tabIds = (wrapper) => tabBar(wrapper).props('visibleViewIds')
  const viewProps = (wrapper) => wrapper.findComponent(ViewContainer).props('viewProps')

  async function visit(router, objectId, viewId) {
    await router.push({ name: 'infrastructure', params: { objectId, viewId } })
    await flushPromises()
  }

  async function closeTab(wrapper, viewId) {
    tabBar(wrapper).vm.$emit('close', viewId)
    await flushPromises()
  }

  it('returns to the tab used before the closed one', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/108/alarms')
    await visit(router, '108', 'dcis')
    await visit(router, '108', 'properties')

    await closeTab(wrapper, 'properties')

    expect(viewIdInRoute(router)).toBe('dcis')
    expect(tabIds(wrapper)).not.toContain('properties')
  })

  it('skips a recent tab that has been closed since', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/108/alarms')
    await visit(router, '108', 'dcis')
    await visit(router, '108', 'properties')

    await closeTab(wrapper, 'dcis')
    expect(viewIdInRoute(router)).toBe('properties')
    await closeTab(wrapper, 'properties')

    expect(viewIdInRoute(router)).toBe('alarms')
  })

  it('stays on the object picked while the closed tab was open', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/108/alarms')
    await visit(router, '108', 'properties')
    await visit(router, '109', 'properties')

    await closeTab(wrapper, 'properties')

    expect(router.currentRoute.value.params).toMatchObject({ objectId: '109', viewId: 'alarms' })
  })

  it('falls back to the first tab when no earlier tab is open', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/108/properties')

    await closeTab(wrapper, 'properties')

    expect(viewIdInRoute(router)).toBe('status')
  })

  it('gives only Properties a close, which leaves a locked tab on the bar', async () => {
    const { wrapper, router } = await mountAt('/infrastructure/108/alarms')
    expect(viewProps(wrapper).closable).toBeUndefined()

    await visit(router, '108', 'properties')
    tabBar(wrapper).vm.$emit('toggle-lock', 'properties')
    expect(viewProps(wrapper).closable).toBe(true)
    viewProps(wrapper).onClose()
    await flushPromises()

    expect(viewIdInRoute(router)).toBe('alarms')
    expect(tabIds(wrapper)).toContain('properties')
  })
})
