import { get, post, patch, del } from './client'
import { dciOriginForWrite, dciOriginName } from '@/utils/dciCodes'

const base = (objectId) => `/v1/objects/${objectId}/data-collection/configuration`

/** A DCI configuration as read: `origin` by its current name, whatever the server calls it. */
function adaptDciConfig(config) {
  return config?.origin == null ? config : { ...config, origin: dciOriginName(config.origin) }
}

/** A DCI configuration (or merge-patch) as written; see `dciOriginForWrite`. */
function serializeDciConfig(data) {
  return data?.origin == null ? data : { ...data, origin: dciOriginForWrite(data.origin) }
}

export async function listDciConfig(objectId) {
  const list = await get(base(objectId))
  return Array.isArray(list) ? list.map(adaptDciConfig) : list
}

export async function getDciConfig(objectId, dciId) {
  return adaptDciConfig(await get(`${base(objectId)}/${dciId}`))
}

export async function createDci(objectId, data) {
  return adaptDciConfig(await post(base(objectId), serializeDciConfig(data)))
}

export async function updateDci(objectId, dciId, data) {
  return adaptDciConfig(await patch(`${base(objectId)}/${dciId}`, serializeDciConfig(data)))
}

export function deleteDci(objectId, dciId) {
  return del(`${base(objectId)}/${dciId}`)
}

/**
 * OTLP metrics the server has seen pushed for a node: `[{ name, type, attributeKeys }]`, `type`
 * being `gauge`, `sum` or `histogram`. The OTLP server module registers this route itself, so
 * it is missing from openapi.yaml and a server without the module answers 404.
 */
export function getOtlpMetrics(objectId) {
  return get(`/v1/objects/${objectId}/otlp-metrics`)
}

/**
 * What a node reported at its last configuration poll, empty before one. `source` is `agent` for
 * `{ metrics, tables, lists }` or `device-driver` for `{ metrics }`. Templates and clusters get
 * the merged lists of all nodes; an object class without lists answers 400.
 */
export function getAvailableMetrics(objectId, source) {
  return get(`/v1/objects/${objectId}/data-collection/available-metrics/${source}`)
}
