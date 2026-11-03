import { describe, it, expect } from 'vitest'
import { toCsv, safeFilename } from '@/utils/csvExport'

const columns = [
  { field: 'timestamp', label: 'Timestamp' },
  { field: 'value', label: 'Value' },
]

describe('toCsv', () => {
  it('writes a header from the column labels', () => {
    expect(toCsv([], columns).split('\r\n')[0]).toBe('Timestamp,Value')
  })

  it('falls back to the field name when a column has no label', () => {
    expect(toCsv([], [{ field: 'value' }])).toBe('value')
  })

  it('writes one CRLF-separated line per row', () => {
    const csv = toCsv(
      [
        { timestamp: 't1', value: 1 },
        { timestamp: 't2', value: 2 },
      ],
      columns,
    )
    expect(csv).toBe('Timestamp,Value\r\nt1,1\r\nt2,2')
  })

  it('renders null and undefined as empty fields', () => {
    expect(toCsv([{ timestamp: null, value: undefined }], columns)).toContain('\r\n,')
  })

  it('keeps a zero rather than treating it as absent', () => {
    expect(toCsv([{ timestamp: 't', value: 0 }], columns)).toContain('t,0')
  })

  it.each([
    ['a comma', 'a,b', '"a,b"'],
    ['a quote', 'say "hi"', '"say ""hi"""'],
    ['a newline', 'line1\nline2', '"line1\nline2"'],
    ['a carriage return', 'line1\rline2', '"line1\rline2"'],
  ])('quotes a field containing %s', (_label, value, expected) => {
    expect(toCsv([{ timestamp: value, value: 1 }], columns)).toContain(`${expected},1`)
  })

  it('leaves ordinary fields unquoted', () => {
    expect(toCsv([{ timestamp: 'plain', value: 1 }], columns)).toContain('plain,1')
  })

  it('honours a custom delimiter, quoting on that character instead', () => {
    const csv = toCsv([{ timestamp: 'a;b', value: 'c,d' }], columns, { delimiter: ';' })
    expect(csv).toContain('"a;b";c,d')
  })
})

describe('safeFilename', () => {
  it('strips path separators and shell-hostile characters', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('collapses whitespace into single dashes', () => {
    expect(safeFilename('Inbound   traffic on ether1')).toBe('Inbound-traffic-on-ether1')
  })

  it('trims leading and trailing dashes', () => {
    expect(safeFilename('  spaced  ')).toBe('spaced')
  })

  it('falls back when nothing usable remains', () => {
    expect(safeFilename('///')).toBe('export')
    expect(safeFilename('', 'chart')).toBe('chart')
    expect(safeFilename(null)).toBe('export')
  })
})
