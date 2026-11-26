import { get, put, del } from './client'

export function getAssetProperties(objectId) {
  return get(`/v1/objects/${objectId}/asset-properties`)
}

export function updateAssetProperty(objectId, name, value) {
  return put(`/v1/objects/${objectId}/asset-properties/${encodeURIComponent(name)}`, { value })
}

export function deleteAssetProperty(objectId, name) {
  return del(`/v1/objects/${objectId}/asset-properties/${encodeURIComponent(name)}`)
}

/**
 * Link an asset to an object, or with `componentSerial` to that hardware component of a node.
 * Answers `{ assetId, linkedObjectId, componentSerial }`.
 *
 * @param {number} assetId
 * @param {{ objectId: number, componentSerial?: string, updateIdentification?: boolean }} payload
 */
export function linkAsset(assetId, payload) {
  return put(`/v1/objects/${assetId}/asset-link`, payload)
}

/** 204 also for an asset that is not linked. */
export function unlinkAsset(assetId) {
  return del(`/v1/objects/${assetId}/asset-link`)
}
