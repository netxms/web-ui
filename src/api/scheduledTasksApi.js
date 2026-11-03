import { get, post, put, del } from './client'

export function getScheduledTaskHandlers() {
  return get('/v1/scheduled-task-handlers')
}

export function getScheduledTasks() {
  return get('/v1/scheduled-tasks')
}

export function getScheduledTask(id) {
  return get(`/v1/scheduled-tasks/${id}`)
}

export function createScheduledTask(data) {
  return post('/v1/scheduled-tasks', data)
}

export function updateScheduledTask(id, data) {
  return put(`/v1/scheduled-tasks/${id}`, data)
}

export function deleteScheduledTask(id) {
  return del(`/v1/scheduled-tasks/${id}`)
}
