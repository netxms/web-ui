/**
 * Normalizes raw /v1/objects responses into default-safe shapes. adaptObject(raw) dispatches by
 * class; tree and list queries use the lighter adaptBaseObject(raw).
 */

import { stripMarkdownPrefix, withMarkdownPrefix } from '@/utils/commentsUtils'
import {
  dciDataTypeCode,
  dciObjectTypeCode,
  dciOriginCode,
  dciOriginName,
  dciSeverityCode,
  dciStatusCode,
} from '@/utils/dciCodes'
import { MAP_FLAGS, parseMapFlags } from '@/utils/networkMapAdapters'
import { PROPERTY_GROUPS, adaptPropertyGroup } from '@/utils/dataCenterProperties'

const NULL_GUID = '00000000-0000-0000-0000-000000000000'
function guid(v) {
  return v && v !== NULL_GUID ? v : null
}

/** Object class code → class name string (for layout endpoints that return integer codes). */
const CLASS_CODE_TO_NAME = {
  2: 'Node',
  5: 'Container',
  19: 'NetworkMap',
  20: 'NetworkMapRoot',
  23: 'Dashboard',
  24: 'DashboardRoot',
  27: 'Rack',
  28: 'Chassis',
}

const PASSIVE_TYPE_MAP = { 0: 'PatchPanel', 1: 'FilterPanel', 2: 'Organizer', 3: 'PDU' }
const PASSIVE_TYPE_REVERSE = { PatchPanel: 0, FilterPanel: 1, Organizer: 2, PDU: 3 }
const RACK_ORIENTATION_MAP = { 0: 'full', 1: 'front', 2: 'back' }
const RACK_ORIENTATION_REVERSE = { full: 0, front: 1, back: 2 }

const HP_TO_MM = 5.08
const RU_TO_MM = 44.45

/** Fields present on every object class. */
export function adaptBaseObject(raw) {
  return {
    id: raw.id,
    guid: raw.guid ?? '',
    class: raw.class,
    name: raw.name ?? '',
    alias: raw.alias ?? '',
    status: raw.status ?? 0,
    category: raw.category ?? raw.categoryId ?? 0,
    timestamp: raw.timestamp ?? null,
    creationTime: raw.creationTime ?? null,
    children: (raw.children ?? []).map(adaptBaseObject),
    parents: raw.parents ?? [],
    ipAddress: raw.ipAddress ?? null,
    // The legacy markdown indicator prefix is an encoding detail — strip it here so
    // every consumer sees clean text (re-applied on write in objectToApiPayload).
    comments: stripMarkdownPrefix(raw.comments),
    commentsSource: stripMarkdownPrefix(raw.commentsSource),
    customAttributes: raw.customAttributes ?? [],
    accessList: raw.accessList ?? [],
    // Server-resolved rights, one boolean per right, inherited ones included. `null` means the
    // server did not say (older build, embedded summary) and consumers assume "allowed"; all
    // false is a real answer. See @/auth/objectAccessRights.
    effectiveRights: raw.effectiveRights ?? null,
    // Per-poll-type state; present only on pollable classes (nodes, sensors, interfaces).
    pollStates: raw.pollStates ?? null,
    geoLocation: raw.geoLocation
      ? {
          type: raw.geoLocation.type ?? 0,
          latitude: raw.geoLocation.latitude ?? 0,
          longitude: raw.geoLocation.longitude ?? 0,
          accuracy: raw.geoLocation.accuracy ?? 0,
          timestamp: raw.geoLocation.timestamp ?? null,
        }
      : null,
    postalAddress: {
      country: raw.postalAddress?.country ?? '',
      region: raw.postalAddress?.region ?? '',
      city: raw.postalAddress?.city ?? '',
      district: raw.postalAddress?.district ?? '',
      streetAddress: raw.postalAddress?.streetAddress ?? '',
      postcode: raw.postalAddress?.postcode ?? '',
    },
    locationEventEnabled: raw.locationEventEnabled ?? false,
    locationControlMode: raw.locationControlMode ?? 0,
    locationAreaIds: raw.locationAreaIds ?? [],
    dashboards: raw.dashboards ?? [],
    urls: raw.urls ?? [],
    responsibleUsers: raw.responsibleUsers ?? [],
    aiHint: raw.aiHint ?? '',
    nameOnMap: raw.nameOnMap ?? null,
    mapImage: guid(raw.mapImage),
    drilldownObjectId: raw.drilldownObjectId ?? 0,
    inheritAccessRights: raw.inheritAccessRights ?? true,
    trustedObjects: raw.trustedObjects ?? [],
    autoBindFilters: [0, 1].map((i) => ({
      autoBind: raw.autoBindFilters?.[i]?.autoBind ?? false,
      autoUnbind: raw.autoBindFilters?.[i]?.autoUnbind ?? false,
      source: raw.autoBindFilters?.[i]?.source ?? '',
    })),
    maintenanceEventId: raw.maintenanceEventId ?? 0,
    maintenanceInitiator: raw.maintenanceInitiator ?? 0,
    isInMaintenanceMode: raw.isInMaintenanceMode ?? false,
    isMaintenanceApplicable: raw.isMaintenanceApplicable ?? false,
    flags: raw.flags ?? 0,
    calcAlg: raw.statusCalcAlg ?? 0,
    propAlg: raw.statusPropAlg ?? 0,
    fixedStatus: raw.fixedStatus ?? 0,
    shift: raw.statusShift ?? 0,
    singleThreshold: raw.statusSingleThreshold ?? 0,
    translation: raw.statusTranslation ?? [0, 0, 0, 0],
    thresholds: raw.statusThresholds ?? [0, 0, 0, 0],
  }
}

