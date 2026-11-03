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
