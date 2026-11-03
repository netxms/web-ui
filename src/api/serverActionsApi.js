import { get, post, put, del } from './client'

export function getServerActions() {
  return get('/v1/server-actions')
}

export function getServerAction(id) {
  return get(`/v1/server-actions/${id}`)
}

export function createServerAction(data) {
  return post('/v1/server-actions', data)
}

export function updateServerAction(id, data) {
  return put(`/v1/server-actions/${id}`, data)
}

export function deleteServerAction(id) {
  return del(`/v1/server-actions/${id}`)
}
