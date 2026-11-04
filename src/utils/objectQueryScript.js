/**
 * Compiles the Find Object simple filter into an NXSL object query (`POST /v1/objects/query`):
 * the legacy filter runs client-side over an object cache, and `/v1/objects/search` cannot
 * express globs, regex or IP ranges. The script is shown in advanced mode, so it is formatted to
 * be read.
 *
 * - Bare identifiers resolve against the object under test; only base NetObj attributes are safe
 *   bare. Class-specific ones go through `?.`, which yields NULL instead of aborting the query.
 * - That NULL must be cast with `string(...)`: `ilike`, `imatch` and String methods fail on NULL,
 *   aborting the whole query; NULL casts to "". `==` is NULL-tolerant.
 * - The IP range rebuilds the address from the `ipAddr` string: `ipAddress` keeps an interface's
 *   or subnet's mask, and `inRange` compares mask bits, so the lower bound itself would not match.
 *
 * Unlike legacy, the searched attributes are a fixed list, and the IP range tests the primary
 * address only.
 */

/** The legacy filter tab's search modes. */
export const SEARCH_MODE = {
  NORMAL: 'normal',
  /** Glob: `*` any string, `?` any character. */
  PATTERN: 'pattern',
  /** Case-insensitive regular expression. */
  REGEXP: 'regexp',
}

export const SEARCH_MODE_OPTIONS = [
  { value: SEARCH_MODE.NORMAL, label: 'Normal' },
  { value: SEARCH_MODE.PATTERN, label: 'Pattern (* = any string, ? = any character)' },
  { value: SEARCH_MODE.REGEXP, label: 'Regular expression' },
]

/**
 * NXSL constants the server registers for object queries. Classes without one cannot be queried
 * (notably Circuit, which the legacy filter lists).
 */
export const CLASS_CONSTANTS = {
  AccessPoint: 'ACCESSPOINT',
  Asset: 'ASSET',
  AssetGroup: 'ASSETGROUP',
  AssetRoot: 'ASSETROOT',
  BusinessService: 'BUSINESSSERVICE',
  BusinessServiceProto: 'BUSINESSSERVICEPROTOTYPE',
  BusinessServiceRoot: 'BUSINESSSERVICEROOT',
  Chassis: 'CHASSIS',
  CloudDomain: 'CLOUDDOMAIN',
  Cluster: 'CLUSTER',
  Collector: 'COLLECTOR',
  Condition: 'CONDITION',
  Container: 'CONTAINER',
  Dashboard: 'DASHBOARD',
  DashboardGroup: 'DASHBOARDGROUP',
  DashboardRoot: 'DASHBOARDROOT',
  DashboardTemplate: 'DASHBOARDTEMPLATE',
  Interface: 'INTERFACE',
  MobileDevice: 'MOBILEDEVICE',
  Network: 'NETWORK',
  NetworkMap: 'NETWORKMAP',
  NetworkMapGroup: 'NETWORKMAPGROUP',
  NetworkMapRoot: 'NETWORKMAPROOT',
  NetworkService: 'NETWORKSERVICE',
  Node: 'NODE',
  Rack: 'RACK',
  Sensor: 'SENSOR',
  ServiceRoot: 'SERVICEROOT',
  Subnet: 'SUBNET',
  Template: 'TEMPLATE',
  TemplateGroup: 'TEMPLATEGROUP',
  TemplateRoot: 'TEMPLATEROOT',
  VPNConnector: 'VPNCONNECTOR',
  WirelessDomain: 'WIRELESSDOMAIN',
  Zone: 'ZONE',
}

export const QUERYABLE_CLASSES = Object.keys(CLASS_CONSTANTS)

/**
 * `base` exists on every object and is referenced bare; `optional` is class-specific and goes
 * through `?.`. Approximates the legacy `AbstractObject.getStrings()` and its overrides.
 */
export const SEARCH_ATTRIBUTES = {
  base: ['name', 'alias', 'comments'],
  optional: [
    'primaryHostName',
    'sysDescription',
    'platformName',
    'snmpSysName',
    'snmpSysContact',
    'snmpSysLocation',
    'snmpOID',
    'description',
    'macAddr',
  ],
}

