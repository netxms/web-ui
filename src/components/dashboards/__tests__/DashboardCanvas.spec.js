import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

// The grid stubs still render their slots so a test can reach the widget stub inside.
vi.mock('@/components/dashboards/DashboardWidget.vue', () => ({
  default: { name: 'DashboardWidgetStub', render: () => null },
}))
vi.mock('@/components/dashboards/WidgetPropertiesDialog.vue', () => ({
  default: { render: () => null },
}))
vi.mock('grid-layout-plus', () => {
  const passThrough = {
    inheritAttrs: false,
    setup:
      (_, { slots }) =>
      () =>
        slots.default?.(),
  }
  return { GridLayout: passThrough, GridItem: passThrough }
})

/** Reports a size for the grid area, the way the browser would after layout. */
let resizeGridArea
globalThis.ResizeObserver = class {
  constructor(callback) {
    resizeGridArea = (height, width = 1200) => callback([{ contentRect: { height, width } }])
  }
  observe() {}
  disconnect() {}
}

const DashboardCanvas = (await import('@/components/dashboards/DashboardCanvas.vue')).default

const DASHBOARD = { id: 1, name: 'Demo', cols: 12, widgets: [] }

function dashboardWithRows(h, extra = {}) {
  return {
    ...DASHBOARD,
    ...extra,
    widgets: [{ id: 'w1', type: 'label', x: 0, y: 0, w: 12, h, config: {}, raw: {} }],
  }
}

function mountCanvas({ dashboard = DASHBOARD, editMode = true } = {}) {
  return mount(DashboardCanvas, {
    props: { dashboard, editMode },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: { DashboardEmptyState: true },
    },
  })
}

function buttonLabelled(wrapper, label) {
  return wrapper.findAll('button').find((b) => b.text() === label)
}

describe('DashboardCanvas add-widget panel', () => {
  it('closes when edit mode is discarded', async () => {
    const wrapper = mountCanvas()
    await buttonLabelled(wrapper, 'Add Widget').trigger('click')
    expect(wrapper.find('.add-widget-panel').exists()).toBe(true)

    await buttonLabelled(wrapper, 'Discard').trigger('click')
    expect(wrapper.emitted('discard')).toHaveLength(1)
    // The parent leaves edit mode in response to `discard`.
    await wrapper.setProps({ editMode: false })

    expect(wrapper.find('.add-widget-panel').exists()).toBe(false)
  })

  it('closes when edit mode ends after a save', async () => {
    const wrapper = mountCanvas()
    await buttonLabelled(wrapper, 'Add Widget').trigger('click')
    await buttonLabelled(wrapper, 'Save').trigger('click')
    await wrapper.setProps({ editMode: false })

    expect(wrapper.find('.add-widget-panel').exists()).toBe(false)
  })

  it('stays closed when edit mode is entered again', async () => {
    const wrapper = mountCanvas()
    await buttonLabelled(wrapper, 'Add Widget').trigger('click')
    await wrapper.setProps({ editMode: false })
    await wrapper.setProps({ editMode: true })

    expect(wrapper.find('.add-widget-panel').exists()).toBe(false)
  })
})

// A 600px grid area fits 8 rows at the 60px row floor plus the 8px gap (8 * 68 = 544).
describe('DashboardCanvas on a board taller than the screen', () => {
  async function mountSized(dashboard, { editMode = true, height = 600 } = {}) {
    const wrapper = mountCanvas({ dashboard, editMode })
    resizeGridArea(height)
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('scrolls in edit mode, so a handle pushed past the fold can still be reached', async () => {
    const wrapper = await mountSized(dashboardWithRows(20))
    expect(wrapper.find('.grid-area').classes()).toContain('grid-area--scrollable')
  })

  it('does not scroll a non-scrollable board in view mode', async () => {
    const wrapper = await mountSized(dashboardWithRows(20), { editMode: false })
    expect(wrapper.find('.grid-area').classes()).not.toContain('grid-area--scrollable')
  })

  it('warns that the rows below the fold are cut off when viewing', async () => {
    const wrapper = await mountSized(dashboardWithRows(20))
    expect(wrapper.find('.overflow-notice').text()).toContain('Scrollable Content')
  })

  it('does not warn while every row fits', async () => {
    const wrapper = await mountSized(dashboardWithRows(8))
    expect(wrapper.find('.overflow-notice').exists()).toBe(false)
  })

  it('does not warn on a scrollable board', async () => {
    const wrapper = await mountSized(dashboardWithRows(20, { scrollable: true }))
    expect(wrapper.find('.overflow-notice').exists()).toBe(false)
  })

  it('does not warn in view mode', async () => {
    const wrapper = await mountSized(dashboardWithRows(20), { editMode: false })
    expect(wrapper.find('.overflow-notice').exists()).toBe(false)
  })

  it('does not warn before the grid area has been measured', () => {
    const wrapper = mountCanvas({ dashboard: dashboardWithRows(20) })
    expect(wrapper.find('.overflow-notice').exists()).toBe(false)
  })
})

describe('DashboardCanvas widget config changes', () => {
  const STATUS_MAP_BOARD = {
    ...DASHBOARD,
    widgets: [
      {
        id: 'w1',
        type: 'status-map',
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        config: { objectId: 7, displayMode: 'flat' },
        raw: { data: { objectId: 7 }, layout: {} },
      },
    ],
  }

  async function pickGrouped(wrapper) {
    wrapper
      .findComponent({ name: 'DashboardWidgetStub' })
      .vm.$emit('update-config', 'w1', { displayMode: 'grouped' })
    await wrapper.vm.$nextTick()
  }

  it('keeps the change for the next save', async () => {
    const wrapper = mountCanvas({ dashboard: STATUS_MAP_BOARD })
    await pickGrouped(wrapper)
    await buttonLabelled(wrapper, 'Save').trigger('click')

    const [saved] = wrapper.emitted('save')[0]
    expect(saved[0].config.displayMode).toBe('grouped')
    expect(saved[0].raw.data).toMatchObject({ objectId: 7, displayMode: 'grouped' })
  })

  it('drops the change on discard', async () => {
    const wrapper = mountCanvas({ dashboard: STATUS_MAP_BOARD })
    await pickGrouped(wrapper)
    await buttonLabelled(wrapper, 'Discard').trigger('click')
    await buttonLabelled(wrapper, 'Save').trigger('click')

    const [saved] = wrapper.emitted('save')[0]
    expect(saved[0].config.displayMode).toBe('flat')
  })
})
