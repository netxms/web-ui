// Limits enforced by the server's persistent storage handler (the table column sizes).

export const MAX_KEY_LENGTH = 127
export const MAX_VALUE_LENGTH = 2000

/**
 * The server decodes the path before routing, so an encoded `/` still splits the key, and the
 * browser collapses `.` and `..` as dot segments even when encoded. Such entries are listed but
 * cannot be edited or deleted.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isAddressableKey(key) {
  return !key.includes('/') && key !== '.' && key !== '..'
}

/**
 * @param {string} key - already trimmed
 * @param {string[]} [existingKeys] - the PUT is an upsert, so create must not overwrite
 * @returns {string} '' when acceptable
 */
export function validateKey(key, existingKeys = []) {
  if (!key) return 'Key is required'
  if (key.length > MAX_KEY_LENGTH) return `Key cannot exceed ${MAX_KEY_LENGTH} characters`
  for (let i = 0; i < key.length; i++) {
    if (key.charCodeAt(i) < 0x20) return 'Key cannot contain control characters'
  }
  if (key.includes('/')) return 'Key cannot contain "/"'
  if (!isAddressableKey(key)) return 'Key cannot be "." or ".."'
  if (existingKeys.includes(key)) return 'An entry with this key already exists'
  return ''
}
