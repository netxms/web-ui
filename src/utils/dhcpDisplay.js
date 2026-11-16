/**
 * Rows for the DHCP view. Type and state follow the `DhcpLease` enums in the WebAPI; they sort
 * by the server's numeric codes (`DHCP_LEASE_*` in nxcldefs.h), as the legacy view does.
 */
import { ipSortKey } from '@/utils/objectUtils'
import { formatDateTimeMedium } from '@/utils/timeFormat'

const LEASE_TYPES = [
  ['DYNAMIC', 'Dynamic'],
  ['RESERVATION', 'Reservation'],
]

const LEASE_STATES = [
  ['ACTIVE', 'Active'],
  ['EXPIRED', 'Expired'],
  ['DECLINED', 'Declined'],
  ['RELEASED', 'Released'],
  ['OFFERED', 'Offered'],
  ['INACTIVE', 'Inactive'],
]

const typeIndex = new Map(LEASE_TYPES.map(([code], i) => [code, i]))
const typeLabel = new Map(LEASE_TYPES)
const stateIndex = new Map(LEASE_STATES.map(([code], i) => [code, i]))
const stateLabel = new Map(LEASE_STATES)

/**
 * @param {{ address?: string, prefixLength?: number }|null|undefined} network
 * @returns {string|null}
 */
function formatNetwork(network) {
  if (!network?.address) return null
  return network.prefixLength != null
    ? `${network.address}/${network.prefixLength}`
    : network.address
}

/**
 * The scope's network, or its ID when the server does not know the network.
 *
 * @param {object} scope - one `DhcpScope`
 * @returns {string}
 */
export function scopeLabel(scope) {
  return formatNetwork(scope.network) ?? scope.id
}

/**
 * @param {object} entry - one `DhcpScope`
 */
export function toScopeRow(entry) {
  const utilization = entry.utilization ?? null
  return {
    id: entry.id,
    network: scopeLabel(entry),
    networkSort: entry.network?.address ? ipSortKey(entry.network) : null,
    name: entry.name || null,
    ranges: entry.ranges || null,
    enabled: entry.enabled !== false,
    total: entry.totalAddresses ?? null,
    used: entry.usedAddresses ?? null,
    declined: entry.declinedAddresses ?? null,
    free: entry.freeAddresses ?? null,
    utilization,
    utilizationText: utilization == null ? null : `${utilization.toFixed(1)}%`,
  }
}

/**
 * A delegated IPv6 prefix carries its length; a single address (/32 or /128) does not.
 *
 * @param {object} entry - one `DhcpLease`
 * @returns {string|null}
 */
function leaseAddress(entry) {
  const address = entry.ipAddress || null
  if (!address) return null
  const isPrefix = address.includes(':') && entry.prefixLength != null && entry.prefixLength < 128
  return isPrefix ? `${address}/${entry.prefixLength}` : address
}

function timestamp(value) {
  const ms = value ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : null
}

/**
 * @param {object} entry - one `DhcpLease`
 * @param {number} index - position in the response, the row id
 * @param {Map<string, string>} [scopeLabels] - scope ID to `scopeLabel`
 */
export function toLeaseRow(entry, index, scopeLabels = new Map()) {
  const scopeId = entry.scopeId || null
  return {
    id: index,
    ip: leaseAddress(entry),
    ipSort: entry.ipAddress ? ipSortKey({ address: entry.ipAddress }) : null,
    mac: entry.macAddress ?? null,
    vendor: entry.vendor ?? null,
    hostname: entry.hostname || null,
    nodeId: entry.nodeId || null,
    nodeName: entry.nodeName ?? null,
    clientId: entry.clientId || null,
    scopeId,
    scope: scopeId ? (scopeLabels.get(scopeId) ?? scopeId) : null,
    type: typeLabel.get(entry.type) ?? null,
    typeSort: typeIndex.get(entry.type) ?? null,
    state: stateLabel.get(entry.state) ?? 'Unknown',
    stateSort: stateIndex.get(entry.state) ?? null,
    lastTransaction: formatDateTimeMedium(entry.lastTransaction, { fallback: null }),
    lastTransactionSort: timestamp(entry.lastTransaction),
    expiration: formatDateTimeMedium(entry.expiration, { fallback: null }),
    expirationSort: timestamp(entry.expiration),
  }
}
