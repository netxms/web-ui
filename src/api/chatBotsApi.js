import { get, post, put, del } from './client'

export function getChatBots() {
  return get('/v1/chat-bots')
}

export function getChatBot(name) {
  return get(`/v1/chat-bots/${encodeURIComponent(name)}`)
}

export function createChatBot(data) {
  return post('/v1/chat-bots', data)
}

export function updateChatBot(name, data) {
  return put(`/v1/chat-bots/${encodeURIComponent(name)}`, data)
}

export function deleteChatBot(name) {
  return del(`/v1/chat-bots/${encodeURIComponent(name)}`)
}

export function renameChatBot(name, newName) {
  return post(`/v1/chat-bots/${encodeURIComponent(name)}/rename`, { newName })
}

export function getChatBotDrivers() {
  return get('/v1/chat-bot-drivers')
}
