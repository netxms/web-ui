// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isDefaultOrder, moveColumnId, orderColumns } from '../columnOrder'

const catalog = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
const ids = (columns) => columns.map((c) => c.id)

describe('orderColumns', () => {
  it('keeps the catalog order when nothing is saved', () => {
    expect(ids(orderColumns(catalog, []))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('follows the saved order', () => {
    expect(ids(orderColumns(catalog, ['d', 'c', 'b', 'a']))).toEqual(['d', 'c', 'b', 'a'])
  })

  it('puts a column the saved order does not know after its catalog neighbour', () => {
    expect(ids(orderColumns(catalog, ['c', 'a', 'd']))).toEqual(['c', 'a', 'b', 'd'])
    // The first catalog column has no neighbour before it, so it goes first.
    expect(ids(orderColumns(catalog, ['d', 'b', 'c']))).toEqual(['a', 'd', 'b', 'c'])
  })

  it('drops saved ids the catalog no longer has, and duplicates', () => {
    expect(ids(orderColumns(catalog, ['b', 'gone', 'a', 'b', 'c', 'd']))).toEqual([
      'b',
      'a',
      'c',
      'd',
    ])
  })
})

describe('isDefaultOrder', () => {
  it('is true for no saved order, and for a saved order equal to the catalog', () => {
    expect(isDefaultOrder(catalog, [])).toBe(true)
    expect(isDefaultOrder(catalog, ['a', 'b', 'c', 'd'])).toBe(true)
    expect(isDefaultOrder(catalog, ['b', 'a'])).toBe(false)
  })
})

describe('moveColumnId', () => {
  const order = ['a', 'b', 'c', 'd']

  it('moves an id before or after another', () => {
    expect(moveColumnId(order, 'd', 'a', false)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveColumnId(order, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveColumnId(order, 'a', 'd', true)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('returns the list unchanged for an unknown id or a move onto itself', () => {
    expect(moveColumnId(order, 'x', 'a', false)).toBe(order)
    expect(moveColumnId(order, 'a', 'x', false)).toBe(order)
    expect(moveColumnId(order, 'b', 'b', true)).toBe(order)
  })
})
