import { ref, computed } from 'vue'
import {
  createAiChat,
  sendAiMessage,
  getAiChatStatus,
  answerAiChatQuestion,
  clearAiChat,
} from '@/api/aiApi'
import { chatToMarkdown } from '@/utils/aiChatDisplay'
import { downloadText } from '@/utils/fileDownload'

const POLL_INTERVAL_MS = 1500

let msgIdCounter = 0

// The server answers 503 (`RCC_AI_ASSISTANT_NOT_AVAILABLE`) when no AI provider is configured,
// e.g. after a restart without one while this app stayed open.
const NOT_CONFIGURED_MESSAGE =
  'The AI assistant is not configured on this server. An administrator has to configure an ' +
  'AI provider in the server configuration and restart the server.'

/** @param {unknown} e @param {string} fallback */
function chatErrorMessage(e, fallback) {
  if (e?.status === 503) return NOT_CONFIGURED_MESSAGE
  return e?.message || fallback
}

const WELCOME_MESSAGE =
  "Hello! I'm Iris, your AI assistant. I can help you with setting up your monitoring " +
  'environment, day-to-day operations, and analyzing problems. Feel free to ask any questions!'

function welcomeMessage() {
  return { id: ++msgIdCounter, role: 'assistant', content: WELCOME_MESSAGE, timestamp: new Date() }
}

/**
 * @param {{ incidentId?: number|null }} [options] - binds the chat to an incident at creation;
 *   it cannot be changed later.
 */
