/**
 * Per-object access rights (OBJECT_ACCESS_* bitmasks stored in each object's ACL) and user/group
 * id helpers; system-level rights are in systemRights.js. Bit 31 is in use and JS bitwise
 * operators are signed 32-bit, so the helpers do the math in BigInt and return plain Numbers.
 */

/** User database ids with this bit set are groups; plain ids are users. */
export const GROUP_FLAG = 0x40000000

/** The built-in "Everyone" group (group id 0 → just the group flag). */
export const EVERYONE_GROUP_ID = 0x40000000

/** The built-in superuser "system". */
export const SYSTEM_USER_ID = 0

/**
 * @param {number} id - user database object id
 * @returns {boolean} true if the id refers to a group
 */
export function isGroupId(id) {
  return (id & GROUP_FLAG) !== 0
}

/**
 * All object access rights in the legacy client's display order, grouped for UI subheadings.
 * `key` matches the server's OBJECT_ACCESS_* constant, `api` is the right's name in an object's
 * `effectiveRights` document, and `mask` its bit in a stored ACL entry; the two wire forms are
 * unrelated, so both live here.
 */
export const OBJECT_ACCESS_RIGHTS = Object.freeze([
  {
    key: 'READ',
    api: 'read',
    mask: 0x00000001,
    label: 'Read',
    group: 'Read',
  },
  {
    key: 'READ_AGENT',
    api: 'readAgentData',
    mask: 0x00010000,
    label: 'Read agent data',
    group: 'Read',
  },
  {
    key: 'READ_SNMP',
    api: 'readSnmpData',
    mask: 0x00020000,
    label: 'Read SNMP data',
    group: 'Read',
  },
  {
    key: 'READ_CREDENTIALS',
    api: 'readCredentials',
    mask: 0x04000000,
    label: 'Read credentials',
    group: 'Read',
  },
  {
    key: 'READ_DEVICE_CONFIG',
    api: 'readDeviceConfig',
    mask: 0x20000000,
    label: 'Read device configuration',
    group: 'Read',
  },
  {
    key: 'READ_DC_CONFIG',
    api: 'readDataCollectionConfig',
    mask: 0x40000000,
    label: 'Read data collection configuration',
    group: 'Read',
  },
  {
    key: 'QUERY_WEBSVC',
    api: 'queryWebService',
    mask: 0x08000000,
    label: 'Query web service',
    group: 'Read',
  },
  {
    key: 'DELEGATED_READ',
    api: 'delegatedRead',
    mask: 0x00800000,
    label: 'Delegated read',
    group: 'Read',
  },
  {
    key: 'MODIFY',
    api: 'modify',
    mask: 0x00000002,
    label: 'Modify',
    group: 'Modify',
  },
  {
    key: 'EDIT_COMMENTS',
    api: 'editComments',
    mask: 0x00200000,
    label: 'Edit comments',
    group: 'Modify',
  },
  {
    key: 'EDIT_RESP_USERS',
    api: 'manageResponsibleUsers',
    mask: 0x00400000,
    label: 'Manage responsible users',
    group: 'Modify',
  },
  {
    key: 'CREATE',
    api: 'createChildObjects',
    mask: 0x00000004,
    label: 'Create child objects',
    group: 'Modify',
  },
  {
    key: 'DELETE',
    api: 'delete',
    mask: 0x00000008,
    label: 'Delete',
    group: 'Modify',
  },
  {
    key: 'CONTROL',
    api: 'control',
    mask: 0x00000100,
    label: 'Control',
    group: 'Control',
  },
  {
    key: 'EXECUTE_SCRIPT',
    api: 'executeScript',
    mask: 0x80000000,
    label: 'Execute scripts',
    group: 'Control',
  },
  {
    key: 'SCREENSHOT',
    api: 'takeScreenshot',
    mask: 0x00040000,
    label: 'Take screenshot',
    group: 'Control',
  },
  {
    key: 'SEND_EVENTS',
    api: 'sendEvents',
    mask: 0x00000080,
    label: 'Send events',
    group: 'Events & Alarms',
  },
  {
    key: 'READ_ALARMS',
    api: 'viewAlarms',
    mask: 0x00000010,
    label: 'View alarms',
    group: 'Events & Alarms',
  },
  {
    key: 'UPDATE_ALARMS',
    api: 'updateAlarms',
    mask: 0x00000040,
    label: 'Update alarms',
    group: 'Events & Alarms',
  },
  {
    key: 'TERM_ALARMS',
    api: 'terminateAlarms',
    mask: 0x00000200,
    label: 'Terminate alarms',
    group: 'Events & Alarms',
  },
  {
    key: 'CREATE_ISSUE',
    api: 'createHelpdeskTicket',
    mask: 0x00000800,
    label: 'Create helpdesk tickets',
    group: 'Events & Alarms',
  },
  {
    key: 'MANAGE_INCIDENTS',
    api: 'manageIncidents',
    mask: 0x02000000,
    label: 'Manage incidents',
    group: 'Events & Alarms',
  },
  {
    key: 'PUSH_DATA',
    api: 'pushData',
    mask: 0x00000400,
    label: 'Push data',
    group: 'Data',
  },
  {
    key: 'DOWNLOAD',
    api: 'downloadFiles',
    mask: 0x00001000,
    label: 'Download files',
    group: 'Files',
  },
  {
    key: 'UPLOAD',
    api: 'uploadFiles',
    mask: 0x00002000,
    label: 'Upload files',
    group: 'Files',
  },
  {
    key: 'UPLOAD_DEVICE_CONFIG',
    api: 'uploadDeviceConfig',
    mask: 0x10000000,
    label: 'Upload device configuration',
    group: 'Files',
  },
  {
    key: 'MANAGE_FILES',
    api: 'manageFiles',
    mask: 0x00004000,
    label: 'Manage files',
    group: 'Files',
  },
  {
    key: 'MAINTENANCE',
    api: 'controlMaintenanceMode',
    mask: 0x00008000,
    label: 'Control maintenance mode',
    group: 'Maintenance',
  },
  {
    key: 'WRITE_MJOURNAL',
    api: 'editMaintenanceJournal',
    mask: 0x00080000,
    label: 'Edit maintenance journal',
    group: 'Maintenance',
  },
  {
    key: 'ACL',
    api: 'accessControl',
    mask: 0x00000020,
    label: 'Access control',
    group: 'Administration',
  },
  {
    key: 'CONFIGURE_AGENT',
    api: 'configureAgent',
    mask: 0x00100000,
    label: 'Configure agent',
    group: 'Administration',
  },
  {
    key: 'MANAGE_POLICIES',
    api: 'managePolicies',
    mask: 0x01000000,
    label: 'Manage policies',
    group: 'Administration',
  },
])

