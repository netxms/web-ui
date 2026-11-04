import { get, post, put, del } from './client'

export function getTwoFactorDrivers() {
  return get('/v1/2fa/drivers')
}

export function getTwoFactorMethods() {
  return get('/v1/2fa/methods')
}

export function createTwoFactorMethod(data) {
  return post('/v1/2fa/methods', data)
}

export function updateTwoFactorMethod(name, data) {
  return put(`/v1/2fa/methods/${encodeURIComponent(name)}`, data)
}

export function deleteTwoFactorMethod(name) {
  return del(`/v1/2fa/methods/${encodeURIComponent(name)}`)
}
