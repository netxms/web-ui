// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { dciSourceKey, dciValueItem, dciValueKey } from '../dciValues'

describe('dciValueItem', () => {
  it('asks for a plain DCI by object and DCI', () => {
    expect(dciValueItem({ nodeId: 11, dciId: 2, type: 1 })).toEqual({ objectId: 11, dciId: 2 })
  })

  it('asks for one cell of a table source', () => {
    const source = { nodeId: 11, dciId: 2, type: 2, column: 'FREE', instance: 'C:' }
    expect(dciValueItem(source)).toEqual({ objectId: 11, dciId: 2, column: 'FREE', instance: 'C:' })
  })

  /** Legacy skips such a source; asking without a cell gets the table's value summary. */
  it('asks a table source without a column or an instance for the table itself', () => {
    expect(dciValueItem({ nodeId: 1, dciId: 2, type: 2, column: 'c', instance: '' })).toEqual({
      objectId: 1,
      dciId: 2,
    })
  })

  it('ignores stale cell fields on an item source', () => {
    expect(dciValueItem({ nodeId: 1, dciId: 2, type: 1, column: 'c', instance: 'i' })).toEqual({
      objectId: 1,
      dciId: 2,
    })
  })

  it('asks nothing for a source without an object or a DCI', () => {
    expect(dciValueItem({ nodeId: 0, dciId: 2 })).toBeNull()
    expect(dciValueItem({ nodeId: 1 })).toBeNull()
    expect(dciValueItem(null)).toBeNull()
  })
})

describe('dciValueKey', () => {
  it('keys a value by object and DCI, and a cell by its column and instance too', () => {
    expect(dciValueKey({ objectId: 11, dciId: 2 })).toBe('11:2')
    expect(dciValueKey({ objectId: 11, dciId: 2, column: 'FREE', instance: 'C:' })).toBe(
      '11:2:["FREE","C:"]',
    )
  })

  it('keeps cells apart whatever their names contain', () => {
    const a = dciValueKey({ objectId: 1, dciId: 2, column: 'a:b', instance: 'c' })
    const b = dciValueKey({ objectId: 1, dciId: 2, column: 'a', instance: 'b:c' })
    expect(a).not.toBe(b)
  })

  it('keys a source the same way as the item it asks for', () => {
    const source = { nodeId: 3, dciId: 4, type: 2, column: 'In', instance: '7' }
    expect(dciSourceKey(source)).toBe(dciValueKey(dciValueItem(source)))
    expect(dciSourceKey({ nodeId: 0, dciId: 4 })).toBeNull()
  })
})