/**
 * Zone. `uin` is the zone's own zoneUIN (distinct from the `zoneUIN` field on
 * node-like objects, which references the zone they belong to).
 * @param {object} base - result of adaptBaseObject
 * @param {object} raw
 * @returns {object}
 */
function adaptZone(base, raw) {
  return {
    ...base,
    uin: raw.uin ?? 0,
  }
}

/**
 * Newer servers send a `physicalPlacement` group, older ones only the flat keys
 * (`physicalContainerId` on a Node, `rackId` on a Chassis), so both are read. A stored height of
 * 0 (what the console stores inside a chassis) reads as 1; sending height < 1 back is a 400.
 *
 * @param {object} raw
 * @returns {object}
 */
function adaptPhysicalPlacement(raw) {
  const group = raw.physicalPlacement ?? null
  const chassisPlacement = group
    ? (group.chassisPlacement ?? null)
    : (raw.chassisPlacementConfig ?? null)
  return {
    containerId: group?.containerId ?? raw.physicalContainerId ?? raw.rackId ?? 0,
    position: group?.position ?? raw.rackPosition ?? 0,
    height: Math.max(1, group?.height ?? raw.rackHeight ?? 1),
    orientation: group?.orientation ?? raw.rackOrientation ?? 0,
    imageFront: guid(group ? group.imageFront : raw.rackImageFront),
    imageRear: guid(group ? group.imageRear : raw.rackImageRear),
    chassisPlacement: chassisPlacement ? { ...chassisPlacement } : null,
  }
}

/**
 * Node, Cluster, MobileDevice, Sensor, AccessPoint, Chassis.
 * @param {object} base - result of adaptBaseObject
 * @param {object} raw
 * @returns {object}
 */
function adaptNodeLike(base, raw) {
  return {
    ...base,
    ipAddress: raw.ipAddress ?? null,
    primaryName: raw.primaryName ?? '',
    type: raw.type ?? '',
    subType: raw.subType ?? '',
    zoneUIN: raw.zoneUIN ?? 0,
    // Agent — the API nests these under `agent`; the flat fallbacks cover older responses.
    agentPort: raw.agent?.port ?? raw.agentPort ?? 0,
    agentVersion: raw.agentVersion ?? '',
    agentCompressionMode: raw.agent?.compressionMode ?? raw.agentCompressionMode ?? 0,
    agentProxyNodeId: raw.agent?.proxy ?? raw.agentProxyNodeId ?? 0,
    // SNMP — likewise nested under `snmp`. `version` arrives as a symbolic name ('2c').
    // No invented default port: an absent value means "not reported", not 161.
    snmpVersion: raw.snmp?.version ?? raw.snmpVersion ?? null,
    snmpPort: raw.snmp?.port ?? raw.snmpPort ?? 0,
    snmpObjectId: raw.snmpObjectId ?? '',
    snmpProxyNodeId: raw.snmp?.proxy ?? raw.snmpProxyNodeId ?? 0,
    // v1/v2c community string lives in the v3-shaped `authName` slot.
    snmpCommunity: raw.snmp?.authName ?? raw.snmpSecurity?.community ?? '',
    platformName: raw.platformName ?? '',
    sysDescription: raw.sysDescription ?? '',
    sysName: raw.sysName ?? '',
    sysLocation: raw.sysLocation ?? '',
    sysContact: raw.sysContact ?? '',
    driverName: raw.driverName ?? '',
    lldpNodeId: raw.lldpNodeId ?? '',
    bootTime: raw.bootTime ?? null,
    downSince: raw.downSince ?? null,
    pollerNodeId: raw.pollerNodeId ?? 0,
    // The API returns parsed objects, not raw bitmasks.
    capabilities: raw.capabilities ?? {},
    state: raw.state ?? {},
    capabilityFlags: raw.capabilityFlags ?? 0,
    stateFlags: raw.stateFlags ?? 0,
    // Cluster-specific (present on Cluster class)
    clusterType: raw.clusterType ?? null,
    syncNetworks: raw.syncNetworks ?? null,
    resources: raw.resources ?? null,
    lastEvents: raw.lastEvents ?? [],
    // Switch/bridge VLANs (present when capabilities.hasVlans is true)
    vlans: raw.vlans ?? [],
    // Port layout (populated on bridge/switch nodes)
    portRowCount: raw.portRowCount ?? 2,
    portNumberingScheme: raw.portNumberingScheme ?? 0,
    // Polling configuration (round-trips with PATCH /polling)
    polling: {
      pollerNode: raw.polling?.pollerNode ?? 0,
      requiredPollCount: raw.polling?.requiredPollCount ?? 0,
      expectedCapabilities: raw.polling?.expectedCapabilities ?? 0,
      useIfXTable: raw.polling?.useIfXTable ?? 0,
      flags: {
        disableAgent: raw.polling?.flags?.disableAgent ?? false,
        disableSNMP: raw.polling?.flags?.disableSNMP ?? false,
        disableICMP: raw.polling?.flags?.disableICMP ?? false,
        disableSSH: raw.polling?.flags?.disableSSH ?? false,
        disableVNC: raw.polling?.flags?.disableVNC ?? false,
        disableSMCLPProperties: raw.polling?.flags?.disableSMCLPProperties ?? false,
        disableEtherNetIP: raw.polling?.flags?.disableEtherNetIP ?? false,
        disableModbus: raw.polling?.flags?.disableModbus ?? false,
        disable8021xStatusPoll: raw.polling?.flags?.disable8021xStatusPoll ?? false,
        disableRoutePoll: raw.polling?.flags?.disableRoutePoll ?? false,
        disableTopologyPoll: raw.polling?.flags?.disableTopologyPoll ?? false,
        disableDiscoveryPoll: raw.polling?.flags?.disableDiscoveryPoll ?? false,
        disablePerfCount: raw.polling?.flags?.disablePerfCount ?? false,
        disableStatusPoll: raw.polling?.flags?.disableStatusPoll ?? false,
        disableConfigurationPoll: raw.polling?.flags?.disableConfigurationPoll ?? false,
        disableDataCollection: raw.polling?.flags?.disableDataCollection ?? false,
      },
    },
    // Rack or chassis placement (see adaptPhysicalPlacement); always present, containerId 0
    // when the object is not placed anywhere.
    physicalPlacement: adaptPhysicalPlacement(raw),
  }
}

