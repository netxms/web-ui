import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// Per-account state outside the query cache must go on sign-out: logout does not reload the page.

// `vi.hoisted` because the mock factories run before this module's own imports resolve.
const aiApi = vi.hoisted(() => ({
  createAiChat: vi.fn(),
  sendAiMessage: vi.fn(),
  getAiChatStatus: vi.fn(),
  getAiChatQuestion: vi.fn(),
  answerAiChatQuestion: vi.fn(),
  clearAiChat: vi.fn(),
}))
vi.mock('@/api/aiApi', () => aiApi)

const toolsApi = vi.hoisted(() => ({
  executeObjectTool: vi.fn(),
}))
vi.mock('@/api/objectToolsApi', () => toolsApi)

const scriptApi = vi.hoisted(() => ({
  getScriptLibrary: vi.fn(),
  executeScript: vi.fn(),
  stopScriptExecution: vi.fn(),
}))
vi.mock('@/api/scriptApi', () => scriptApi)

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

import { resetSessionState } from '@/utils/sessionReset'
import { useScriptStore } from '@/stores/scriptStore'
import { useToolExecutionStore } from '@/stores/toolExecutionStore'
import { usePollExecutionStore } from '@/stores/pollExecutionStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useObjectIconStore } from '@/stores/objectIconStore'
import { useViewStore } from '@/stores/viewStore'
import { useToolExecution } from '@/composables/useToolExecution'
import { useWorkingState } from '@/composables/useWorkingState'
import { useAiChat } from '@/composables/useAiChat'
import { useLayout } from '@/composables/useLayout'
import { moduleRegistry } from '@/modules'

/** Closes synchronously, which is harsher than the real thing: the close handler runs
 *  while the store is already empty. */
class FakeWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.listeners = {}
    this.closed = null
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type, fn) {
    ;(this.listeners[type] ||= []).push(fn)
  }

  close(code, reason) {
    this.closed = { code, reason }
    for (const fn of this.listeners.close || []) fn({ wasClean: true, code, reason })
  }
}

let pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  vi.useFakeTimers()
  FakeWebSocket.instances = []
  globalThis.WebSocket = FakeWebSocket
  for (const fn of Object.values(aiApi)) fn.mockReset()
  toolsApi.executeObjectTool.mockReset()
  for (const fn of Object.values(scriptApi)) fn.mockReset()
})

afterEach(() => {
  resetSessionState() // module singletons outlive the pinia instance
  pinia._e.stop()
  vi.useRealTimers()
  delete globalThis.WebSocket
})

