/**
 * DCI history export (`webapi/data_export.cpp`); request shapes are in `utils/dataExport.js`.
 * The server checks read access on the root object and each DCI, and only the user who started
 * an export may query or download it. The POSTs are query-shaped, so they skip the 403 toast.
 */
import { get, getBlob, post } from './client'

/**
 * The metrics a request would select, without exporting anything.
 *
 * @param {object} request - selection request (`buildSelectionRequest`)
 * @param {object} [options] - `signal`, passed to the client
 * @returns {Promise<{ metrics: import('@/utils/dataExport').DataExportMetric[], skippedCount: number }>}
 *   `skippedCount`: matching DCIs left out as non-numeric, table or inaccessible
 */
export async function previewDataExport(request, options) {
  const data = await post('/v1/data-export/metrics', request, {
    ...options,
    suppressForbidden: true,
  })
  return {
    metrics: Array.isArray(data?.metrics) ? data.metrics : [],
    skippedCount: Number(data?.skippedCount) || 0,
  }
}

/**
 * Start an export as a background task.
 *
 * @param {object} request - full export request (`buildExportRequest`)
 * @returns {Promise<number>} the task id
 */
export async function startDataExport(request) {
  const data = await post('/v1/data-export', request, { suppressForbidden: true })
  return Number(data?.taskId)
}

/**
 * State of an export task: `{ taskId, state, progress, failureReason, metricCount,
 * skippedCount, sampleCount, archiveSize, mappingAvailable }`, the counts only once
 * `state` is `completed`. 404 once the task or its files are gone.
 *
 * @param {number} taskId
 * @param {object} [options] - `signal`, passed to the client
 */
export function getDataExportState(taskId, options) {
  return get(`/v1/data-export/${taskId}`, options)
}

/**
 * Download a produced file. The server deletes each file after its first download (or an
 * hour after completion), so the caller keeps the blob if it may need it again.
 *
 * @param {number} taskId
 * @param {'archive'|'mapping'} type
 * @returns {Promise<Blob>}
 */
export function downloadDataExportFile(taskId, type) {
  return getBlob(`/v1/data-export/${taskId}/file?type=${type}`)
}
