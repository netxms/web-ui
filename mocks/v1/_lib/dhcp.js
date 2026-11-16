// DHCP server data for node 395, shaped as GET /v1/objects/{id}/dhcp/scopes and .../leases.
// Kea-style numeric scope IDs. A scope's counters are counted from its leases, so Used matches
// the lease list; times are relative to the request.

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const SCOPES = [
  {
    id: '1',
    address: '10.20.1.0',
    name: 'Office LAN',
    ranges: '10.20.1.100 - 10.20.1.199',
    total: 100,
    enabled: true,
  },
  {
    id: '2',
    address: '10.20.2.0',
    name: 'Guest Wi-Fi',
    ranges: '10.20.2.10 - 10.20.2.49',
    total: 40,
    enabled: true,
  },
  {
    id: '3',
    address: '10.20.3.0',
    name: 'VoIP Phones',
    ranges: '10.20.3.50 - 10.20.3.99',
    total: 50,
    enabled: true,
  },
  {
    id: '4',
    address: '10.20.9.0',
    name: 'Lab',
    ranges: '10.20.9.10 - 10.20.9.29',
    total: 20,
    enabled: false,
  },
]

export const DHCP_SCOPE_IDS = new Set(SCOPES.map((scope) => scope.id))

const VENDORS = [
  ['3C:22:FB', 'Apple, Inc.'],
  ['F8:BC:12', 'Dell Inc.'],
  ['98:FA:9B', 'LCFC(HeFei) Electronics Technology co., ltd'],
  ['64:51:06', 'Hewlett Packard'],
  ['8C:79:F5', 'Samsung Electronics Co.,Ltd'],
  ['02:5A:7E', null],
]

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0')

function mac(prefix, n) {
  return `${prefix}:${hex((n * 37) % 256)}:${hex((n * 11) % 256)}:${hex(n % 256)}`
}

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString())

/**
 * @param {object} options
 * @param {string} options.scopeId
 * @param {string} options.ip
 * @param {string|null} options.mac
 * @param {string|null} options.vendor
 * @param {string} options.hostname
 * @param {string} [options.type]
 * @param {string} [options.state]
 * @param {number|null} options.last - ms
 * @param {number|null} options.expires - ms
 * @param {number} [options.nodeId]
 * @param {string|null} [options.nodeName]
 */
function lease({
  scopeId,
  ip,
  mac: macAddress,
  vendor,
  hostname,
  type = 'DYNAMIC',
  state = 'ACTIVE',
  last,
  expires,
  nodeId = 0,
  nodeName = null,
}) {
  return {
    ipAddress: ip,
    prefixLength: 32,
    scopeId,
    macAddress,
    vendor: macAddress ? vendor : null,
    clientId: macAddress ? `01:${macAddress.toLowerCase()}` : '',
    hostname,
    type,
    state,
    lastTransaction: iso(last),
    expiration: iso(expires),
    nodeId,
    nodeName,
  }
}

