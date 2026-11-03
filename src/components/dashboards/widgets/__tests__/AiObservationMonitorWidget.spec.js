import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, toValue } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import { CONTEXT_OBJECT_ID } from '@/utils/dashboardContext'

let capturedParams

vi.mock('@/queries/useAiOperatorQueries', () => ({
  useAiObservations: (params) => {
    capturedParams = params
    return { data: ref([]), isLoading: ref(false), error: ref(null), refetch: vi.fn() }
  },
}))

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: () => ({ objectsById: ref(new Map()) }),
}))

const AiObservationMonitorWidget = (
  await import('@/components/dashboards/widgets/AiObservationMonitorWidget.vue')
).default
const { provideDashboardContext } = await import('@/composables/useDashboardContext')

function mountWidget(config, { contextObjectId } = {}) {
  const Host = defineComponent({
    setup() {
      if (contextObjectId) provideDashboardContext({ dashboardId: 1, contextObjectId })
      return () =>
        h(AiObservationMonitorWidget, {
          widget: { id: 'w1', type: 'ai-observation-monitor', config },
        })
    },
  })
  return mount(Host, {
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: { AppTable: true, AppLink: true },
    },
  })
}

beforeEach(() => {
  capturedParams = null
})

describe('AiObservationMonitorWidget', () => {
  it('scopes the context sentinel to the object the dashboard is shown for, with children', () => {
    mountWidget({ objectId: CONTEXT_OBJECT_ID, newOnly: true }, { contextObjectId: 42 })
    expect(toValue(capturedParams)).toMatchObject({ object: 42, includeChildren: true })
  })

  it('sends no object scope for the sentinel on a dashboard shown on its own', () => {
    mountWidget({ objectId: CONTEXT_OBJECT_ID, newOnly: true })
    const params = toValue(capturedParams)
    expect(params).not.toHaveProperty('object')
    expect(params).not.toHaveProperty('includeChildren')
  })

  it('asks only for new observations when newOnly is set', () => {
    mountWidget({ objectId: 0, newOnly: true })
    expect(toValue(capturedParams).state).toBe('new')
  })

  it('says there are no new observations when the list is empty', () => {
    const wrapper = mountWidget({ objectId: 0, newOnly: true })
    expect(wrapper.text()).toContain('No new observations')
  })
})
