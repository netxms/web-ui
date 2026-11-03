import { describe, it, expect } from 'vitest'
import {
  parseTableDiscoveryData,
  formatTableDiscoveryData,
  parseOtlpDiscoveryData,
  formatOtlpDiscoveryData,
  parseOtlpKeyList,
  defaultOtlpNameFormat,
} from '../instanceDiscoveryData'

describe('table discovery data', () => {
  it('splits the column off the last colon', () => {
    expect(parseTableDiscoveryData('Hardware.Components:CATEGORY, INDEX')).toEqual({
      table: 'Hardware.Components',
      column: 'CATEGORY, INDEX',
    })
    expect(parseTableDiscoveryData('A:B:COL')).toEqual({ table: 'A:B', column: 'COL' })
  })

  it('reads data without a column as the table name', () => {
    expect(parseTableDiscoveryData('Network.Interfaces')).toEqual({
      table: 'Network.Interfaces',
      column: '',
    })
    expect(parseTableDiscoveryData(null)).toEqual({ table: '', column: '' })
  })

  it('appends the column only when there is one', () => {
    expect(formatTableDiscoveryData({ table: 'T', column: 'ID' })).toBe('T:ID')
    expect(formatTableDiscoveryData({ table: 'T', column: '' })).toBe('T')
    expect(formatTableDiscoveryData({ table: 'T', column: '  ' })).toBe('T')
  })

  it('round-trips without changing the stored string', () => {
    for (const data of ['T:ID', 'A:B:COL', 'Plain', '']) {
      expect(formatTableDiscoveryData(parseTableDiscoveryData(data))).toBe(data)
    }
  })
})

describe('OTLP discovery data', () => {
  it('splits pattern, key attributes and name format', () => {
    expect(parseOtlpDiscoveryData('http.*;host,port;%{host}:%{port}')).toEqual({
      pattern: 'http.*',
      keys: 'host,port',
      format: '%{host}:%{port}',
    })
  })

  it('keeps everything after the second separator in the format', () => {
    expect(parseOtlpDiscoveryData('p;k;a;b').format).toBe('a;b')
  })

  it('reads a bare pattern', () => {
    expect(parseOtlpDiscoveryData('system.cpu.*')).toEqual({
      pattern: 'system.cpu.*',
      keys: '',
      format: '',
    })
  })

  it('packs like the legacy client', () => {
    expect(formatOtlpDiscoveryData({ pattern: 'p', keys: '', format: '' })).toBe('p')
    expect(formatOtlpDiscoveryData({ pattern: 'p', keys: 'k', format: '' })).toBe('p;k')
    expect(formatOtlpDiscoveryData({ pattern: 'p', keys: '', format: 'f' })).toBe('p;;f')
    expect(formatOtlpDiscoveryData({ pattern: 'p', keys: 'k', format: 'f' })).toBe('p;k;f')
  })

  it('keeps text as typed, including spaces', () => {
    expect(formatOtlpDiscoveryData({ pattern: 'p', keys: 'a, b', format: '%{a} %{b}' })).toBe(
      'p;a, b;%{a} %{b}',
    )
  })

  it('round-trips without changing the stored string', () => {
    for (const data of ['p', 'p;k', 'p;;f', 'p;k;f', '']) {
      expect(formatOtlpDiscoveryData(parseOtlpDiscoveryData(data))).toBe(data)
    }
  })
})

describe('OTLP key attributes', () => {
  it('reads a comma-separated key list, ignoring spaces and blanks', () => {
    expect(parseOtlpKeyList('host, port,,device ')).toEqual(['host', 'port', 'device'])
    expect(parseOtlpKeyList('')).toEqual([])
    expect(parseOtlpKeyList(null)).toEqual([])
  })

  it('builds the default name format from the keys', () => {
    expect(defaultOtlpNameFormat(['host', 'port'])).toBe('%{host}:%{port}')
    expect(defaultOtlpNameFormat([])).toBe('')
  })
})