/**
 * The same rights, bucketed under their UI subheadings in declaration order.
 *
 * @returns {Array<{name: string, rights: typeof OBJECT_ACCESS_RIGHTS}>}
 */
export function groupObjectAccessRights() {
  const groups = []
  for (const right of OBJECT_ACCESS_RIGHTS) {
    let group = groups.find((g) => g.name === right.group)
    if (!group) {
      group = { name: right.group, rights: [] }
      groups.push(group)
    }
    group.rights.push(right)
  }
  return groups
}

/**
 * Right name -> mask.
 * @type {Readonly<Record<string, number>>}
 */
export const OBJECT_ACCESS = Object.freeze(
  Object.fromEntries(OBJECT_ACCESS_RIGHTS.map((r) => [r.key, r.mask])),
)

/**
 * Right name -> `effectiveRights` attribute name, derived from the same table.
 * @type {Readonly<Record<string, string>>}
 */
export const OBJECT_RIGHT_API_NAMES = Object.freeze(
  Object.fromEntries(OBJECT_ACCESS_RIGHTS.map((r) => [r.key, r.api])),
)

/** OR of every defined object access right. */
export const FULL_ACCESS_MASK = Number(
  OBJECT_ACCESS_RIGHTS.reduce((acc, r) => acc | BigInt(r.mask), 0n),
)

/**
 * @param {number} access - access bitmask
 * @param {number} mask - single right mask
 * @returns {boolean}
 */
export function hasAccessBit(access, mask) {
  const m = BigInt(mask)
  return (BigInt(access) & m) === m
}

/**
 * @param {number} access
 * @param {number} mask
 * @param {boolean} on
 * @returns {number}
 */
export function setAccessBit(access, mask, on) {
  const a = BigInt(access)
  const m = BigInt(mask)
  return Number(on ? a | m : a & ~m)
}

/**
 * Does the logged-in user hold a named right on this object? Without `effectiveRights` (older
 * server, embedded summary), or with the right missing from it, the answer is `true` and the
 * server refuses instead; only an explicit `false` hides anything. UX only: the server always
 * enforces rights.
 *
 * These are UX-only checks. The server always enforces rights independently.
 *
 * @param {{ effectiveRights?: Record<string, boolean>|null }|null|undefined} object - adapted object
 * @param {string} rightKey - key from OBJECT_ACCESS (e.g. 'DELETE')
 * @returns {boolean}
 */
export function hasObjectRight(object, rightKey) {
  const apiName = OBJECT_RIGHT_API_NAMES[rightKey]
  if (apiName === undefined) throw new Error(`Unknown object access right: ${rightKey}`)

  const rights = object?.effectiveRights
  if (rights === null || rights === undefined) return true

  return rights[apiName] !== false
}

/**
 * Human-readable one-line summary of an access bitmask:
 * "No rights", "Read", "Read +4", or "Full access".
 * @param {number} access
 * @returns {string}
 */
export function summarizeAccess(access) {
  if (!access) return 'No rights'
  if (hasAccessBit(access, FULL_ACCESS_MASK)) return 'Full access'
  const granted = OBJECT_ACCESS_RIGHTS.filter((r) => hasAccessBit(access, r.mask))
  if (granted.length === 0) return 'No rights'
  const first = granted[0].label
  return granted.length === 1 ? first : `${first} +${granted.length - 1}`
}
