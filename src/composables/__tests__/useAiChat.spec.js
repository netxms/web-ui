// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Chats live in module state, so each test re-imports the module for a clean registry.
const api = {
  createAiChat: vi.fn(),
  sendAiMessage: vi.fn(),
  getAiChatStatus: vi.fn(),
  answerAiChatQuestion: vi.fn(),
  clearAiChat: vi.fn(),
}

vi.mock('@/api/aiApi', () => api)

const download = vi.fn()
vi.mock('@/utils/fileDownload', () => ({ downloadText: download }))

const QUESTION = {
  id: 7,
  type: 'confirmation',
  confirmationType: 0,
  text: 'Restart the agent on core-sw-1?',
  context: 'The agent has been unreachable for 10 minutes.',
  expiresAt: 0,
}

/** `/status` while a run is blocked on `QUESTION`. */
const ASKING = { status: 'processing', pendingQuestion: QUESTION, currentFunction: null }

async function freshModule() {
  vi.resetModules()
  return import('@/composables/useAiChat')
}

async function freshChat() {
  const { useAiChat } = await freshModule()
  return useAiChat()
}

async function tick() {
  await vi.advanceTimersByTimeAsync(1500)
}

beforeEach(() => {
  vi.useFakeTimers()
  for (const fn of Object.values(api)) fn.mockReset()
  download.mockReset()
  api.createAiChat.mockResolvedValue({ chatId: 1 })
  api.sendAiMessage.mockResolvedValue({})
  api.answerAiChatQuestion.mockResolvedValue({})
  api.clearAiChat.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAiChat pending questions', () => {
  it('surfaces a question the assistant is blocked on', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue(ASKING)

    await chat.sendMessage('check the agent')
    await tick()

    expect(chat.pendingQuestion.value).toEqual(QUESTION)
    expect(chat.isThinking.value).toBe(true)
    chat.stopPolling()
  })

  it('clears the question once the server stops reporting one', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue(ASKING)

    await chat.sendMessage('check the agent')
    await tick()
    expect(chat.pendingQuestion.value).toEqual(QUESTION)

    api.getAiChatStatus.mockResolvedValue({ status: 'processing', pendingQuestion: null })
    await tick()

    expect(chat.pendingQuestion.value).toBeNull()
    chat.stopPolling()
  })

  it('sends a confirmation answer and clears the question', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue(ASKING)

    await chat.sendMessage('check the agent')
    await tick()
    await chat.answerQuestion({ positive: true })

    expect(api.answerAiChatQuestion).toHaveBeenCalledWith(1, {
      questionId: 7,
      positive: true,
      selectedOption: -1,
    })
    expect(chat.pendingQuestion.value).toBeNull()
    chat.stopPolling()
  })

  it('sends the chosen index for a multiple-choice question', async () => {
    const chat = await freshChat()
    const multi = { ...QUESTION, type: 'multipleChoice', options: ['Restart', 'Ignore'] }
    api.getAiChatStatus.mockResolvedValue({ status: 'processing', pendingQuestion: multi })

    await chat.sendMessage('check the agent')
    await tick()
    await chat.answerQuestion({ positive: true, selectedOption: 1 })

    expect(api.answerAiChatQuestion).toHaveBeenCalledWith(1, {
      questionId: 7,
      positive: true,
      selectedOption: 1,
    })
    chat.stopPolling()
  })

  it('restores the question when answering fails', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue(ASKING)
    api.answerAiChatQuestion.mockRejectedValue(new Error('nope'))

    await chat.sendMessage('check the agent')
    await tick()
    await chat.answerQuestion({ positive: true })

    expect(chat.pendingQuestion.value).toEqual(QUESTION)
    expect(chat.error.value).toBe('nope')
    chat.stopPolling()
  })

  it('drops the question when the run completes', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue(ASKING)

    await chat.sendMessage('check the agent')
    await tick()
    expect(chat.pendingQuestion.value).toEqual(QUESTION)

    api.getAiChatStatus.mockResolvedValue({ status: 'completed', response: 'Agent restarted.' })
    await tick()

    expect(chat.pendingQuestion.value).toBeNull()
    expect(chat.isThinking.value).toBe(false)
    expect(chat.messages.value.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Agent restarted.',
    })
  })

  it('drops the question when the run errors', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue(ASKING)

    await chat.sendMessage('check the agent')
    await tick()

    api.getAiChatStatus.mockResolvedValue({ status: 'error', errorMessage: 'boom' })
    await tick()

    expect(chat.pendingQuestion.value).toBeNull()
    expect(chat.error.value).toBe('boom')
    expect(chat.isThinking.value).toBe(false)
  })

  it('answerQuestion is a no-op when nothing is pending', async () => {
    const chat = await freshChat()

    await chat.answerQuestion({ positive: true })

    expect(api.answerAiChatQuestion).not.toHaveBeenCalled()
  })
})

