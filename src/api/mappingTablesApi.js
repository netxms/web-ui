/**
 * Mapping tables (legacy `MappingTableManagerView.java`). Listing and writes need
 * MANAGE_MAPPING_TBLS; reading one table needs no right, because DCI value display uses it.
 * `PUT` changes only the fields sent and replaces every element when `elements` is present.
 * Rules the server applies silently on save are in `utils/mappingTables.js`.
 */
import { get, post, put, del } from './client'

/**
 * @typedef {object} MappingTableElement
 * @property {string} key
 * @property {string} value
 * @property {string} description
 */

/**
 * @typedef {object} MappingTable
 * @property {number} id
 * @property {string} guid
 * @property {string} name
 * @property {string} description
 * @property {number} flags - bit 0: numeric keys
 * @property {MappingTableElement[]} [elements] - absent in the list
 */

function normalizeTable(raw) {
  const table = {
    id: raw?.id ?? 0,
    guid: raw?.guid ?? '',
    name: raw?.name ?? '',
    description: raw?.description ?? '',
    flags: raw?.flags ?? 0,
  }
  if (Array.isArray(raw?.elements)) {
    table.elements = raw.elements.map((e) => ({
      key: e?.key ?? '',
      value: e?.value ?? '',
      description: e?.description ?? '',
    }))
  }
  return table
}

/** @returns {Promise<MappingTable[]>} every table, without elements */
export async function getMappingTables() {
  const data = await get('/v1/mapping-tables')
  return Array.isArray(data) ? data.map(normalizeTable) : []
}

/** @returns {Promise<MappingTable>} the table with its elements */
export async function getMappingTable(tableId) {
  return normalizeTable(await get(`/v1/mapping-tables/${tableId}`))
}

/**
 * 409 when another table already has the name (case-insensitive).
 *
 * @param {{ name: string, description?: string, flags?: number, elements?: MappingTableElement[] }} data
 * @returns {Promise<MappingTable>} the table as created
 */
export async function createMappingTable(data) {
  return normalizeTable(await post('/v1/mapping-tables', data))
}

/**
 * @param {number} tableId
 * @param {object} data - any of name, description, flags, elements
 * @returns {Promise<MappingTable>} the table as stored, keys normalized
 */
export async function updateMappingTable(tableId, data) {
  return normalizeTable(await put(`/v1/mapping-tables/${tableId}`, data))
}

/** @returns {Promise<void>} */
export function deleteMappingTable(tableId) {
  return del(`/v1/mapping-tables/${tableId}`)
}
