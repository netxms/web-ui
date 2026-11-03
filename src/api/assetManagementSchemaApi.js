import { get, post, put, del } from './client'

export function getAssetManagementSchema() {
  return get('/v1/asset-management-schema')
}

export function getAssetAttribute(name) {
  return get(`/v1/asset-management-schema/${name}`)
}

export function createAssetAttribute(data) {
  return post('/v1/asset-management-schema', data)
}

export function updateAssetAttribute(name, data) {
  return put(`/v1/asset-management-schema/${name}`, data)
}

export function deleteAssetAttribute(name) {
  return del(`/v1/asset-management-schema/${name}`)
}
