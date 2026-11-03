// Texts as in the legacy client (`Interface.java`, `InterfaceListLabelProvider`). The server sends
// OSPF and 802.1x states as bare codes, with no `*Text` companion.

/** Interface flags (`IF_*` in include/nxcldefs.h). */
export const IF_FLAGS = {
  PHYSICAL_PORT: 0x00000002,
  EXCLUDE_FROM_TOPOLOGY: 0x00000004,
  CREATED_MANUALLY: 0x00000010,
  INCLUDE_IN_ICMP_POLL: 0x00000040,
  DISABLE_SNMP_STATUS_POLL: 0x00000080,
  DISABLE_ICMP_STATUS_POLL: 0x00000100,
  DISABLE_AGENT_STATUS_POLL: 0x00000200,
  OSPF_INTERFACE: 0x00000400,
}

/** Expected interface states (`IF_EXPECTED_STATE_*`). */
export const EXPECTED_STATE = { UP: 0, DOWN: 1, IGNORE: 2, AUTO: 3 }

// AUTO is not selectable: the server replaces it with UP or DOWN on the first status poll.
export const EXPECTED_STATE_OPTIONS = [
  { value: EXPECTED_STATE.UP, label: 'Up' },
  { value: EXPECTED_STATE.DOWN, label: 'Down' },
  { value: EXPECTED_STATE.IGNORE, label: 'Ignore' },
]

const OSPF_STATE_TEXT = ['', 'DOWN', 'LOOPBACK', 'WAITING', 'PT-TO-PT', 'DR', 'BDR', 'ODR']
const OSPF_TYPE_TEXT = ['', 'BROADCAST', 'NBMA', 'PT-TO-PT', 'PT-TO-MP']

const DOT1X_PAE_STATE_TEXT = [
  'UNKNOWN',
  'INITIALIZE',
  'DISCONNECTED',
  'CONNECTING',
  'AUTHENTICATING',
  'AUTHENTICATED',
  'ABORTING',
  'HELD',
  'FORCE AUTH',
  'FORCE UNAUTH',
  'RESTART',
]

const DOT1X_BACKEND_STATE_TEXT = [
  'UNKNOWN',
  'REQUEST',
  'RESPONSE',
  'SUCCESS',
  'FAIL',
  'TIMEOUT',
  'IDLE',
  'INITIALIZE',
  'IGNORE',
]

/** @param {{ flags?: number }} iface */
export function isPhysicalPort(iface) {
  return ((iface?.flags ?? 0) & IF_FLAGS.PHYSICAL_PORT) !== 0
}

/** @param {{ flags?: number }} iface */
export function isOspfInterface(iface) {
  return ((iface?.flags ?? 0) & IF_FLAGS.OSPF_INTERFACE) !== 0
}

/** @param {{ flags?: number }} iface */
export function isCreatedManually(iface) {
  return ((iface?.flags ?? 0) & IF_FLAGS.CREATED_MANUALLY) !== 0
}

export function ospfStateText(iface) {
  return isOspfInterface(iface) ? (OSPF_STATE_TEXT[iface.ospfState] ?? '') : ''
}

export function ospfTypeText(iface) {
  return isOspfInterface(iface) ? (OSPF_TYPE_TEXT[iface.ospfType] ?? '') : ''
}

export function ospfAreaText(iface) {
  return isOspfInterface(iface) ? (iface.ospfArea ?? '') : ''
}

// Legacy also requires node 802.1x support, which a port reporting a non-UNKNOWN state implies.
export function dot1xPaeStateText(iface) {
  if (!isPhysicalPort(iface)) return ''
  return DOT1X_PAE_STATE_TEXT[iface.dot1xPaeState] ?? DOT1X_PAE_STATE_TEXT[0]
}

export function dot1xBackendStateText(iface) {
  if (!isPhysicalPort(iface)) return ''
  return DOT1X_BACKEND_STATE_TEXT[iface.dot1xBackendState] ?? DOT1X_BACKEND_STATE_TEXT[0]
}

/**
 * Negative means never measured.
 *
 * @param {number|null|undefined} tenths - tenths of a percent
 * @returns {string}
 */
export function formatUtilization(tenths) {
  if (typeof tenths !== 'number' || tenths < 0) return ''
  return `${(tenths / 10).toFixed(1)}%`
}

/** `chassis/module/pic/port` */
export function formatPhysicalLocation(iface) {
  if (!isPhysicalPort(iface)) return ''
  const loc = iface.physicalLocation ?? {}
  return `${loc.chassis ?? 0}/${loc.module ?? 0}/${loc.pic ?? 0}/${loc.port ?? 0}`
}

/**
 * A row with no value keeps its empty line, so a pasted column lines up with its rows.
 *
 * @param {object[]} rows
 * @param {(row: object) => string|null|undefined} valueOf
 * @returns {string}
 */
export function linesOf(rows, valueOf) {
  return rows.map((row) => valueOf(row) ?? '').join('\n')
}

/**
 * @param {object[]} rows
 * @param {Array<{ id: string }>} columns
 * @param {(row: object, column: object) => string} textOf
 * @returns {string}
 */
export function tabSeparatedRows(rows, columns, textOf) {
  return rows
    .map((row) =>
      columns.map((col) => String(textOf(row, col) ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t'),
    )
    .join('\n')
}

const MAC_ADDRESS_PATTERN = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/

/**
 * The server stores a zero address for bad input instead of rejecting it.
 *
 * @param {string|null|undefined} text
 */
export function isValidMacAddress(text) {
  return MAC_ADDRESS_PATTERN.test(String(text ?? '').trim())
}

/**
 * The server refuses a MAC address on an interface not created manually.
 *
 * @param {object} draft
 * @param {object} original
 * @returns {object}
 */
export function interfacePropertiesPatch(draft, original) {
  const patch = {}
  if (draft.expectedState !== original?.expectedState) patch.expectedState = draft.expectedState
  if (draft.requiredPollCount !== original?.requiredPollCount) {
    patch.requiredPollCount = draft.requiredPollCount ?? 0
  }
  const mac = String(draft.macAddress ?? '').trim()
  if (isCreatedManually(original) && mac !== String(original?.macAddress ?? '').trim()) {
    patch.macAddress = mac
  }
  return patch
}
