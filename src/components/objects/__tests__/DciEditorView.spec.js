import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import DciEditorView from '../DciEditorView.vue'

// Swapped per test: an item or a table DCI.
const config = ref(null)

vi.mock('@/queries/useDciConfigQueries', () => ({
  useDciConfig: () => ({
    data: config,
    isLoading: ref(false),
    error: ref(null),
    isFetching: ref(false),
    refetch: vi.fn(),
  }),
  useCreateDci: () => ({ mutateAsync: vi.fn() }),
  useUpdateDci: () => ({ mutateAsync: vi.fn() }),
}))

function mountEditor(type, initialTab) {
  config.value = {
    id: 5,
    type,
    name: 'Metric',
    description: 'DCI',
    instanceDiscoveryMethod: 'none',
  }
  return mount(DciEditorView, {
    props: { objectId: 100, dciId: 5, initialTab },
    global: {
      plugins: [PrimeVue],
      stubs: {
        DciGeneralTab: true,
        DciProcessingTab: true,
        DciInstanceDiscoveryTab: true,
        DciPerformanceViewTab: true,
        DciOtherOptionsTab: true,
        DciTagsTab: true,
        DciAccessControlTab: true,
      },
    },
  })
}

const tabLabels = (wrapper) => wrapper.findAll('[role="tab"]').map((t) => t.text())
const activeTab = (wrapper) => wrapper.find('[role="tab"][aria-selected="true"]').text()

describe('DciEditorView tabs', () => {
  it('places Instance Discovery between Processing and Performance View, as legacy does', async () => {
    const wrapper = mountEditor('item')
    await flushPromises()

    expect(tabLabels(wrapper)).toEqual([
      'General',
      'Processing',
      'Instance Discovery',
      'Performance View',
      'Other Options',
      'Tags',
      'Access Control',
    ])
  })

  it('has Instance Discovery for table DCIs too', async () => {
    const wrapper = mountEditor('table')
    await flushPromises()

    expect(tabLabels(wrapper)).toContain('Instance Discovery')
    expect(tabLabels(wrapper)).not.toContain('Performance View')
  })

  it('opens the tab ?tab=instanceDiscovery names', async () => {
    const wrapper = mountEditor('item', 'instanceDiscovery')
    await flushPromises()

    expect(activeTab(wrapper)).toBe('Instance Discovery')
  })
})