function createChat({ incidentId = null } = {}) {
  const chatId = ref(null)
  const messages = ref([])
  const isThinking = ref(false)
  const error = ref(null)

  /** The question the assistant is blocked on; status stays `processing` until answered. */
  const pendingQuestion = ref(null)

  const currentFunction = ref(null)

  /** `{ tokens, window }` after the last LLM call. */
  const contextUsage = ref(null)

  const hasConversation = computed(() => messages.value.some((m) => m.role === 'user'))

  let pollingTimer = null

  // The server keeps a sent context in effect for following requests, so it is only sent when
  // it changes; repeating it would fill the model's context window with copies.
  let lastSentContext = null

  /** Shared, so opening the chat and sending at once create one chat, not two. */
  let creating = null
  /** Bumped by `reset`: a creation that resolves after a sign-out belongs to the old session. */
  let generation = 0

  function ensureSession() {
    if (chatId.value != null) return Promise.resolve()
    if (creating) return creating
    const startedIn = generation
    const request = createAiChat(incidentId != null ? { incidentId } : {})
      .then((result) => {
        if (startedIn !== generation) return
        chatId.value = result.chatId
        lastSentContext = null
        messages.value = [welcomeMessage()]
      })
      .finally(() => {
        if (creating === request) creating = null
      })
    creating = request
    return request
  }

  /** Creates the server-side chat when shown, so a refusal shows before the first question. */
  async function start() {
    try {
      await ensureSession()
    } catch (e) {
      error.value = chatErrorMessage(e, 'Failed to start chat session')
    }
  }

  function stopPolling() {
    if (pollingTimer != null) {
      clearTimeout(pollingTimer)
      pollingTimer = null
    }
  }

  function finishRun() {
    isThinking.value = false
    pendingQuestion.value = null
    currentFunction.value = null
  }

  async function poll() {
    try {
      const status = await getAiChatStatus(chatId.value)
      contextUsage.value = status.contextUsage ?? null
      if (status.status === 'completed') {
        messages.value = [
          ...messages.value,
          {
            id: ++msgIdCounter,
            role: 'assistant',
            content: status.response ?? '',
            timestamp: new Date(),
          },
        ]
        error.value = null
        finishRun()
        return
      }
      if (status.status === 'error') {
        error.value = status.errorMessage || 'An error occurred'
        finishRun()
        return
      }

      pendingQuestion.value = status.pendingQuestion ?? null
      currentFunction.value = status.currentFunction ?? null
      pollingTimer = setTimeout(poll, POLL_INTERVAL_MS)
    } catch (e) {
      error.value = e.message || 'Failed to get response'
      finishRun()
    }
  }

  /**
   * Clears the question optimistically: if the server disagrees the next poll puts it back.
   *
   * @param {{ positive?: boolean, selectedOption?: number }} answer
   */
  async function answerQuestion({ positive = false, selectedOption = -1 } = {}) {
    const question = pendingQuestion.value
    if (question == null) return

    pendingQuestion.value = null
    try {
      await answerAiChatQuestion(chatId.value, {
        questionId: question.id,
        positive,
        selectedOption,
      })
    } catch (e) {
      error.value = e.message || 'Failed to send answer'
      pendingQuestion.value = question
    }
  }

  /**
   * @param {string} text
   * @param {object|null} [context] - e.g. `{ type: 'object', object_id, object_name }`
   */
  async function sendMessage(text, context = null) {
    if (!text.trim() || isThinking.value) return
    error.value = null

    try {
      await ensureSession()
    } catch (e) {
      error.value = chatErrorMessage(e, 'Failed to start chat session')
      return
    }

    messages.value = [
      ...messages.value,
      { id: ++msgIdCounter, role: 'user', content: text, timestamp: new Date() },
    ]
    isThinking.value = true

    const contextJson = context ? JSON.stringify(context) : null
    const contextChanged = contextJson != null && contextJson !== lastSentContext

    try {
      await sendAiMessage(chatId.value, text, contextChanged ? context : undefined)
    } catch (e) {
      error.value = chatErrorMessage(e, 'Failed to send message')
      isThinking.value = false
      return
    }
    if (contextChanged) lastSentContext = contextJson

    stopPolling()
    pollingTimer = setTimeout(poll, POLL_INTERVAL_MS)
  }

  async function clearMessages() {
    stopPolling()
    finishRun()
    error.value = null
    contextUsage.value = null
    // The server forgets context messages too.
    lastSentContext = null
    if (chatId.value != null) {
      try {
        await clearAiChat(chatId.value)
      } catch {
        // Local state is reset regardless.
      }
      messages.value = [welcomeMessage()]
    } else {
      messages.value = []
    }
  }

  function reset() {
    generation++
    creating = null
    stopPolling()
    chatId.value = null
    lastSentContext = null
    messages.value = []
    error.value = null
    contextUsage.value = null
    finishRun()
  }

  /** @param {string} [title] */
  function exportChat(title) {
    const date = new Date().toISOString().slice(0, 10)
    downloadText(
      `ai-chat-${date}.md`,
      chatToMarkdown(messages.value, { title }),
      'text/markdown;charset=utf-8;',
    )
  }

  return {
    incidentId,
    chatId,
    messages,
    isThinking,
    pendingQuestion,
    currentFunction,
    contextUsage,
    error,
    hasConversation,
    ensureSession,
    start,
    sendMessage,
    answerQuestion,
    clearMessages,
    exportChat,
    stopPolling,
    reset,
  }
}

/**
 * Module state, so a chat outlives the component showing it.
 *
 * @type {Map<string, ReturnType<typeof createChat>>}
 */
const chats = new Map()

export const PANEL_CHAT = 'panel'
export const PERSPECTIVE_CHAT = 'perspective'

export function incidentChatKey(incidentId) {
  return `incident:${incidentId}`
}

/**
 * Each key is its own server-side chat.
 *
 * @param {string} [key]
 * @param {{ incidentId?: number|null }} [options] - used only when the chat is created
 */
export function useAiChat(key = PANEL_CHAT, options) {
  let chat = chats.get(key)
  if (!chat) {
    chat = createChat(options)
    chats.set(key, chat)
  }
  return chat
}

/**
 * For sign-out. Chats are reset in place, not removed: components hold on to their instance.
 * Local only: the server-side chats belong to a session that is already gone.
 */
export function resetChat() {
  for (const chat of chats.values()) chat.reset()
}
