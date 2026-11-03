import {
  Globe,
  Folder,
  FolderCog,
  FolderCode,
  Server,
  EthernetPort,
  Network as NetworkIcon,
  MapPin,
  Layers,
  Layers3,
  CircuitBoard,
  Copy,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  Briefcase,
  Package,
  Waypoints,
  Smartphone,
  Activity,
  Circle,
  Cloud,
  Cable,
  Radio,
  RadioTower,
  Shield,
  Zap,
} from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'
import { dciOriginName } from '@/utils/dciCodes'
import { secondsSince } from '@/utils/timeFormat'

// Reactive: computeds reading `isDark.value` re-run when the theme toggles.
const { isDark } = useTheme()

/**
 * Palette key per status code (index = code; 0-4 double as alarm/event severity), matching the
 * --netxms-status-<key> variables in main.css.
 */
export const STATUS_KEYS = [
  'normal',
  'warning',
  'minor',
  'major',
  'critical',
  'unknown',
  'unmanaged',
  'disabled',
  'testing',
]
const STATUS_LABELS = [
  'Normal',
  'Warning',
  'Minor',
  'Major',
  'Critical',
  'Unknown',
  'Unmanaged',
  'Disabled',
  'Testing',
]

// Colors are the --netxms-status-* variables from main.css, so they follow the theme.
// `color` is the solid fill (dots, borders, bars); `bgColor`/`textColor` the soft variant
// (tiles, chips - see StatusTag); `onFillColor` the rare text that sits on the solid fill.
const STATUS_MAP = Object.fromEntries(
  STATUS_KEYS.map((key, code) => [
    code,
    {
      label: STATUS_LABELS[code],
      color: `var(--netxms-status-${key})`,
      bgColor: `var(--netxms-status-${key}-bg)`,
      textColor: `var(--netxms-status-${key}-text)`,
      onFillColor: `var(--netxms-status-${key}-on-fill)`,
    },
  ]),
)

export function getStatusInfo(statusNumber) {
  return STATUS_MAP[statusNumber] ?? STATUS_MAP[5]
}

export const STATUS_THRESHOLD_OPTIONS = [
  { value: -1, label: 'Default', key: 'default' },
  { value: 1, label: 'Warning', key: 'warning' },
  { value: 2, label: 'Minor', key: 'minor' },
  { value: 3, label: 'Major', key: 'major' },
  { value: 4, label: 'Critical', key: 'critical' },
]

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}

export function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return { h, s, l }
}

export function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  }
}

function isDarkMode() {
  return isDark.value
}

// Text on the solid fill: no single color reads on every fill from lemon to deep red, so
// each level takes whichever of these two contrasts more with it (at least 4.7:1).
const INK = '#1c1917'
const WHITE = '#ffffff'

/**
 * Hex copy of the --netxms-status-* palette in main.css, for canvas/ECharts contexts that cannot
 * read CSS variables; indexed by status code. objectUtils.spec.js checks it against main.css.
 */
export const STATUS_PALETTE = {
  light: {
    // soft green, lemon, amber-500, orange-600, red-700, slate-500/400/300, purple-600
    fill: [
      '#4abf76',
      '#e9d401',
      '#f59e0b',
      '#ea580c',
      '#b91c1c',
      '#64748b',
      '#94a3b8',
      '#cbd5e1',
      '#9333ea',
    ],
    bg: [
      '#e1f9e7',
      '#f7f1bb',
      '#fed2a0',
      '#ffb296',
      '#ff968a',
      '#e2e8f0',
      '#e2e8f0',
      '#e2e8f0',
      '#f3e8ff',
    ],
    text: [
      '#27643e',
      '#615700',
      '#684001',
      '#6e2400',
      '#720307',
      '#475569',
      '#64748b',
      '#94a3b8',
      '#6b21a8',
    ],
    onFill: [INK, INK, INK, INK, WHITE, WHITE, INK, INK, WHITE],
  },
  dark: {
    // soft green, lighter lemon, amber-500, orange-500, red-600, slate-400/500/600, purple-400
    fill: [
      '#4abf76',
      '#eee533',
      '#f59e0b',
      '#f97316',
      '#dc2626',
      '#94a3b8',
      '#64748b',
      '#475569',
      '#c084fc',
    ],
    bg: [
      '#225a36',
      '#3d3a03',
      '#523100',
      '#652800',
      '#620e0e',
      '#2a3646',
      '#2a3646',
      '#2a3646',
      '#3b0764',
    ],
    text: [
      '#b4ffc9',
      '#f7f181',
      '#ffbc69',
      '#fe9a66',
      '#fca5a5',
      '#cbd5e1',
      '#94a3b8',
      '#94a3b8',
      '#e9d5ff',
    ],
    onFill: [INK, INK, INK, INK, WHITE, INK, WHITE, WHITE, INK],
  },
}

