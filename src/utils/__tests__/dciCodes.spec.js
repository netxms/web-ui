// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DCI_ORIGIN_NAMES,
  dciDataTypeCode,
  dciObjectTypeCode,
  dciOriginCode,
  dciOriginForWrite,
  dciOriginName,
  dciSeverityCode,
  dciStatusCode,
} from '../dciCodes'
import { DCI_DATA_TYPES } from '../dciFormat'

describe('DCI origins', () => {
  // DS_* in include/nxcldefs.h against g_dciOriginNames in src/server/core/dcobject.cpp.
  it.each([
    [0, 'internal'],
    [1, 'agent'],
    [2, 'snmp'],
    [3, 'websvc'],
    [7, 'script'],
    [14, 'otlp'],
    [17, 'computed'],
  ])('maps DS_* %i and "%s" both ways', (code, name) => {
    expect(dciOriginName(code)).toBe(name)
    expect(dciOriginName(name)).toBe(name)
    expect(dciOriginCode(code)).toBe(code)
    expect(dciOriginCode(name)).toBe(code)
  })

  it('reads the pre-rename "nxagent" as "agent"', () => {
    expect(dciOriginName('nxagent')).toBe('agent')
    expect(dciOriginCode('nxagent')).toBe(1)
  })

  it('passes an origin it does not know through', () => {
    expect(dciOriginName(18)).toBe(18)
    expect(dciOriginName('quantum')).toBe('quantum')
    expect(dciOriginCode('quantum')).toBe('quantum')
    expect(dciOriginName(undefined)).toBeUndefined()
    expect(dciOriginName('constructor')).toBe('constructor')
  })

  it('has one name per DS_* code up to DS_COMPUTED', () => {
    expect(DCI_ORIGIN_NAMES).toHaveLength(18)
    expect(new Set(DCI_ORIGIN_NAMES).size).toBe(18)
  })

  describe('dciOriginForWrite', () => {
    // A stable-6.2 server rejects "agent", a newer one rejects "nxagent"; both take the code.
    it('writes the agent origin as its code, under either spelling', () => {
      expect(dciOriginForWrite('agent')).toBe(1)
      expect(dciOriginForWrite('nxagent')).toBe(1)
      expect(dciOriginForWrite(1)).toBe(1)
    })

    it('writes every other origin by name', () => {
      expect(dciOriginForWrite('snmp')).toBe('snmp')
      expect(dciOriginForWrite(3)).toBe('websvc')
      expect(dciOriginForWrite('quantum')).toBe('quantum')
    })
  })
})

describe('dciDataTypeCode', () => {
  it.each([
    ['int32', DCI_DATA_TYPES.INT32],
    ['uint32', DCI_DATA_TYPES.UINT32],
    ['int64', DCI_DATA_TYPES.INT64],
    ['uint64', DCI_DATA_TYPES.UINT64],
    ['string', DCI_DATA_TYPES.STRING],
    ['float', DCI_DATA_TYPES.FLOAT],
    ['null', DCI_DATA_TYPES.NULL],
    ['counter32', DCI_DATA_TYPES.COUNTER32],
    ['counter64', DCI_DATA_TYPES.COUNTER64],
  ])('maps "%s" to DCI_DT %i', (name, code) => {
    expect(dciDataTypeCode(name)).toBe(code)
    expect(dciDataTypeCode(code)).toBe(code)
  })

  it('passes a type it does not know through', () => {
    expect(dciDataTypeCode('decimal')).toBe('decimal')
    expect(dciDataTypeCode(undefined)).toBeUndefined()
  })
})

describe('dciStatusCode', () => {
  it('maps g_dciStatusNames to ITEM_STATUS_*', () => {
    expect(['active', 'disabled', 'unsupported'].map(dciStatusCode)).toEqual([0, 1, 2])
    expect(dciStatusCode(1)).toBe(1)
  })
})

describe('dciSeverityCode', () => {
  it('maps g_severityNames to SEVERITY_*', () => {
    expect(['normal', 'warning', 'minor', 'major', 'critical'].map(dciSeverityCode)).toEqual([
      0, 1, 2, 3, 4,
    ])
    expect(dciSeverityCode(3)).toBe(3)
    expect(dciSeverityCode('catastrophic')).toBe('catastrophic')
  })
})

describe('dciObjectTypeCode', () => {
  it("maps the config endpoint's 'item' / 'table' to DCO_TYPE_*", () => {
    expect(dciObjectTypeCode('item')).toBe(1)
    expect(dciObjectTypeCode('table')).toBe(2)
    expect(dciObjectTypeCode(2)).toBe(2)
    expect(dciObjectTypeCode('toString')).toBe('toString')
  })
})
