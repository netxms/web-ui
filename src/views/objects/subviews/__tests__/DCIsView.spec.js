import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, ref, toValue } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import DCIsView from '../DCIsView.vue'
import { entityIdForTest } from '@/composables/useEntityDetail'
import { clearWorkingState } from '@/composables/useWorkingState'
import { userPrefs } from '@/utils/appStorage'

// Mounting the whole view is slow under the parallel suite.
vi.setConfig({ testTimeout: 15_000 })

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))

// AppTable's new-tab hrefs pull in the router singleton, which cannot be constructed
// against the mocked vue-router.
vi.mock('@/router', () => ({
  default: { resolve: () => ({ href: '/' }), push: vi.fn(), replace: vi.fn() },
}))

vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: vi.fn() }),
}))

vi.mock('@/composables/useEntityDetail', async () => {
  const { ref, computed } = await import('vue')
  const entityId = ref(null)
  return {
    entityIdForTest: entityId,
    useEntityDetail: () => ({
      entityId,
      isDetailView: computed(() => entityId.value !== null),
      detailTarget: () => ({}),
      openDetail: vi.fn(),
      closeDetail: vi.fn(),
    }),
  }
})

const DAY = 24 * 60 * 60
const nowSeconds = Math.floor(Date.now() / 1000)
// The third DCI stopped collecting 17 days ago, like one on an unmanaged node.
const staleSeconds = nowSeconds - 17 * DAY
const iso = (unixSeconds) => new Date(unixSeconds * 1000).toISOString()

const values = [
  {
    id: 1214,
    description: 'A: free space on /',
    name: 'FS.Free(/)',
    dataType: 5,
    status: 0,
    timestamp: iso(nowSeconds - 60),
    templateItemId: 0,
    comments: 'Line one\nLine two',
  },
  // Added by a template, with a threshold that fired.
  {
    id: 1215,
    description: 'B: free space on /boot',
    name: 'FS.Free(/b)',
    dataType: 5,
    status: 0,
    timestamp: iso(nowSeconds - 60),
    templateItemId: 2243,
    hasActiveThreshold: true,
    threshold: {
      function: 'last',
      condition: 'greater',
      value: '80',
      currentSeverity: 3,
      activationEvent: 'SYS_THRESHOLD_REACHED',
      lastEventMessage: 'Too much',
    },
  },
  {
    id: 1216,
    description: 'C: used space on /',
    name: 'FS.Used(/)',
    dataType: 5,
    status: 0,
    timestamp: iso(staleSeconds),
    templateItemId: 0,
  },
  // Not supported by the agent: never collected anything.
  {
    id: 1217,
    description: 'D: missing counter',
    name: 'Missing.Counter',
    dataType: 6,
    status: 2,
    timestamp: null,
    noValue: true,
    templateItemId: 0,
  },
]

const prefetchDciHistory = vi.fn()