function statusHex(variant, statusNumber) {
  const colors = STATUS_PALETTE[isDarkMode() ? 'dark' : 'light'][variant]
  return colors[statusNumber] ?? colors[5]
}

export function getStatusHexColor(statusNumber) {
  return statusHex('fill', statusNumber)
}

export function getStatusSoftBgHexColor(statusNumber) {
  return statusHex('bg', statusNumber)
}

export function getStatusSoftTextHexColor(statusNumber) {
  return statusHex('text', statusNumber)
}

/** Text colour for a label on the solid fill (e.g. inside an ECharts slice). */
export function getStatusOnFillHexColor(statusNumber) {
  return statusHex('onFill', statusNumber)
}

const CLASS_ICON_MAP = {
  Network: 'pi pi-globe',
  ServiceRoot: 'pi pi-globe',
  Container: 'pi pi-folder',
  Collector: 'pi pi-folder',
  Node: 'pi pi-server',
  Interface: 'app-icon-ethernet-port',
  Subnet: 'pi pi-share-alt',
  Zone: 'pi pi-map-marker',
  Cluster: 'pi pi-th-large',
  TemplateRoot: 'pi pi-copy',
  TemplateGroup: 'pi pi-folder',
  Template: 'pi pi-file',
  DashboardRoot: 'pi pi-th-large',
  Dashboard: 'pi pi-th-large',
  DashboardGroup: 'pi pi-folder',
  NetworkMapRoot: 'pi pi-map',
  NetworkMap: 'pi pi-map',
  NetworkMapGroup: 'pi pi-folder',
  BusinessServiceRoot: 'pi pi-briefcase',
  BusinessService: 'pi pi-briefcase',
  AssetRoot: 'pi pi-box',
  AssetGroup: 'pi pi-folder',
  Asset: 'pi pi-box',
  Condition: 'pi pi-question-circle',
  NetworkService: 'pi pi-bolt',
  VPNConnector: 'pi pi-shield',
  DashboardTemplate: 'pi pi-th-large',
  BusinessServiceProto: 'pi pi-briefcase',
  Rack: 'pi pi-server',
  Chassis: 'pi pi-server',
  MobileDevice: 'pi pi-mobile',
  Sensor: 'pi pi-wave-pulse',
  CloudDomain: 'pi pi-cloud',
  Circuit: 'pi pi-bolt',
  WirelessDomain: 'pi pi-wifi',
}

export function getClassIcon(objectClass) {
  return CLASS_ICON_MAP[objectClass] ?? 'pi pi-circle'
}

