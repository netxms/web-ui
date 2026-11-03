import { describe, it, expect } from 'vitest'
import { formatBssid, toRadioRow, toStationRow } from '@/utils/wirelessDisplay'

describe('formatBssid', () => {
  it('turns the radio endpoint bare hex into colon notation', () => {
    expect(formatBssid('e48d8c72cff3')).toBe('E4:8D:8C:72:CF:F3')
  })

  it('keeps an address that is already colon-separated', () => {
    expect(formatBssid('E4:8D:8C:72:CF:F3')).toBe('E4:8D:8C:72:CF:F3')
  })

  it('reads all zeroes and an absent value as not reported', () => {
    expect(formatBssid('000000000000')).toBeNull()
    expect(formatBssid('00:00:00:00:00:00')).toBeNull()
    expect(formatBssid('')).toBeNull()
    expect(formatBssid(undefined)).toBeNull()
  })

  it('passes through a value it cannot read rather than dropping it', () => {
    expect(formatBssid('E48D')).toBe('E48D')
  })
})

describe('toRadioRow', () => {
  const radio = {
    index: 1,
    ifIndex: 5,
    name: 'wlan1',
    bssid: 'E48D8C72CFF3',
    ssid: 'Office-2.4',
    band: 1,
    channel: 1,
    frequency: 2412,
    powerDBm: 0,
    powerMW: 0,
    ownerId: 42,
    ownerName: 'ap-1',
  }

  it('maps a reported radio', () => {
    expect(toRadioRow(radio, 3)).toEqual({
      id: 3,
      ownerId: 42,
      ownerName: 'ap-1',
      index: 1,
      name: 'wlan1',
      ssid: 'Office-2.4',
      bssid: 'E4:8D:8C:72:CF:F3',
      band: '2.4 GHz',
      bandSort: 1,
      channel: 1,
      frequency: '2412 MHz',
      frequencySort: 2412,
      powerDBm: 0,
      powerMW: 0,
    })
  })

  it('blanks what the device did not report, but keeps a zero transmit power', () => {
    const row = toRadioRow({ ...radio, band: 0, channel: 0, frequency: 0, ssid: '' }, 0)
    expect(row.band).toBeNull()
    expect(row.bandSort).toBeNull()
    expect(row.channel).toBeNull()
    expect(row.frequency).toBeNull()
    expect(row.frequencySort).toBeNull()
    expect(row.ssid).toBeNull()
    expect(row.powerDBm).toBe(0)
  })

  it('labels every documented band', () => {
    expect([2, 3, 4].map((band) => toRadioRow({ ...radio, band }, 0).band)).toEqual([
      '3.65 GHz',
      '5 GHz',
      '6 GHz',
    ])
  })
})

describe('toStationRow', () => {
  const station = {
    macAddress: '80:E6:50:1F:4D:62',
    vendor: 'Apple, Inc.',
    ipAddress: { address: '10.0.0.15', prefixLength: 24 },
    ssid: 'Office-5',
    bssid: 'E4:8D:8C:72:CF:F2',
    vlan: 10,
    rssi: -68,
    txRate: 866700000,
    rxRate: 6000000,
    radioIndex: 2,
    radioName: 'wlan2',
    accessPointId: 42,
    accessPointName: 'ap-1',
    nodeId: 77,
    nodeName: 'laptop-1',
  }

  it('maps a fully reported station', () => {
    expect(toStationRow(station, 4)).toEqual({
      id: 4,
      mac: '80:E6:50:1F:4D:62',
      vendor: 'Apple, Inc.',
      ip: '10.0.0.15',
      ipSort: '010.000.000.015',
      nodeId: 77,
      nodeName: 'laptop-1',
      accessPointId: 42,
      accessPointName: 'ap-1',
      radio: 'wlan2',
      ssid: 'Office-5',
      rssi: -68,
      vlan: 10,
      txRate: '866.7 Mbps',
      txRateSort: 866700000,
      rxRate: '6 Mbps',
      rxRateSort: 6000000,
    })
  })

  it('blanks the fields the server reports as unknown', () => {
    const row = toStationRow(
      {
        ...station,
        vendor: null,
        ipAddress: null,
        nodeId: 0,
        nodeName: null,
        accessPointId: 0,
        accessPointName: null,
        rssi: 0,
        vlan: 0,
        txRate: 0,
        rxRate: 0,
      },
      0,
    )
    expect(row.vendor).toBeNull()
    expect(row.ip).toBeNull()
    expect(row.ipSort).toBeNull()
    expect(row.nodeId).toBeNull()
    expect(row.accessPointId).toBeNull()
    expect(row.rssi).toBeNull()
    expect(row.vlan).toBeNull()
    expect(row.txRate).toBeNull()
    expect(row.rxRateSort).toBeNull()
  })

  it('treats the any-address as no address', () => {
    const row = toStationRow({ ...station, ipAddress: { address: '0.0.0.0' } }, 0)
    expect(row.ip).toBeNull()
    expect(row.ipSort).toBeNull()
  })

  it('falls back to the radio index when the radio could not be resolved', () => {
    expect(toStationRow({ ...station, radioName: null }, 0).radio).toBe('[2]')
    expect(toStationRow({ ...station, radioName: null, radioIndex: 0 }, 0).radio).toBeNull()
  })
})
