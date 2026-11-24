import cytoscape from 'cytoscape'
import { LAYOUT_RUNNERS } from '@/utils/layoutEngine'
import { MAP_LINK_COLOR_SOURCES } from '@/utils/networkMapAdapters'
import { DEFAULT_MAP_FLAGS } from '@/utils/networkMapUtils'
import { LAYOUTS, applyLayout } from '@/utils/topologyUtils'

/** Room for a map node figure and its label, so the spring layout does not pack them. */
const SPRING_NODE_SIZE = 80

/**
 * @param {{ objects?: object[], links?: object[] }} topology
 * @returns {{ nodes: Record<string, { name: string }>, edges: Record<string, { source: string, target: string }> }}
 */
function topologyGraph(topology) {
  const nodes = {}
  for (const obj of topology?.objects ?? []) nodes[String(obj.id)] = { name: obj.name ?? '' }
  const edges = {}
  ;(topology?.links ?? []).forEach((link, i) => {
    const source = String(link.object1)
    const target = String(link.object2)
    if (nodes[source] && nodes[target]) edges[`l${i}`] = { source, target }
  })
  return { nodes, edges }
}

async function springLayout(nodes, edges) {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    style: [{ selector: 'node', style: { width: SPRING_NODE_SIZE, height: SPRING_NODE_SIZE } }],
    elements: [
      ...Object.keys(nodes).map((id) => ({ data: { id }, classes: 'object' })),
      ...Object.entries(edges).map(([id, edge]) => ({
        data: { id, source: edge.source, target: edge.target },
      })),
    ],
  })
  try {
    return await LAYOUT_RUNNERS.spring(cy)
  } finally {
    cy.destroy()
  }
}

/**
 * @param {string} layout - a LAYOUTS value
 * @param {{ objects?: object[], links?: object[] }} topology - topology endpoint response
 * @param {number | null} rootId - the object the map is built around
 * @returns {Promise<Record<string, { x: number, y: number }>>} by object id
 */
export async function layoutTopology(layout, topology, rootId) {
  const { nodes, edges } = topologyGraph(topology)
  const root = rootId != null ? String(rootId) : null
  if (layout === LAYOUTS.SPRING) return springLayout(nodes, edges)
  return applyLayout(layout, nodes, edges, root).nodes
}

/**
 * The topology as a network map document (the shape `GET /v1/objects/{mapId}` returns), for
 * `adaptApiNetworkMap`. Element ids are the object ids. As in legacy ad-hoc maps, a link with an
 * interface takes its color from the interface status.
 *
 * @param {{ objects?: object[], links?: object[] }} topology - topology endpoint response
 * @param {Record<string, { x: number, y: number }>} positions - by object id; missing = origin
 * @param {{ flags?: number, objectDisplayMode?: number }} [display] - MF_* bits and
 *   MapObjectDisplayMode, as a saved map carries them
 * @returns {object}
 */
export function topologyToMapDocument(
  topology,
  positions,
  { flags = DEFAULT_MAP_FLAGS, objectDisplayMode = 0 } = {},
) {
  const objects = topology?.objects ?? []
  const present = new Set(objects.map((obj) => obj.id))
  const elements = objects.map((obj) => ({
    id: obj.id,
    type: 1,
    objectId: obj.id,
    posX: Math.round(positions?.[obj.id]?.x ?? 0),
    posY: Math.round(positions?.[obj.id]?.y ?? 0),
  }))
  const links = (topology?.links ?? [])
    .filter((link) => present.has(link.object1) && present.has(link.object2))
    .map((link) => {
      const interface1 = link.interface1 ?? 0
      const interface2 = link.interface2 ?? 0
      return {
        element1: link.object1,
        element2: link.object2,
        type: link.type ?? 0,
        name: link.name ?? '',
        connectorName1: link.port1 ?? '',
        connectorName2: link.port2 ?? '',
        interface1,
        interface2,
        colorSource:
          interface1 > 0 || interface2 > 0
            ? MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS
            : MAP_LINK_COLOR_SOURCES.DEFAULT,
        flags: link.flags ?? 0,
      }
    })
  return { flags, objectDisplayMode, elements, links }
}

/**
 * Interfaces at the link ends, for their names and statuses.
 * @param {{ links?: object[] }} topology
 * @returns {number[]}
 */
export function topologyInterfaceIds(topology) {
  const ids = new Set()
  for (const link of topology?.links ?? []) {
    if (link.interface1 > 0) ids.add(link.interface1)
    if (link.interface2 > 0) ids.add(link.interface2)
  }
  return [...ids]
}