/**
 * The server resolves `fields[]` against script globals first, then the object attribute, with
 * an empty string when the class lacks it, so this is safe for every class.
 */
export const STANDARD_FIELDS = ['zoneUIN']

/**
 * The only place user input reaches the generated script. A raw newline inside a string is an
 * NXSL lexer error.
 *
 * @param {string} value
 * @returns {string} the literal, including its quotes
 */
export function nxslString(value) {
  const escaped = String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
  return `"${escaped}"`
}

/** `normal` is a literal substring match, as in legacy; NXSL `ilike` cannot escape `*` or `?`. */
function matchExpression(attribute, text, mode) {
  if (mode === SEARCH_MODE.REGEXP) return `${attribute} imatch ${nxslString(text)}`
  if (mode === SEARCH_MODE.PATTERN) return `${attribute} ilike ${nxslString(text)}`
  return `${attribute}.toLowerCase().contains(${nxslString(text)}.toLowerCase())`
}

function anyOf(expressions) {
  if (expressions.length === 0) return null
  if (expressions.length === 1) return expressions[0]
  return `(${expressions.join('\n   || ')})`
}

function textClause(text, mode) {
  const clauses = [
    ...SEARCH_ATTRIBUTES.base.map((attr) => matchExpression(attr, text, mode)),
    // A NULL attribute aborts the query; string() casts NULL to "".
    ...SEARCH_ATTRIBUTES.optional.map((attr) =>
      matchExpression(`string($object?.${attr})`, text, mode),
    ),
  ]
  return anyOf(clauses)
}

function classClause(classes) {
  const constants = classes.map((name) => CLASS_CONSTANTS[name]).filter(Boolean)
  if (constants.length === 0) return null
  return anyOf(constants.map((constant) => `type == ${constant}`))
}

/**
 * `zoneUIN` exists only on zone members, so an object with no zone (a container) passes, as in
 * the legacy filter.
 */
function zoneClause(zones) {
  if (zones.length === 0) return null
  const clauses = [
    '$object?.zoneUIN == null',
    ...zones.map((uin) => `$object?.zoneUIN == ${Number(uin)}`),
  ]
  return anyOf(clauses)
}

function ipClause(ipFrom, ipTo) {
  if (!ipFrom || !ipTo) return null
  return `new InetAddress(ipAddr).inRange(${nxslString(ipFrom)}, ${nxslString(ipTo)})`
}

/**
 * @typedef {object} ObjectFilterInput
 * @property {string} [text] - search string; empty matches everything
 * @property {string} [mode] - one of SEARCH_MODE
 * @property {string[]} [classes] - class names to keep; empty means every class
 * @property {number[]} [zones] - zone UINs to keep; empty means every zone
 * @property {string} [ipFrom] - inclusive start of the IP range; needs ipTo to take effect
 * @property {string} [ipTo] - inclusive end of the IP range
 */

/**
 * `rootObjectId` is not part of the script: the endpoint scopes the search to a sub-tree itself.
 *
 * @param {ObjectFilterInput} [input]
 * @returns {{ script: string, fields: string[] }}
 */
export function compileObjectFilter(input = {}) {
  const {
    text = '',
    mode = SEARCH_MODE.NORMAL,
    classes = [],
    zones = [],
    ipFrom = '',
    ipTo = '',
  } = input

  const trimmed = String(text).trim()

  const clauses = [
    classClause(classes),
    zoneClause(zones),
    ipClause(String(ipFrom).trim(), String(ipTo).trim()),
    trimmed ? textClause(trimmed, mode) : null,
  ].filter(Boolean)

  // An empty form matches every object, as the legacy filter's empty search string does.
  const script = clauses.length === 0 ? 'true' : clauses.join('\n&& ')

  return { script, fields: [...STANDARD_FIELDS] }
}

/**
 * Lets the view prompt instead of pulling the entire object tree on open.
 *
 * @param {ObjectFilterInput} [input]
 */
export function isEmptyFilter(input = {}) {
  return compileObjectFilter(input).script === 'true'
}
