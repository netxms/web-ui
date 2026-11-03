/**
 * Keeps `userPrefs` (utils/appStorage.js) in step with the server's user variables, like the
 * legacy `PreferenceStore`: the server's values win at sign-in and later changes are written
 * through. Unlike legacy, because browsers are shared:
 *
 * - Only values no account has claimed yet are uploaded, by the first account to sync.
 *   Otherwise one user's settings would land in the next user's account.
 * - Signing in replaces the cache; a field the server lacks goes back to its default.
 *
 * Variables carry the `webui.` prefix (the namespace is shared with the legacy client) and hold
 * JSON. Without the server, the session runs on the cache alone.
 */
import { userPrefs } from '@/utils/appStorage'
import { deleteUserVariable, getUserVariables, setUserVariable } from '@/api/userPreferencesApi'

export const VARIABLE_PREFIX = 'webui.'

/**
 * `IsValidObjectName` (libnetxms/tools.cpp) without `/`: the server takes a slash, but a name
 * holding one cannot be addressed in the URL path. Below `MAX_USERVAR_NAME_LENGTH` (128).
 */
const VALID_NAME = /^[A-Za-z0-9_\-@(). ]{1,127}$/

/**
 * Null when the server would refuse the name (the field then stays in this browser).
 *
 * @param {string} field
 */
export function variableName(field) {
  const name = VARIABLE_PREFIX + field
  return VALID_NAME.test(name) ? name : null
}

/** @param {Record<string, string>} variables */
function decode(variables) {
  const values = {}
  for (const [name, raw] of Object.entries(variables ?? {})) {
    if (!name.startsWith(VARIABLE_PREFIX)) continue
    try {
      values[name.slice(VARIABLE_PREFIX.length)] = JSON.parse(raw)
    } catch {
      // Not written by us, or damaged; the field falls back to its default.
    }
  }
  return values
}

/** The account writes go to; null while signed out, syncing, or running on the cache. */
let session = null

/** Variable name -> value (undefined = delete). A newer change replaces one not yet sent. */
const pending = new Map()
let draining = false

/**
 * One request at a time, so the last change to a variable is also the last to reach it.
 * Failures are dropped: the server's value wins at the next sign-in.
 */
async function drain() {
  draining = true
  try {
    while (session && pending.size) {
      const [name, value] = pending.entries().next().value
      pending.delete(name)
      try {
        if (value === undefined) await deleteUserVariable(session.userId, name)
        else await setUserVariable(session.userId, name, JSON.stringify(value))
      } catch {
        // best effort
      }
    }
  } finally {
    draining = false
  }
}

function write(field, value) {
  if (!session) return
  const name = variableName(field)
  if (!name) return
  pending.set(name, value)
  if (!draining) drain()
}

userPrefs.connect(write)

/**
 * Pre-user-variables onboarding stand-in: keyed by user id (or login when the id was not yet
 * known), holding a JSON string under `.Onboarding`.
 */
const LEGACY_ATTRIBUTES_KEY = 'netxms-user-attributes'
const LEGACY_ONBOARDING = '.Onboarding'

function legacyUserKeys(user) {
  return [user.id != null ? String(user.id) : null, user.username].filter(Boolean)
}

function readLegacyOnboarding(user) {
  try {
    const byUser = JSON.parse(localStorage.getItem(LEGACY_ATTRIBUTES_KEY))?.byUser
    for (const key of legacyUserKeys(user)) {
      const raw = byUser?.[key]?.[LEGACY_ONBOARDING]
      if (typeof raw === 'string') return JSON.parse(raw)
    }
  } catch {
    // unreadable: nothing to carry over
  }
  return undefined
}

function dropLegacyOnboarding(user) {
  try {
    const state = JSON.parse(localStorage.getItem(LEGACY_ATTRIBUTES_KEY))
    if (!state?.byUser) return
    for (const key of legacyUserKeys(user)) delete state.byUser[key]
    if (Object.keys(state.byUser).length) {
      localStorage.setItem(LEGACY_ATTRIBUTES_KEY, JSON.stringify(state))
    } else {
      localStorage.removeItem(LEGACY_ATTRIBUTES_KEY)
    }
  } catch {
    // ignore
  }
}

/** Bumped by every sync and disconnect, so a slow answer for an earlier session is dropped. */
let generation = 0

/** @returns {Promise<boolean>} whether every upload succeeded */
async function upload(userId, values) {
  const results = await Promise.allSettled(
    Object.entries(values).map(([field, value]) => {
      const name = variableName(field)
      return name ? setUserVariable(userId, name, JSON.stringify(value)) : null
    }),
  )
  return results.every((result) => result.status === 'fulfilled')
}

/** Server unreachable: keep this account's cache, never another account's. */
function keepLocal(user, owner) {
  const cachedOwner = userPrefs.owner()
  const values = cachedOwner === null || cachedOwner === owner ? userPrefs.read() : {}
  if (values.onboarding === undefined) {
    const legacy = readLegacyOnboarding(user)
    if (legacy !== undefined) values.onboarding = legacy
  }
  // Unclaimed values stay unclaimed, so they are still uploaded once the server answers.
  userPrefs.replace(values, cachedOwner === null ? null : owner)
}

/**
 * Resolves when the cache holds the user's preferences; never rejects. Sign-in awaits it so the
 * shell does not open on the previous account's theme and columns.
 *
 * @param {{id?: number, username?: string} | null} user
 */
export async function syncUserPreferences(user) {
  disconnectUserPreferences()
  if (user?.id == null) return
  const current = generation
  const owner = String(user.id)

  let server
  try {
    server = decode(await getUserVariables(user.id, `${VARIABLE_PREFIX}*`))
  } catch {
    if (current === generation) keepLocal(user, owner)
    return
  }
  if (current !== generation) return

  const cachedOwner = userPrefs.owner()
  const claiming = cachedOwner === null
  const uploads = {}
  if (claiming) {
    for (const [field, value] of Object.entries(userPrefs.read())) {
      if (server[field] === undefined) uploads[field] = value
    }
  }
  const legacyOnboarding =
    server.onboarding === undefined && uploads.onboarding === undefined
      ? readLegacyOnboarding(user)
      : undefined
  if (legacyOnboarding !== undefined) uploads.onboarding = legacyOnboarding

  const uploaded = await upload(user.id, uploads)
  if (current !== generation) return

  // A failed upload leaves the browser's values unclaimed, so the next sign-in retries them.
  userPrefs.replace({ ...server, ...uploads }, claiming && !uploaded ? null : owner)
  if (uploaded && legacyOnboarding !== undefined) dropLegacyOnboarding(user)
  session = { userId: user.id }
}

/** Stop writing to the server: sign-out, or a new sync starting. Queued writes are dropped. */
export function disconnectUserPreferences() {
  generation++
  session = null
  pending.clear()
}
