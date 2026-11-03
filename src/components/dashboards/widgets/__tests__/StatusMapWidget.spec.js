import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, toValue } from 'vue'
import { CONTEXT_OBJECT_ID } from '@/utils/dashboardContext'

let capturedObjectId

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectSubTree: (objectId) => {
    capturedObjectId = objectId
    return { data: ref([]), isLoading: ref(false), isFetching: ref(false) }
  },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
// The tiles' nav bindings import the app router, which would pull in the whole route table.
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '#' }) } }))

const StatusMapWidget = (await import('@/components/dashboards/widgets/StatusMapWidget.vue'))
  .default
const StatusMapToolbar = (await import('@/components/objects/StatusMapToolbar.vue')).default
const { provideDashboardContext } = await import('@/composables/useDashboardContext')
const { provideWidgetEditing } = await import('@/composables/useWidgetEditing')

function mountWidget(config, { contextObjectId, editing } = {}) {
  const Host = defineComponent({
    setup() {
      if (contextObjectId) provideDashboardContext({ dashboardId: 1, contextObjectId })
      if (editing) provideWidgetEditing(editing)
      return () => h(StatusMapWidget, { widget: { id: 'w1', type: 'status-map', config } })
    },
  })
  return mount(Host, {
    global: {
      stubs: {
        StatusMapToolbar: true,
        ProgressSpinner: true,
        StatusMapHoneycomb: true,
        StatusMapSunburst: true,
        StatusMapTreemap: true,
      },
    },
  })
}

beforeEach(() => {
  capturedObjectId = null
})

describe('StatusMapWidget context', () => {
  it('shows the object the dashboard is shown for when set to the context object', () => {
    mountWidget({ objectId: CONTEXT_OBJECT_ID }, { contextObjectId: 42 })
    expect(toValue(capturedObjectId)).toBe(42)
  })

  it('reads as unconfigured for the context object on a dashboard shown on its own', () => {
    const wrapper = mountWidget({ objectId: CONTEXT_OBJECT_ID })
    expect(toValue(capturedObjectId)).toBeNull()
    expect(wrapper.text()).toContain('No object configured')
  })

  it('keeps a concrete object whatever the context', () => {
    mountWidget({ objectId: 7 }, { contextObjectId: 42 })
    expect(toValue(capturedObjectId)).toBe(7)
  })
})

describe('StatusMapWidget layout', () => {
  const toolbar = (wrapper) => wrapper.findComponent(StatusMapToolbar)

  it('draws the layout and sort saved in the dashboard', () => {
    const wrapper = mountWidget({ objectId: 7, displayMode: 'honeycomb', sortBy: 'name' })
    expect(toolbar(wrapper).props()).toMatchObject({ layout: 'honeycomb', sortBy: 'name' })
  })

  it('offers no layout or sort outside edit mode', () => {
    expect(toolbar(mountWidget({ objectId: 7 })).props('editable')).toBe(false)
  })

  it('hands a change made while editing to the dashboard', () => {
    const updateConfig = vi.fn()
    const wrapper = mountWidget({ objectId: 7 }, { editing: { editMode: ref(true), updateConfig } })
    expect(toolbar(wrapper).props('editable')).toBe(true)

    toolbar(wrapper).vm.$emit('update:layout', 'grouped')
    toolbar(wrapper).vm.$emit('update:sortBy', 'name')
    expect(updateConfig.mock.calls).toEqual([[{ displayMode: 'grouped' }], [{ sortBy: 'name' }]])
  })
})