/**
 * Node: NodeLike plus its protocol groups. A proxy of 0 is the default (zone proxy or server).
 * Login and passwords come only with Modify or Read credentials access.
 * @param {object} base
 * @param {object} raw
 * @returns {object}
 */
function adaptNode(base, raw) {
  const ssh = raw.ssh ?? {}
  const vnc = raw.vnc ?? {}
  const modbus = raw.modbus ?? {}
  const eip = raw.etherNetIp ?? {}
  const netconf = raw.netconf ?? {}
  const icmp = raw.icmp ?? {}
  return {
    ...adaptNodeLike(base, raw),
    // Flat `sshLogin` / `sshPort`: servers before the groups; the SSH terminal reads both.
    ssh: {
      port: ssh.port ?? raw.sshPort ?? 22,
      proxy: ssh.proxy ?? 0,
      keyId: ssh.keyId ?? 0,
      login: ssh.login ?? raw.sshLogin ?? '',
      password: ssh.password ?? '',
    },
    vnc: { port: vnc.port ?? 5900, proxy: vnc.proxy ?? 0, password: vnc.password ?? '' },
    modbus: {
      tcpPort: modbus.tcpPort ?? 502,
      unitId: modbus.unitId ?? 255,
      proxy: modbus.proxy ?? 0,
    },
    // `address` null: the node's primary address.
    etherNetIp: { address: eip.address ?? null, port: eip.port ?? 44818, proxy: eip.proxy ?? 0 },
    netconf: { port: netconf.port ?? 830, proxy: netconf.proxy ?? 0 },
    icmp: {
      proxy: icmp.proxy ?? 0,
      statCollectionMode: icmp.statCollectionMode ?? 'default',
      targets: [...(icmp.targets ?? [])],
    },
    mqttProxy: raw.mqttProxy ?? 0,
    syslogCodepage: raw.syslogCodepage ?? '',
    externalGateway: raw.externalGateway === true,
  }
}

/**
 * Sensor: NodeLike plus the one Modbus setting a sensor has.
 * @param {object} base
 * @param {object} raw
 * @returns {object}
 */
function adaptSensor(base, raw) {
  return { ...adaptNodeLike(base, raw), modbus: { unitId: raw.modbus?.unitId ?? 255 } }
}

/**
 * Chassis — extends NodeLike with chassis-specific dimensions and imagery.
 * @param {object} base
 * @param {object} raw
 * @returns {object}
 */
