/**
 * DCI enumerations by numeric code and by name. Older servers send last values with codes
 * (DS_*, DCI_DT_*, ...); the configuration endpoint, data export and newer last values carry
 * the names of the server's lookup tables (g_dciOriginNames, ...). Readers accept either form.
 */

/** g_dciOriginNames, indexed by DS_* code. */
export const DCI_ORIGIN_NAMES = Object.freeze([
  'internal',
  'agent',
  'snmp',
  'websvc',
  'push',
  'winperf',
  'smclp',
  'script',
  'ssh',
  'mqtt',
  'driver',
  'modbus',
  'ethernetip',
  'cloud',
  'otlp',
  'trafficobserver',
  'netconf',
  'computed',
])

/** Older server spellings: DS_NATIVE_AGENT was "nxagent" before it became "agent". */
const ORIGIN_ALIASES = new Map([['nxagent', 'agent']])

const RENAMED_ORIGINS = new Set(ORIGIN_ALIASES.values())

/** g_dciDataTypeNames, indexed by DCI_DT_* code (DCI_DATA_TYPES in dciFormat.js). */
const DATA_TYPE_NAMES = Object.freeze([
  'int32',
  'uint32',
  'int64',
  'uint64',
  'string',
  'float',
  'null',
  'counter32',
  'counter64',
])

/** g_dciStatusNames, indexed by ITEM_STATUS_* code. */
const STATUS_NAMES = Object.freeze(['active', 'disabled', 'unsupported'])

/** g_severityNames, indexed by SEVERITY_* code (the same numbers as STATUS_NORMAL..CRITICAL). */
const SEVERITY_NAMES = Object.freeze(['normal', 'warning', 'minor', 'major', 'critical'])

/** DCO_TYPE_* by the name the configuration endpoint gives `type`. */
const OBJECT_TYPE_CODES = new Map([
  ['item', 1],
  ['table', 2],
])

function toCode(value, names) {
  if (typeof value !== 'string') return value
  const code = names.indexOf(value)
  return code < 0 ? value : code
}

/**
 * @param {number|string} [origin]
 * @returns {string|number|undefined} an unknown code or name as given
 */
export function dciOriginName(origin) {
  if (typeof origin === 'number') return DCI_ORIGIN_NAMES[origin] ?? origin
  return ORIGIN_ALIASES.get(origin) ?? origin
}

/**
 * @param {number|string} [origin]
 * @returns {number|string|undefined} an unknown name as given
 */
export function dciOriginCode(origin) {
  return toCode(dciOriginName(origin), DCI_ORIGIN_NAMES)
}

/**
 * A renamed origin is written as its DS_* code: each server knows only its own spelling, but
 * every server with the endpoint accepts the code.
 * @param {number|string} origin
 * @returns {number|string}
 */
export function dciOriginForWrite(origin) {
  const name = dciOriginName(origin)
  return RENAMED_ORIGINS.has(name) ? dciOriginCode(name) : name
}

/**
 * @param {number|string} [dataType]
 * @returns {number|string|undefined} an unknown name as given
 */
export function dciDataTypeCode(dataType) {
  return toCode(dataType, DATA_TYPE_NAMES)
}

/**
 * @param {number|string} [status]
 * @returns {number|string|undefined} an unknown name as given
 */
export function dciStatusCode(status) {
  return toCode(status, STATUS_NAMES)
}

/**
 * @param {number|string} [severity]
 * @returns {number|string|undefined} an unknown name as given
 */
export function dciSeverityCode(severity) {
  return toCode(severity, SEVERITY_NAMES)
}

/**
 * @param {number|string} [type]
 * @returns {number|string|undefined} an unknown name as given
 */
export function dciObjectTypeCode(type) {
  return OBJECT_TYPE_CODES.get(type) ?? type
}
