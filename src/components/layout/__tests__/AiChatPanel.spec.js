import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, reactive, toValue } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import AiChatPanel from '@/components/layout/AiChatPanel.vue'
import { useLayout } from '@/composables/useLayout'

const sendMessage = vi.fn()

const route = reactive({ name: 'alarms', params: {} })
vi.mock('vue-router', () => ({ useRoute: () => route }))

let requestedObjectId = null
const objectData = ref(null)
vi.mock('@/queries/useObjectQueries', () => ({
  useObject: (id) => {
    requestedObjectId = id
    return { data: objectData }
  },
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
    sendMessage,
    answerQuestion: vi.fn(),
    clearMessages: vi.fn(),
    exportChat: vi.fn(),
    start: vi.fn(),
  }),
}))

vi.mock('@/queries/useAiQueries', () => ({
  useSavedPrompts: () => ({ data: ref([]) }),
  useCreateSavedPrompt: () => ({ mutate: vi.fn(), isPending: ref(false) }),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

function mountPanel() {
  return mount(AiChatPanel, {
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

beforeEach(() => {
  route.name = 'alarms'
  route.params = {}
  objectData.value = null
  useLayout().isAiChatOpen.value = false
})

describe('AiChatPanel composer', () => {
  it('sends the message and clears the textarea on Enter', async () => {
    sendMessage.mockClear()
    const wrapper = mountPanel()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('hello there')
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(sendMessage).toHaveBeenCalledWith('hello there', null)
    expect(textarea.element.value).toBe('')
  })

  it('inserts a newline instead of sending on Shift+Enter', async () => {
    sendMessage.mockClear()
    const wrapper = mountPanel()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('hello there')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(textarea.element.value).toBe('hello there')
  })

  it('shrinks the textarea back down after long text is deleted', async () => {
    // jsdom does no layout, so scrollHeight is stubbed.
    let mockScrollHeight = 0
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => mockScrollHeight,
    })

    const wrapper = mountPanel()
    const textarea = wrapper.find('textarea')

    mockScrollHeight = 300
    await textarea.setValue('a very long prompt spanning many lines'.repeat(20))
    expect(textarea.element.style.height).toBe('300px')

    mockScrollHeight = 22
    await textarea.setValue('')
    expect(textarea.element.style.height).toBe('22px')
  })
})

describe('AiChatPanel context', () => {
  async function send(wrapper, text) {
    const textarea = wrapper.find('textarea')
    await textarea.setValue(text)
    await textarea.trigger('keydown', { key: 'Enter' })
  }

  it('sends the object open in the current perspective', async () => {
    sendMessage.mockClear()
    route.name = 'infrastructure'
    route.params = { objectId: '42', viewId: 'overview' }
    objectData.value = { id: 42, class: 'Node', name: 'core-sw-1' }
    const wrapper = mountPanel()

    await send(wrapper, 'why is it down?')

    expect(sendMessage).toHaveBeenCalledWith('why is it down?', {
      type: 'object',
      object_id: 42,
      object_name: 'core-sw-1',
    })
    expect(wrapper.find('.ai-context').text()).toContain('core-sw-1')
  })

  it('sends the id alone while the name is still loading', async () => {
    sendMessage.mockClear()
    route.name = 'network-maps'
    route.params = { mapId: '9' }
    const wrapper = mountPanel()

    await send(wrapper, 'what is on this map?')

    expect(sendMessage).toHaveBeenCalledWith('what is on this map?', {
      type: 'object',
      object_id: 9,
    })
    expect(wrapper.find('.ai-context').text()).toContain('[9]')
  })

  // The selection store keeps the last tree object after the user moves on.
  it('sends no context outside the object perspectives', async () => {
    sendMessage.mockClear()
    route.name = 'alarms'
    route.params = { alarmId: '5' }
    const wrapper = mountPanel()

    await send(wrapper, 'hello')

    expect(sendMessage).toHaveBeenCalledWith('hello', null)
    expect(wrapper.find('.ai-context').text()).toContain('None')
  })

  it('looks the object up only while the panel is open', () => {
    route.name = 'infrastructure'
    route.params = { objectId: '42' }
    mountPanel()

    expect(toValue(requestedObjectId)).toBeNull()
    useLayout().isAiChatOpen.value = true
    expect(toValue(requestedObjectId)).toBe(42)
  })
})
