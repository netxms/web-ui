/**
 * Mapping table rules the server applies silently (`MappingTable::updateFromJson`):
 * - duplicate keys: the last one wins, the other disappears without an error;
 * - numeric keys go through `strtol(key, nullptr, 0)` into int32 and are stored in decimal:
 *   text becomes "0", a leading zero means octal, out-of-range values wrap.
 */

export const MAX_NAME_LENGTH = 63
export const MAX_KEY_LENGTH = 63
export const MAX_TEXT_LENGTH = 4000

/** `MTF_NUMERIC_KEYS`, bit 0 of the table flags. */
export const FLAG_NUMERIC_KEYS = 1

const INT32_MIN = -2147483648
const INT32_MAX = 2147483647

const NUMERIC_KEY = /^([+-]?)(0x[0-9a-f]+|0|[1-9][0-9]*)$/i

/**
 * Null when the server would not read the key as written: not a decimal or 0x hex integer, a
 * leading zero (octal to `strtol`), or outside the int32 range.
 *
 * @param {string} key
 * @returns {number|null}
 */
export function parseNumericKey(key) {
  const match = NUMERIC_KEY.exec(key)
  if (!match) return null
  const digits = match[2]
  const magnitude = Number.parseInt(digits, digits.length > 1 && /x/i.test(digits[1]) ? 16 : 10)
  const value = match[1] === '-' ? -magnitude : magnitude
  return value >= INT32_MIN && value <= INT32_MAX ? value : null
}

/**
 * @param {string} key
 * @param {boolean} numeric
 * @returns {string}
 */
export function normalizeKey(key, numeric) {
  if (!numeric) return key
  const value = parseNumericKey(key)
  return value === null ? key : String(value)
}

function numericKeyError(key) {
  if (/^[+-]?0[0-9]+$/.test(key)) {
    return 'Leading zeros are not allowed: the server would read the number as octal'
  }
  return 'Must be a whole number, decimal or 0x-prefixed hexadecimal, within the 32-bit range'
}

/**
 * Every entry of a duplicate set is flagged.
 *
 *
 * @param {Array<{ id: number, key: string }>} entries
 * @param {boolean} numeric - the numeric-keys flag as it will be saved
 * @returns {Map<number, string>}
 */
export function validateEntries(entries, numeric) {
  const errors = new Map()
  const firstByKey = new Map()

  for (const entry of entries) {
    const key = entry.key
    if (!key) {
      errors.set(entry.id, 'Key is required')
      continue
    }
    if (key.length > MAX_KEY_LENGTH) {
      errors.set(entry.id, `Key cannot exceed ${MAX_KEY_LENGTH} characters`)
      continue
    }
    if (numeric && parseNumericKey(key) === null) {
      errors.set(entry.id, numericKeyError(key))
      continue
    }
    const stored = normalizeKey(key, numeric)
    const message = `Duplicate key "${stored}": only one of these entries would be kept`
    if (firstByKey.has(stored)) {
      errors.set(entry.id, message)
      errors.set(firstByKey.get(stored), message)
    } else {
      firstByKey.set(stored, entry.id)
    }
  }
  return errors
}

/**
 * Mirrors the legacy CSV import: Key, Value, optional Description; records with fewer than two
 * fields skipped; a first record of "Key,Value..." taken as a header.
 *
 * @param {string[][]} records - from `parseCsv`
 * @returns {Array<{ key: string, value: string, description: string }>}
 */
export function entriesFromCsv(records) {
  const rows = records.filter((record) => record.length >= 2)
  const [first] = rows
  if (
    first &&
    first[0].trim().toLowerCase() === 'key' &&
    first[1].trim().toLowerCase() === 'value'
  ) {
    rows.shift()
  }
  return rows.map(([key, value, description = '']) => ({ key: key.trim(), value, description }))
}

const lookupMaps = new WeakMap()

/**
 * Exact match on the key as stored, like the server's `MappingTable::get`: neither side finds
 * the key "1" for a value of "01" or "1.0".
 *
 * @param {{ elements?: Array<{ key: string, value: string }> } | null | undefined} table
 * @param {unknown} rawValue - the value as the server sends it
 * @returns {string|null}
 */
export function lookupMappedValue(table, rawValue) {
  if (!table?.elements || rawValue == null || rawValue === '') return null
  // Built once per table object; a refetch hands over a new object and so a new map.
  let byKey = lookupMaps.get(table)
  if (!byKey) {
    byKey = new Map(table.elements.map((e) => [e.key, e.value]))
    lookupMaps.set(table, byKey)
  }
  return byKey.get(String(rawValue)) ?? null
}
