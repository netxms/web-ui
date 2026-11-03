export const MEMORY_SCOPES = [
  { value: 'environment', label: 'Environment' },
  { value: 'user', label: 'User' },
  { value: 'object', label: 'Object' },
]

/** Server limit, in UTF-8 bytes. */
export const MEMORY_TITLE_MAX_BYTES = 127

/** @param {string} scope */
export function memoryScopeLabel(scope) {
  return MEMORY_SCOPES.find((s) => s.value === scope)?.label ?? 'Unknown'
}

/**
 * Environment entries need `SYSTEM_ACCESS_MANAGE_AI_MEMORY`.
 *
 * @param {boolean} canManageMemory
 */
export function creatableMemoryScopes(canManageMemory) {
  return MEMORY_SCOPES.filter((s) => s.value !== 'environment' || canManageMemory)
}

/**
 * Worded like the legacy client: "Chat 12 (admin)", or just the user for a hand-written entry.
 *
 * @param {{ sourceType: string, sourceId: number }} entry
 * @param {string} userName
 */
export function memorySourceLabel(entry, userName) {
  switch (entry.sourceType) {
    case 'chat':
      return `Chat ${entry.sourceId} (${userName})`
    case 'task':
      return `AI task ${entry.sourceId} (${userName})`
    case 'operator':
      return `AI operator ${entry.sourceId} (${userName})`
    default:
      return userName
  }
}

/**
 * @param {string} scope
 * @param {number|null|undefined} currentUserId
 */
export function emptyMemoryForm(scope, currentUserId) {
  return {
    scope,
    scopeId: scope === 'user' ? (currentUserId ?? 0) : 0,
    title: '',
    content: '',
    locked: false,
  }
}

/**
 * Scope and owner are fixed once an entry exists, so only a new entry has them checked.
 *
 * @param {{ scope: string, scopeId: number, title: string, content: string }} form
 * @param {boolean} isNew
 * @returns {Record<string, string>}
 */
export function validateMemoryForm(form, isNew) {
  const errors = {}
  const title = form.title.trim()
  if (!title) errors.title = 'Title is required.'
  else if (new TextEncoder().encode(title).length > MEMORY_TITLE_MAX_BYTES) {
    errors.title = `Title is too long (at most ${MEMORY_TITLE_MAX_BYTES} bytes in UTF-8).`
  }
  if (!form.content.trim()) errors.content = 'Content is required.'
  if (isNew && form.scope === 'user' && !form.scopeId) errors.scopeId = 'Select a user.'
  if (isNew && form.scope === 'object' && !form.scopeId) errors.scopeId = 'Select an object.'
  return errors
}

/**
 * `PATCH` takes only `title`, `content` and `locked`.
 *
 * @param {{ scope: string, scopeId: number, title: string, content: string,
 *   locked: boolean }} form
 * @param {boolean} isNew
 */
export function buildMemoryPayload(form, isNew) {
  const changeable = {
    title: form.title.trim(),
    content: form.content.trim(),
    locked: form.locked,
  }
  if (!isNew) return changeable
  return {
    scope: form.scope,
    ...(form.scope === 'environment' ? {} : { scopeId: form.scopeId }),
    ...changeable,
  }
}
