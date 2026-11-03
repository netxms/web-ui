import { get } from './client'

export function getServerInfo() {
  return get('/v1/server-info')
}

/**
 * Liveness probe for the reconnect banner: true when the server answers at all, 401 included
 * (session validity is `authStore.checkSession`'s concern). Never rejects: a network failure
 * means "still down".
 *
 * @returns {Promise<boolean>}
 */
export async function getServerStatus() {
  try {
    // A 401 here must not tear down the session.
    await get('/v1/status', { suppressUnauthorized: true })
    return true
  } catch (err) {
    return err?.status === 401
  }
}
