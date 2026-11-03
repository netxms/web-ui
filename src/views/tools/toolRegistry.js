import { defineAsyncComponent } from 'vue'

/**
 * Entries without a `component` are legacy views not built yet; they are listed and render
 * behind the under-construction overlay.
 *
 * @typedef {object} ToolEntry
 * @property {string} id - URL segment, `/tools/<id>`
 * @property {string} label
 * @property {string} icon - PrimeIcons class
 * @property {string} family - TOOL_FAMILIES id, the sidebar's grouping
 * @property {string} description - one line, shown on the catalog card
 * @property {string} [requiredRight] - key from usePermissions().can; hides the tool when absent
 * @property {import('vue').Component} [component] - omit for a not-yet-built tool
 */

/** Display order. Same shape as `LOG_FAMILIES`: the two perspectives share a sidebar. */
export const TOOL_FAMILIES = [
  { id: 'search', label: 'Search' },
  { id: 'explore', label: 'Explore' },
  { id: 'other', label: 'Other' },
]

/** @type {ToolEntry[]} */
export const TOOLS = [
  {
    id: 'object-query',
    label: 'Find Object',
    icon: 'pi pi-filter',
    family: 'search',
    description:
      'Search every object by name, pattern or regular expression, narrowed by class, zone and IP range — or write the query in NXSL directly.',
    component: defineAsyncComponent(() => import('@/views/tools/ObjectQueryView.vue')),
  },
  {
    id: 'mac-search',
    label: 'MAC Address Search',
    icon: 'pi pi-sitemap',
    family: 'search',
    description:
      'Find which switch port a MAC address is connected to, by full address or leading fragment.',
    requiredRight: 'searchNetwork',
    component: defineAsyncComponent(() => import('@/views/tools/MacSearchView.vue')),
  },
  {
    id: 'ip-search',
    label: 'IP Address Search',
    icon: 'pi pi-map-marker',
    family: 'search',
    description: 'Locate an IP address across subnets and find the switch port behind it.',
  },
  {
    id: 'mib-explorer',
    label: 'MIB Explorer',
    icon: 'pi pi-share-alt',
    family: 'explore',
    // Walking a live node needs an SNMP walk/get endpoint that does not exist yet.
    description: 'Browse the SNMP MIB tree and inspect OID definitions.',
    component: defineAsyncComponent(() => import('@/views/tools/MibExplorerView.vue')),
  },
  {
    id: 'world-map',
    label: 'World Map',
    icon: 'pi pi-globe',
    family: 'explore',
    description: 'Every geolocated object on one map, with status colouring.',
    component: defineAsyncComponent(() => import('@/views/tools/WorldMapView.vue')),
  },
  {
    id: 'data-export',
    label: 'Data Export',
    icon: 'pi pi-file-export',
    family: 'other',
    // No requiredRight: the server checks read access per object and DCI, and legacy gates
    // nothing either.
    description:
      'Export the history of tagged metrics under an object as CSV files, optionally anonymized, for analysis elsewhere.',
    component: defineAsyncComponent(() => import('@/views/tools/DataExportView.vue')),
  },
]

/** @param {string} id */
export function getTool(id) {
  return TOOLS.find((tool) => tool.id === id) ?? null
}

/**
 * @param {Record<string, boolean>} can - the `can` map from usePermissions()
 * @returns {ToolEntry[]}
 */
export function getAvailableTools(can) {
  return TOOLS.filter((tool) => !tool.requiredRight || can?.[tool.requiredRight])
}

/**
 * Order within a group is the registry's own: Find Object leads because most sessions start
 * there.
 *
 * @param {ToolEntry[]} tools
 * @returns {Array<{id: string, label: string, tools: ToolEntry[]}>}
 */
export function groupToolsByFamily(tools) {
  const buckets = new Map(TOOL_FAMILIES.map((family) => [family.id, []]))
  for (const tool of tools ?? []) {
    ;(buckets.get(tool.family) ?? buckets.get('other')).push(tool)
  }
  return TOOL_FAMILIES.map((family) => ({ ...family, tools: buckets.get(family.id) })).filter(
    (family) => family.tools.length > 0,
  )
}

/**
 * For the router guard. Unknown ids return null so a bad URL reaches the view's "no such tool"
 * state.
 *
 * @param {string} id
 */
export function requiredRightForTool(id) {
  return getTool(id)?.requiredRight ?? null
}
