import { get, post, put, del } from './client'

export function getSshKeys(includePublicKey = false) {
  return get(`/v1/ssh-keys?includePublicKey=${includePublicKey}`)
}

export function getSshKey(keyId) {
  return get(`/v1/ssh-keys/${keyId}`)
}

export function createSshKey(data) {
  return post('/v1/ssh-keys', data)
}

export function updateSshKey(keyId, data) {
  return put(`/v1/ssh-keys/${keyId}`, data)
}

export function deleteSshKey(keyId, force = false) {
  return del(`/v1/ssh-keys/${keyId}${force ? '?force=true' : ''}`)
}
