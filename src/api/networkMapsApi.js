import { getObject, getObjectSubTree, updateObjectNetworkMapContent } from './objectsApi'
import { serializeNetworkMapContent } from '@/utils/networkMapAdapters'
import { MOCK_MAP_IDS } from '@/utils/networkMapUtils'
import { DEMO_CONTENT_ENABLED } from '@/config/buildFlags'
import { DEMO_MAPS } from './demoSeeds'

/** Appended to the real tree so demo maps remain accessible. */
const DEMO_GROUP = {
  id: -2, // -1 is already used by dashboards DEMO_GROUP
  class: 'NetworkMapGroup',
  name: 'Demo Maps',
  status: 0,
  children: [
    { id: 600, class: 'NetworkMap', name: 'DC-Alpha Core Topology', status: 0 },
    { id: 601, class: 'NetworkMap', name: 'IP Topology – Office', status: 0 },
    { id: 602, class: 'NetworkMap', name: 'Traffic Heatmap & Storm Demo', status: 0 },
    { id: 603, class: 'NetworkMap', name: 'WAN Backbone - Europe (Geo Demo)', status: 0 },
  ],
}

export function getNetworkMapTree() {
  return getObjectSubTree(6).then((tree) => (DEMO_CONTENT_ENABLED ? [...tree, DEMO_GROUP] : tree))
}

/**
 * Demo maps are fixtures already in the internal map format, referring to no server objects.
 * @param {number|string} id
 */
export function isDemoMapId(id) {
  return DEMO_CONTENT_ENABLED && MOCK_MAP_IDS.has(Number(id))
}

/**
 * The objects the map refers to are not resolved here: `useNetworkMap` queries them one by one
 * so they share the app's object cache.
 *
 * @param {number|string} id
 * @param {object} [options] - forwarded to the client (`signal`, `priority`)
 * @returns {Promise<object>} raw API map document, or a demo fixture already in
 *   internal format - `isDemoMapId` says which.
 */
export function getNetworkMap(id, options) {
  const numId = Number(id)

  if (isDemoMapId(numId)) {
    const map = DEMO_MAPS[numId]
    if (map) return Promise.resolve(map)
    return Promise.reject(new Error(`Mock map ${numId} not found`))
  }

  return getObject(numId, options)
}

/**
 * The untouched raw JSON is the source of truth; only pending position edits are merged over it
 * (serializeNetworkMapContent). Demo maps are view-only and never get here.
 * @param {number} id
 * @param {object} map - internal map format (from adaptApiNetworkMap)
 * @param {Map<string, {x: number, y: number}>} [positionOverrides]
 */
export function saveNetworkMap(id, map, positionOverrides) {
  if (DEMO_CONTENT_ENABLED && MOCK_MAP_IDS.has(Number(id))) {
    return Promise.reject(new Error('Demo maps cannot be saved to the server'))
  }
  return updateObjectNetworkMapContent(id, serializeNetworkMapContent(map, positionOverrides))
}
