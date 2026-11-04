import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import AlarmTable from '../AlarmTable.vue'
import { clearWorkingState } from '@/composables/useWorkingState'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// AppTable's new-tab hrefs pull in the router singleton, which cannot be built against the
// mocked vue-router.
vi.mock('@/router', () => ({
  default: { resolve: () => ({ href: '/' }), push: vi.fn(), replace: vi.fn() },
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

vi.mock('@/queries/useAlarmQueries', () => ({
  useAlarmSourceObjects: () => ({ data: computed(() => new Map()) }),
}))

vi.mock('@/composables/useAlarmActions', () => ({
  ALARM_ACTIONS: {},
  useAlarmActions: () => ({
    allowing: () => [],
    availabilityOf: () => ({ acknowledge: true, resolve: true, terminate: true }),
    run: vi.fn(),
    isRunning: computed(() => false),
    progressText: computed(() => null),
  }),
}))

vi.mock('@/composables/useAlarmContextMenu', () => ({
  useAlarmContextMenu: () => ({
    items: computed(() => []),
    open: vi.fn(),
    pendingTool: computed(() => null),
    toolInputVisible: computed(() => false),
    submitToolInput: vi.fn(),
    cancelToolInput: vi.fn(),
  }),
}))

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: () => ({ objectsById: computed(() => new Map()) }),
  useZoneNames: () => computed(() => new Map()),
}))

/** Stands in for SmartFilterInput: free text only, no debounce. */
const FilterStub = defineComponent({
  props: ['modelValue', 'filterDefs', 'placeholder', 'size'],
  emits: ['update:modelValue'],
  template: `<input
    class="filter-stub"
    :value="modelValue.text"
    @input="$emit('update:modelValue', { text: $event.target.value, tokens: [] })"
  />`,
})

const alarms = [
  { id: 1, severity: 2, state: 0, source: 10, sourceName: 'core-switch', message: 'Link down' },
  { id: 2, severity: 4, state: 0, source: 11, sourceName: 'edge-router', message: 'CPU high' },
]

function mountTable(props = {}) {
  return mount(AlarmTable, {
    props: { alarms, ...props },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: {} },
      stubs: {
        SmartFilterInput: FilterStub,
        ColumnChooser: true,
        RefetchIndicator: true,
        ActionContextMenu: true,
        CreateIncidentDialog: true,
        ToolInputDialog: true,
      },
      config: {
        globalProperties: {
          $plural: (count, singular) => `${count} ${singular}${count === 1 ? '' : 's'}`,
          $route: { path: '/dashboards/5', params: { dashboardId: '5' } },
        },
      },
    },
  })
}

const filterText = (wrapper) => wrapper.find('.filter-stub').element.value
const count = (wrapper) => wrapper.find('.item-count').text()

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  clearWorkingState()
})

describe('AlarmTable working state', () => {
  it('comes back with the filter it was left with', async () => {
    const first = mountTable()
    await first.find('.filter-stub').setValue('core')
    expect(count(first)).toBe('1 alarm')
    first.unmount()

    const again = mountTable()
    await flushPromises()

    expect(filterText(again)).toBe('core')
    expect(count(again)).toBe('1 alarm')
  })

  it('keeps tables with their own storage keys apart', async () => {
    const widget = mountTable({ storageKey: 'widget:w-1' })
    await widget.find('.filter-stub').setValue('core')
    widget.unmount()

    const other = mountTable({ storageKey: 'widget:w-2' })
    await flushPromises()

    expect(filterText(other)).toBe('')
    expect(count(other)).toBe('2 alarms')
  })
})