vi.mock('@/queries/useObjectQueries', () => ({
  useDciCurrentValues: () => ({
    data: ref({ values }),
    isLoading: ref(false),
    isFetching: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useDciHistory: (objectId, dciId) => ({
    data: computed(() => ({ dciId: toValue(dciId), values: [{ timestamp: 1, value: '1' }] })),
    isLoading: ref(false),
  }),
  useObjectsByIds: () => ({
    objectsById: computed(() => new Map()),
    isFetching: ref(false),
    unresolvedIds: ref([]),
  }),
  usePrefetchDciHistory: () => prefetchDciHistory,
}))

const configList = [
  {
    id: 1214,
    type: 'item',
    description: 'A: free space on /',
    name: 'FS.Free(/)',
    origin: 'agent',
    dataType: 'int64',
    status: 'active',
    pollingScheduleType: 'default',
    retentionType: 'default',
    templateId: 0,
    templateItemId: 0,
    thresholds: [],
  },
  {
    id: 1215,
    type: 'item',
    description: 'B: free space on /boot',
    name: 'FS.Free(/b)',
    origin: 'agent',
    dataType: 'int64',
    status: 'active',
    pollingScheduleType: 'default',
    retentionType: 'default',
    templateId: 20,
    templateItemId: 2243,
    thresholds: [{ function: 'last', condition: 'greater', value: '80' }],
  },
]

vi.mock('@/queries/useDciConfigQueries', () => ({
  useDciConfigList: () => ({
    data: ref(configList),
    isLoading: ref(false),
    isFetching: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useUpdateDci: () => ({ mutate: vi.fn() }),
  useDeleteDci: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/queries/useMappingTableQueries', () => ({
  useDciValueMapping: () => ({ mappedValue: () => null }),
}))

const DciHistoryChartStub = defineComponent({
  props: ['historyData'],
  template: '<div class="chart-stub">{{ historyData.dciId }}</div>',
})

const EntityContextMenuStub = defineComponent({
  props: ['items'],
  setup(props, { expose }) {
    const contextData = ref(null)
    function show(event, rowData) {
      contextData.value = rowData
    }
    expose({ show, contextData })
    return {}
  },
  template: `
    <div class="ctx-menu-stub">
      <button
        v-for="(item, i) in items.filter((it) => !it.separator)"
        :key="i"
        class="ctx-item"
        @click="item.command && item.command()"
      >{{ item.label }}</button>
    </div>
  `,
})

/**
 * @param {object} [options]
 * @param {object} [options.object]
 * @param {object} [options.route] - an app `$route`, which turns on working state
 */
function mountView({ object = { id: 100, class: 'Node', name: 'node' }, route } = {}) {
  return mount(DCIsView, {
    props: { object },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: {} },
      stubs: {
        DciHistoryChart: DciHistoryChartStub,
        DciStringHistory: true,
        DciTableCurrentView: true,
        DciEditorView: true,
        RefetchIndicator: true,
        EntityContextMenu: EntityContextMenuStub,
      },
      config: {
        globalProperties: {
          $plural: (count, singular) => `${count} ${singular}${count === 1 ? '' : 's'}`,
          ...(route && { $route: route }),
        },
      },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  clearWorkingState()
  entityIdForTest.value = null
  routerPush.mockClear()
  prefetchDciHistory.mockClear()
})

const dataRows = (wrapper) => wrapper.findAll('tbody tr[aria-expanded]')
const chartIds = (wrapper) => wrapper.findAll('.chart-stub').map((c) => c.text())

describe('DCIsView live data expansion', () => {
  it('keeps the history of every expanded row open', async () => {
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[1].trigger('click')

    expect(chartIds(wrapper)).toEqual(['1214', '1215'])
    expect(wrapper.text()).not.toContain('Click this item again')
  })

  it('collapses only the row that was clicked again', async () => {
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[0].trigger('click')
    await dataRows(wrapper)[1].trigger('click')
    await dataRows(wrapper)[0].trigger('click')

    expect(chartIds(wrapper)).toEqual(['1215'])
  })

  it('opens the row from the Quick preview menu entry', async () => {
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[1].trigger('contextmenu')
    const preview = wrapper.findAll('.ctx-item').find((b) => b.text() === 'Quick preview')
    await preview.trigger('click')

    expect(dataRows(wrapper)[1].attributes('aria-expanded')).toBe('true')
    expect(chartIds(wrapper)).toEqual(['1215'])
  })
})

describe('DCIsView selection actions', () => {
  const rowCheckboxes = (wrapper) =>
    wrapper.findAll('.app-table__checkbox-td .app-table__checkbox-wrap')
  const selectionButton = (wrapper, label) =>
    wrapper
      .find('.selection-actions')
      .findAll('button')
      .find((b) => b.text() === label)

  it('offers them in the toolbar, so selecting does not move the table', async () => {
    const wrapper = mountView()
    await flushPromises()

    await rowCheckboxes(wrapper)[0].trigger('click')

    const actions = wrapper.find('.dcis-toolbar .selection-actions')
    expect(actions.text()).toContain('1 selected')
    expect(actions.text()).toContain('Line chart')
  })

  it('previews every selected row', async () => {
    const wrapper = mountView()
    await flushPromises()

    await rowCheckboxes(wrapper)[0].trigger('click')
    await rowCheckboxes(wrapper)[2].trigger('click')
    await selectionButton(wrapper, 'Preview').trigger('click')

    expect(chartIds(wrapper)).toEqual(['1214', '1216'])
  })

  it('previews the whole selection from the menu of a selected row', async () => {
    const wrapper = mountView()
    await flushPromises()

    await rowCheckboxes(wrapper)[0].trigger('click')
    await rowCheckboxes(wrapper)[1].trigger('click')
    await dataRows(wrapper)[1].trigger('contextmenu')
    await wrapper
      .findAll('.ctx-item')
      .find((b) => b.text() === 'Quick preview')
      .trigger('click')

    expect(chartIds(wrapper)).toEqual(['1214', '1215'])
  })

  it('clears the selection', async () => {
    const wrapper = mountView()
    await flushPromises()

    await rowCheckboxes(wrapper)[0].trigger('click')
    await selectionButton(wrapper, 'Clear').trigger('click')

    expect(wrapper.find('.selection-actions').text()).toBe('')
  })
})

describe('DCIsView history prefetch', () => {
  afterEach(() => vi.useRealTimers())

  it('fetches the history of a row the pointer rests on', async () => {
    const wrapper = mountView()
    await flushPromises()
    vi.useFakeTimers()

    await dataRows(wrapper)[0].trigger('mouseenter')
    vi.advanceTimersByTime(600)

    expect(prefetchDciHistory).toHaveBeenCalledExactlyOnceWith(100, 1214, { endAt: null })
  })

  it('fetches the window the preview will show for a stale DCI', async () => {
    const wrapper = mountView()
    await flushPromises()
    vi.useFakeTimers()

    await dataRows(wrapper)[2].trigger('mouseenter')
    vi.advanceTimersByTime(600)

    expect(prefetchDciHistory).toHaveBeenCalledExactlyOnceWith(100, 1216, {
      endAt: staleSeconds,
    })
  })

  it('fetches nothing for rows the pointer only crosses', async () => {
    const wrapper = mountView()
    await flushPromises()
    vi.useFakeTimers()

    await dataRows(wrapper)[0].trigger('mouseenter')
    vi.advanceTimersByTime(300)
    await dataRows(wrapper)[0].trigger('mouseleave')
    await dataRows(wrapper)[1].trigger('mouseenter')
    vi.advanceTimersByTime(300)
    await dataRows(wrapper)[1].trigger('mouseleave')
    vi.advanceTimersByTime(1000)

    expect(prefetchDciHistory).not.toHaveBeenCalled()
  })
})

describe('DCIsView chart view link', () => {
  const openChartLink = (wrapper) =>
    wrapper.findAll('a').find((a) => a.text() === 'Open in chart view')

  it("opens the chart on its default window for a DCI that's still collecting", async () => {
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[0].trigger('click')
    await openChartLink(wrapper).trigger('click')

    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush.mock.calls[0][0].query.t).toBeUndefined()
  })

  it('opens the chart on the window the preview showed for a stale DCI', async () => {
    const wrapper = mountView()
    await flushPromises()

    await dataRows(wrapper)[2].trigger('click')
    await openChartLink(wrapper).trigger('click')

    expect(routerPush.mock.calls[0][0].query).toMatchObject({
      t: 'custom',
      from: String(staleSeconds - DAY),
      to: String(staleSeconds),
    })
  })
})

const rowFor = (wrapper, id) =>
  dataRows(wrapper).find((r) => r.find('td:nth-child(3)').text() === String(id))

describe('DCIsView live data rows', () => {
  it('keeps the metric out of the row and shows it in the expansion', async () => {
    const wrapper = mountView()
    await flushPromises()

    const row = rowFor(wrapper, 1214)
    expect(row.text()).toContain('A: free space on /')
    expect(row.text()).not.toContain('FS.Free(/)')

    await row.trigger('click')
    expect(wrapper.find('.dci-details').text()).toContain('FS.Free(/)')
  })

  it('shows the fired threshold, and nothing for a DCI without one', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(rowFor(wrapper, 1215).find('.dci-threshold').text()).toBe('Last > 80')
    // Not AppTable's fallback cell, which printed the sort rank ("0").
    expect(rowFor(wrapper, 1214).find('.dci-threshold-cell').text()).toBe('')
  })

  it('shows comments on one line', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(rowFor(wrapper, 1214).text()).toContain('Line one Line two')
  })

  it('says why a DCI that is not collecting has no value', async () => {
    const wrapper = mountView()
    await flushPromises()

    const row = rowFor(wrapper, 1217)
    expect(row.find('.dci-status--unsupported').text()).toBe('Not Supported')
    expect(row.classes()).toContain('dci-row-inactive')
  })

  it('renders DCI status as text, not a PrimeVue Tag', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.p-tag').exists()).toBe(false)
  })
})