const CLASS_ICON_COMPONENT = {
  Network: Globe,
  ServiceRoot: Globe,
  Container: Folder,
  Collector: FolderCog,
  Node: Server,
  Interface: EthernetPort,
  AccessPoint: RadioTower,
  Subnet: NetworkIcon,
  Zone: MapPin,
  Cluster: Layers,
  Rack: Layers3,
  Chassis: CircuitBoard,
  TemplateRoot: Copy,
  TemplateGroup: FolderCode,
  Template: FileText,
  DashboardRoot: LayoutDashboard,
  DashboardGroup: Folder,
  Dashboard: LayoutDashboard,
  NetworkMapRoot: MapIcon,
  NetworkMapGroup: Folder,
  NetworkMap: MapIcon,
  BusinessServiceRoot: Briefcase,
  BusinessServiceGroup: Folder,
  BusinessService: Briefcase,
  AssetRoot: Package,
  AssetGroup: Folder,
  Asset: Package,
  Condition: Waypoints,
  NetworkService: Zap,
  VPNConnector: Shield,
  MobileDevice: Smartphone,
  Sensor: Activity,
  DashboardTemplate: LayoutDashboard,
  BusinessServiceProto: Briefcase,
  CloudDomain: Cloud,
  Circuit: Cable,
  WirelessDomain: Radio,
}

export function getClassIconComponent(objectClass) {
  return CLASS_ICON_COMPONENT[objectClass] ?? Circle
}

const CLASS_ICON_COLOR = {
  Network: 'var(--p-green-500)',
  ServiceRoot: 'var(--p-green-500)',
  Container: 'var(--p-amber-400)',
  Collector: 'var(--p-amber-400)',
  Node: 'var(--p-blue-400)',
  Interface: 'var(--p-teal-400)',
  AccessPoint: 'var(--p-cyan-400)',
  Subnet: 'var(--p-purple-400)',
  Zone: 'var(--p-cyan-400)',
  Cluster: 'var(--p-sky-400)',
  TemplateRoot: 'var(--p-orange-400)',
  TemplateGroup: 'var(--p-orange-400)',
  Template: 'var(--p-orange-400)',
  DashboardRoot: 'var(--p-indigo-400)',
  DashboardGroup: 'var(--p-indigo-400)',
  Dashboard: 'var(--p-indigo-400)',
  NetworkMapRoot: 'var(--p-emerald-400)',
  NetworkMapGroup: 'var(--p-emerald-400)',
  NetworkMap: 'var(--p-emerald-400)',
  BusinessServiceRoot: 'var(--p-rose-400)',
  BusinessService: 'var(--p-rose-400)',
  NetworkService: 'var(--p-amber-400)',
  VPNConnector: 'var(--p-sky-400)',
  AssetRoot: 'var(--p-stone-400)',
  Asset: 'var(--p-stone-400)',
  Rack: 'var(--p-surface-400)',
  Chassis: 'var(--p-surface-400)',
  MobileDevice: 'var(--p-pink-400)',
  Sensor: 'var(--p-lime-400)',
  CloudDomain: 'var(--p-sky-400)',
  Circuit: 'var(--p-amber-400)',
  WirelessDomain: 'var(--p-cyan-400)',
}

export function getClassIconColor(objectClass) {
  return CLASS_ICON_COLOR[objectClass] ?? 'var(--p-surface-400)'
}

// Labels for classes that do not read naturally when split on capitals.
const CLASS_LABEL_OVERRIDES = {
  ServiceRoot: 'Infrastructure',
  AssetGroup: 'Asset Group',
  AssetRoot: 'Asset Root',
  BusinessServiceProto: 'Business Service Prototype',
  CloudDomain: 'Cloud Domain',
  DashboardGroup: 'Dashboard Group',
  DashboardTemplate: 'Dashboard Template',
  MobileDevice: 'Mobile Device',
  NetworkMap: 'Network Map',
  NetworkMapGroup: 'Network Map Group',
  NetworkService: 'Network Service',
  TemplateGroup: 'Template Group',
  VPNConnector: 'VPN Connector',
  WirelessDomain: 'Wireless Domain',
}

export function getClassLabel(objectClass) {
  return CLASS_LABEL_OVERRIDES[objectClass] ?? objectClass
}

