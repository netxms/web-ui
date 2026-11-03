/**
 * Server configuration variables (legacy `ServerVariables.java`). Every endpoint needs
 * SERVER_CONFIG; hidden variables are never returned. `PUT` is an upsert: an unknown name is
 * created as a visible STRING variable, like legacy "Create new...".
 */
import { get, post, put, del } from './client'

/**
 * @typedef {object} ServerConfigVariable
 * @property {string} id - same as `name`; AppTable keys rows by `id`
 * @property {string} name
 * @property {string} value
 * @property {string} defaultValue
 * @property {'STRING'|'BOOLEAN'|'INTEGER'|'CHOICE'|'COLOR'|'PASSWORD'} dataType
 * @property {string} description
 * @property {string} units
 * @property {boolean} needServerRestart
 * @property {Array<{ value: string, description: string }>} possibleValues
 */

/**
 * Fill in what the server may omit and add the `id` alias AppTable keys on.
 *
 * @param {object} raw
 * @returns {ServerConfigVariable}
 */
function normalizeVariable(raw) {
  const name = raw?.name ?? ''
  return {
    id: name,
    name,
    value: raw?.value ?? '',
    defaultValue: raw?.defaultValue ?? '',
    dataType: raw?.dataType ?? 'STRING',
    description: raw?.description ?? '',
    units: raw?.units ?? '',
    needServerRestart: raw?.needServerRestart ?? false,
    possibleValues: Array.isArray(raw?.possibleValues) ? raw.possibleValues : [],
  }
}

/** @returns {Promise<ServerConfigVariable[]>} */
export async function getServerConfigVariables() {
  const data = await get('/v1/server-config')
  return Array.isArray(data) ? data.map(normalizeVariable) : []
}

/** @returns {Promise<ServerConfigVariable>} */
export async function getServerConfigVariable(name) {
  return normalizeVariable(await get(`/v1/server-config/${encodeURIComponent(name)}`))
}

/**
 * Set a variable's value, creating it if it does not exist.
 *
 * @param {string} name
 * @param {string} value - always a string; BOOLEAN is "0"/"1", COLOR a CSS color
 * @returns {Promise<ServerConfigVariable>} the variable as stored
 */
export async function setServerConfigVariable(name, value) {
  return normalizeVariable(await put(`/v1/server-config/${encodeURIComponent(name)}`, { value }))
}

/** @returns {Promise<ServerConfigVariable>} the variable at its default value */
export async function resetServerConfigVariable(name) {
  return normalizeVariable(await post(`/v1/server-config/${encodeURIComponent(name)}/reset`))
}

/** @returns {Promise<void>} */
export function deleteServerConfigVariable(name) {
  return del(`/v1/server-config/${encodeURIComponent(name)}`)
}
