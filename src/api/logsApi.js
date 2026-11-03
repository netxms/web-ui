import { get, post } from './client'

/**
 * @typedef {object} LogSummary
 * @property {string} name - Log name used in every other log API call
 * @property {string|null} description - Long human readable description of the log content
 * @property {string|null} recordIdColumn - Column holding the id accepted by getLogRecord()
 * @property {string|null} objectIdColumn - Column referencing the related NetXMS object, if any
 */

/**
 * @typedef {object} LogColumn
 * @property {string} name - Column name as used in filters, ordering, and record objects
 * @property {string|null} description - Human readable column name
 * @property {string} type - One of the LOG_COLUMN_TYPE values
 * @property {boolean} recordId - True if this column is a sequential record id
 * @property {boolean} detail - True if only returned by getLogRecord(), never by queryLog()
 */

/**
 * List the logs the current user is allowed to read. Logs contributed by server modules
 * are included, so the result is not limited to the built-in set.
 *
 * @returns {Promise<LogSummary[]>}
 */
export function getLogs() {
  return get('/v1/logs')
}

/**
 * Get a log definition including its typed column list. A 403 renders inline
 * (`suppressForbidden`).
 *
 * @param {string} name
 * @returns {Promise<LogSummary & { columns: LogColumn[] }>}
 */
export function getLogDetails(name) {
  return get(`/v1/logs/${encodeURIComponent(name)}`, { suppressForbidden: true })
}

/**
 * Requests are self-contained (no server-side query state). `count` is the number of records in
 * this page only; paging re-executes the query and skips `offset` records, so `offset` + `limit`
 * may not exceed 100000. `resolvedValues` names the `objectId`/`userId` codes in this page,
 * omitting unreadable or unknown ids; older servers omit it entirely.
 *
 * @param {string} name
 * @param {object} body - LogQueryRequest: { filters, orderBy, offset, limit }
 * @returns {Promise<{columns: LogColumn[], offset: number, count: number, records: object[],
 *   resolvedValues?: {objects: Record<string, object>, users: Record<string, string>}}>}
 */
export function queryLog(name, body) {
  return post(`/v1/logs/${encodeURIComponent(name)}/query`, body, { suppressForbidden: true })
}

/**
 * Build the SQL statement a queryLog() call with the same body would execute, without
 * running it. The statement reflects the caller's object access constraints.
 *
 * @param {string} name
 * @param {object} body - Same LogQueryRequest shape as queryLog()
 * @returns {Promise<{query: string}>}
 */
export function getLogQuerySql(name, body) {
  return post(`/v1/logs/${encodeURIComponent(name)}/query-sql`, body)
}

/**
 * Get a single record by record id, including the `detail` columns that query results omit.
 *
 * @param {string} name
 * @param {number|string} recordId - Value of the log's recordIdColumn
 * @returns {Promise<object>} Record keyed by column name
 */
export function getLogRecord(name, recordId) {
  return get(`/v1/logs/${encodeURIComponent(name)}/records/${recordId}`)
}