describe('useAiChat run status', () => {
  it('reports the function the assistant is running, and forgets it when done', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue({ status: 'processing', currentFunction: 'get-alarms' })

    await chat.sendMessage('any alarms?')
    await tick()
    expect(chat.currentFunction.value).toBe('get-alarms')

    api.getAiChatStatus.mockResolvedValue({ status: 'completed', response: 'None.' })
    await tick()
    expect(chat.currentFunction.value).toBeNull()
  })

  it('keeps the context window usage of the last call, and drops it on clear', async () => {
    const chat = await freshChat()
    const usage = { tokens: 1200, window: 200000 }
    api.getAiChatStatus.mockResolvedValue({
      status: 'completed',
      response: 'ok',
      contextUsage: usage,
    })

    await chat.sendMessage('hello')
    await tick()
    expect(chat.contextUsage.value).toEqual(usage)

    await chat.clearMessages()
    expect(chat.contextUsage.value).toBeNull()
  })

  it('polls /status only, one request per tick', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue({ status: 'processing' })

    await chat.sendMessage('hello')
    await tick()
    await tick()

    expect(api.getAiChatStatus).toHaveBeenCalledTimes(2)
    chat.stopPolling()
  })
})

// A server with no AI provider answers chat creation and sending with 503
// (`RCC_AI_ASSISTANT_NOT_AVAILABLE`); the component can go away under an app that stayed open.
describe('useAiChat on a server with no AI assistant', () => {
  function refusal(status, message) {
    return Object.assign(new Error(message), { status })
  }

  it('explains a 503 from chat creation instead of blaming the chat', async () => {
    const chat = await freshChat()
    api.createAiChat.mockRejectedValue(refusal(503, 'AI assistant is not available'))

    await chat.sendMessage('hello')

    expect(chat.error.value).toMatch(/not configured on this server/)
    expect(api.sendAiMessage).not.toHaveBeenCalled()
  })

  it('explains a 503 from message sending and stops the thinking state', async () => {
    const chat = await freshChat()
    api.sendAiMessage.mockRejectedValue(refusal(503, 'AI assistant is not available'))

    await chat.sendMessage('hello')

    expect(chat.error.value).toMatch(/not configured on this server/)
    expect(chat.isThinking.value).toBe(false)
  })

  it('leaves any other failure to the server explanation', async () => {
    const chat = await freshChat()
    api.sendAiMessage.mockRejectedValue(refusal(404, 'Chat session not found'))

    await chat.sendMessage('hello')

    expect(chat.error.value).toBe('Chat session not found')
  })
})

