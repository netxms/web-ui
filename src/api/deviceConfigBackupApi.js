import { get, post } from './client'

/**
 * Listing backups needs only `read` on the node; their content needs `readDeviceConfig`, and a
 * refusal is audit-logged, so the view lists first and loads content lazily. 501 (provider
 * lacks the call) and 500 (provider unavailable) are rendered inline. There is no "Backup Now"
 * endpoint; legacy does it over NXCP.
 */

/**
 * Backup metadata for a node, newest first as returned by the provider.
 *
 * @param {number} objectId - Node object id.
 * @returns {Promise<Array<object>>}
 */
export function getDeviceConfigBackups(objectId) {
  return get(`/v1/objects/${objectId}/device-config-backups`)
}

/**
 * One backup including running and startup configuration content.
 *
 * Text configurations come back as UTF-8 strings; a backup with `isBinary` set carries
 * base64 instead, which this view reports as a size rather than decoding.
 *
 * @param {number} objectId - Node object id.
 * @param {number} backupId
 * @returns {Promise<object>}
 */
export function getDeviceConfigBackup(objectId, backupId) {
  return get(`/v1/objects/${objectId}/device-config-backups/${backupId}`)
}

/**
 * Push a stored backup onto a device. Runs as a background task; poll it with
 * `getBackgroundTask(taskId)`.
 *
 * `sourceObjectId` may differ from `targetObjectId` - that is the replacement-device case,
 * and the one `force` exists for: the server refuses with 409 when the two nodes have
 * different device drivers unless it is set.
 *
 * @param {number} targetObjectId - Node the configuration is applied to.
 * @param {object} options
 * @param {number} options.sourceObjectId - Node the backup belongs to.
 * @param {number} options.backupId
 * @param {boolean} [options.useStartupConfig=false] - Restore startup config instead of running.
 * @param {boolean} [options.force=false] - Apply despite a device driver mismatch.
 * @returns {Promise<{ taskId: number }>}
 */
export function restoreDeviceConfig(
  targetObjectId,
  { sourceObjectId, backupId, useStartupConfig = false, force = false },
) {
  return post(`/v1/objects/${targetObjectId}/restore-device-config`, {
    sourceObjectId,
    backupId,
    useStartupConfig,
    force,
  })
}
