import { get, post, put, del } from './client'

export function getEventForwarders() {
  return get('/v1/event-forwarders')
}

export function getEventForwarder(name) {
  return get(`/v1/event-forwarders/${encodeURIComponent(name)}`)
}

export function createEventForwarder(data) {
  return post('/v1/event-forwarders', data)
}

export function updateEventForwarder(name, data) {
  return put(`/v1/event-forwarders/${encodeURIComponent(name)}`, data)
}

export function deleteEventForwarder(name) {
  return del(`/v1/event-forwarders/${encodeURIComponent(name)}`)
}

export function renameEventForwarder(name, newName) {
  return post(`/v1/event-forwarders/${encodeURIComponent(name)}/rename`, { newName })
}

export function getEventForwarderDrivers() {
  return get('/v1/event-forwarder-drivers')
}
