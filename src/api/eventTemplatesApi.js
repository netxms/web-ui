import { get, post, put, del } from './client'

export function getEventTemplates() {
  return get('/v1/event-templates')
}

export function getEventTemplate(code) {
  return get(`/v1/event-templates/${code}`)
}

export function createEventTemplate(data) {
  return post('/v1/event-templates', data)
}

export function updateEventTemplate(code, data) {
  return put(`/v1/event-templates/${code}`, data)
}

export function deleteEventTemplate(code) {
  return del(`/v1/event-templates/${code}`)
}
