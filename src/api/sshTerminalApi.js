import { post } from './client'

/**
 * Opens the SSH channel on the node's proxy agent before answering, so login failures come back
 * here. 502, 503 and 504 describe the proxy or the node, not this server, and the caller renders
 * them and a 403 inline.
 *
 * @param {number} objectId
 * @param {{ columns: number, rows: number, terminalType: string, login?: string, password?: string, keyId?: number }} body
 *   without `login`, the server uses the credentials stored on the node
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ token: string, expiresIn: number, wsUrl: string }>}
 */
export function createSshTerminalSession(objectId, body, { signal } = {}) {
  return post(`/v1/objects/${objectId}/ssh-terminal`, body, {
    signal,
    suppressForbidden: true,
    suppressUnavailable: true,
  })
}
