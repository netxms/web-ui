// The server's SnmpParseOID reads an empty element ("1..3", "1.3.") as 0; legacy rejects those,
// and so does this. The server prints OIDs without a leading dot.

const UINT32_MAX = 4294967295

/**
 * Minus surrounding blanks and one leading dot.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeOid(text) {
  const trimmed = (text ?? '').trim()
  return trimmed.startsWith('.') ? trimmed.slice(1) : trimmed
}

/**
 * @param {string} text
 * @param {{ maxLength?: number }} [options] - the column limit, where the OID is stored
 * @returns {string} '' when usable
 */
export function oidError(text, { maxLength = Infinity } = {}) {
  const oid = normalizeOid(text)
  if (!oid) return 'OID is required'
  if (oid.length > maxLength) return `OID cannot exceed ${maxLength} characters`
  const elements = oid.split('.')
  if (elements.some((e) => !/^\d+$/.test(e))) {
    return 'OID must be numbers separated by dots, e.g. 1.3.6.1.4.1'
  }
  if (elements.some((e) => Number(e) > UINT32_MAX)) {
    return 'OID elements must fit in 32 bits'
  }
  return ''
}

/**
 * So 1.3.6.1.9 sorts before 1.3.6.1.10.
 *
 * @param {string} oid
 * @returns {string}
 */
export function oidSortKey(oid) {
  return normalizeOid(oid)
    .split('.')
    .map((e) => e.padStart(10, '0'))
    .join('.')
}

const MIB_TYPE_DATA_TYPES = {
  INTEGER: 'int32',
  INTEGER32: 'int32',
  COUNTER: 'counter32',
  COUNTER32: 'counter32',
  GAUGE: 'uint32',
  GAUGE32: 'uint32',
  TIMETICKS: 'uint32',
  UINTEGER: 'uint32',
  UNSIGNED32: 'uint32',
  COUNTER64: 'counter64',
}

/**
 * As legacy SelectSnmpParamDlg.getParameterDataType picks it; anything else collects as a string.
 *
 * @param {string|null} mibType - `MibNode.type`, e.g. `COUNTER32`
 * @returns {string}
 */
export function dciDataTypeForMibType(mibType) {
  return MIB_TYPE_DATA_TYPES[mibType] ?? 'string'
}
