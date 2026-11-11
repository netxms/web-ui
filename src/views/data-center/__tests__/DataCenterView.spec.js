import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'

const route = reactive({ name: 'data-center', params: {}, query: {}, path: '/data-center' })
const router = { push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '#' }) }
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => router,
  onBeforeRouteLeave: () => {},
  onBeforeRouteUpdate: () => {},
}))
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '#' }) } }))
const updateRoomConfig = vi.fn(() => Promise.resolve({}))
vi.mock('@/api/dataCenterApi', async (importOriginal) => ({
  ...(await importOriginal()),
  updateRoomConfig: (...args) => updateRoomConfig(...args),
}))
const createObject = vi.fn()
vi.mock('@/queries/useObjectQueries', async (importOriginal) => ({
  ...(await importOriginal()),
  useCreateObject: () => ({ mutateAsync: createObject, isPending: ref(false) }),
  useObjects: () => ({ data: ref([{ id: 2, class: 'ServiceRoot' }]) }),
  useObjectTree: () => ({ data: ref([]), isLoading: ref(false), error: ref(null) }),
}))

window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const DataCenterView = (await import('../DataCenterView.vue')).default
const HALL_A = 2090000030
const FACILITY = 2090000001
const HALL_A_COOLING = 2090000021

let sidebar
let wrapper

function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  wrapper = mount(DataCenterView, {
    attachTo: document.body,
    global: {
      plugins: [
        pinia,
        [VueQueryPlugin, { queryClient }],
        PrimeVue,
        ToastService,
        ConfirmationService,
      ],
      directives: { tooltip: Tooltip },
    },
  })
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  router.push.mockClear()
  router.replace.mockClear()
  sidebar = document.createElement('div')
  sidebar.id = 'sidebar-content'
  document.body.appendChild(sidebar)
})

afterEach(() => {
  wrapper?.unmount()
  sidebar.remove()
})

describe('DataCenterView', () => {
  it('lists the demo facility with its rooms and domains, not its racks', async () => {
    route.params = {}
    mountView()
    await flushPromises()

    const text = sidebar.textContent
    expect(text).toContain('DC-Alpha Site (demo)')
    for (const name of ['Hall A', 'Meet-Me Room', 'Utility Feed', 'Chiller Plant']) {
      expect(text).toContain(name)
    }
    expect(text).not.toContain('A05')
  })

  it('gives demo rows no action menu', async () => {
    route.params = {}
    mountView()
    await flushPromises()

    expect(sidebar.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(5)
    expect(sidebar.querySelectorAll('.tree-overflow-btn')).toHaveLength(0)
    sidebar.querySelector('[role="treeitem"]').dispatchEvent(new MouseEvent('contextmenu'))
    await flushPromises()
    expect(sidebar.querySelector('.menu-target')).toBeNull()
  })

  it('offers only the seeded views for a demo room and opens its floor plan', async () => {
    route.params = { objectId: String(HALL_A), viewId: 'floorPlan' }
    mountView()
    await flushPromises()

    const tabs = wrapper.findAll('[role="tab"]').map((tab) => tab.text())
    expect(tabs).toEqual(['Floor Plan'])
    await vi.waitFor(() => expect(wrapper.findAll('.fp-rack').length).toBe(16))
  })

  it('moves a facility opened without a view to its overview', async () => {
    route.params = { objectId: String(FACILITY) }
    mountView()
    await flushPromises()

    expect(router.replace).toHaveBeenCalledWith({
      name: 'data-center',
      params: { objectId: String(FACILITY), viewId: 'overview' },
    })
    route.params = { objectId: String(FACILITY), viewId: 'overview' }
    await vi.waitFor(() => expect(wrapper.findAll('.figure-tile').length).toBe(9))
    const tabs = wrapper.findAll('[role="tab"]').map((tab) => tab.text())
    expect(tabs).toEqual(['Overview', 'Power', 'Cooling'])
  })

  it('opens the power chain of a facility on its tab', async () => {
    route.params = { objectId: String(FACILITY), viewId: 'power' }
    mountView()
    await vi.waitFor(() => expect(wrapper.findAll('.pc-row').length).toBe(8))
  })

  it('opens a demo cooling zone on its cooling view', async () => {
    route.params = { objectId: String(HALL_A_COOLING) }
    mountView()
    await flushPromises()

    expect(router.replace).toHaveBeenCalledWith({
      name: 'data-center',
      params: { objectId: String(HALL_A_COOLING), viewId: 'cooling' },
    })
    route.params = { objectId: String(HALL_A_COOLING), viewId: 'cooling' }
    await vi.waitFor(() => expect(wrapper.findAll('.cl-row').length).toBe(1))
    expect(wrapper.find('.cl-toolbar').text()).toContain('8.4 °C')
  })

  async function createThrough(eventName, objectClass, name) {
    const parent = { id: 7, class: 'Facility' }
    document.dispatchEvent(new CustomEvent(eventName, { detail: { parent, objectClass } }))
    let dialog
    await vi.waitFor(() => {
      dialog = [...document.querySelectorAll('[role="dialog"]')].at(-1)
      expect(dialog?.textContent).toContain(`Create ${objectClass}`)
    })
    const input = dialog.querySelector('input[type="text"]')
    input.value = name
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    ;[...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Create').click()
    await flushPromises()
  }

  it('opens a created room on its floor plan in edit mode, a container in Infrastructure', async () => {
    route.params = {}
    mountView()
    await flushPromises()

    createObject.mockResolvedValueOnce({ id: 2080000001, class: 'Room' })
    await createThrough('dataCenterObject:create', 'Room', 'Hall C')
    expect(createObject).toHaveBeenLastCalledWith(
      expect.objectContaining({ class: 'Room', name: 'Hall C', parentId: 7 }),
    )
    expect(updateRoomConfig).toHaveBeenCalledWith(2080000001, {
      gridTileSize: 600,
      gridLabels: 'LETTERS_NUMBERS',
    })
    expect(router.push).toHaveBeenLastCalledWith({
      name: 'data-center',
      params: { objectId: 2080000001, viewId: 'floorPlan' },
      query: { edit: '1' },
    })

    createObject.mockResolvedValueOnce({ id: 900, class: 'Container' })
    await createThrough('object:create', 'Container', 'Spares')
    expect(router.push).toHaveBeenLastCalledWith({
      name: 'infrastructure',
      params: { objectId: 900 },
    })
  })
})
