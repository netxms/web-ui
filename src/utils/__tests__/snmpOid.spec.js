import { describe, it, expect } from 'vitest'
import { normalizeOid, oidError, oidSortKey, dciDataTypeForMibType } from '../snmpOid'

describe('normalizeOid', () => {
  it('trims and drops one leading dot', () => {
    expect(normalizeOid('  .1.3.6.1 ')).toBe('1.3.6.1')
    expect(normalizeOid('1.3.6.1')).toBe('1.3.6.1')
  })

  it('treats a missing value as empty', () => {
    expect(normalizeOid(undefined)).toBe('')
  })
})

describe('oidError', () => {
  it('accepts dotted numbers, with or without a leading dot', () => {
    expect(oidError('1.3.6.1.4.1.2620.1.1')).toBe('')
    expect(oidError('.1.3.6.1.6.3.1.1.5.3')).toBe('')
    expect(oidError('1')).toBe('')
  })

  it('requires a value', () => {
    expect(oidError('')).toBe('OID is required')
    expect(oidError('  .  ')).toBe('OID is required')
  })

  // The server reads an empty element as 0; legacy refuses it, and so do we.
  it.each(['1..3', '1.3.', '1.3.6.1.x', 'iso.3.6', '1.-3', '1.3 .6'])('rejects %s', (oid) => {
    expect(oidError(oid)).toMatch(/numbers separated by dots/)
  })

  it('rejects an element beyond 32 bits', () => {
    expect(oidError('1.3.4294967295')).toBe('')
    expect(oidError('1.3.4294967296')).toMatch(/32 bits/)
  })

  it('applies a column limit only when given one', () => {
    const long = Array(26).fill('999999999').join('.')
    expect(oidError(long)).toBe('')
    expect(oidError(long, { maxLength: 255 })).toBe('OID cannot exceed 255 characters')
  })
})

describe('oidSortKey', () => {
  it('orders OIDs by number rather than by text', () => {
    const oids = ['1.3.6.1.10', '1.3.6.1.9', '.1.3.6.1.9.1', '1.3.6']
    const sorted = [...oids].sort((a, b) => oidSortKey(a).localeCompare(oidSortKey(b)))
    expect(sorted).toEqual(['1.3.6', '1.3.6.1.9', '.1.3.6.1.9.1', '1.3.6.1.10'])
  })
})

describe('dciDataTypeForMibType', () => {
  it('maps numeric MIB syntaxes as the legacy client does', () => {
    expect(dciDataTypeForMibType('INTEGER')).toBe('int32')
    expect(dciDataTypeForMibType('COUNTER32')).toBe('counter32')
    expect(dciDataTypeForMibType('GAUGE32')).toBe('uint32')
    expect(dciDataTypeForMibType('TIMETICKS')).toBe('uint32')
    expect(dciDataTypeForMibType('COUNTER64')).toBe('counter64')
  })

  it('collects anything else as a string', () => {
    expect(dciDataTypeForMibType('OCTETSTR')).toBe('string')
    expect(dciDataTypeForMibType('IPADDR')).toBe('string')
    expect(dciDataTypeForMibType(null)).toBe('string')
  })
})