const NAV_CLASS_MAP = {
  ServiceRoot: { label: 'Infrastructure', icon: NetworkIcon, route: '/infrastructure' },
  TemplateRoot: { label: 'Templates', icon: Copy, route: '/templates' },
  NetworkMapRoot: { label: 'Network Maps', icon: MapIcon, route: '/network-maps' },
  DashboardRoot: { label: 'Dashboards', icon: LayoutDashboard, route: '/dashboards' },
  BusinessServiceRoot: {
    label: 'Business Services',
    icon: Briefcase,
    route: '/business-services',
  },
  AssetRoot: { label: 'Assets', icon: Package, route: '/assets' },
}

export function getNavItem(apiObject) {
  const config = NAV_CLASS_MAP[apiObject.class]
  if (!config) return null
  return { id: apiObject.id, label: config.label, icon: config.icon, route: config.route }
}

const NODE_LIKE_CLASSES = new Set(['Node', 'Cluster', 'MobileDevice', 'Sensor'])

export function isNodeLike(objectClass) {
  return NODE_LIKE_CLASSES.has(objectClass)
}

export function formatIpAddress(ipObj) {
  if (!ipObj || !ipObj.address || ipObj.address === '0.0.0.0') return null
  return ipObj.address
}

/**
 * IP addresses compare wrong as plain strings, so each group is zero-padded to its widest form.
 * IPv4 sorts before IPv6 (shorter key); no value sorts last.
 *
 * @param {{ address?: string }|null|undefined} ipObj
 * @returns {string}
 */
export function ipSortKey(ipObj) {
  const address = ipObj?.address
  if (!address) return '￿'
  if (address.includes(':')) {
    // Expand '::' and pad every hextet to 4 digits
    const [head, tail = ''] = address.split('::')
    const headParts = head ? head.split(':') : []
    const tailParts = tail ? tail.split(':') : []
    const gap = address.includes('::') ? 8 - headParts.length - tailParts.length : 0
    const parts = [...headParts, ...Array(Math.max(gap, 0)).fill('0'), ...tailParts]
    return parts.map((p) => p.padStart(4, '0')).join(':')
  }
  return address
    .split('.')
    .map((p) => p.padStart(3, '0'))
    .join('.')
}

const CAPABILITY_LABELS = {
  isSnmp: 'SNMP',
  isNativeAgent: 'Agent',
  isBridge: 'Bridge',
  isRouter: 'Router',
  isLocalMgmt: 'Local Mgmt',
  isPrinter: 'Printer',
  isOspf: 'OSPF',
  isSsh: 'SSH',
  isCdp: 'CDP',
  isNdp: 'NDP',
  isLldp: 'LLDP',
  isVrrp: 'VRRP',
  hasVlans: 'VLANs',
  is8021x: '802.1x',
  isStp: 'STP',
  hasEntityMib: 'Entity MIB',
  hasIfxTable: 'ifXTable',
  hasAgentIfxCounters: 'Agent ifX Counters',
  hasWinPdh: 'Windows PDH',
  isWifiController: 'WiFi Controller',
  isWifiAp: 'WiFi AP',
  isSmclp: 'SMCLP',
  isNewPolicyTypes: 'New Policy Types',
  hasUserAgent: 'User Agent',
  isEthernetIp: 'EtherNet/IP',
  isModbusTcp: 'Modbus TCP',
  isProfinet: 'PROFINET',
  hasFileManager: 'File Manager',
  lldpV2Mib: 'LLDP v2 MIB',
  emulatedEntityMib: 'Emulated Entity MIB',
  deviceView: 'Device View',
  isVnc: 'VNC',
  isLocalVnc: 'Local VNC',
  registeredForBackup: 'Backup',
  hasServiceManager: 'Service Manager',
}

export function getCapabilityEntries(capabilities) {
  if (!capabilities) return []
  return Object.entries(CAPABILITY_LABELS).map(([key, label]) => ({
    key,
    label,
    active: !!capabilities[key],
  }))
}