function buildLeases(now) {
  const leases = []

  // Office LAN: 24 h leases, a reserved access point and printer, a few expired and one declined.
  for (let i = 0; i < 23; i++) {
    const [prefix, vendor] = VENDORS[i % VENDORS.length]
    const last = now - (i * 37 + 5) * MINUTE
    leases.push(
      lease({
        scopeId: '1',
        ip: `10.20.1.${100 + i}`,
        mac: mac(prefix, i + 1),
        vendor,
        hostname: i % 3 === 0 ? `laptop-${String(i + 1).padStart(2, '0')}` : `ws-${101 + i}`,
        last,
        expires: last + 24 * HOUR,
      }),
    )
  }
  leases.push(
    lease({
      scopeId: '1',
      ip: '10.20.1.20',
      mac: '64:51:06:2C:90:11',
      vendor: 'Hewlett Packard',
      hostname: 'wifi-1',
      type: 'RESERVATION',
      last: now - 3 * HOUR,
      expires: now + 21 * HOUR,
      nodeId: 385,
      nodeName: 'wifi-1.office.example.com',
    }),
    lease({
      scopeId: '1',
      ip: '10.20.1.21',
      mac: '00:80:77:4E:12:A0',
      vendor: 'Brother Industries, LTD.',
      hostname: 'printer-2f',
      type: 'RESERVATION',
      state: 'INACTIVE',
      last: null,
      expires: null,
    }),
  )
  for (let i = 0; i < 3; i++) {
    const last = now - (30 + i * 6) * HOUR
    leases.push(
      lease({
        scopeId: '1',
        ip: `10.20.1.${140 + i}`,
        mac: mac('F8:BC:12', 60 + i),
        vendor: 'Dell Inc.',
        hostname: `ws-${140 + i}`,
        state: 'EXPIRED',
        last,
        expires: last + 24 * HOUR,
      }),
    )
  }
  leases.push(
    lease({
      scopeId: '1',
      ip: '10.20.1.150',
      mac: null,
      vendor: null,
      hostname: '',
      state: 'DECLINED',
      last: now - 50 * MINUTE,
      expires: now + 23 * HOUR,
    }),
  )

  // Guest Wi-Fi: 4 h leases, nearly full.
  for (let i = 0; i < 34; i++) {
    const [prefix, vendor] = VENDORS[(i + 2) % VENDORS.length]
    const last = now - (i * 6 + 2) * MINUTE
    leases.push(
      lease({
        scopeId: '2',
        ip: `10.20.2.${10 + i}`,
        mac: mac(prefix, 100 + i),
        vendor,
        hostname: i % 4 === 0 ? '' : `guest-device-${i + 1}`,
        last,
        expires: last + 4 * HOUR,
      }),
    )
  }
  for (let i = 0; i < 2; i++) {
    leases.push(
      lease({
        scopeId: '2',
        ip: `10.20.2.${44 + i}`,
        mac: mac('8C:79:F5', 200 + i),
        vendor: 'Samsung Electronics Co.,Ltd',
        hostname: `Galaxy-S2${4 + i}`,
        state: 'RELEASED',
        last: now - (2 + i) * HOUR,
        expires: null,
      }),
    )
  }

  // VoIP Phones: 7 day leases.
  for (let i = 0; i < 18; i++) {
    const last = now - (i * 5 + 1) * HOUR
    leases.push(
      lease({
        scopeId: '3',
        ip: `10.20.3.${50 + i}`,
        mac: mac('80:5E:C0', 30 + i),
        vendor: 'YEALINK(XIAMEN) NETWORK TECHNOLOGY CO.,LTD.',
        hostname: `sip-${2100 + i}`,
        last,
        expires: last + 7 * 24 * HOUR,
      }),
    )
  }
  leases.push(
    lease({
      scopeId: '3',
      ip: '10.20.3.68',
      mac: mac('80:5E:C0', 48),
      vendor: 'YEALINK(XIAMEN) NETWORK TECHNOLOGY CO.,LTD.',
      hostname: 'sip-2118',
      state: 'OFFERED',
      last: now - 2 * MINUTE,
      expires: now + 2 * MINUTE,
    }),
  )

  return leases
}

/** @param {string|null} scopeId - every scope when null */
export function dhcpLeases(scopeId = null) {
  const leases = buildLeases(Math.floor(Date.now() / MINUTE) * MINUTE)
  return scopeId ? leases.filter((entry) => entry.scopeId === scopeId) : leases
}

export function dhcpScopes() {
  const leases = dhcpLeases()
  return SCOPES.map((scope) => {
    const own = leases.filter((entry) => entry.scopeId === scope.id)
    const used = own.filter((entry) => entry.state === 'ACTIVE').length
    const declined = own.filter((entry) => entry.state === 'DECLINED').length
    return {
      id: scope.id,
      network: { family: 2, address: scope.address, prefixLength: 24 },
      name: scope.name,
      ranges: scope.ranges,
      enabled: scope.enabled,
      totalAddresses: scope.total,
      usedAddresses: used,
      declinedAddresses: declined,
      freeAddresses: scope.total - used - declined,
      utilization: (used * 100) / scope.total,
    }
  })
}
