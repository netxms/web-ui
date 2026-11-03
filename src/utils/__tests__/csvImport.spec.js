import { describe, it, expect } from 'vitest'
import { parseCsv } from '../csvImport'
import { toCsv } from '../csvExport'

describe('parseCsv', () => {
  it('splits plain records on CRLF and LF', () => {
    expect(parseCsv('a,b\r\nc,d\ne,f')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ])
  })

  it('reads quoted fields with delimiters, doubled quotes and line breaks', () => {
    expect(parseCsv('"x,y","say ""hi""","two\nlines"\r\n')).toEqual([
      ['x,y', 'say "hi"', 'two\nlines'],
    ])
  })

  it('keeps empty fields, including a trailing one', () => {
    expect(parseCsv('a,,c,\n')).toEqual([['a', '', 'c', '']])
  })

  it('skips blank lines and a leading byte order mark', () => {
    expect(parseCsv(`${String.fromCharCode(0xfeff)}a,b\n\n\nc,d\n`)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('reads back exactly what toCsv writes', () => {
    const rows = [
      { key: '1', value: 'up, running', description: 'quote " inside' },
      { key: '2', value: 'multi\r\nline', description: '' },
    ]
    const columns = [
      { field: 'key', label: 'Key' },
      { field: 'value', label: 'Value' },
      { field: 'description', label: 'Description' },
    ]
    expect(parseCsv(toCsv(rows, columns))).toEqual([
      ['Key', 'Value', 'Description'],
      ['1', 'up, running', 'quote " inside'],
      ['2', 'multi\r\nline', ''],
    ])
  })
})
