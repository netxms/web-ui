import { get, post, put, del } from './client'

export function getSummaryTables() {
  return get('/v1/dci-summary-tables')
}

export function getSummaryTable(tableId) {
  return get(`/v1/dci-summary-tables/${tableId}`)
}

export function createSummaryTable(data) {
  return post('/v1/dci-summary-tables', data)
}

export function updateSummaryTable(tableId, data) {
  return put(`/v1/dci-summary-tables/${tableId}`, data)
}

export function deleteSummaryTable(tableId) {
  return del(`/v1/dci-summary-tables/${tableId}`)
}

export function querySummaryTable(tableId, objectId) {
  return post(`/v1/dci-summary-tables/${tableId}/query`, { objectId })
}
