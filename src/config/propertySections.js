const sectionComponents = {
  general: () => import('@/components/properties/sections/GeneralSection.vue'),
  'access-rights': () => import('@/components/properties/sections/AccessControlSection.vue'),
  'auto-bind': () => import('@/components/properties/sections/AutoBindSection.vue'),
  'auto-apply-rules': () => import('@/components/properties/sections/AutoApplyRulesSection.vue'),
  'custom-attributes': () => import('@/components/properties/sections/CustomAttributesSection.vue'),
  'dashboards-maps': () => import('@/components/properties/sections/DashboardsMapsSection.vue'),
  'external-resources': () =>
    import('@/components/properties/sections/ExternalResourcesSection.vue'),
  location: () => import('@/components/properties/sections/LocationSection.vue'),
  'map-appearance': () => import('@/components/properties/sections/MapAppearanceSection.vue'),
  'responsible-users': () => import('@/components/properties/sections/ResponsibleUsersSection.vue'),
  'status-calculation': () =>
    import('@/components/properties/sections/StatusCalculationSection.vue'),
  'trusted-objects': () => import('@/components/properties/sections/TrustedObjectsSection.vue'),
  communication: () => import('@/components/properties/sections/CommunicationSection.vue'),
  polling: () => import('@/components/properties/sections/PollingSection.vue'),
  'interface-polling': () => import('@/components/properties/sections/InterfacePollingSection.vue'),
  'business-service-polling': () =>
    import('@/components/properties/sections/BusinessServicePollingSection.vue'),
  'object-auto-bind': () => import('@/components/properties/sections/ObjectAutoBindSection.vue'),
  'dci-auto-bind': () => import('@/components/properties/sections/DciAutoBindSection.vue'),
  'instance-discovery': () =>
    import('@/components/properties/sections/InstanceDiscoverySection.vue'),
  'expected-capabilities': () => import('@/components/properties/sections/PlaceholderSection.vue'),
  'port-stop-list': () => import('@/components/properties/sections/PlaceholderSection.vue'),
  'rack-chassis': () => import('@/components/properties/sections/RackChassisSection.vue'),
  elements: () => import('@/components/properties/sections/DashboardElementsSection.vue'),
  'object-context': () =>
    import('@/components/properties/sections/DashboardObjectContextSection.vue'),
}

const COMMON_SECTIONS = [
  {
    id: 'general',
    label: 'General',
    icon: 'pi pi-info-circle',
    group: 'Basic',
  },
  {
    id: 'access-rights',
    label: 'Access Rights',
    icon: 'pi pi-lock',
    group: 'Basic',
  },
  {
    id: 'custom-attributes',
    label: 'Custom Attributes',
    icon: 'pi pi-tags',
    group: 'Basic',
  },
  {
    id: 'location',
    label: 'Location',
    icon: 'pi pi-map-marker',
    group: 'Basic',
  },
  {
    id: 'map-appearance',
    label: 'Map Appearance',
    icon: 'pi pi-image',
    group: 'Display',
  },
  {
    id: 'dashboards-maps',
    label: 'Dashboards & Maps',
    icon: 'pi pi-th-large',
    group: 'Display',
  },
  {
    id: 'external-resources',
    label: 'External Resources',
    icon: 'pi pi-external-link',
    group: 'Display',
  },
  {
    id: 'responsible-users',
    label: 'Responsible Users',
    icon: 'pi pi-users',
    group: 'Advanced',
  },
  {
    id: 'status-calculation',
    label: 'Status Calculation',
    icon: 'pi pi-calculator',
    group: 'Advanced',
  },
  {
    id: 'trusted-objects',
    label: 'Trusted Objects',
    icon: 'pi pi-shield',
    group: 'Advanced',
  },
]

const AUTO_BIND_SECTION = {
  id: 'auto-bind',
  label: 'Automatic Bind Rules',
  icon: 'pi pi-bolt',
  group: 'Advanced',
}

const AUTO_APPLY_RULES_SECTION = {
  id: 'auto-apply-rules',
  label: 'Automatic Apply Rules',
  icon: 'pi pi-bolt',
  group: 'Advanced',
}

const BUSINESS_SERVICE_POLLING_SECTION = {
  id: 'business-service-polling',
  label: 'Polling',
  icon: 'pi pi-sync',
  group: 'Advanced',
}

const OBJECT_AUTO_BIND_SECTION = {
  id: 'object-auto-bind',
  label: 'Object Auto Bind',
  icon: 'pi pi-bolt',
  group: 'Advanced',
}

const DCI_AUTO_BIND_SECTION = {
  id: 'dci-auto-bind',
  label: 'DCI Auto Bind',
  icon: 'pi pi-bolt',
  group: 'Advanced',
}

const INSTANCE_DISCOVERY_SECTION = {
  id: 'instance-discovery',
  label: 'Instance Discovery',
  icon: 'pi pi-search',
  group: 'Advanced',
}

