// Limits match the server's DB columns. Server event parameter 1 is the trap OID; mapped varbinds
// follow in list order from parameter 2.
import { normalizeOid } from './snmpOid'

export const MAX_OID_LENGTH = 255
export const MAX_DESCRIPTION_LENGTH = 255
export const MAX_EVENT_TAG_LENGTH = 63

/** Legacy's spinner range for a varbind position. */
export const MAX_POSITION = 255

/** `SNMP_UNMATCHED_TRAP`, used when no event is chosen. */
export const EVENT_SNMP_UNMATCHED_TRAP = 500

/** `TRAP_VARBIND_FORCE_TEXT`, bit 0 of a parameter mapping's flags. */
export const FLAG_FORCE_TEXT = 1

export const FIRST_PARAMETER_NUMBER = 2

/**
 * @param {{ oid: string, position: number }} parameter
 * @returns {string}
 */
export function parameterSource(parameter) {
  return parameter.position > 0 ? `Position ${parameter.position}` : parameter.oid
}

/**
 * `position` or `oid`, never both: a positive position wins on the server.
 *
 * @param {{ oid: string, position: number, description: string, flags: number }} parameter
 * @returns {object}
 */
export function toParameterRequest({ oid, position, description, flags }) {
  return position > 0
    ? { position, description, flags }
    : { oid: normalizeOid(oid), description, flags }
}
