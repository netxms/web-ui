import { get, post, put, del } from './client'

export function getNotificationChannels() {
  return get('/v1/notification-channels')
}

export function getNotificationChannel(name) {
  return get(`/v1/notification-channels/${encodeURIComponent(name)}`)
}

export function createNotificationChannel(data) {
  return post('/v1/notification-channels', data)
}

export function updateNotificationChannel(name, data) {
  return put(`/v1/notification-channels/${encodeURIComponent(name)}`, data)
}

export function deleteNotificationChannel(name) {
  return del(`/v1/notification-channels/${encodeURIComponent(name)}`)
}

export function renameNotificationChannel(name, newName) {
  return post(`/v1/notification-channels/${encodeURIComponent(name)}/rename`, { newName })
}

export function clearNotificationChannelQueue(name) {
  return post(`/v1/notification-channels/${encodeURIComponent(name)}/clear-queue`)
}

export function sendNotification(name, data) {
  return post(`/v1/notification-channels/${encodeURIComponent(name)}/send`, data)
}

export function getNotificationDrivers() {
  return get('/v1/notification-drivers')
}
