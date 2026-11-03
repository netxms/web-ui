export const TOPOLOGY_TYPES = {
  L2: 'l2',
  IP: 'ip',
  OSPF: 'ospf',
  INTERNAL: 'internal',
}

export const TOPOLOGY_TYPE_LABELS = {
  l2: 'Layer 2',
  ip: 'IP',
  ospf: 'OSPF',
  internal: 'Internal',
}

export const LAYOUTS = {
  RADIAL: 'radial',
  GRID: 'grid',
  TREE_V: 'tree-v',
  TREE_H: 'tree-h',
}

export const LAYOUT_LABELS = {
  radial: 'Radial',
  grid: 'Grid',
  'tree-v': 'Tree ↓',
  'tree-h': 'Tree →',
}

/** PrimeIcons font codepoints. */
const CLASS_ICON_CODEPOINTS = {
  Node: '\ue9e4',
  Interface: '\ue96f',
  Subnet: '\ue97a',
  Zone: '\ue968',
  Cluster: '\ue918',
  Container: '\ue963',
  Rack: '\ue91d',
  Collector: '\ue963',
  AccessPoint: '\ue96f',
  Sensor: '\uea0c',
  NetworkService: '\ue94f',
  MobileDevice: '\ue983',
  NetworkMap: '\ue9c2',
  Template: '\ue906',
  Dashboard: '\ue918',
}

/**
 * @param {string} objectClass
 * @returns {string}
 */
export function getClassIconCodepoint(objectClass) {
  return CLASS_ICON_CODEPOINTS[objectClass] ?? '\ue9dc'
}

const TOPO_LINK_COLORS = {
  0: '#94a3b8', // normal — slate
  1: '#8b5cf6', // VPN — purple
  2: '#94a3b8', // multilink — same as normal, but wider
  3: '#ef4444', // agent tunnel — red
  4: '#22c55e', // agent proxy — green
  5: '#06b6d4', // SSH proxy — cyan
  6: '#eab308', // SNMP proxy — yellow
  7: '#f97316', // ICMP proxy — orange
  8: '#10b981', // sensor proxy — emerald
  9: '#6366f1', // zone proxy — indigo
  10: '#0ea5e9', // WiFi client — sky blue
}

const TOPO_LINK_DASH = {
  1: '8 4', // VPN dashed
  5: '4 3', // SSH proxy short dash
}

/**
 * @param {{ type: number }} link
 * @returns {string} hex color
 */
export function getTopoLinkColor(link) {
  return TOPO_LINK_COLORS[link.type] ?? '#94a3b8'
}

/**
 * @param {{ type: number }} link
 * @returns {string} stroke-dasharray
 */
export function getTopoLinkDash(link) {
  return TOPO_LINK_DASH[link.type] ?? '0'
}

/**
 * @param {{ type: number }} link
 * @returns {number}
 */
export function getTopoLinkWidth(link) {
  return link.type === 2 ? 4 : 2 // multilink = thicker
}

/**
 * IPv4 addresses kept as-is, FQDNs cut to the hostname, anything over 20 chars ellipsized.
 * @param {string} name
 * @returns {string}
 */
export function computeDisplayName(name) {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/.test(name)) return name
  const dotIndex = name.indexOf('.')
  const short = dotIndex !== -1 ? name.slice(0, dotIndex) : name
  return short.length > 20 ? short.slice(0, 20) + '...' : short
}

/**
 * @param {{ objects: object[] }} topologyMap
 * @returns {Record<string, object>}
 */
export function topologyToNodes(topologyMap) {
  const nodes = {}
  for (const obj of topologyMap.objects ?? []) {
    const displayName = computeDisplayName(obj.name)
    nodes[String(obj.id)] = {
      name: obj.name,
      displayName,
      objectId: obj.id,
      objectClass: obj.class,
      objectStatus: obj.status,
    }
  }
  return nodes
}

/**
 * Deduplicates bidirectional links (same pair, different direction).
 * @param {{ links: object[] }} topologyMap
 * @returns {Record<string, object>}
 */
export function topologyToEdges(topologyMap) {
  const edges = {}
  const seen = new Set()
  let counter = 0
  for (const link of topologyMap.links ?? []) {
    const a = Math.min(link.object1, link.object2)
    const b = Math.max(link.object1, link.object2)
    const key = `${a}-${b}-${link.type}`
    if (seen.has(key)) continue
    seen.add(key)
    const id = `e${++counter}`
    edges[id] = {
      source: String(link.object1),
      target: String(link.object2),
      type: link.type,
      label: link.name || null,
      port1: link.port1 || null,
      port2: link.port2 || null,
    }
  }
  return edges
}

/**
 * BFS rings centered on rootId, ring n at radius n * RING_RADIUS.
 * @param {Record<string, object>} nodes
 * @param {Record<string, object>} edges
 * @param {string|null} rootId
 * @returns {{ nodes: Record<string, {x: number, y: number}> }}
 */