const STATE_LABELS = {
  agentUnreachable: 'Agent Unreachable',
  snmpUnreachable: 'SNMP Unreachable',
  ethernetIpUnreachable: 'EtherNet/IP Unreachable',
  cacheModeNotSupported: 'Cache Mode Not Supported',
  snmpTrapFlood: 'SNMP Trap Flood',
  icmpUnreachable: 'ICMP Unreachable',
  sshUnreachable: 'SSH Unreachable',
  modbusUnreachable: 'Modbus Unreachable',
  unreachable: 'Unreachable',
  networkPathProblem: 'Network Path Problem',
}

function getStateEntries(state) {
  if (!state) return []
  return Object.entries(STATE_LABELS).map(([key, label]) => ({ key, label, active: !!state[key] }))
}

/**
 * Capability flag paired with the state flag set when that protocol stops answering. ICMP has
 * no capability flag; it applies to any object with an IP address.
 */
const REACHABILITY_PROTOCOLS = [
  { key: 'agent', label: 'Agent', capability: 'isNativeAgent', stateFlag: 'agentUnreachable' },
  { key: 'snmp', label: 'SNMP', capability: 'isSnmp', stateFlag: 'snmpUnreachable' },
  { key: 'ssh', label: 'SSH', capability: 'isSsh', stateFlag: 'sshUnreachable' },
  {
    key: 'ethernetIp',
    label: 'EtherNet/IP',
    capability: 'isEthernetIp',
    stateFlag: 'ethernetIpUnreachable',
  },
  { key: 'modbus', label: 'Modbus', capability: 'isModbusTcp', stateFlag: 'modbusUnreachable' },
  { key: 'icmp', label: 'ICMP', capability: null, stateFlag: 'icmpUnreachable' },
]

/**
 * One chip per protocol the object speaks. Empty when the object has no `state` document
 * (non-pollable classes): "reachable" cannot be told from "unknown" there.
 *
 * @param {object} object
 * @returns {Array<{key: string, label: string, ok: boolean}>}
 */
export function getReachabilityChips(object) {
  const state = object?.state
  if (!state) return []
  const capabilities = object?.capabilities ?? {}
  const hasIp = !!formatIpAddress(object?.ipAddress)

  return REACHABILITY_PROTOCOLS.filter((p) =>
    p.capability ? !!capabilities[p.capability] : hasIp,
  ).map((p) => ({ key: p.key, label: p.label, ok: !state[p.stateFlag] }))
}

/**
 * Active state flags no reachability chip accounts for, so none is silently dropped.
 *
 * @param {object} object
 * @returns {Array<{key: string, label: string}>}
 */
export function getActiveProblemChips(object) {
  const covered = new Set(
    getReachabilityChips(object).map(
      (chip) => REACHABILITY_PROTOCOLS.find((p) => p.key === chip.key).stateFlag,
    ),
  )
  return getStateEntries(object?.state)
    .filter((entry) => entry.active && !covered.has(entry.key))
    .map(({ key, label }) => ({ key, label }))
}

/**
 * `downSince` wins over `bootTime`.
 *
 * @param {object} object
 * @param {number} [now] - epoch ms
 * @returns {{mode: 'up'|'down'|null, seconds: number|null, timestamp: string|null}}
 */
export function getUptimeInfo(object, now = Date.now()) {
  const downSince = object?.downSince
  if (downSince) {
    return { mode: 'down', seconds: secondsSince(downSince, now), timestamp: downSince }
  }
  const bootTime = object?.bootTime
  if (bootTime) {
    return { mode: 'up', seconds: secondsSince(bootTime, now), timestamp: bootTime }
  }
  return { mode: null, seconds: null, timestamp: null }
}

// Names as the server emits them (server/core/pollable.cpp); the openapi.yaml description of
// this field also lists 'routing-table' and 'map-update', which the server never sends.
const POLL_TYPE_LABELS = {
  status: 'Status',
  configuration: 'Configuration',
  instance: 'Instance Discovery',
  discovery: 'Network Discovery',
  topology: 'Topology',
  routing: 'Routing Table',
  icmp: 'ICMP',
  autobind: 'Auto-bind',
  map: 'Map Update',
}

