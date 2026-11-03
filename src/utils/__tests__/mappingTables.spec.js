import { describe, it, expect } from 'vitest'
import {
  parseNumericKey,
  normalizeKey,
  validateEntries,
  entriesFromCsv,
  lookupMappedValue,
} from '../mappingTables'

describe('parseNumericKey', () => {
  it('reads decimal and 0x-prefixed hexadecimal, with a sign', () => {
    expect(parseNumericKey('0')).toBe(0)
    expect(parseNumericKey('42')).toBe(42)
    expect(parseNumericKey('-7')).toBe(-7)
    expect(parseNumericKey('+7')).toBe(7)
    expect(parseNumericKey('0x1F')).toBe(31)
    expect(parseNumericKey('-0x10')).toBe(-16)
  })

  it('rejects what strtol would read differently from how it is written', () => {
    expect(parseNumericKey('010')).toBeNull() // octal to strtol
    expect(parseNumericKey('abc')).toBeNull() // becomes 0
    expect(parseNumericKey('12abc')).toBeNull() // becomes 12
    expect(parseNumericKey('')).toBeNull()
    expect(parseNumericKey('1.5')).toBeNull()
  })

  it('stays inside the int32 range the server stores', () => {
    expect(parseNumericKey('2147483647')).toBe(2147483647)
    expect(parseNumericKey('-2147483648')).toBe(-2147483648)
    expect(parseNumericKey('2147483648')).toBeNull()
    expect(parseNumericKey('0xFFFFFFFF')).toBeNull()
  })
})

describe('normalizeKey', () => {
  it('stores numeric keys in decimal and leaves text keys alone', () => {
    expect(normalizeKey('0x10', true)).toBe('16')
    expect(normalizeKey('0x10', false)).toBe('0x10')
  })
})

describe('validateEntries', () => {
  const entries = (...keys) => keys.map((key, id) => ({ id, key }))

  it('accepts distinct, well-formed keys', () => {
    expect(validateEntries(entries('a', 'b'), false).size).toBe(0)
    expect(validateEntries(entries('1', '0x2'), true).size).toBe(0)
  })

  it('requires a key', () => {
    expect(validateEntries(entries(''), false).get(0)).toBe('Key is required')
  })

  it('flags every entry of a duplicate set', () => {
    const errors = validateEntries(entries('a', 'b', 'a'), false)
    expect([...errors.keys()]).toEqual([2, 0])
    expect(errors.get(0)).toMatch(/Duplicate key "a"/)
  })

  it('finds duplicates after numeric normalization', () => {
    const errors = validateEntries(entries('16', '0x10'), true)
    expect(errors.size).toBe(2)
    expect(errors.get(1)).toMatch(/Duplicate key "16"/)
  })

  it('treats keys as text when the flag is off', () => {
    expect(validateEntries(entries('16', '0x10'), false).size).toBe(0)
  })

  it('rejects text keys in a numeric table, explaining octal separately', () => {
    const errors = validateEntries(entries('up', '010'), true)
    expect(errors.get(0)).toMatch(/whole number/)
    expect(errors.get(1)).toMatch(/octal/)
  })
})

describe('entriesFromCsv', () => {
  it('skips a Key,Value header and short records, defaulting the description', () => {
    expect(
      entriesFromCsv([
        ['Key', 'Value', 'Description'],
        ['only-one'],
        [' 1 ', 'up'],
        ['2', 'down', 'x'],
      ]),
    ).toEqual([
      { key: '1', value: 'up', description: '' },
      { key: '2', value: 'down', description: 'x' },
    ])
  })

  it('keeps a first record that is data', () => {
    expect(entriesFromCsv([['1', 'up']])).toEqual([{ key: '1', value: 'up', description: '' }])
  })
})

describe('lookupMappedValue', () => {
  const table = {
    elements: [
      { key: '1', value: 'up', description: '' },
      { key: '2', value: 'down', description: '' },
      { key: 'blank', value: '', description: '' },
    ],
  }

  it('maps a raw value by its exact key', () => {
    expect(lookupMappedValue(table, '1')).toBe('up')
    expect(lookupMappedValue(table, 2)).toBe('down')
  })

  it('matches the key as written, like the server and legacy client', () => {
    expect(lookupMappedValue(table, '01')).toBeNull()
    expect(lookupMappedValue(table, '1.0')).toBeNull()
    expect(lookupMappedValue(table, ' 1')).toBeNull()
  })

  it('keeps an entry whose value is empty', () => {
    expect(lookupMappedValue(table, 'blank')).toBe('')
  })

  it('maps nothing without a table, elements or a value', () => {
    expect(lookupMappedValue(undefined, '1')).toBeNull()
    expect(lookupMappedValue({}, '1')).toBeNull()
    expect(lookupMappedValue(table, '')).toBeNull()
    expect(lookupMappedValue(table, null)).toBeNull()
    expect(lookupMappedValue(table, '3')).toBeNull()
  })

  it('reads a refetched table, not the previous one', () => {
    expect(lookupMappedValue(table, '1')).toBe('up')
    const refetched = { elements: [{ key: '1', value: 'running', description: '' }] }
    expect(lookupMappedValue(refetched, '1')).toBe('running')
  })
})