function adaptChassis(base, raw) {
  return {
    ...adaptNodeLike(base, raw),
    controllerId: raw.controllerId ?? 0,
    bindUnderController: raw.bindUnderController === true,
    chassisWidth: raw.chassisWidth ?? 80,
    chassisHeight: raw.chassisHeight ?? 2,
    unitSystem: raw.unitSystem ?? 'hp-ru',
    chassisMode: raw.chassisMode ?? 'front-back',
    frontImageGuid: guid(raw.frontImageGuid),
    backImageGuid: guid(raw.backImageGuid),
  }
}

/**
 * Dashboard, DashboardTemplate.
 * @param {object} base
 * @param {object} raw
 * @returns {object}
 */
function adaptDashboard(base, raw) {
  return {
    ...base,
    numColumns: raw.numColumns ?? 4,
    elements: raw.elements ?? [],
    displayPriority: raw.displayPriority ?? 0,
    // Object-context flags. Servers before they were exposed send neither key, so their
    // presence is what tells "off" apart from "not reported".
    showAsObjectView: raw.showAsObjectView === true,
    showContextSelector: raw.showContextSelector === true,
    objectContextFlagsSupported: 'showAsObjectView' in raw,
    forcedContextObjectId: raw.forcedContextObjectId ?? 0,
  }
}

function adaptNetworkMap(base, raw) {
  return {
    ...base,
    width: raw.width ?? 1000,
    height: raw.height ?? 600,
    mapType: raw.mapType ?? 0,
    layout: raw.layout ?? 0,
    seedObjects: raw.seedObjects ?? [],
    backgroundColor: raw.backgroundColor ?? null,
    defaultLinkColor: raw.defaultLinkColor ?? null,
    // Server-side JSON key is misspelled ("defaultLinkWidht", matches NetworkMap::toJson)
    defaultLinkWidth: raw.defaultLinkWidht ?? 1,
    defaultLinkStyle: raw.defaultLinkStyle ?? 0,
    defaultLinkRouting: raw.defaultLinkRouting ?? 0,
    backgroundZoom: raw.backgroundZoom ?? 0,
    backgroundLatitude: raw.backgroundLatitude ?? 0,
    backgroundLongitude: raw.backgroundLongitude ?? 0,
    background: raw.background ?? null,
    filterSource: raw.filter ?? '',
    linkStylingScriptSource: raw.linkScript ?? '',
    elements: raw.elements ?? [],
    links: raw.links ?? [],
    displayPriority: raw.displayPriority ?? 0,
    // "Automatically show this map in object context" (MF_SHOW_AS_OBJECT_VIEW); `flags` is a
    // boolean object on current servers and an integer on older ones.
    showAsObjectView: (parseMapFlags(raw.flags) & MAP_FLAGS.SHOW_AS_OBJECT_VIEW) !== 0,
  }
}

function adaptRack(base, raw) {
  return {
    ...base,
    rackHeight: raw.rackHeight ?? 42,
    rackMode: raw.rackMode ?? 'front-back', // 'front-back' | 'front'
    // The server's own names; the cabinet is in millimetres.
    height: raw.height ?? 42,
    topBottomNumbering: raw.topBottomNumbering ?? false,
    width: raw.width ?? 600,
    depth: raw.depth ?? 1000,
  }
}

/** Facility, PowerDomain, CoolingZone, Room: the class's property group, as a draft copy. */
function adaptDataCenterObject(base, raw) {
  const { key } = PROPERTY_GROUPS[raw.class]
  return { ...base, [key]: adaptPropertyGroup(raw.class, raw[key]) }
}

function adaptTemplate(base, raw) {
  return {
    ...base,
    policyList: raw.policyList ?? [],
    removeDCIOnDelete: raw.removeDCIOnDelete ?? false,
    // Scaffolding for "Automatic Apply Rules" — no WebAPI endpoint yet
    autoApply: {
      exclusionGroup: raw.autoApply?.exclusionGroup ?? '',
      autoApply: raw.autoApply?.autoApply ?? false,
      autoRemove: raw.autoApply?.autoRemove ?? false,
      source: raw.autoApply?.source ?? '',
    },
  }
}

function adaptBusinessService(base, raw) {
  return {
    ...base,
    // Scaffolding for "Polling" / "Object Auto Bind" / "DCI Auto Bind" — no WebAPI endpoint yet
    businessServicePolling: {
      disableStatusPoll: raw.businessServicePolling?.disableStatusPoll ?? false,
      disableConfPoll: raw.businessServicePolling?.disableConfPoll ?? false,
    },
    objectAutoBind: {
      autoBind: raw.objectAutoBind?.autoBind ?? false,
      autoUnbind: raw.objectAutoBind?.autoUnbind ?? false,
      statusThreshold: raw.objectAutoBind?.statusThreshold ?? -1,
      source: raw.objectAutoBind?.source ?? '',
    },
    dciAutoBind: {
      autoBind: raw.dciAutoBind?.autoBind ?? false,
      autoUnbind: raw.dciAutoBind?.autoUnbind ?? false,
      statusThreshold: raw.dciAutoBind?.statusThreshold ?? -1,
      source: raw.dciAutoBind?.source ?? '',
    },
  }
}