// The server keeps a message's context for the rest of the conversation, so it is sent only
// when it changes.
describe('useAiChat context', () => {
  const NODE = { type: 'object', object_id: 42, object_name: 'core-sw-1' }
  const OTHER = { type: 'object', object_id: 43, object_name: 'core-sw-2' }

  async function send(chat, text, context) {
    api.getAiChatStatus.mockResolvedValue({ status: 'completed', response: 'ok' })
    await chat.sendMessage(text, context)
    await tick()
  }

  function sentContexts() {
    return api.sendAiMessage.mock.calls.map((call) => call[2])
  }

  it('sends the context with the first message and not again while it is unchanged', async () => {
    const chat = await freshChat()

    await send(chat, 'is it up?', NODE)
    await send(chat, 'and its interfaces?', { ...NODE })

    expect(sentContexts()).toEqual([NODE, undefined])
  })

  it('sends a context again once it changes', async () => {
    const chat = await freshChat()

    await send(chat, 'is it up?', NODE)
    await send(chat, 'and this one?', OTHER)
    await send(chat, 'back to the first one', NODE)

    expect(sentContexts()).toEqual([NODE, OTHER, NODE])
  })

  it('sends nothing when there is no context', async () => {
    const chat = await freshChat()

    await send(chat, 'hello', null)

    expect(sentContexts()).toEqual([undefined])
  })

  it('sends the context again after the chat is cleared', async () => {
    const chat = await freshChat()
    api.clearAiChat.mockResolvedValue({})

    await send(chat, 'is it up?', NODE)
    await chat.clearMessages()
    await send(chat, 'is it up?', NODE)

    expect(sentContexts()).toEqual([NODE, NODE])
  })

  it('sends the context again when the message carrying it failed', async () => {
    const chat = await freshChat()
    api.sendAiMessage.mockRejectedValueOnce(new Error('Request already in progress'))

    await chat.sendMessage('is it up?', NODE)
    await send(chat, 'is it up?', NODE)

    expect(sentContexts()).toEqual([NODE, NODE])
  })
})

describe('useAiChat chats', () => {
  it('keeps the welcome message when the chat is cleared, as legacy does', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue({ status: 'completed', response: 'ok' })

    await chat.sendMessage('hello')
    await tick()
    expect(chat.hasConversation.value).toBe(true)

    await chat.clearMessages()

    expect(api.clearAiChat).toHaveBeenCalledWith(1)
    expect(chat.messages.value).toHaveLength(1)
    expect(chat.messages.value[0].role).toBe('assistant')
    expect(chat.hasConversation.value).toBe(false)
  })

  it('gives each key its own server chat', async () => {
    const { useAiChat, PERSPECTIVE_CHAT } = await freshModule()
    api.createAiChat.mockResolvedValueOnce({ chatId: 1 }).mockResolvedValueOnce({ chatId: 2 })

    const panel = useAiChat()
    const perspective = useAiChat(PERSPECTIVE_CHAT)
    await panel.start()
    await perspective.start()

    expect(panel.chatId.value).toBe(1)
    expect(perspective.chatId.value).toBe(2)
    expect(useAiChat()).toBe(panel)
  })

  it('binds an incident chat to its incident at creation', async () => {
    const { useAiChat, incidentChatKey } = await freshModule()

    await useAiChat(incidentChatKey(42), { incidentId: 42 }).start()

    expect(api.createAiChat).toHaveBeenCalledWith({ incidentId: 42 })
  })

  it('creates one server chat when it is opened and sent to at once', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue({ status: 'processing' })

    await Promise.all([chat.start(), chat.sendMessage('hello')])

    expect(api.createAiChat).toHaveBeenCalledTimes(1)
    chat.stopPolling()
  })

  it('shows why the chat could not be started', async () => {
    const chat = await freshChat()
    api.createAiChat.mockRejectedValue(
      Object.assign(new Error('Invalid incident ID'), { status: 400 }),
    )

    await chat.start()

    expect(chat.error.value).toBe('Invalid incident ID')
  })

  it('resets every chat for a sign-out', async () => {
    const { useAiChat, resetChat, PERSPECTIVE_CHAT } = await freshModule()
    const panel = useAiChat()
    const perspective = useAiChat(PERSPECTIVE_CHAT)
    await panel.start()
    await perspective.start()

    resetChat()

    expect(panel.chatId.value).toBeNull()
    expect(perspective.chatId.value).toBeNull()
    expect(perspective.messages.value).toEqual([])
  })

  it('exports the conversation as Markdown', async () => {
    const chat = await freshChat()
    api.getAiChatStatus.mockResolvedValue({ status: 'completed', response: 'All quiet.' })
    await chat.sendMessage('anything new?')
    await tick()

    chat.exportChat('AI Assistant - Incident #42')

    const [filename, text, type] = download.mock.calls[0]
    expect(filename).toMatch(/^ai-chat-\d{4}-\d{2}-\d{2}\.md$/)
    expect(type).toMatch(/^text\/markdown/)
    expect(text).toContain('# AI Assistant - Incident #42')
    expect(text).toContain('anything new?')
    expect(text).toContain('All quiet.')
  })
})