/**
 * Null when the object has no poll states.
 *
 * @param {object} object
 * @returns {{status: object|null, all: Array<{key: string, label: string, pending: boolean,
 *   lastCompleted: string|null}>}|null}
 */
export function getPollSummary(object) {
  const states = object?.pollStates
  if (!Array.isArray(states) || states.length === 0) return null

  const all = states.map((s) => ({
    key: s.name,
    label: POLL_TYPE_LABELS[s.name] ?? s.name,
    pending: !!s.pending,
    lastCompleted: s.lastCompleted ?? null,
  }))
  return { status: all.find((p) => p.key === 'status') ?? null, all }
}

// Classes that can own DCIs. Templates carry DCI configuration but never have live values.
export const DCI_TARGET_CLASSES = new Set([
  'Node',
  'Cluster',
  'MobileDevice',
  'AccessPoint',
  'Chassis',
  'Sensor',
  'Collector',
  'Circuit',
  'Template',
])

export const TEMPLATE_APPLICABLE_CLASSES = [...DCI_TARGET_CLASSES].filter((c) => c !== 'Template')

// Keyed by both numeric (current-values API) and string (config API); `id` is the config API's
// spelling, so either form maps to one CSS modifier.
const DCI_STATUS_ACTIVE = {
  id: 'active',
  label: 'Active',
  severity: 'success',
  icon: 'pi pi-check-circle',
}
const DCI_STATUS_DISABLED = {
  id: 'disabled',
  label: 'Disabled',
  severity: 'secondary',
  icon: 'pi pi-ban',
}
const DCI_STATUS_UNSUPPORTED = {
  id: 'unsupported',
  label: 'Not Supported',
  severity: 'warn',
  icon: 'pi pi-exclamation-triangle',
}
const DCI_STATUS_MAP = {
  0: DCI_STATUS_ACTIVE,
  1: DCI_STATUS_DISABLED,
  2: DCI_STATUS_UNSUPPORTED,
  active: DCI_STATUS_ACTIVE,
  disabled: DCI_STATUS_DISABLED,
  unsupported: DCI_STATUS_UNSUPPORTED,
}

export function getDciStatusInfo(status) {
  return DCI_STATUS_MAP[status] ?? DCI_STATUS_MAP[0]
}

// DCIValue.lastCollectionError; text as in the legacy last values table. INVALID_DATA
// ("collected, but meaningless") is amber, every other reason red.
const DCI_COLLECTION_ERROR_MAP = {
  ACCESS_DENIED: { text: '<< ACCESS DENIED >>', severity: 'error' },
  COMM_ERROR: { text: '<< COMM ERROR >>', severity: 'error' },
  INVALID_DATA: { text: '<< INVALID DATA >>', severity: 'warn' },
  NO_SUCH_INSTANCE: { text: '<< NO SUCH INSTANCE >>', severity: 'error' },
  NOT_SUPPORTED: { text: '<< NOT SUPPORTED >>', severity: 'error' },
}

const DCI_COLLECTION_ERROR_FALLBACK = { text: '<< ERROR >>', severity: 'error' }

/**
 * Unknown reasons, and servers without lastCollectionError, fall back to the generic marker.
 *
 * @param {string} [lastCollectionError]
 * @returns {{ text: string, severity: 'error'|'warn' }}
 */
export function getDciCollectionErrorInfo(lastCollectionError) {
  return DCI_COLLECTION_ERROR_MAP[lastCollectionError] ?? DCI_COLLECTION_ERROR_FALLBACK
}