function adaptBusinessServicePrototype(base, raw) {
  return {
    ...adaptBusinessService(base, raw),
    // Scaffolding for "Instance Discovery" — no WebAPI endpoint yet
    instanceDiscovery: {
      method: raw.instanceDiscovery?.method ?? 0,
      source: raw.instanceDiscovery?.source ?? 0,
      name: raw.instanceDiscovery?.name ?? '',
      script: raw.instanceDiscovery?.script ?? '',
    },
  }
}

/**
 * Normalize IP address list from various API response shapes:
 * - ipAddressList: [{address, prefixLength}, ...] (real API)
 * - ipAddressList: ["x.x.x.x/nn", ...] (mocks / legacy)
 * - ipAddress: {address, prefixLength} (single-address shorthand)
 */
function normalizeIpAddressList(raw) {
  const list = raw.ipAddressList ?? (raw.ipAddress ? [raw.ipAddress] : [])
  return list.map((entry) => {
    if (typeof entry === 'string') return entry
    if (entry?.address) {
      return entry.prefixLength != null ? `${entry.address}/${entry.prefixLength}` : entry.address
    }
    return String(entry)
  })
}

function adaptInterface(base, raw) {
  return {
    ...base,
    index: raw.index ?? 0,
    macAddress: raw.macAddress ?? null,
    ipAddressList: normalizeIpAddressList(raw),
    flags: raw.flags ?? 0,
    isPhysicalPort: !!((raw.flags ?? 0) & 0x02),
    description: raw.description ?? '',
    ifAlias: raw.ifAlias ?? '',
    type: raw.type ?? 0,
    mtu: raw.mtu ?? 0,
    speed: raw.speed ?? 0,
    maxSpeed: raw.maxSpeed ?? 0,
    inboundUtilization: raw.inboundUtilization ?? -1,
    outboundUtilization: raw.outboundUtilization ?? -1,
    bridgePortNumber: raw.bridgePortNumber ?? 0,
    expectedState: raw.expectedState ?? 0,
    expectedStateText: raw.expectedStateText ?? '',
    requiredPollCount: raw.requiredPollCount ?? 0,
    // SNMP instance of the interface's ifTable rows when it is more than the ifIndex.
    ifTableSuffix: raw.ifTableSuffix ?? [],
    // OSPF and 802.1x states come as bare codes (only the OSPF ones, and only on an OSPF
    // interface); utils/interfaceDisplay.js holds their text.
    ospfArea: raw.ospfArea ?? '',
    ospfType: raw.ospfType ?? 0,
    ospfState: raw.ospfState ?? 0,
    dot1xPaeState: raw.dot1xPaeAuthState ?? raw.dot1xPaeState ?? 0,
    dot1xBackendState: raw.dot1xBackendAuthState ?? raw.dot1xBackendState ?? 0,
    // The peer's MAC and IP address are not part of the document: read them from the peer
    // interface and peer node objects, as the legacy client does.
    peerNodeId: raw.peerNodeId ?? 0,
    peerInterfaceId: raw.peerInterfaceId ?? 0,
    peerDiscoveryProtocol: raw.peerDiscoveryProtocol ?? 0,
    peerDiscoveryProtocolText: raw.peerDiscoveryProtocolText ?? '',
    adminState: raw.adminState ?? 0,
    adminStateText: raw.adminStateText ?? '',
    operState: raw.operState ?? 0,
    operStateText: raw.operStateText ?? '',
    stpPortState: raw.stpPortState ?? 0,
    stpPortStateText: raw.stpPortStateText ?? '',
    physicalLocation: raw.physicalLocation ?? { chassis: 0, module: 0, pic: 0, port: 0 },
    vlans: raw.vlans ?? [],
  }
}

/**
 * Dispatches by class; unknown classes get base fields only.
 *
 * @param {object | null} raw - raw API response
 * @returns {object | null}
 */
export function adaptObject(raw) {
  if (!raw) return null
  const adapted = adaptByClass(adaptBaseObject(raw), raw)
  // Present on every data collection target; 0 is the default proxy.
  if ('webServiceProxy' in raw) adapted.webServiceProxy = raw.webServiceProxy ?? 0
  return adapted
}