const TEMPLATE_BASE_SECTIONS = [
  {
    id: 'general',
    label: 'General',
    icon: 'pi pi-info-circle',
    group: 'Basic',
  },
  {
    id: 'access-rights',
    label: 'Access Rights',
    icon: 'pi pi-lock',
    group: 'Basic',
  },
  {
    id: 'custom-attributes',
    label: 'Custom Attributes',
    icon: 'pi pi-tags',
    group: 'Basic',
  },
  {
    id: 'external-resources',
    label: 'External Resources',
    icon: 'pi pi-external-link',
    group: 'Display',
  },
  {
    id: 'responsible-users',
    label: 'Responsible Users',
    icon: 'pi pi-users',
    group: 'Advanced',
  },
  {
    id: 'trusted-objects',
    label: 'Trusted Objects',
    icon: 'pi pi-shield',
    group: 'Advanced',
  },
]

const ASSET_BASE_SECTIONS = [
  {
    id: 'general',
    label: 'General',
    icon: 'pi pi-info-circle',
    group: 'Basic',
  },
  {
    id: 'access-rights',
    label: 'Access Rights',
    icon: 'pi pi-lock',
    group: 'Basic',
  },
  {
    id: 'custom-attributes',
    label: 'Custom Attributes',
    icon: 'pi pi-tags',
    group: 'Basic',
  },
  {
    id: 'external-resources',
    label: 'External Resources',
    icon: 'pi pi-external-link',
    group: 'Display',
  },
  {
    id: 'map-appearance',
    label: 'Map Appearance',
    icon: 'pi pi-image',
    group: 'Display',
  },
  {
    id: 'responsible-users',
    label: 'Responsible Users',
    icon: 'pi pi-users',
    group: 'Advanced',
  },
  {
    id: 'trusted-objects',
    label: 'Trusted Objects',
    icon: 'pi pi-shield',
    group: 'Advanced',
  },
]

const BUSINESS_SERVICE_BASE_SECTIONS = [
  {
    id: 'general',
    label: 'General',
    icon: 'pi pi-info-circle',
    group: 'Basic',
  },
  {
    id: 'access-rights',
    label: 'Access Rights',
    icon: 'pi pi-lock',
    group: 'Basic',
  },
  {
    id: 'custom-attributes',
    label: 'Custom Attributes',
    icon: 'pi pi-tags',
    group: 'Basic',
  },
  {
    id: 'external-resources',
    label: 'External Resources',
    icon: 'pi pi-external-link',
    group: 'Display',
  },
  {
    id: 'map-appearance',
    label: 'Map Appearance',
    icon: 'pi pi-image',
    group: 'Display',
  },
  {
    id: 'responsible-users',
    label: 'Responsible Users',
    icon: 'pi pi-users',
    group: 'Advanced',
  },
  {
    id: 'status-calculation',
    label: 'Status Calculation',
    icon: 'pi pi-calculator',
    group: 'Advanced',
  },
  {
    id: 'trusted-objects',
    label: 'Trusted Objects',
    icon: 'pi pi-shield',
    group: 'Advanced',
  },
]

const CONTAINER_SECTIONS = [
  AUTO_BIND_SECTION,
  {
    id: 'port-stop-list',
    label: 'Port Stop List',
    icon: 'pi pi-ban',
    group: 'Advanced',
  },
]

const NODE_SECTIONS = [
  {
    id: 'communication',
    label: 'Communication',
    icon: 'pi pi-wifi',
    group: 'Network',
  },
  {
    id: 'polling',
    label: 'Polling',
    icon: 'pi pi-sync',
    group: 'Network',
  },
  {
    id: 'expected-capabilities',
    label: 'Expected Capabilities',
    icon: 'pi pi-check-square',
    group: 'Network',
  },
]

// Its own id: the Node section of the same name edits a different document.
const INTERFACE_POLLING_SECTION = {
  id: 'interface-polling',
  label: 'Polling',
  icon: 'pi pi-sync',
  group: 'Network',
}

// The server rejects physicalPlacement for any class but Node and Chassis (400), so this is not
// part of NODE_SECTIONS, which MobileDevice, Sensor and Cluster reuse.
const PLACEMENT_SECTION = {
  id: 'rack-chassis',
  label: 'Rack / Chassis',
  icon: 'pi pi-server',
  group: 'Network',
}

const CLUSTER_SECTIONS = [...NODE_SECTIONS, AUTO_BIND_SECTION]

const NETWORK_MAP_GROUP_SECTIONS = COMMON_SECTIONS.filter(
  (s) => s.id !== 'location' && s.id !== 'dashboards-maps',
)

const DASHBOARD_GROUP_SECTIONS = COMMON_SECTIONS.filter(
  (s) => s.id !== 'location' && s.id !== 'dashboards-maps' && s.id !== 'status-calculation',
)