// By origin name; a DS_* code or an older server's name reads the same label via dciOriginName.
const DCI_ORIGIN_LABELS = new Map([
  ['internal', 'Internal'],
  ['agent', 'Agent'],
  ['snmp', 'SNMP'],
  ['websvc', 'Web Service'],
  ['push', 'Push'],
  ['winperf', 'WinPerf'],
  ['smclp', 'SM-CLP'],
  ['script', 'Script'],
  ['ssh', 'SSH'],
  ['mqtt', 'MQTT'],
  ['driver', 'Device Driver'],
  ['modbus', 'Modbus'],
  ['ethernetip', 'EtherNet/IP'],
  ['cloud', 'Cloud'],
  ['otlp', 'OTLP'],
  ['trafficobserver', 'Traffic Observer'],
  ['netconf', 'NETCONF'],
  ['computed', 'Computed'],
])

export function getDciSourceTypeLabel(type) {
  return DCI_ORIGIN_LABELS.get(dciOriginName(type)) ?? `Unknown (${type})`
}

// Keyed by both numeric (current-values API, DCI_DT_*) and string (config API).
const DCI_DATA_TYPE_MAP = {
  0: 'Int32',
  1: 'UInt32',
  2: 'Int64',
  3: 'UInt64',
  4: 'String',
  5: 'Float',
  6: 'Null',
  7: 'Counter32',
  8: 'Counter64',
  int32: 'Integer (32-bit)',
  uint32: 'Unsigned Integer (32-bit)',
  int64: 'Integer (64-bit)',
  uint64: 'Unsigned Integer (64-bit)',
  float: 'Floating Point',
  string: 'String',
  null: 'Same as collected',
  counter32: 'Counter (32-bit)',
  counter64: 'Counter (64-bit)',
}

export function getDciDataTypeLabel(type) {
  return DCI_DATA_TYPE_MAP[type] ?? `Unknown (${type})`
}

/** Max distinct integer values still treated as a discrete (step) series. */
const DCI_DISCRETE_MAX_DISTINCT = 5
/** Larger values are gauges/counters. */
const DCI_DISCRETE_MAX_VALUE = 16

/**
 * Continuous data is drawn as a smooth line, discrete/boolean as a step line.
 *
 * @param {Array<{value?: string|number, avg?: number}>} [values] - history rows
 * @returns {'continuous'|'discrete'|'boolean'}
 *   'discrete' - few distinct integer values, all in [0, DCI_DISCRETE_MAX_VALUE]; sparse gauge
 *   data with few distinct samples stays continuous
 */
export function getDciSeriesKind(values) {
  const nums = (values ?? [])
    .map((v) => Number(v?.value ?? v?.avg))
    .filter((n) => Number.isFinite(n))

  if (nums.length === 0) return 'continuous'
  if (!nums.every(Number.isInteger)) return 'continuous'

  const distinct = new Set(nums)
  if ([...distinct].every((n) => n === 0 || n === 1)) return 'boolean'

  const withinStateRange = nums.every((n) => n >= 0 && n <= DCI_DISCRETE_MAX_VALUE)
  if (withinStateRange && distinct.size <= DCI_DISCRETE_MAX_DISTINCT) return 'discrete'
  return 'continuous'
}

const SNMP_VERSION_MAP = {
  0: 'v1',
  1: 'v2c',
  2: 'v2c',
  3: 'v3',
}

export function formatSnmpVersion(version) {
  return SNMP_VERSION_MAP[version] ?? `v${version}`
}

export function formatSpeed(bps) {
  if (!bps) return ''
  if (bps >= 1e12) return `${bps / 1e12} Tbps`
  if (bps >= 1e9) return `${bps / 1e9} Gbps`
  if (bps >= 1e6) return `${bps / 1e6} Mbps`
  return `${bps / 1e3} Kbps`
}

const IF_TYPE_MAP = {
  1: 'Other',
  6: 'Ethernet',
  24: 'Loopback',
  53: 'Virtual',
  71: 'Wi-Fi',
  131: 'Tunnel',
  161: 'Link Aggregate',
}

export function getInterfaceTypeName(typeId) {
  return IF_TYPE_MAP[typeId] ?? `Type ${typeId}`
}
