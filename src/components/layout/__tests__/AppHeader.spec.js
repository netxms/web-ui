import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import { setActivePinia, createPinia } from 'pinia'
import AppHeader from '@/components/layout/AppHeader.vue'
import { SERVER_COMPONENTS } from '@/config/serverComponents'

// On a server with no LLM provider the chat's writes answer 503 (older servers crash), so the
// button and panel must be absent unless the server reports the AI component.
const serverComponents = ref([])

vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({
    components: serverComponents,
    isLoading: ref(false),
    has: (id) => serverComponents.value.includes(id),
  }),
}))

vi.mock('@/composables/useAiChat', () => ({
  useAiChat: () => ({
    messages: ref([]),
    isThinking: ref(false),
    pendingQuestion: ref(null),
    currentFunction: ref(null),
    contextUsage: ref(null),
    error: ref(null),
    hasConversation: ref(false),
    sendMessage: vi.fn(),
    answerQuestion: vi.fn(),
    clearMessages: vi.fn(),
    exportChat: vi.fn(),
    start: vi.fn(),
  }),
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ name: 'home', params: {} }),
}))
vi.mock('@/queries/useObjectQueries', () => ({ useObject: () => ({ data: ref(null) }) }))

vi.mock('@/queries/useAiQueries', () => ({
  useSavedPrompts: () => ({ data: ref([]) }),
  useCreateSavedPrompt: () => ({ mutate: vi.fn(), isPending: ref(false) }),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

function mountHeader(components) {
  serverComponents.value = components
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(AppHeader, {
    global: {
      plugins: [PrimeVue, pinia],
      directives: { tooltip: Tooltip },
      stubs: { RouterLink: true, ProfilePanel: true, AboutDialog: true },
    },
  })
}

const aiButton = (wrapper) => wrapper.find('[aria-label="AI Assistant"]')

describe('AppHeader AI assistant gate', () => {
  it('offers the assistant when the server registered the component', () => {
    const wrapper = mountHeader(['CORE', SERVER_COMPONENTS.AI_ASSISTANT])
    expect(aiButton(wrapper).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AiChatPanel' }).exists()).toBe(true)
  })

  it('hides the button and the panel on a server without the component', () => {
    const wrapper = mountHeader(['CORE'])
    expect(aiButton(wrapper).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'AiChatPanel' }).exists()).toBe(false)
  })

  it('hides the assistant before server-info has answered', () => {
    // Offering the assistant before server-info answers can crash older servers.
    const wrapper = mountHeader([])
    expect(aiButton(wrapper).exists()).toBe(false)
  })

  it('leaves the rest of the header alone', () => {
    const wrapper = mountHeader(['CORE'])
    for (const label of ['Search', 'Profile', 'System information', 'Toggle navigation']) {
      expect(wrapper.find(`[aria-label="${label}"]`).exists()).toBe(true)
    }
  })

  it('reveals the assistant once a late server-info lands', () => {
    const wrapper = mountHeader([])
    expect(aiButton(wrapper).exists()).toBe(false)
    serverComponents.value = [SERVER_COMPONENTS.AI_ASSISTANT]
    return wrapper.vm.$nextTick().then(() => {
      expect(aiButton(wrapper).exists()).toBe(true)
    })
  })
})