const DASHBOARD_ELEMENTS_SECTION = {
  id: 'elements',
  label: 'Elements',
  icon: 'pi pi-th-large',
  group: 'Basic',
}

const OBJECT_CONTEXT_SECTION = {
  id: 'object-context',
  label: 'Object Context',
  icon: 'pi pi-sitemap',
  group: 'Advanced',
}

const DASHBOARD_SECTIONS = [
  { id: 'general', label: 'General', icon: 'pi pi-info-circle', group: 'Basic' },
  DASHBOARD_ELEMENTS_SECTION,
  { id: 'access-rights', label: 'Access Rights', icon: 'pi pi-lock', group: 'Basic' },
  { id: 'custom-attributes', label: 'Custom Attributes', icon: 'pi pi-tags', group: 'Basic' },
  {
    id: 'external-resources',
    label: 'External Resources',
    icon: 'pi pi-external-link',
    group: 'Display',
  },
  { id: 'map-appearance', label: 'Map Appearance', icon: 'pi pi-image', group: 'Display' },
  OBJECT_CONTEXT_SECTION,
  AUTO_BIND_SECTION,
  { id: 'responsible-users', label: 'Responsible Users', icon: 'pi pi-users', group: 'Advanced' },
  { id: 'trusted-objects', label: 'Trusted Objects', icon: 'pi pi-shield', group: 'Advanced' },
]

const CLASS_EXTRA_SECTIONS = {
  Node: [...NODE_SECTIONS, PLACEMENT_SECTION],
  Chassis: [PLACEMENT_SECTION],
  Interface: [INTERFACE_POLLING_SECTION],
  Container: CONTAINER_SECTIONS,
  Cluster: CLUSTER_SECTIONS,
  MobileDevice: NODE_SECTIONS,
  Sensor: NODE_SECTIONS,
  NetworkMap: [AUTO_BIND_SECTION],
  Collector: [AUTO_BIND_SECTION],
  Circuit: [AUTO_BIND_SECTION],
}

const CLASS_SECTIONS_OVERRIDE = {
  NetworkMapGroup: NETWORK_MAP_GROUP_SECTIONS,
  DashboardGroup: DASHBOARD_GROUP_SECTIONS,
  NetworkMapRoot: NETWORK_MAP_GROUP_SECTIONS,
  DashboardRoot: DASHBOARD_GROUP_SECTIONS,
  Dashboard: DASHBOARD_SECTIONS,
  TemplateRoot: TEMPLATE_BASE_SECTIONS,
  TemplateGroup: TEMPLATE_BASE_SECTIONS,
  Template: [...TEMPLATE_BASE_SECTIONS, AUTO_APPLY_RULES_SECTION],
  Asset: ASSET_BASE_SECTIONS,
  AssetGroup: ASSET_BASE_SECTIONS,
  AssetRoot: ASSET_BASE_SECTIONS,
  BusinessServiceRoot: BUSINESS_SERVICE_BASE_SECTIONS,
  BusinessService: [
    ...BUSINESS_SERVICE_BASE_SECTIONS,
    BUSINESS_SERVICE_POLLING_SECTION,
    OBJECT_AUTO_BIND_SECTION,
    DCI_AUTO_BIND_SECTION,
  ],
  BusinessServicePrototype: [
    ...BUSINESS_SERVICE_BASE_SECTIONS,
    BUSINESS_SERVICE_POLLING_SECTION,
    OBJECT_AUTO_BIND_SECTION,
    DCI_AUTO_BIND_SECTION,
    INSTANCE_DISCOVERY_SECTION,
  ],
}

export const GROUP_ORDER = ['Basic', 'Network', 'Display', 'Advanced']

/**
 * @param {string} objectClass
 */
export function getSectionsForClass(objectClass) {
  const override = CLASS_SECTIONS_OVERRIDE[objectClass]
  const extra = CLASS_EXTRA_SECTIONS[objectClass] ?? []
  const allSections = override ? [...override] : [...COMMON_SECTIONS, ...extra]

  const groupIndex = (s) => {
    const idx = GROUP_ORDER.indexOf(s.group)
    return idx === -1 ? GROUP_ORDER.length : idx
  }
  allSections.sort((a, b) => groupIndex(a) - groupIndex(b))

  return allSections.map((section) => ({
    ...section,
    component: sectionComponents[section.id],
  }))
}

/**
 * @param {Array} sections
 * @returns {Array<{ label: string, sections: Array }>}
 */
export function groupSections(sections) {
  const groups = []
  const seen = new Set()

  for (const section of sections) {
    if (!seen.has(section.group)) {
      seen.add(section.group)
      groups.push({
        label: section.group,
        sections: sections.filter((s) => s.group === section.group),
      })
    }
  }

  return groups
}
