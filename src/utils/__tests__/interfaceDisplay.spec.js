// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  dot1xBackendStateText,
  dot1xPaeStateText,
  formatPhysicalLocation,
  formatUtilization,
  IF_FLAGS,
  interfacePropertiesPatch,
  isValidMacAddress,
  linesOf,
  ospfAreaText,
  ospfStateText,
  ospfTypeText,
  tabSeparatedRows,
} from '@/utils/interfaceDisplay'

const OSPF = { flags: IF_FLAGS.OSPF_INTERFACE, ospfArea: '0.0.0.1', ospfType: 1, ospfState: 5 }
const PORT = { flags: IF_FLAGS.PHYSICAL_PORT }

describe('state text', () => {
  it('names OSPF state and type on an OSPF interface, as legacy does', () => {
    expect(ospfStateText(OSPF)).toBe('DR')
    expect(ospfTypeText(OSPF)).toBe('BROADCAST')
    expect(ospfAreaText(OSPF)).toBe('0.0.0.1')
  })

  it('shows nothing for OSPF on an interface OSPF does not run on', () => {
    const plain = { ...OSPF, flags: 0 }
    expect(ospfStateText(plain)).toBe('')
    expect(ospfTypeText(plain)).toBe('')
    expect(ospfAreaText(plain)).toBe('')
  })

  it('names 802.1x states on a physical port only', () => {
    expect(dot1xPaeStateText({ ...PORT, dot1xPaeState: 5 })).toBe('AUTHENTICATED')
    expect(dot1xBackendStateText({ ...PORT, dot1xBackendState: 3 })).toBe('SUCCESS')
    expect(dot1xPaeStateText({ flags: 0, dot1xPaeState: 5 })).toBe('')
  })

  it('falls back to UNKNOWN for a code outside the table', () => {
    expect(dot1xPaeStateText({ ...PORT, dot1xPaeState: 99 })).toBe('UNKNOWN')
  })
})

describe('formatUtilization', () => {
  it('reads tenths of a percent', () => {
    expect(formatUtilization(153)).toBe('15.3%')
    expect(formatUtilization(0)).toBe('0.0%')
  })

  it('shows nothing for a value never measured', () => {
    expect(formatUtilization(-1)).toBe('')
    expect(formatUtilization(undefined)).toBe('')
  })
})

describe('formatPhysicalLocation', () => {
  it('uses the legacy chassis/module/pic/port notation on a physical port', () => {
    const iface = { ...PORT, physicalLocation: { chassis: 0, module: 1, pic: 0, port: 5 } }
    expect(formatPhysicalLocation(iface)).toBe('0/1/0/5')
  })

  it('shows nothing for a logical interface', () => {
    expect(formatPhysicalLocation({ flags: 0, physicalLocation: { port: 5 } })).toBe('')
  })
})

describe('copy text', () => {
  const rows = [
    { name: 'ether1', mac: '00:11:22:33:44:55' },
    { name: 'vlan4', mac: null },
  ]

  it('keeps an empty line for a row without the value, so pasted lines stay aligned', () => {
    expect(linesOf(rows, (row) => row.mac)).toBe('00:11:22:33:44:55\n')
  })

  it('writes rows as tab-separated columns and flattens tabs and newlines in a cell', () => {
    const columns = [{ id: 'name' }, { id: 'mac' }]
    const text = tabSeparatedRows(
      [...rows, { name: 'a\tb\nc', mac: '' }],
      columns,
      (row, col) => row[col.id],
    )
    expect(text).toBe('ether1\t00:11:22:33:44:55\nvlan4\t\na b c\t')
  })
})

describe('isValidMacAddress', () => {
  it('accepts colon- and hyphen-separated octets', () => {
    expect(isValidMacAddress('00:1A:2b:3C:4d:5E')).toBe(true)
    expect(isValidMacAddress(' 00-1A-2B-3C-4D-5E ')).toBe(true)
  })

  it('rejects anything the server would store as zeroes', () => {
    expect(isValidMacAddress('00:1A:2B:3C:4D')).toBe(false)
    expect(isValidMacAddress('router')).toBe(false)
    expect(isValidMacAddress('')).toBe(false)
    expect(isValidMacAddress(null)).toBe(false)
  })
})

describe('interfacePropertiesPatch', () => {
  const discovered = { expectedState: 0, requiredPollCount: 0, macAddress: 'AA:BB:CC:00:00:01' }
  const manual = { ...discovered, flags: IF_FLAGS.CREATED_MANUALLY }

  it('sends nothing when nothing changed', () => {
    expect(interfacePropertiesPatch({ ...discovered }, discovered)).toEqual({})
  })

  it('sends only the fields that changed', () => {
    expect(interfacePropertiesPatch({ ...discovered, expectedState: 2 }, discovered)).toEqual({
      expectedState: 2,
    })
    expect(interfacePropertiesPatch({ ...discovered, requiredPollCount: 3 }, discovered)).toEqual({
      requiredPollCount: 3,
    })
  })

  it('sends a MAC address only for a manually created interface', () => {
    const changed = { macAddress: 'AA:BB:CC:00:00:02' }
    expect(interfacePropertiesPatch({ ...discovered, ...changed }, discovered)).toEqual({})
    expect(interfacePropertiesPatch({ ...manual, ...changed }, manual)).toEqual(changed)
  })
})
