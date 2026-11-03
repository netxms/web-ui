import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import AiView from '../AiView.vue'

const route = reactive({ name: 'ai', params: {}, query: {} })
const routerReplace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}))

// The router singleton cannot be constructed against the mocked vue-router.
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '/' }), push: vi.fn() } }))

const can = ref({})
vi.mock('@/composables/usePermissions', () => ({ usePermissions: () => ({ can }) }))

const components = ref(['AI-ASSISTANT'])
vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({
    has: (id) => components.value.includes(id),
    isLoading: ref(false),
  }),
}))

vi.mock('@/stores/authStore', () => ({ useAuthStore: () => reactive({ sessionGuid: 's' }) }))

const AiChatView = { name: 'AiChatView', props: ['incidentId'], template: '<div class="chat" />' }

const ViewTabBar = {
  name: 'ViewTabBar',
  props: ['views', 'visibleViewIds', 'activeView'],
  template: '<div class="tab-bar" />',
}

function mountView() {
  return mount(AiView, {
    global: {
      stubs: {
        ViewTabBar,
        AiChatView,
        AiObservationsTab: { template: '<div class="observations" />' },
        AiMessagesTab: { template: '<div class="messages" />' },
        EmptyState: { props: ['title'], template: '<div class="empty">{{ title }}</div>' },
      },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  route.params = {}
  route.query = {}
  routerReplace.mockClear()
  can.value = { useAiAssistant: true, viewEventLog: true }
  components.value = ['AI-ASSISTANT']
})

describe('AiView', () => {
  it('opens on the chat, with every tab the account can use', () => {
    const wrapper = mountView()
    const bar = wrapper.findComponent(ViewTabBar)

    expect(bar.props('visibleViewIds')).toEqual(['chat', 'observations', 'messages'])
    expect(bar.props('activeView')).toBe('chat')
    expect(wrapper.find('.chat').exists()).toBe(true)
  })

  it('offers a tab only with its right, and moves a link to one it cannot use', async () => {
    can.value = { viewEventLog: true }
    route.params = { tab: 'chat' }
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent(ViewTabBar).props('visibleViewIds')).toEqual([
      'observations',
      'messages',
    ])
    expect(wrapper.find('.observations').exists()).toBe(true)
    expect(routerReplace).toHaveBeenCalledWith({ name: 'ai', params: { tab: 'observations' } })
  })

  it('binds the chat to the incident a link names', () => {
    route.params = { tab: 'chat' }
    route.query = { incident: '42' }
    const wrapper = mountView()

    expect(wrapper.findComponent(AiChatView).props('incidentId')).toBe(42)
  })

  it('says so on a server without the AI assistant', () => {
    components.value = ['CORE']
    const wrapper = mountView()

    expect(wrapper.findComponent(ViewTabBar).exists()).toBe(false)
    expect(wrapper.find('.empty').text()).toBe('AI assistant not available')
  })
})
