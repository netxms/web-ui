/**
 * Like the legacy label providers, a value the device did not report (channel, frequency, RSSI,
 * VLAN or rate of 0) becomes null; transmit power keeps its 0.
 */
import { parseMacQuery } from '@/utils/macAddress'
import { formatIpAddress, formatSpeed, ipSortKey } from '@/utils/objectUtils'

/** Radio band codes: `RadioBand` in the Java client, the `band` enum in the WebAPI. 0 is unknown. */
export const RADIO_BAND_LABELS = {
  1: '2.4 GHz',
  2: '3.65 GHz',
  3: '5 GHz',
  4: '6 GHz',
}

/**
 * Radio BSSIDs arrive as 12 bare hex digits, unlike every other MAC in the WebAPI. All zeroes
 * means not reported.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function formatBssid(raw) {
  if (!raw || /^[0:]+$/.test(raw)) return null
  const mac = parseMacQuery(raw)
  return mac.isMac && !mac.isPartial ? mac.normalized : raw
}

/**
 * @param {object} entry - one `WirelessRadioInterface`
 * @param {number} index - position in the response, the row id
 */
export function toRadioRow(entry, index) {
  return {
    id: index,
    ownerId: entry.ownerId || null,
    ownerName: entry.ownerName ?? null,
    index: entry.index ?? null,
    name: entry.name || null,
    ssid: entry.ssid || null,
    bssid: formatBssid(entry.bssid),
    band: RADIO_BAND_LABELS[entry.band] ?? null,
    bandSort: RADIO_BAND_LABELS[entry.band] ? entry.band : null,
    channel: entry.channel || null,
    frequency: entry.frequency ? `${entry.frequency} MHz` : null,
    frequencySort: entry.frequency || null,
    powerDBm: entry.powerDBm ?? null,
    powerMW: entry.powerMW ?? null,
  }
}

/**
 * @param {object} entry - one `WirelessStation`
 * @param {number} index - position in the response, the row id
 */
export function toStationRow(entry, index) {
  const ip = formatIpAddress(entry.ipAddress)
  return {
    id: index,
    mac: entry.macAddress || null,
    vendor: entry.vendor ?? null,
    ip,
    ipSort: ip ? ipSortKey(entry.ipAddress) : null,
    nodeId: entry.nodeId || null,
    nodeName: entry.nodeName ?? null,
    accessPointId: entry.accessPointId || null,
    accessPointName: entry.accessPointName ?? null,
    radio: entry.radioName ?? (entry.radioIndex ? `[${entry.radioIndex}]` : null),
    ssid: entry.ssid || null,
    rssi: entry.rssi || null,
    vlan: entry.vlan || null,
    txRate: formatSpeed(entry.txRate) || null,
    txRateSort: entry.txRate || null,
    rxRate: formatSpeed(entry.rxRate) || null,
    rxRateSort: entry.rxRate || null,
  }
}
