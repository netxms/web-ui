import { get, post, put, del } from './client'

/**
 * @typedef {object} UserDirectoryEntry
 * @property {number} id
 * @property {string} name
 * @property {string} [fullName] - users only
 * @property {boolean} isGroup
 * @property {boolean} isDisabled
 */

/** Needs "manage users". Display code reads `getUserDirectory` instead. */
export function getUsers() {
  return get('/v1/users')
}

function emptyOnForbidden(error) {
  if (error?.status === 403) return []
  throw error
}

/**
 * Users and groups for any session. Servers before netxms 26123a3541 lack the route (404); the
 * "manage users" lists stand in there, empty for everyone else.
 *
 * @returns {Promise<UserDirectoryEntry[]>}
 */
export async function getUserDirectory() {
  try {
    return await get('/v1/user-directory')
  } catch (error) {
    if (error?.status !== 404) throw error
  }
  const [users, groups] = await Promise.all([
    getUsers().catch(emptyOnForbidden),
    getUserGroups().catch(emptyOnForbidden),
  ])
  return [
    ...users.map((user) => ({
      id: user.id,
      name: user.name,
      fullName: user.fullName ?? '',
      isGroup: false,
      isDisabled: !!user.flags?.disabled,
    })),
    ...groups.map((group) => ({
      id: group.id,
      name: group.name,
      isGroup: true,
      isDisabled: !!group.flags?.disabled,
    })),
  ]
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
