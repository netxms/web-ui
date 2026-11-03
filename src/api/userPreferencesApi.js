/**
 * User variables: the server's per-user key/value store, one flat namespace shared with the
 * legacy client (which uses prefixes like `AlarmList.`). Values are strings; writes are per key
 * and the last one wins. The caller must be the user or hold MANAGE_USERS.
 */
import { del, get, put } from './client'

function variablePath(userId, name) {
  return `/v1/users/${userId}/variables/${encodeURIComponent(name)}`
}

/**
 * @param {number|string} userId
 * @param {string} [pattern] - glob over the names, e.g. `webui.*`
 * @returns {Promise<Record<string, string>>} name -> value
 */
export async function getUserVariables(userId, pattern) {
  const query = pattern ? `?pattern=${encodeURIComponent(pattern)}` : ''
  return (await get(`/v1/users/${userId}/variables${query}`)) ?? {}
}

/**
 * Background writes: a preference is never worth an access-denied toast, and a session that
 * ended while the write was queued must not sign the next user out.
 */
const WRITE_OPTIONS = {
  priority: 'background',
  suppressForbidden: true,
  suppressUnauthorized: true,
}

/**
 * Create or overwrite one variable.
 *
 * @param {number|string} userId
 * @param {string} name
 * @param {string} value
 */
export function setUserVariable(userId, name, value) {
  return put(variablePath(userId, name), { value }, WRITE_OPTIONS)
}

/**
 * Delete one variable. Deleting a missing one is not an error.
 *
 * @param {number|string} userId
 * @param {string} name
 */
export function deleteUserVariable(userId, name) {
  return del(variablePath(userId, name), WRITE_OPTIONS)
}
