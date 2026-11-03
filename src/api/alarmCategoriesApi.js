import { get, post, put, del } from './client'

export function getAlarmCategories() {
  return get('/v1/alarm-categories')
}

export function createAlarmCategory(data) {
  return post('/v1/alarm-categories', { name: data.name, description: data.description })
}

export function updateAlarmCategory(id, data) {
  return put(`/v1/alarm-categories/${id}`, { name: data.name, description: data.description })
}

export function deleteAlarmCategory(id) {
  return del(`/v1/alarm-categories/${id}`)
}