function adaptByClass(base, raw) {
  switch (raw.class) {
    case 'Node':
      return adaptNode(base, raw)
    case 'Sensor':
      return adaptSensor(base, raw)
    case 'Cluster':
    case 'MobileDevice':
    case 'AccessPoint':
      return adaptNodeLike(base, raw)
    case 'Chassis':
      return adaptChassis(base, raw)
    case 'Rack':
      return adaptRack(base, raw)
    case 'Dashboard':
    case 'DashboardTemplate':
      return adaptDashboard(base, raw)
    case 'NetworkMap':
      return adaptNetworkMap(base, raw)
    case 'Template':
      return adaptTemplate(base, raw)
    case 'BusinessService':
      return adaptBusinessService(base, raw)
    case 'BusinessServicePrototype':
      return adaptBusinessServicePrototype(base, raw)
    case 'Interface':
      return adaptInterface(base, raw)
    case 'Zone':
      return adaptZone(base, raw)
    case 'Facility':
    case 'PowerDomain':
    case 'CoolingZone':
    case 'Room':
      return adaptDataCenterObject(base, raw)
    default:
      return base
  }
}

/** DCO_TYPE_TABLE in include/nxcldefs.h — the `type` a DCIValue carries for a table DCI. */
const DCO_TYPE_TABLE = 2

/**
 * A table DCI arrives as a value summary (empty `value`, `dataType` DCI_DT_NULL), told apart
 * only by `type`; its contents need `GET .../table-value`. Released servers send `sourceType`,
 * `dataType`, `status`, `type` and the threshold's `currentSeverity` as codes, newer ones as
 * names (and `origin` instead of `sourceType`); rows leave here with codes and the origin's
 * current name (see `@/utils/dciCodes`). Callers match rows to their request: a bulk response
 * may be shorter.
 *
 * @param {object} value - one DCIValue
 * @returns {object} the entry, normalized, plus a derived `isTable`
 */
export function adaptDciValue(value) {
  const row = { ...value }
  if (row.sourceType != null || row.origin != null) {
    row.sourceType = dciOriginCode(row.sourceType ?? row.origin)
    row.origin = dciOriginName(row.origin ?? row.sourceType)
  }
  if (row.dataType != null) row.dataType = dciDataTypeCode(row.dataType)
  if (row.status != null) row.status = dciStatusCode(row.status)
  if (row.type != null) row.type = dciObjectTypeCode(row.type)
  if (row.threshold?.currentSeverity != null) {
    const currentSeverity = dciSeverityCode(row.threshold.currentSeverity)
    row.threshold = { ...row.threshold, currentSeverity }
  }
  row.isTable = row.type === DCO_TYPE_TABLE
  return row
}

/**
 * Adapt a raw GET /v1/objects/{id}/data-collection/current-values response.
 *
 * @param {object | null} raw
 * @returns {object | null}
 */
export function adaptDciCurrentValues(raw) {
  if (!raw) return raw
  return { ...raw, values: Array.isArray(raw.values) ? raw.values.map(adaptDciValue) : [] }
}

/**
 * The API's `position` names the physically topmost unit an element occupies, in the rack's own
 * numbering direction (`topBottomNumbering`). The internal "slot" is always bottom-up (1 =
 * bottom-most unit, as rackUtils.js's checkOverlap expects), so a multi-U element's position and
 * slot name opposite ends of its span, as in the legacy RackWidget.
 */
function rackPositionToSlot(position, elementHeight, rackHeight, topBottomNumbering) {
  return topBottomNumbering
    ? rackHeight - position - elementHeight + 2
    : position - elementHeight + 1
}

function slotToRackPosition(slot, elementHeight, rackHeight, topBottomNumbering) {
  return topBottomNumbering ? rackHeight - slot - elementHeight + 2 : slot + elementHeight - 1
}

/**
 * Adapt a raw GET /v1/objects/{id}/rack-layout response.
 * Returns rack metadata and a unified elements array compatible with RackCanvas.
 * @param {object} raw
 * @returns {{ rackId: number, name: string, height: number, topBottomNumbering: boolean, elements: object[] }}
 */
export function adaptRackLayout(raw) {
  const height = raw.height ?? 42
  const topBottomNumbering = raw.topBottomNumbering ?? false

  const passiveElements = (raw.passiveElements ?? []).map((el) => ({
    id: `passive-${el.id}`,
    slot: rackPositionToSlot(el.position, el.height ?? 1, height, topBottomNumbering),
    heightU: el.height ?? 1,
    orientation: RACK_ORIENTATION_MAP[el.orientation] ?? 'full',
    passiveType: PASSIVE_TYPE_MAP[el.type] ?? 'PatchPanel',
    objectId: null,
    objectName: null,
    objectClass: null,
    objectStatus: null,
    label: el.name ?? '',
    frontImageGuid: guid(el.imageFront),
    backImageGuid: guid(el.imageRear),
    portCount: el.portCount ?? 0,
  }))

  const objects = (raw.objects ?? []).map((el) => ({
    id: `obj-${el.id}`,
    slot: rackPositionToSlot(el.rackPosition, el.rackHeight ?? 1, height, topBottomNumbering),
    heightU: el.rackHeight ?? 1,
    orientation: RACK_ORIENTATION_MAP[el.rackOrientation] ?? 'full',
    passiveType: null,
    objectId: el.id,
    objectName: el.name ?? '',
    objectClass: CLASS_CODE_TO_NAME[el.objectClass] ?? `class-${el.objectClass}`,
    objectStatus: el.status ?? 0,
    label: el.name ?? '',
    frontImageGuid: guid(el.rackImageFront),
    backImageGuid: guid(el.rackImageRear),
    portCount: 0,
  }))

  return {
    rackId: raw.rackId,
    name: raw.name ?? '',
    height,
    topBottomNumbering,
    elements: [...passiveElements, ...objects],
  }
}