describe('DCIsView hide template items', () => {
  const toggle = (wrapper) => wrapper.find('button[aria-label="Hide template items"]')

  it('hides the DCIs a template added, and remembers the choice', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(rowFor(wrapper, 1215)).toBeDefined()
    expect(toggle(wrapper).attributes('aria-pressed')).toBe('false')

    await toggle(wrapper).trigger('click')

    expect(toggle(wrapper).attributes('aria-pressed')).toBe('true')
    expect(rowFor(wrapper, 1215)).toBeUndefined()
    expect(rowFor(wrapper, 1214)).toBeDefined()
    expect(userPrefs.get('dci.hideTemplateItems')).toBe(true)
  })

  it('says how many items it hides', async () => {
    const wrapper = mountView()
    await flushPromises()
    await toggle(wrapper).trigger('click')

    expect(wrapper.find('.dci-count').text()).toBe('3 items, 1 hidden')
  })

  it('starts with template items hidden when the account says so', async () => {
    userPrefs.set('dci.hideTemplateItems', true)
    const wrapper = mountView()
    await flushPromises()

    expect(rowFor(wrapper, 1215)).toBeUndefined()
  })
})

describe('DCIsView coming back from the editor', () => {
  it('keeps the list mounted while the editor is open', async () => {
    const wrapper = mountView()
    await flushPromises()
    await dataRows(wrapper)[0].trigger('click')

    entityIdForTest.value = '1216'
    await flushPromises()
    entityIdForTest.value = null
    await flushPromises()

    expect(chartIds(wrapper)).toEqual(['1214'])
  })

  it('brings the edited DCI back into view', async () => {
    const wrapper = mountView()
    await flushPromises()

    entityIdForTest.value = '1216'
    await flushPromises()
    entityIdForTest.value = null
    await flushPromises()

    expect(rowFor(wrapper, 1216).classes()).toContain('app-table__row--revealed')
  })
})

