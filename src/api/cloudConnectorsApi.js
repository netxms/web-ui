import { get } from './client'

export function getCloudConnectors() {
  return get('/v1/cloud-connectors')
}
