/**
 * SNMP trap mappings - `/v1/snmp-trap-mappings`.
 *
 * Each mapping turns a trap (matched by exact OID, else by the longest matching OID prefix)
 * into an event, copying chosen varbinds into event parameters. Mirrors the legacy console's
 * `snmp/views/SnmpTrapEditor.java`. Every call needs CONFIGURE_TRAPS.
 *
 * `PUT` changes only the fields it is sent, and replaces every parameter mapping when
 * `parameters` is present. Validation rules are in `utils/snmpTrapMappings.js`.
 */
import { get, post, put, del } from './client'

/**
 * @typedef {object} SnmpTrapParameterMapping
 * @property {string} oid - varbind OID; '' when mapped by position
 * @property {number} position - 1-based varbind position, 0 when mapped by OID
 * @property {string} description
 * @property {number} flags - bit 0: force text representation
 */

/**
 * @typedef {object} SnmpTrapMapping
 * @property {number} id
 * @property {string} guid
 * @property {string} oid - trap OID, no leading dot
 * @property {number} eventCode
 * @property {string} eventTag
 * @property {string} description
 * @property {string} transformationScript
 * @property {SnmpTrapParameterMapping[]} parameters - in event parameter order
 */

function normalizeParameter(raw) {
  const position = raw?.position ?? 0
  return {
    oid: position > 0 ? '' : (raw?.oid ?? ''),
    position,
    description: raw?.description ?? '',
    flags: raw?.flags ?? 0,
  }
}

function normalizeMapping(raw) {
  return {
    id: raw?.id ?? 0,
    guid: raw?.guid ?? '',
    oid: raw?.oid ?? '',
    eventCode: raw?.eventCode ?? 0,
    // Null when the mapping has no tag.
    eventTag: raw?.eventTag ?? '',
    description: raw?.description ?? '',
    transformationScript: raw?.transformationScript ?? '',
    // Omitted when there are none.
    parameters: Array.isArray(raw?.parameters) ? raw.parameters.map(normalizeParameter) : [],
  }
}

/** @returns {Promise<SnmpTrapMapping[]>} every mapping, parameters included */
export async function getSnmpTrapMappings() {
  const data = await get('/v1/snmp-trap-mappings')
  return Array.isArray(data) ? data.map(normalizeMapping) : []
}

/** @returns {Promise<SnmpTrapMapping>} */
export async function getSnmpTrapMapping(mappingId) {
  return normalizeMapping(await get(`/v1/snmp-trap-mappings/${mappingId}`))
}

/**
 * 400 for an unknown event code or an invalid trap or parameter OID.
 *
 * @param {object} data - `oid` required; eventCode defaults to SNMP_UNMATCHED_TRAP
 * @returns {Promise<SnmpTrapMapping>} the mapping as created
 */
export async function createSnmpTrapMapping(data) {
  return normalizeMapping(await post('/v1/snmp-trap-mappings', data))
}

/**
 * @param {number} mappingId
 * @param {object} data - any of oid, eventCode, eventTag, description, transformationScript,
 *   parameters
 * @returns {Promise<SnmpTrapMapping>} the mapping as stored
 */
export async function updateSnmpTrapMapping(mappingId, data) {
  return normalizeMapping(await put(`/v1/snmp-trap-mappings/${mappingId}`, data))
}

/** @returns {Promise<void>} */
export function deleteSnmpTrapMapping(mappingId) {
  return del(`/v1/snmp-trap-mappings/${mappingId}`)
}
