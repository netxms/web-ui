import { get, post, put, patch, del } from './client'

/** 503 when no AI provider is configured: not a dead server, hence `suppressUnavailable`. */
export function createAiChat(body = {}) {
  return post('/v1/ai/chat', body, { suppressUnavailable: true })
}

/** Same 503 contract as `createAiChat`. */
export function sendAiMessage(chatId, message, context) {
  return post(`/v1/ai/chat/${chatId}/message`, { message, context }, { suppressUnavailable: true })
}

/**
 * Poll a chat. While `status` is `processing` the answer carries `pendingQuestion` (a question
 * the assistant is blocked on: `{ id, type: 'confirmation'|'multipleChoice', confirmationType,
 * text, context, expiresAt, options?: string[] }`, Chat::getPendingQuestion) and
 * `currentFunction`; every answer carries `contextUsage` (`{ tokens, window }` or null).
 */
export function getAiChatStatus(chatId) {
  return get(`/v1/ai/chat/${chatId}/status`)
}

/**
 * Answer a pending question. `positive` drives confirmations; `selectedOption` is the index
 * into `options` for multiple choice (-1 when not applicable).
 */
export function answerAiChatQuestion(
  chatId,
  { questionId, positive = false, selectedOption = -1 },
) {
  return post(`/v1/ai/chat/${chatId}/answer`, { questionId, positive, selectedOption })
}

export function clearAiChat(chatId) {
  return post(`/v1/ai/chat/${chatId}/clear`)
}

export function deleteAiChat(chatId) {
  return del(`/v1/ai/chat/${chatId}`)
}

export function getAiSkillsAndFunctions() {
  return get('/v1/ai/skills-and-functions')
}

export function disableAiItem(type, name) {
  return post('/v1/ai/disabled-items', { type, name })
}

export function enableAiItem(type, name) {
  return del(`/v1/ai/disabled-items/${encodeURIComponent(type)}/${encodeURIComponent(name)}`)
}

export function getSavedPrompts() {
  return get('/v1/ai/saved-prompts')
}

export function createSavedPrompt(data) {
  return post('/v1/ai/saved-prompts', data)
}

export function updateSavedPrompt(promptId, data) {
  return put(`/v1/ai/saved-prompts/${promptId}`, data)
}

export function deleteSavedPrompt(promptId) {
  return del(`/v1/ai/saved-prompts/${promptId}`)
}

/**
 * AI memory entries the caller can read: environment entries, the caller's own user entries,
 * entries of objects the caller can read; everything with "manage AI memory".
 *
 * @param {{ scope?: 'environment'|'user'|'object', scopeId?: number }} [params]
 */
export function getAiMemoryEntries(params = {}) {
  const qs = new URLSearchParams()
  if (params.scope) qs.set('scope', params.scope)
  if (params.scopeId != null) qs.set('scopeId', String(params.scopeId))
  const query = qs.toString()
  return get(`/v1/ai/memory${query ? `?${query}` : ''}`)
}

/**
 * Title must be unique within the scope (409 otherwise). `scopeId` is the user for user scope
 * (defaults to the caller) and the object for object scope.
 *
 * @param {{ scope: string, scopeId?: number, title: string, content: string,
 *   locked?: boolean }} data
 */
export function createAiMemoryEntry(data) {
  return post('/v1/ai/memory', data)
}

/** Changes only the fields given: `title`, `content`, `locked`. */
export function updateAiMemoryEntry(memoryId, data) {
  return patch(`/v1/ai/memory/${memoryId}`, data)
}

export function deleteAiMemoryEntry(memoryId) {
  return del(`/v1/ai/memory/${memoryId}`)
}
