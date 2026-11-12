// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createClassSelectionFilter, DEFAULT_NAVIGABLE_CLASSES } from '@/utils/objectSelection'

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
