// Asset links of the fixtures, kept in the object store so a link or unlink shows up in every
// later read: 850 and 852 are linked to node components, 851 to a node itself, 853 to nothing.
import { COMPONENT_TREES, HARDWARE } from './nodeInventory.js'
import { getAddedObjects, getObject, patchObject } from './objectStore.js'

const FIXTURE_ASSET_IDS = [850, 851, 852, 853]

/** Classes the server links an asset to (IsValidAssetLinkTargetClass). */
const TARGET_CLASSES = ['Node', 'AccessPoint', 'Chassis', 'MobileDevice', 'Rack', 'Sensor']

function allAssets() {
  const added = getAddedObjects()
    .filter((o) => o.class === 'Asset')
    .map((o) => o.id)
  return [...FIXTURE_ASSET_IDS, ...added].map(getObject).filter(Boolean)
}

function treeSerials(component, serials) {
  if (!component) return serials
  if (component.serialNumber) serials.add(component.serialNumber)
  for (const child of component.children ?? []) treeSerials(child, serials)
  return serials
}

function componentSerials(nodeId) {
  const serials = treeSerials(COMPONENT_TREES[nodeId], new Set())
  for (const entry of HARDWARE[nodeId] ?? []) if (entry.serialNumber) serials.add(entry.serialNumber)
  return serials
}

function queryResult(asset) {
  return {
    object: { id: asset.id, name: asset.name, class: 'Asset', status: asset.status ?? 0 },
    fields: { serial: asset.componentSerial ?? '' },
  }
}

/**
 * Assets linked to an object, as `POST /v1/objects/query` returns them: with `components` those
 * linked to its components, otherwise the one linked to the object itself.
 */
export function linkedAssets(objectId, { components }) {
  return allAssets()
    .filter((a) => a.linkedObjectId === objectId && Boolean(a.componentSerial) === components)
    .map(queryResult)
}

/** PUT /v1/objects/{assetId}/asset-link, with the server's checks and answers. */
export function linkAsset(assetId, body, res) {
  const fail = (status, reason) => {
    res.statusCode = status
    return { reason }
  }
  const asset = getObject(assetId)
  if (!asset) return fail(404, 'Invalid object ID')
  if (asset.class !== 'Asset') return fail(400, 'Object is not an asset')
  const target = body?.objectId ? getObject(body.objectId) : null
  if (!target) return fail(400, 'Invalid object ID')
  const serial = body.componentSerial ?? ''
  if (serial) {
    if (target.class !== 'Node') return fail(400, 'Asset can be linked only to component of a node')
    if (!componentSerials(target.id).has(serial)) {
      return fail(400, `Component with serial number ${serial} not found in node inventory`)
    }
  } else {
    if (!TARGET_CLASSES.includes(target.class)) {
      return fail(400, 'Asset cannot be linked to object of this class')
    }
    for (const other of allAssets()) {
      if (other.id !== assetId && other.linkedObjectId === target.id && !other.componentSerial) {
        patchObject(other.id, { linkedObjectId: 0, componentSerial: '' })
      }
    }
  }
  patchObject(assetId, { linkedObjectId: target.id, componentSerial: serial })
  return { assetId, linkedObjectId: target.id, componentSerial: serial }
}

/** DELETE /v1/objects/{assetId}/asset-link: 204 also when the asset is not linked. */
export function unlinkAsset(assetId, res) {
  const asset = getObject(assetId)
  if (!asset) {
    res.statusCode = 404
    return { reason: 'Invalid object ID' }
  }
  if (asset.class !== 'Asset') {
    res.statusCode = 400
    return { reason: 'Object is not an asset' }
  }
  patchObject(assetId, { linkedObjectId: 0, componentSerial: '' })
  res.statusCode = 204
  res.end()
}
