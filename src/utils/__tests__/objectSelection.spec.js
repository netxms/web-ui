// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  createClassSelectionFilter,
  DEFAULT_NAVIGABLE_CLASSES,
  orderPickerRoots,
} from '@/utils/objectSelection'

describe('createClassSelectionFilter', () => {
  it('selects only the given classes', () => {
    const { selectable } = createClassSelectionFilter(['Node', 'Cluster'])
    expect(selectable({ class: 'Node' })).toBe(true)
    expect(selectable({ class: 'Cluster' })).toBe(true)
    expect(selectable({ class: 'Interface' })).toBe(false)
    expect(selectable({ class: 'Subnet' })).toBe(false)
  })

  it('keeps navigable container classes visible for drill-down', () => {
    const { displayFilter } = createClassSelectionFilter(['Node'])
    expect(displayFilter({ class: 'Node' })).toBe(true)
    for (const cls of DEFAULT_NAVIGABLE_CLASSES) {
      expect(displayFilter({ class: cls })).toBe(true)
    }
    expect(displayFilter({ class: 'Interface' })).toBe(false)
    expect(displayFilter({ class: 'AccessPoint' })).toBe(false)
  })

  it('honours a custom navigable set', () => {
    const { selectable, displayFilter } = createClassSelectionFilter(['Node'], {
      navigableClasses: ['Container'],
    })
    expect(displayFilter({ class: 'Container' })).toBe(true)
    expect(displayFilter({ class: 'Node' })).toBe(true) // selectable stays navigable
    // Not in the custom navigable set anymore
    expect(displayFilter({ class: 'Subnet' })).toBe(false)
    expect(selectable({ class: 'Container' })).toBe(false)
  })

  it('handles null / undefined nodes and empty class lists', () => {
    const { selectable, displayFilter } = createClassSelectionFilter([])
    expect(selectable(null)).toBe(false)
    expect(selectable(undefined)).toBe(false)
    expect(selectable({})).toBe(false)
    expect(displayFilter({ class: 'Container' })).toBe(true)
    expect(displayFilter(null)).toBe(false)
  })
})

describe('orderPickerRoots', () => {
  const ROOTS = [
    { id: 1, class: 'Network' },
    { id: 2, class: 'ServiceRoot' },
    { id: 3, class: 'TemplateRoot' },
    { id: 5, class: 'AssetRoot' },
  ]

  it('puts Infrastructure before Network and keeps the rest in server order', () => {
    expect(orderPickerRoots(ROOTS).map((r) => r.id)).toEqual([2, 1, 3, 5])
  })

  it('leaves the input alone', () => {
    orderPickerRoots(ROOTS)
    expect(ROOTS.map((r) => r.id)).toEqual([1, 2, 3, 5])
  })
})
