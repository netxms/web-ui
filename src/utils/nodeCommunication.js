/**
 * Properties > Communication: validation and the PATCH /v1/objects/{id} body for the node
 * protocol groups (`ssh`, `vnc`, `modbus`, `etherNetIp`, `netconf`, `icmp`) and the single
 * communication fields of nodes, chassis and other data collection targets.
 */

export const NODE_WITHOUT_IP = '0.0.0.0'

export const ICMP_STAT_MODE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

// The groups are merge-patched, so only changed members go out. Credentials and the
// EtherNet/IP address clear with null.
const GROUP_FIELDS = {
  ssh: ['port', 'proxy', 'keyId', 'login', 'password'],
  vnc: ['port', 'proxy', 'password'],
  modbus: ['tcpPort', 'unitId', 'proxy'],
  etherNetIp: ['address', 'port', 'proxy'],
  netconf: ['port', 'proxy'],
  icmp: ['proxy', 'statCollectionMode'],
}

const NULL_WHEN_EMPTY = new Set(['login', 'password', 'address'])

const TOP_LEVEL_FIELDS = [
  'externalGateway',
  'mqttProxy',
  'syslogCodepage',
  'webServiceProxy',
  'controllerId',
  'bindUnderController',
]

/** The legacy client's check: a host name, or something shaped like an IPv4 or IPv6 address. */
export function isValidHostName(name) {
  return /^(([A-Za-z0-9_-]+\.)*[A-Za-z0-9_-]+|[A-Fa-f0-9:]+)$/.test(name.trim())
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/**
 * A unicast IPv4 or IPv6 address, which is what the server accepts as an ICMP target or an
 * EtherNet/IP address (anything else is a 400).
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isValidUnicastAddress(text) {
  const value = text.trim()
  if (IPV4.test(value)) {
    const first = Number(value.split('.')[0])
    return value !== NODE_WITHOUT_IP && value !== '255.255.255.255' && (first < 224 || first > 239)
  }
  if (!value.includes(':') || !/^[0-9A-Fa-f:.]+$/.test(value)) return false
  try {
    const host = new URL(`http://[${value}]/`).hostname
    return host !== '[::]' && !/^\[ff/i.test(host)
  } catch {
    return false
  }
}

function changedMembers(draftGroup, origGroup, fields) {
  const patch = {}
  for (const field of fields) {
    const value = field === 'login' ? draftGroup.login.trim() : draftGroup[field]
    if (value === origGroup?.[field]) continue
    patch[field] = NULL_WHEN_EMPTY.has(field) && !value ? null : value
  }
  return patch
}

/**
 * The communication part of the object PATCH, or an empty object. `primaryName` is not part of
 * it: the server checks it for an address conflict before it applies `externalGateway`, so it
 * goes in a request of its own after this one.
 *
 * @param {object} draft
 * @param {object|null} orig
 * @returns {object}
 */
export function communicationPatch(draft, orig) {
  const patch = {}
  for (const [group, fields] of Object.entries(GROUP_FIELDS)) {
    if (!draft[group]) continue
    const members = changedMembers(draft[group], orig?.[group], fields)
    if (group === 'icmp') {
      const targets = draft.icmp.targets ?? []
      if (JSON.stringify(targets) !== JSON.stringify(orig?.icmp?.targets ?? [])) {
        members.targets = [...targets]
      }
    }
    if (Object.keys(members).length) patch[group] = members
  }
  for (const field of TOP_LEVEL_FIELDS) {
    if (!(field in draft) || draft[field] === orig?.[field]) continue
    patch[field] = field === 'syslogCodepage' ? draft[field].trim() || null : draft[field]
  }
  return patch
}