function applyRadialLayout(nodes, edges, rootId) {
  const ids = Object.keys(nodes)
  if (ids.length === 0) return { nodes: {} }

  const RING_RADIUS = 220

  const adj = {}
  for (const id of ids) adj[id] = new Set()
  for (const edge of Object.values(edges)) {
    if (adj[edge.source] && adj[edge.target]) {
      adj[edge.source].add(edge.target)
      adj[edge.target].add(edge.source)
    }
  }

  const start = rootId && nodes[rootId] ? String(rootId) : ids[0]
  const rings = [[start]]
  const visited = new Set([start])

  while (true) {
    const prev = rings[rings.length - 1]
    const next = []
    for (const id of prev) {
      for (const nb of adj[id] ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          next.push(nb)
        }
      }
    }
    if (next.length === 0) break
    rings.push(next)
  }

  const disconnected = ids.filter((id) => !visited.has(id))
  if (disconnected.length > 0) rings.push(disconnected)

  const positions = {}
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]
    if (r === 0) {
      positions[ring[0]] = { x: 0, y: 0 }
      continue
    }
    const radius = r * RING_RADIUS
    for (let i = 0; i < ring.length; i++) {
      const angle = (2 * Math.PI * i) / ring.length - Math.PI / 2
      positions[ring[i]] = {
        x: Math.round(radius * Math.cos(angle)),
        y: Math.round(radius * Math.sin(angle)),
      }
    }
  }

  return { nodes: positions }
}

/**
 * @param {Record<string, object>} nodes
 * @returns {{ nodes: Record<string, {x: number, y: number}> }}
 */
function applyGridLayout(nodes) {
  const SPACING = 220
  const ids = Object.keys(nodes).sort((a, b) =>
    (nodes[a].name ?? a).localeCompare(nodes[b].name ?? b),
  )
  if (ids.length === 0) return { nodes: {} }

  const cols = Math.ceil(Math.sqrt(ids.length))
  const positions = {}
  ids.forEach((id, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions[id] = {
      x: col * SPACING - ((cols - 1) * SPACING) / 2,
      y: row * SPACING,
    }
  })
  return { nodes: positions }
}

/**
 * BFS levels; with 10+ nodes each level is staggered into 2 tiers, 30+ into 3, to keep the
 * layout from getting too wide.
 * @param {Record<string, object>} nodes
 * @param {Record<string, object>} edges
 * @param {string|null} rootId
 * @param {'TB'|'LR'} direction
 * @returns {{ nodes: Record<string, {x: number, y: number}> }}
 */
function applyTreeLayout(nodes, edges, rootId, direction = 'TB') {
  const ids = Object.keys(nodes)
  if (ids.length === 0) return { nodes: {} }

  const tierCount = ids.length >= 30 ? 3 : ids.length >= 10 ? 2 : 1
  const NODE_SPACING = tierCount === 3 ? 90 : tierCount === 2 ? 120 : 180
  const TIER_OFFSET = tierCount === 3 ? 55 : tierCount === 2 ? 60 : 0
  // Expand level spacing to accommodate tiers without overlapping the next level
  const LEVEL_SPACING = (tierCount === 1 ? 220 : 180) + TIER_OFFSET * (tierCount - 1)

  const adj = {}
  for (const id of ids) adj[id] = new Set()
  for (const edge of Object.values(edges)) {
    if (adj[edge.source] && adj[edge.target]) {
      adj[edge.source].add(edge.target)
      adj[edge.target].add(edge.source)
    }
  }

  const start = rootId && nodes[rootId] ? String(rootId) : ids[0]
  const levels = { [start]: 0 }
  const parent = {}
  const queue = [start]
  const order = []

  while (queue.length > 0) {
    const id = queue.shift()
    order.push(id)
    const lvl = levels[id]
    const children = [...(adj[id] ?? [])].filter((nb) => !(nb in levels))
    children.sort((a, b) => (nodes[a].name ?? a).localeCompare(nodes[b].name ?? b))
    for (const child of children) {
      levels[child] = lvl + 1
      parent[child] = id
      queue.push(child)
    }
  }

  const disconnected = ids.filter((id) => !(id in levels))
  const maxLevel = Math.max(0, ...Object.values(levels))
  disconnected.forEach((id) => {
    levels[id] = maxLevel + 1
  })

  const byLevel = {}
  for (const id of [...order, ...disconnected]) {
    const lvl = levels[id]
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(id)
  }

  const positions = {}
  for (const [lvl, group] of Object.entries(byLevel)) {
    const baseDepth = Number(lvl) * LEVEL_SPACING
    const offset = ((group.length - 1) * NODE_SPACING) / 2
    group.forEach((id, i) => {
      const cross = i * NODE_SPACING - offset
      const tier = tierCount > 1 ? (i % tierCount) * TIER_OFFSET : 0
      positions[id] =
        direction === 'TB' ? { x: cross, y: baseDepth + tier } : { x: baseDepth + tier, y: cross }
    })
  }

  return { nodes: positions }
}

/**
 * @param {string} layout  'radial' | 'grid' | 'tree-v' | 'tree-h'
 * @param {Record<string, object>} nodes
 * @param {Record<string, object>} edges
 * @param {string|null} rootId
 * @returns {{ nodes: Record<string, {x: number, y: number}> }}
 */
export function applyLayout(layout, nodes, edges, rootId) {
  switch (layout) {
    case LAYOUTS.GRID:
      return applyGridLayout(nodes)
    case LAYOUTS.TREE_V:
      return applyTreeLayout(nodes, edges, rootId, 'TB')
    case LAYOUTS.TREE_H:
      return applyTreeLayout(nodes, edges, rootId, 'LR')
    case LAYOUTS.RADIAL:
    default:
      return applyRadialLayout(nodes, edges, rootId)
  }
}
