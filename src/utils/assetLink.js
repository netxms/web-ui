/** Classes an asset can be linked to (server `IsValidAssetLinkTargetClass`). */
export const ASSET_LINK_TARGET_CLASSES = [
  'Node',
  'AccessPoint',
  'Chassis',
  'MobileDevice',
  'Rack',
  'Sensor',
]

/**
 * Body of `PUT /v1/objects/{assetId}/asset-link`. A component link always writes the component
 * serial into the asset, and the server ignores `updateIdentification` there.
 *
 * @param {{ objectId: number, componentSerial?: string|null, updateIdentification?: boolean }} link
 * @returns {{ objectId: number, componentSerial?: string, updateIdentification?: boolean }}
 */
export function assetLinkPayload({ objectId, componentSerial = null, updateIdentification = true }) {
  if (componentSerial) return { objectId, componentSerial }
  return { objectId, updateIdentification: Boolean(updateIdentification) }
}

/**
 * Object query for the asset linked to the object itself rather than to one of its components.
 * The object document carries no asset id. Asset attributes do not exist on other classes, so
 * the class is tested before they are read.
 *
 * @param {number} objectId
 * @returns {string}
 */
export function objectAssetQuery(objectId) {
  return `if (type != ASSET)
   return false;
return ($object->linkedObjectId == ${Number(objectId)}) and ($object->componentSerial == "");`
}

/**
 * What a new link replaces, one sentence each; empty when it replaces nothing.
 *
 * @param {object} link
 * @param {{ id: number, name: string, linkedObjectId?: number, componentSerial?: string }} link.asset
 *   - the asset's current document
 * @param {string|null} [link.assetLinkName] - name of the object the asset is linked to now
 * @param {{ id: number, name: string }} link.target
 * @param {string|null} [link.componentSerial] - for a link to a component of `target`
 * @param {{ id: number, name: string }|null} [link.currentAsset] - asset linked to the target, or
 *   to that component, now
 * @returns {string[]}
 */
export function replacedLinks({
  asset,
  assetLinkName = null,
  target,
  componentSerial = null,
  currentAsset = null,
}) {
  const notes = []
  const serial = componentSerial || ''
  const linkedObjectId = asset.linkedObjectId ?? 0
  const linkedSerial = asset.componentSerial || ''
  const alreadyHere = linkedObjectId === target.id && linkedSerial === serial
  if (linkedObjectId && !alreadyHere) {
    const linkedName = assetLinkName ?? `[${linkedObjectId}]`
    const where = linkedSerial ? `component ${linkedSerial} of "${linkedName}"` : `"${linkedName}"`
    notes.push(`Asset "${asset.name}" is linked to ${where}; this removes that link.`)
  }
  if (currentAsset && currentAsset.id !== asset.id) {
    // The server unlinks an object's previous asset, but not a component's.
    notes.push(
      serial
        ? `Component ${serial} is already linked to asset "${currentAsset.name}", which stays linked.`
        : `"${target.name}" is linked to asset "${currentAsset.name}", which will be unlinked.`,
    )
  }
  return notes
}

/**
 * Row menu items of a hardware inventory component. Only a component with a serial number can
 * be linked, as in legacy HardwareInventoryView.
 *
 * @param {{ id: number, name: string, class: string }} node
 * @param {{ serial: string|null, assetId: number|null, asset: string|null }} row
 * @param {boolean} canModify
 * @returns {object[]} PrimeVue menu items
 */
export function componentAssetMenuItems(node, row, canModify) {
  if (!canModify || !row?.serial) return []
  const dispatch = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }))
  const component = { serial: row.serial }
  const items = [
    {
      label: 'Link to asset...',
      icon: 'pi pi-link',
      command: () => dispatch('asset:linkToAsset', { object: node, component }),
    },
  ]
  if (row.assetId) {
    items.push({
      label: 'Unlink from asset',
      icon: 'pi pi-times-circle',
      command: () =>
        dispatch('asset:unlinkFromAsset', {
          object: node,
          component,
          asset: { id: row.assetId, name: row.asset },
        }),
    })
  }
  return items
}
