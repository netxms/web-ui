import { describe, it, expect } from 'vitest'
import { tableDataToGrid, findColumnIndex, columnValues } from '../tableData'

const TABLE = {
  columns: [
    { name: 'IFNAME', displayName: 'Interface', instanceColumn: true },
    { name: 'SPEED', displayName: 'Speed', unitName: 'Mbps' },
    { name: 'ERRORS', displayName: '' },
  ],
  data: [
    { values: [{ value: 'eth0' }, { value: '1000' }, { value: '0' }] },
    { values: [{ value: 'eth1' }, { value: '100' }, { value: '12', status: 2 }] },
  ],
}

describe('tableDataToGrid', () => {
  it('maps columns to AppTable definitions, falling back to the raw name', () => {
    const { columns } = tableDataToGrid(TABLE)
    expect(columns.map((c) => c.label)).toEqual(['Interface', 'Speed', 'ERRORS'])
    expect(columns.map((c) => c.id)).toEqual(['IFNAME', 'SPEED', 'ERRORS'])
  })

  it('carries the instance column flag and unit through', () => {
    const { columns } = tableDataToGrid(TABLE)
    expect(columns[0].instanceColumn).toBe(true)
    expect(columns[1].instanceColumn).toBe(false)
    expect(columns[1].unitName).toBe('Mbps')
  })

  it('flattens cells positionally so a column named "id" cannot clobber the row key', () => {
    const { columns, rows } = tableDataToGrid({
      columns: [{ name: 'id' }, { name: 'objectId' }],
      data: [{ values: [{ value: 'not-the-key' }, { value: 'nor-this' }] }],
    })
    expect(rows[0].id).toBe(0)
    expect(rows[0][columns[0].field]).toBe('not-the-key')
    expect(rows[0][columns[1].field]).toBe('nor-this')
  })

  it('appends the unit name to a non-empty value', () => {
    const { columns, rows } = tableDataToGrid(TABLE)
    expect(rows[0][columns[1].field]).toBe('1000 Mbps')
  })

  it('leaves an empty cell empty rather than rendering a bare unit', () => {
    const { columns, rows } = tableDataToGrid({
      columns: [{ name: 'SPEED', unitName: 'Mbps' }],
      data: [{ values: [{ value: '' }] }, { values: [{}] }, { values: [] }],
    })
    expect(rows.map((r) => r[columns[0].field])).toEqual(['', '', ''])
  })

  it('records per-cell status only for rows that carry one', () => {
    const { columns, rows } = tableDataToGrid(TABLE)
    expect(rows[0]._status).toBeUndefined()
    expect(rows[1]._status).toEqual({ [columns[2].field]: 2 })
  })

  it('keys rows by objectId when the extended format supplies one', () => {
    const { rows } = tableDataToGrid({
      columns: [{ name: 'A' }],
      data: [
        { objectId: 42, values: [{ value: 'x' }] },
        { objectId: 43, values: [{ value: 'y' }] },
      ],
    })
    expect(rows.map((r) => r.id)).toEqual([42, 43])
    expect(rows[0].objectId).toBe(42)
  })

  it('returns empty columns and rows for a missing or empty table', () => {
    expect(tableDataToGrid(null)).toEqual({ columns: [], rows: [] })
    expect(tableDataToGrid({})).toEqual({ columns: [], rows: [] })
  })
})

describe('findColumnIndex', () => {
  it('finds a column by name', () => {
    expect(findColumnIndex(TABLE, 'SPEED')).toBe(1)
  })

  it('matches case-insensitively, as the server does', () => {
    expect(findColumnIndex(TABLE, 'speed')).toBe(1)
  })

  it('returns -1 for an unknown, empty or missing column', () => {
    expect(findColumnIndex(TABLE, 'NOPE')).toBe(-1)
    expect(findColumnIndex(TABLE, '')).toBe(-1)
    expect(findColumnIndex(TABLE, null)).toBe(-1)
    expect(findColumnIndex(null, 'SPEED')).toBe(-1)
  })
})

describe('columnValues', () => {
  it('pairs an instance column with a data column', () => {
    expect(columnValues(TABLE, 'IFNAME', 'SPEED')).toEqual([
      { instance: 'eth0', value: 1000 },
      { instance: 'eth1', value: 100 },
    ])
  })

  it('treats an unparseable value as zero, as the legacy chart does', () => {
    expect(columnValues(TABLE, 'IFNAME', 'ERRORS')[0].value).toBe(0)
    expect(
      columnValues(
        { ...TABLE, data: [{ values: [{ value: 'eth0' }, {}, { value: 'n/a' }] }] },
        'IFNAME',
        'ERRORS',
      )[0].value,
    ).toBe(0)
  })

  it('returns nothing when either column is missing', () => {
    expect(columnValues(TABLE, 'IFNAME', 'NOPE')).toEqual([])
    expect(columnValues(TABLE, 'NOPE', 'SPEED')).toEqual([])
  })

  it('skips rows with no instance value', () => {
    expect(
      columnValues(
        { ...TABLE, data: [{ values: [{ value: '' }, { value: '5' }, { value: '0' }] }] },
        'IFNAME',
        'SPEED',
      ),
    ).toEqual([])
  })
})
