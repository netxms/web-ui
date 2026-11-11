// Parent class -> creatable child classes, as in the legacy ObjectCreateMenuManager.

const GENERIC_CONTAINER_CHILDREN = [
  'Container',
  'Collector',
  'Node',
  'Cluster',
  'Chassis',
  'Rack',
  'Sensor',
  'MobileDevice',
  'Condition',
  'Circuit',
  'CloudDomain',
  'WirelessDomain',
  'Facility',
  'Room',
]

const DEVICE_CHILDREN = ['Node', 'Chassis', 'Rack', 'Sensor']

const DATA_CENTER_PARENTS = {
  Facility: ['Container', 'PowerDomain', 'CoolingZone', 'Room', 'Cluster', ...DEVICE_CHILDREN],
  PowerDomain: ['PowerDomain', 'Cluster', ...DEVICE_CHILDREN],
  CoolingZone: ['CoolingZone', 'Cluster', ...DEVICE_CHILDREN],
  Room: DEVICE_CHILDREN,
}

const NODE_CHILDREN = ['Interface', 'NetworkService', 'VPNConnector']

const TEMPLATE_GROUP_CHILDREN = ['Template', 'TemplateGroup']
const DASHBOARD_GROUP_CHILDREN = ['Dashboard', 'DashboardGroup', 'DashboardTemplate']
const NETWORK_MAP_GROUP_CHILDREN = ['NetworkMap', 'NetworkMapGroup']
const ASSET_GROUP_CHILDREN = ['Asset', 'AssetGroup']
const BUSINESS_SERVICE_CHILDREN = ['BusinessService', 'BusinessServiceProto']

const PARENT_CLASS_CHILDREN = {
  ServiceRoot: GENERIC_CONTAINER_CHILDREN,
  Container: GENERIC_CONTAINER_CHILDREN,
  Collector: GENERIC_CONTAINER_CHILDREN,
  Node: NODE_CHILDREN,
  Network: ['Zone'],
  Zone: ['Subnet'],
  TemplateRoot: TEMPLATE_GROUP_CHILDREN,
  TemplateGroup: TEMPLATE_GROUP_CHILDREN,
  DashboardRoot: DASHBOARD_GROUP_CHILDREN,
  DashboardGroup: DASHBOARD_GROUP_CHILDREN,
  NetworkMapRoot: NETWORK_MAP_GROUP_CHILDREN,
  NetworkMapGroup: NETWORK_MAP_GROUP_CHILDREN,
  AssetRoot: ASSET_GROUP_CHILDREN,
  AssetGroup: ASSET_GROUP_CHILDREN,
  BusinessServiceRoot: BUSINESS_SERVICE_CHILDREN,
  BusinessService: BUSINESS_SERVICE_CHILDREN,
  ...DATA_CENTER_PARENTS,
}

/** @returns {string[]} */
export function getCreatableClasses(parentClass) {
  return PARENT_CLASS_CHILDREN[parentClass] ?? []
}

/** Classes with a creation dialog; the "Create" menu offers only these. */
export const IMPLEMENTED_CLASSES = new Set([
  'Container',
  'Collector',
  'AssetGroup',
  'Condition',
  'VPNConnector',
  'Template',
  'TemplateGroup',
  'Dashboard',
  'DashboardGroup',
  'DashboardTemplate',
  'NetworkMapGroup',
  'BusinessService',
  'Cluster',
  'Circuit',
  'WirelessDomain',
  'Zone',
])
