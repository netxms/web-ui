/**
 * Persistent storage: the server-wide key/value store NXSL (`ReadPersistentStorage` /
 * `WritePersistentStorage`) and EPP rules use. Every call needs PERSISTENT_STORAGE. Writes reach
 * the database asynchronously but reads are served from memory, so a write is visible at once.
 */
import { get, put, del } from './client'

/**
 * @typedef {object} PersistentStorageEntry
 * @property {string} id - same as `key`; AppTable keys rows by `id`
 * @property {string} key
 * @property {string} value
 */

/** @returns {PersistentStorageEntry} */
function toEntry(key, value) {
  return { id: key, key, value: value ?? '' }
}

/**
 * Every entry. The server answers with one key->value object, not an array.
 *
 * @returns {Promise<PersistentStorageEntry[]>}
 */
export async function getPersistentStorage() {
  const data = await get('/v1/persistent-storage')
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  return Object.entries(data).map(([key, value]) => toEntry(key, value))
}

/**
 * Set an entry's value, creating the entry if it does not exist.
 *
 * @param {string} key - must pass `isAddressableKey` (utils/persistentStorage.js)
 * @param {string} value
 * @returns {Promise<PersistentStorageEntry>} the entry as stored
 */
export async function setPersistentStorageEntry(key, value) {
  const data = await put(`/v1/persistent-storage/${encodeURIComponent(key)}`, { value })
  return toEntry(data?.key ?? key, data?.value ?? value)
}

/**
 * Delete an entry. 404 when it no longer exists.
 *
 * @param {string} key - must pass `isAddressableKey`
 * @returns {Promise<void>}
 */
export function deletePersistentStorageEntry(key) {
  return del(`/v1/persistent-storage/${encodeURIComponent(key)}`)
}