/**
 * Normalize a dimension value from its API units to the chassis's native unit system.
 * @param {number} value
 * @param {number} fromUnits - 0=HP or RU (native), 1=mm
 * @param {'width'|'height'} dimension
 * @param {string} targetSystem - 'hp-ru' or 'mm'
 */
function normalizeChassisUnit(value, fromUnits, dimension, targetSystem) {
  const factor = dimension === 'width' ? HP_TO_MM : RU_TO_MM
  if (targetSystem === 'hp-ru') {
    return fromUnits === 1 ? value / factor : value
  }
  return fromUnits === 0 ? value * factor : value
}

/**
 * Adapt a raw GET /v1/objects/{id}/chassis-layout response.
 * @param {object} raw
 * @param {string} [unitSystem] - 'hp-ru' (default) or 'mm'; from the chassis object's own properties
 * @returns {{ chassisId: number, name: string, controllerId: number, status: number, elements: object[] }}
 */
export function adaptChassisLayout(raw, unitSystem = 'hp-ru') {
  const elements = (raw.objects ?? []).map((el) => {
    const p = el.placement ?? {}
    return {
      id: `obj-${el.id}`,
      x: normalizeChassisUnit(p.positionWidth ?? 0, p.positionWidthUnits ?? 0, 'width', unitSystem),
      y: normalizeChassisUnit(
        p.positionHeight ?? 0,
        p.positionHeightUnits ?? 0,
        'height',
        unitSystem,
      ),
      width: normalizeChassisUnit(p.width ?? 1, p.widthUnits ?? 0, 'width', unitSystem),
      height: normalizeChassisUnit(p.height ?? 1, p.heightUnits ?? 0, 'height', unitSystem),
      orientation: p.orientation === 1 ? 'front' : p.orientation === 2 ? 'back' : 'full',
      objectId: el.id,
      objectName: el.name ?? '',
      objectClass: CLASS_CODE_TO_NAME[el.objectClass] ?? `class-${el.objectClass}`,
      objectStatus: el.status ?? 0,
      frontImageGuid: guid(p.image),
      backImageGuid: null,
      label: el.name ?? '',
    }
  })

  return {
    chassisId: raw.chassisId,
    name: raw.name ?? '',
    controllerId: raw.controllerId ?? 0,
    status: raw.status ?? 0,
    elements,
  }
}

/**
 * Convert an adapted object back into a PATCH payload of the common editable fields.
 *
 * @param {object} adapted - adapted object (from adaptObject)
 * @returns {object} partial API payload suitable for PATCH
 */
export function objectToApiPayload(draft) {
  return {
    name: draft.name,
    alias: draft.alias || null,
    nameOnMap: draft.nameOnMap || null,
    // PATCH `comments` sets the macro *source* server-side, so serialize from
    // commentsSource; the markdown indicator prefix is re-applied here (all comments
    // written by this UI are markdown). Empty clears via null — never a bare prefix.
    comments: draft.commentsSource ? withMarkdownPrefix(draft.commentsSource) : null,
    category: draft.category || null,
    mapImage: draft.mapImage || null,
    drilldownObjectId: draft.drilldownObjectId || null,
  }
}

/**
 * Serialize rack placement into a PATCH /v1/objects/{objectId}/physical-placement body.
 * Pass element: null to remove the object from its rack without deleting it.
 *
 * @param {number|null} rackId
 * @param {object|null} element - adapted rack-layout element (object-backed kind)
 * @param {number} rackHeight - total rack height in units
 * @param {boolean} topBottomNumbering - the rack's numbering direction
 * @returns {object}
 */
export function rackPlacementToApiPayload(rackId, element, rackHeight, topBottomNumbering) {
  // Unplacing sends containerId alone: the server validates the rack extent whenever
  // position or height is present, and an object already stored out of range (the NXCP
  // path validates nothing) must still be removable.
  if (rackId == null || !element) {
    return { containerId: null }
  }
  return {
    containerId: rackId,
    position: slotToRackPosition(
      element.slot,
      element.heightU ?? 1,
      rackHeight,
      topBottomNumbering,
    ),
    height: element.heightU ?? 1,
    orientation: RACK_ORIENTATION_REVERSE[element.orientation] ?? 0,
    imageFront: element.frontImageGuid || null,
    imageRear: element.backImageGuid || null,
  }
}

