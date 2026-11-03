import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, reactive, ref } from 'vue'
import PrimeVue from 'primevue/config'
import Tabs from 'primevue/tabs'
import AiAssistantSection from '../AiAssistantSection.vue'
import { clearWorkingState } from '@/composables/useWorkingState'

const route = reactive({ path: '/configuration/ai-assistant', params: {}, query: {} })
const routerReplace = vi.fn((target) => {
  route.query = target.query ?? {}
})
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}))

// The router singleton cannot be constructed against the mocked vue-router.
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '/' }), push: vi.fn() } }))

vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({ has: () => true, isLoading: ref(false) }),
}))

vi.mock('@/composables/useEntityDetail', () => ({
  useEntityDetail: () => ({
    entityId: ref(null),
    isDetailView: computed(() => false),
    detailTarget: () => ({}),
    openDetail: vi.fn(),
    closeDetail: vi.fn(),
  }),
}))

vi.mock('@/queries/useAiOperatorQueries', () => ({
  useAiOperator: () => ({
    data: ref(null),
    isLoading: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
}))

function mountSection() {
  return mount(AiAssistantSection, {
    global: {
      plugins: [PrimeVue],
      stubs: {
        SectionHeader: true,
        EntityDetailHeader: true,
        AiOperatorsTab: true,
        AiOperatorDetailView: true,
        AiMemoryTab: true,
        AiTasksTab: true,
        AiSkillsTab: true,
        AiPromptsTab: true,
      },
      // The app's `$route`, which turns on working state.
      config: { globalProperties: { $route: route } },
    },
  })
}

const activeTab = (wrapper) => wrapper.findComponent(Tabs).props('value')

beforeEach(() => {
  clearWorkingState()
  route.query = {}
  routerReplace.mockClear()
})

describe('AiAssistantSection working state', () => {
  it('comes back on the tab it was left on, and says so in the URL', async () => {
    const first = mountSection()
    first.findComponent(Tabs).vm.$emit('update:value', 'prompts')
    await flushPromises()
    first.unmount()
    route.query = {}

    const again = mountSection()
    await flushPromises()

    expect(activeTab(again)).toBe('prompts')
    expect(route.query.tab).toBe('prompts')
  })

  it('opens the tab a link names, whatever it was left on', async () => {
    const first = mountSection()
    first.findComponent(Tabs).vm.$emit('update:value', 'prompts')
    await flushPromises()
    first.unmount()
    route.query = { tab: 'skills' }

    const linked = mountSection()
    await flushPromises()

    expect(activeTab(linked)).toBe('skills')
  })
})

describe('AiAssistantSection observations link', () => {
  it('sends an old link to the observations tab on to the AI perspective', async () => {
    route.query = { tab: 'observations' }

    mountSection()
    await flushPromises()

    expect(routerReplace).toHaveBeenCalledWith({ name: 'ai', params: { tab: 'observations' } })
  })

  it('opens the first tab when the remembered one was observations', async () => {
    const first = mountSection()
    first.findComponent(Tabs).vm.$emit('update:value', 'observations')
    await flushPromises()
    first.unmount()
    route.query = {}

    const again = mountSection()
    await flushPromises()

    expect(activeTab(again)).toBe('operators')
  })
})