describe('DCIsView configuration mode', () => {
  const configRowFor = (wrapper, id) =>
    wrapper.findAll('tbody tr').find((r) => r.find('td').text() === String(id))

  async function mountConfig() {
    const wrapper = mountView()
    await flushPromises()
    const button = wrapper.findAll('button').find((b) => b.text() === 'Configuration')
    await button.trigger('click')
    await flushPromises()
    return wrapper
  }

  it('leaves the Template cell of a DCI created on the node empty', async () => {
    const wrapper = await mountConfig()

    expect(configRowFor(wrapper, 1214).find('.dci-template-cell').text()).toBe('')
    expect(configRowFor(wrapper, 1215).find('.dci-template-cell').text()).toBe('[20]')
  })

  it('summarizes the thresholds', async () => {
    const wrapper = await mountConfig()

    expect(configRowFor(wrapper, 1215).text()).toContain('Last > 80')
  })

  it('keeps the filter when switching modes', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('input[data-filter-input]').setValue('fs.free(/b)')
    expect(wrapper.find('.dci-count').text()).toBe('1 item')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Configuration')
      .trigger('click')
    await flushPromises()

    expect(wrapper.find('input[data-filter-input]').element.value).toBe('fs.free(/b)')
    expect(wrapper.find('.dci-count').text()).toBe('1 item')
    expect(configRowFor(wrapper, 1215)).toBeDefined()
    expect(configRowFor(wrapper, 1214)).toBeUndefined()
  })
})

describe('DCIsView working state', () => {
  const routeTo = (objectId) => ({
    path: `/infrastructure/${objectId}/dcis`,
    params: { objectId: String(objectId), viewId: 'dcis' },
  })
  const rowCheckboxes = (wrapper) =>
    wrapper.findAll('.app-table__checkbox-td .app-table__checkbox-wrap')
  const filterInput = (wrapper) => wrapper.find('input[data-filter-input]')
  const selectedText = (wrapper) => wrapper.find('.selection-actions').text()

  it('comes back with its filter and selection on the same node', async () => {
    const first = mountView({ route: routeTo(100) })
    await flushPromises()
    await filterInput(first).setValue('free')
    await rowCheckboxes(first)[0].trigger('click')
    expect(selectedText(first)).toContain('1 selected')
    first.unmount()

    const again = mountView({ route: routeTo(100) })
    await flushPromises()

    expect(filterInput(again).element.value).toBe('free')
    expect(again.find('.dci-count').text()).toBe('2 items')
    expect(selectedText(again)).toContain('1 selected')
  })

  it('takes the filter and mode to the next node, but not the selection', async () => {
    const first = mountView({ route: routeTo(100) })
    await flushPromises()
    await filterInput(first).setValue('free')
    await rowCheckboxes(first)[0].trigger('click')
    first.unmount()

    const other = mountView({
      object: { id: 200, class: 'Node', name: 'other' },
      route: routeTo(200),
    })
    await flushPromises()

    expect(filterInput(other).element.value).toBe('free')
    expect(selectedText(other)).not.toContain('selected')

    await other
      .findAll('button')
      .find((b) => b.text() === 'Configuration')
      .trigger('click')
    await flushPromises()
    other.unmount()

    const back = mountView({ route: routeTo(100) })
    await flushPromises()
    expect(back.find('.dci-template-cell').exists()).toBe(true)
  })

  it('opens a template in Configuration whatever mode the view was left in', async () => {
    const first = mountView({ route: routeTo(100) })
    await flushPromises()
    expect(first.find('.dci-template-cell').exists()).toBe(false)
    first.unmount()

    const template = mountView({
      object: { id: 300, class: 'Template', name: 'template' },
      route: routeTo(300),
    })
    await flushPromises()

    expect(template.find('.dci-template-cell').exists()).toBe(true)
  })
})