describe('resetSessionState', () => {
  it('drops the script editor source, library and output', () => {
    const script = useScriptStore()
    script.source = 'return $node->name;'
    script.parameters = 'a, b'
    script.selectedLibraryScript = { id: 3, name: 'Hooks::Startup' }
    script.library = [{ id: 3, name: 'Hooks::Startup' }]
    script.output = [{ type: 'result', text: 'core-sw-1' }]

    resetSessionState()

    expect(script.source).toBe('')
    expect(script.parameters).toBe('')
    expect(script.selectedLibraryScript).toBeNull()
    expect(script.library).toEqual([])
    expect(script.output).toEqual([])
  })

  it('closes a running script stream, so the script stops and writes nothing more', async () => {
    scriptApi.executeScript.mockResolvedValue({ executionId: 9, wsUrl: '/ws/script/9' })
    const script = useScriptStore()
    script.source = 'while (true) print("x");'

    await script.execute(42)
    expect(FakeWebSocket.instances).toHaveLength(1)
    const ws = FakeWebSocket.instances[0]

    resetSessionState()

    expect(ws.closed).toEqual({ code: 1000, reason: 'session ended' })
    expect(script.executing).toBe(false)
    expect(script.output).toEqual([])
    for (const fn of ws.listeners.message || []) {
      fn({ data: JSON.stringify({ type: 'output', data: 'late' }) })
    }
    expect(script.output).toEqual([])
  })

  it('drops tool results and closes their open streams', async () => {
    toolsApi.executeObjectTool.mockResolvedValue({ wsUrl: '/ws/tool/1' })
    const { executeTool } = useToolExecution()
    const executions = useToolExecutionStore()

    await executeTool({ id: 42, name: 'core-sw-1' }, { id: 5, type: 'action', name: 'Restart' })

    expect(executions.getExecutionsForObject(42)).toHaveLength(1)
    expect(FakeWebSocket.instances).toHaveLength(1)

    resetSessionState()

    expect(FakeWebSocket.instances[0].closed).toEqual({ code: 1000, reason: 'session ended' })
    expect(executions.getExecutionsForObject(42)).toEqual([])
  })

  it('drops poll logs and the object selection', () => {
    const polls = usePollExecutionStore()
    const selection = useSelectionStore()
    polls.createExecution({
      pollType: 'status',
      pollLabel: 'Status',
      objectId: 42,
      objectName: 'core-sw-1',
    })
    polls.appendStreamOutput('42-status', 'Poll request sent\n')
    selection.selectPrimary({ id: 42, name: 'core-sw-1' })
    selection.selectView({ id: 43, name: 'eth0' }, 'interfaces')

    resetSessionState()

    expect(polls.getExecution('42-status')).toBeNull()
    expect(selection.primaryObject).toBeNull()
    expect(selection.primaryObjects).toEqual([])
    expect(selection.viewObject).toBeNull()
  })

  it('drops the AI chat transcript, its chat id and its polling timer', async () => {
    aiApi.createAiChat.mockResolvedValue({ chatId: 7 })
    aiApi.sendAiMessage.mockResolvedValue({})
    aiApi.getAiChatStatus.mockResolvedValue({ status: 'processing' })
    aiApi.getAiChatQuestion.mockResolvedValue({ question: null })

    const chat = useAiChat()
    await chat.sendMessage('why is core-sw-1 down?')
    expect(chat.chatId.value).toBe(7)
    expect(chat.isThinking.value).toBe(true)

    resetSessionState()

    expect(chat.chatId.value).toBeNull()
    expect(chat.messages.value).toEqual([])
    expect(chat.isThinking.value).toBe(false)
    expect(chat.pendingQuestion.value).toBeNull()
    expect(chat.error.value).toBeNull()

    await vi.advanceTimersByTimeAsync(5000)
    expect(aiApi.getAiChatStatus).not.toHaveBeenCalled()
  })

  it('closes the AI chat panel', () => {
    const { isAiChatOpen, toggleAiChat } = useLayout()
    toggleAiChat()
    expect(isAiChatOpen.value).toBe(true)

    resetSessionState()

    expect(isAiChatOpen.value).toBe(false)
  })

  it('ends a previewed category draft, which only its own user should see', () => {
    const icons = useObjectIconStore()
    icons.startPreview({ categoryId: 3, name: 'Routers', iconImageId: 'draft' })

    resetSessionState()

    expect(icons.preview).toBeNull()
  })

  it('forgets where this tab was: active views, the view per class, tree expansion', () => {
    const views = useViewStore()
    views.setActiveView('infrastructure', 'dcis')
    views.setActiveViewForClass('infrastructure', 'Node', 'dcis')
    views.setExpandedIds('infrastructure', ['2', '2-100'])

    resetSessionState()

    expect(views.getActiveView('infrastructure')).toBeNull()
    expect(views.getActiveViewForClass('infrastructure', 'Node')).toBeNull()
    expect(views.getExpandedIds('infrastructure')).toEqual([])
  })

  it('forgets how each view was left, since filters and selections name its objects', () => {
    let filter
    const View = defineComponent({
      setup() {
        filter = ref('')
        useWorkingState('dcis', { view: { filter } })
        return () => h('div')
      },
    })
    const global = {
      config: { globalProperties: { $route: { path: '/infrastructure/1', params: {} } } },
    }
    const first = mount(View, { global })
    filter.value = 'cpu'
    first.unmount()
    const second = mount(View, { global })
    expect(filter.value).toBe('cpu')
    second.unmount()

    resetSessionState()
    mount(View, { global })

    expect(filter.value).toBe('')
  })

  it('forgets which server components the last session saw', () => {
    const spy = vi.spyOn(moduleRegistry, 'setServerComponents')

    resetSessionState()

    expect(spy).toHaveBeenCalledWith(null)
    spy.mockRestore()
  })
})
