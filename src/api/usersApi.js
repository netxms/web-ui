import { get, post, put, del } from './client'

/**
 * Needs "manage users"; callers that only want names for display pass `suppressForbidden` and
 * fall back to raw ids on 403.
 *
 * @param {{ suppressForbidden?: boolean }} [options]
 */
export function getUsers(options) {
  return get('/v1/users', options)
}

export function getUser(userId) {
  return get(`/v1/users/${userId}`)
}

export function createUser(name) {
  return post('/v1/users', { name })
}

export function updateUser(userId, data) {
  return put(`/v1/users/${userId}`, data)
}

export function deleteUser(userId) {
  return del(`/v1/users/${userId}`)
}

export function setPassword(userId, newPassword, oldPassword) {
  const body = { newPassword }
  if (oldPassword) body.oldPassword = oldPassword
  return post(`/v1/users/${userId}/password`, body)
}

export function getUserGroups() {
  return get('/v1/user-groups')
}

export function getUserGroup(groupId) {
  return get(`/v1/user-groups/${groupId}`)
}

export function createUserGroup(name) {
  return post('/v1/user-groups', { name })
}

export function updateUserGroup(groupId, data) {
  return put(`/v1/user-groups/${groupId}`, data)
}

export function deleteUserGroup(groupId) {
  return del(`/v1/user-groups/${groupId}`)
}

export function getUserTwoFactorBindings(userId) {
  return get(`/v1/users/${userId}/2fa-bindings`)
}

export function updateUserTwoFactorBinding(userId, methodName, data) {
  return put(`/v1/users/${userId}/2fa-bindings/${encodeURIComponent(methodName)}`, data)
}

export function deleteUserTwoFactorBinding(userId, methodName) {
  return del(`/v1/users/${userId}/2fa-bindings/${encodeURIComponent(methodName)}`)
}

export function getUserTokens(userId) {
  return get(`/v1/users/${userId}/tokens`)
}

export function createUserToken(userId, data) {
  return post(`/v1/users/${userId}/tokens`, data)
}

export function deleteUserToken(userId, tokenId) {
  return del(`/v1/users/${userId}/tokens/${tokenId}`)
}