/**
 * Serialize an adapted passive rack element (PDU, patch panel, filler panel, organiser)
 * into a create/update payload for the /v1/objects/{rackId}/rack-layout/passive-elements
 * endpoints. `type` is immutable server-side once created, but is harmless to always send.
 * @param {object} element - adapted rack-layout element (passive kind)
 * @param {number} rackHeight - total rack height in units
 * @param {boolean} topBottomNumbering - the rack's numbering direction
 * @returns {object}
 */
export function passiveElementToApiPayload(element, rackHeight, topBottomNumbering) {
  const elementHeight = element.heightU ?? 1
  return {
    name: element.label || '',
    type: PASSIVE_TYPE_REVERSE[element.passiveType] ?? 0,
    position: slotToRackPosition(element.slot, elementHeight, rackHeight, topBottomNumbering),
    height: elementHeight,
    orientation: RACK_ORIENTATION_REVERSE[element.orientation] ?? 0,
    portCount: element.portCount ?? 0,
    imageFront: element.frontImageGuid || NULL_GUID,
    imageRear: element.backImageGuid || NULL_GUID,
  }
}

/**
 * Serialize chassis placement into a PATCH /v1/objects/{objectId}/physical-placement body.
 * Pass element: null to remove the object from the chassis.
 *
 * Dimensions are rounded: the chassis layout adapter converts HP/RU into mm by division,
 * and the server rejects a non-integer geometry member with 400.
 *
 * @param {number|null} chassisId
 * @param {object|null} element - adapted chassis-layout element
 * @param {string} [unitSystem] - 'hp-ru' (default) or 'mm', matches the chassis's own unitSystem
 * @returns {object}
 */
export function chassisPlacementToApiPayload(chassisId, element, unitSystem = 'hp-ru') {
  if (chassisId == null || !element) {
    return { containerId: null }
  }
  const units = unitSystem === 'mm' ? 1 : 0
  return {
    containerId: chassisId,
    chassisPlacement: {
      image: element.frontImageGuid || null,
      width: Math.round(element.width),
      widthUnits: units,
      height: Math.round(element.height),
      heightUnits: units,
      positionWidth: Math.round(element.x),
      positionWidthUnits: units,
      positionHeight: Math.round(element.y),
      positionHeightUnits: units,
      // A chassis is drawn front or rear only; orientation 0 would link the node under the
      // chassis and draw it in neither view.
      orientation: element.orientation === 'back' ? 2 : 1,
    },
  }
}

/**
 * Serialize status calculation fields from a draft into a PATCH /v1/objects/{id}/status-calculation payload.
 * @param {object} draft
 * @returns {object}
 */
export function objectToStatusCalcPayload(draft) {
  return {
    calcAlg: draft.calcAlg,
    propAlg: draft.propAlg,
    fixedStatus: draft.fixedStatus,
    shift: draft.shift,
    singleThreshold: draft.singleThreshold,
    translation: [...draft.translation],
    thresholds: [...draft.thresholds],
  }
}

/**
 * The whole group goes out, not a diff: it is a merge-patch and the server validates the rack
 * extent whenever containerId, position or height is present, which is the check this form
 * wants. Removal sends containerId alone so an object stored out of range stays removable.
 *
 * @param {object} draft
 * @returns {object}
 */
export function objectToPhysicalPlacementPayload(draft) {
  const p = draft.physicalPlacement
  if (!p || !p.containerId) {
    return { containerId: null }
  }
  const payload = {
    containerId: p.containerId,
    position: p.position ?? 0,
    height: p.height ?? 1,
    orientation: p.orientation ?? 0,
    imageFront: p.imageFront || null,
    imageRear: p.imageRear || null,
  }
  if (p.chassisPlacement) {
    payload.chassisPlacement = { ...p.chassisPlacement }
  }
  return payload
}

/**
 * Serialize location fields from a draft into a PATCH /v1/objects/{id}/location payload.
 * @param {object} draft
 * @returns {object}
 */
export function objectToLocationPayload(draft) {
  let geoLocation = null
  if (draft.geoLocation && draft.geoLocation.type !== 0) {
    geoLocation = {
      type: draft.geoLocation.type,
      latitude: draft.geoLocation.latitude,
      longitude: draft.geoLocation.longitude,
    }
    if (draft.geoLocation.accuracy) geoLocation.accuracy = draft.geoLocation.accuracy
    if (draft.geoLocation.timestamp) geoLocation.timestamp = draft.geoLocation.timestamp
  }

  let postalAddress = null
  const p = draft.postalAddress ?? {}
  const hasAny = p.country || p.region || p.city || p.district || p.streetAddress || p.postcode
  if (hasAny) {
    postalAddress = {
      country: p.country || null,
      region: p.region || null,
      city: p.city || null,
      district: p.district || null,
      streetAddress: p.streetAddress || null,
      postcode: p.postcode || null,
    }
  }

  return { geoLocation, postalAddress }
}
