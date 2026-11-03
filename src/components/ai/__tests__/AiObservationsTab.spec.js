import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Select from 'primevue/select'
import Tooltip from 'primevue/tooltip'
import AppTable from '@/components/common/AppTable.vue'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const observations = ref([])
const operators = ref([])
const can = ref({ manageAiOperators: true })
const mutate = vi.fn()

vi.mock('@/queries/useAiOperatorQueries', () => ({
  useAiObservations: () => ({
    data: observations,
    isLoading: ref(false),
    isFetching: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useAiOperators: (enabled) => ({ data: ref(enabled() ? operators.value : undefined) }),
  useSetAiObservationState: () => ({ mutate, isPending: ref(false) }),
}))

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: () => ({
    objectsById: ref(new Map([[10, { id: 10, name: 'sw-lab-1', class: 'Node' }]])),
  }),
}))

vi.mock('@/composables/usePermissions', () => ({ usePermissions: () => ({ can }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

const AiObservationsTab = (await import('@/components/ai/AiObservationsTab.vue')).default

const first = {
  id: 1,
  timestamp: '2026-10-24T19:14:50Z',
  instanceId: 4,
  severity: 3,
  title: 'First',
  body: 'First body',
  objectId: 10,
  state: 'new',
}
const second = { ...first, id: 2, timestamp: '2026-10-23T19:14:50Z', title: 'Second' }

function mountTab() {
  return mount(AiObservationsTab, {
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      mocks: { $plural: (n, word) => `${n} ${n === 1 ? word : `${word}s`}` },
      stubs: {
        AppLink: { template: '<a><slot /></a>' },
        ColumnChooser: true,
        EntityContextMenu: true,
        SmartFilterInput: true,
      },
    },
  })
}

const panel = (wrapper) => wrapper.find('.record-panel')
const clickRow = (wrapper, index) => wrapper.findAll('tbody tr')[index].trigger('click')
const headers = (wrapper) => wrapper.findAll('thead th').map((th) => th.text())

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  mutate.mockReset()
  observations.value = [first, second]
  operators.value = [{ id: 4, name: 'Night shift' }]
  can.value = { manageAiOperators: true }
})

describe('AiObservationsTab details panel', () => {
  it('opens on the clicked row and marks it', async () => {
    const wrapper = mountTab()
    expect(panel(wrapper).classes()).not.toContain('is-open')

    await clickRow(wrapper, 0)

    expect(panel(wrapper).classes()).toContain('is-open')
    expect(wrapper.find('.observation-title').text()).toBe('First')
    expect(wrapper.findAll('tbody tr')[0].classes()).toContain('row--selected')
  })

  it('moves to another row without closing, and closes on the same row', async () => {
    const wrapper = mountTab()
    await clickRow(wrapper, 0)
    await clickRow(wrapper, 1)

    expect(panel(wrapper).classes()).toContain('is-open')
    expect(wrapper.find('.observation-title').text()).toBe('Second')

    await clickRow(wrapper, 1)

    expect(panel(wrapper).classes()).not.toContain('is-open')
    expect(wrapper.find('tbody tr.row--selected').exists()).toBe(false)
  })

  it('keeps the object plain text in the table, so a click on it opens the panel too', async () => {
    const wrapper = mountTab()
    const objectCell = wrapper.findAll('tbody tr')[0].findAll('td')[4]
    expect(objectCell.text()).toBe('sw-lab-1')
    expect(wrapper.find('tbody a').exists()).toBe(false)

    await objectCell.trigger('click')

    expect(panel(wrapper).classes()).toContain('is-open')
    expect(panel(wrapper).find('a.object-link').text()).toBe('sw-lab-1')
  })

  it('follows its record through a refetch', async () => {
    const wrapper = mountTab()
    await clickRow(wrapper, 0)

    observations.value = [{ ...first, state: 'acknowledged' }, second]
    await nextTick()

    expect(wrapper.find('.record-footer').text()).toContain('Mark as new')
  })

  it('stays on a record the state filter dropped, so a triage can be undone', async () => {
    mutate.mockImplementation((_vars, { onSuccess }) => {
      observations.value = [second]
      onSuccess()
    })
    const wrapper = mountTab()
    await clickRow(wrapper, 0)

    await wrapper.find('.record-footer button').trigger('click')
    await nextTick()

    expect(mutate.mock.calls[0][0]).toEqual({ observationId: 1, state: 'acknowledged' })
    expect(panel(wrapper).classes()).toContain('is-open')
    expect(wrapper.find('.observation-title').text()).toBe('First')
    expect(wrapper.find('.record-footer').text()).toContain('Mark as new')
  })
})

describe('AiObservationsTab operator names', () => {
  it('names the operator for an account that can read them', async () => {
    const wrapper = mountTab()
    await clickRow(wrapper, 0)

    expect(wrapper.findAll('tbody tr')[0].text()).toContain('Night shift')
  })

  it('stays on the id for one that cannot', () => {
    can.value = { manageAiOperators: false }
    const cells = mountTab()
      .findAll('tbody tr')[0]
      .findAll('td')
      .map((td) => td.text())

    expect(cells[3]).toBe('4')
  })
})

describe('AiObservationsTab toolbar and columns', () => {
  it('says "All states" while no state is picked', () => {
    expect(mountTab().findComponent(Select).text()).toContain('All states')
  })

  it('moves a dragged column and keeps the order for the next visit', async () => {
    const wrapper = mountTab()
    wrapper
      .findComponent(AppTable)
      .vm.$emit('column-move', { id: 'title', targetId: 'severity', after: false })
    await nextTick()
    expect(headers(wrapper)[0]).toBe('Observation')
    wrapper.unmount()

    setActivePinia(createPinia())
    expect(headers(mountTab())[0]).toBe('Observation')
  })
})
