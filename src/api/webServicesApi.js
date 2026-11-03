import { get, post, put, del } from './client'

export function getWebServiceDefinitions() {
  return get('/v1/web-service-definitions')
}

export function getWebServiceDefinition(id) {
  return get(`/v1/web-service-definitions/${id}`)
}

export function createWebServiceDefinition(data) {
  return post('/v1/web-service-definitions', data)
}

export function updateWebServiceDefinition(id, data) {
  return put(`/v1/web-service-definitions/${id}`, data)
}

export function deleteWebServiceDefinition(id) {
  return del(`/v1/web-service-definitions/${id}`)
}
