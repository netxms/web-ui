import { describe, it, expect } from 'vitest'
import { parameterSource, toParameterRequest } from '../snmpTrapMappings'

describe('parameterSource', () => {
  it('names the position or the OID', () => {
    expect(parameterSource({ oid: '', position: 3 })).toBe('Position 3')
    expect(parameterSource({ oid: '1.3.6.1.2.1.2.2.1.1', position: 0 })).toBe('1.3.6.1.2.1.2.2.1.1')
  })
})

describe('toParameterRequest', () => {
  it('sends a position without the OID', () => {
    expect(
      toParameterRequest({ oid: '1.3.6', position: 2, description: 'ifIndex', flags: 1 }),
    ).toEqual({ position: 2, description: 'ifIndex', flags: 1 })
  })

  it('sends an OID, normalized, without a position', () => {
    expect(
      toParameterRequest({ oid: ' .1.3.6.1 ', position: 0, description: '', flags: 0 }),
    ).toEqual({ oid: '1.3.6.1', description: '', flags: 0 })
  })
})
