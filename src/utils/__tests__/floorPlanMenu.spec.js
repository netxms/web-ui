import { describe, it, expect, vi } from 'vitest'
import { floorPlanMenuItems, removeLabelFor } from '../floorPlanMenu'

const POINT = { x: 1200, y: 600 }
const RACK = { key: 'r:101', kind: 'rack', id: 101, rotation: 0 }
const OTHER_RACK = { key: 'r:102', kind: 'rack', id: 102, rotation: 0 }
const COLUMN = { key: 'e:7', kind: 'element', id: 7 }
const CORNER = { key: 'v:2', kind: 'vertex', index: 2 }

function context(overrides = {}) {
  return {
    editMode: true,
    canEdit: true,
    selectedItems: [],
    unplaced: [],
    canRemoveVertex: true,
    nameOf: (key) => `name of ${key}`,
    rackHref: (id) => `/infrastructure/${id}/rack`,
    roomPropertiesHref: '/infrastructure/42/properties?section=room',
    run: {
      addElement: vi.fn(),
      placeRack: vi.fn(),
      rotate: vi.fn(),
      remove: vi.fn(),
      lineUp: vi.fn(),
      insertVertex: vi.fn(),
      openRack: vi.fn(),
      fit: vi.fn(),
      openRoomProperties: vi.fn(),
    },
    ...overrides,
  }
}

const labels = (items) => items.filter((i) => !i.separator).map((i) => i.label)
const find = (items, label) => items.find((i) => i.label === label)

describe('floorPlanMenuItems', () => {
  it('adds elements and places unplaced racks where the floor was clicked', () => {
    const ctx = context({ editMode: false, unplaced: [{ id: 103, name: 'A03' }] })
    const items = floorPlanMenuItems({ kind: 'floor', point: POINT }, ctx)

    expect(labels(items)).toEqual(['Add', 'Place rack here', 'Fit to view', 'Room properties...'])
    expect(labels(find(items, 'Add').items)).toEqual([
      'Column',
      'Wall',
      'Door',
      'Ramp',
      'Stairs',
      'Other',
    ])
    find(items, 'Add').items[1].command()
    expect(ctx.run.addElement).toHaveBeenCalledWith('WALL', POINT)
    find(items, 'Place rack here').items[0].command()
    expect(ctx.run.placeRack).toHaveBeenCalledWith(103, POINT)
    expect(find(items, 'Room properties...').url).toBe(ctx.roomPropertiesHref)
  })

  it('offers only viewing on the floor without the right to edit', () => {
    const ctx = context({ editMode: false, canEdit: false, roomPropertiesHref: null })
    expect(labels(floorPlanMenuItems({ kind: 'floor', point: POINT }, ctx))).toEqual([
      'Fit to view',
    ])
  })

  it('opens a rack while viewing, as a link', () => {
    const ctx = context({ editMode: false })
    const items = floorPlanMenuItems({ kind: 'rack', key: 'r:101', point: POINT }, ctx)

    expect(labels(items)).toEqual(['name of r:101', 'Open rack'])
    expect(items[0]).toMatchObject({ class: 'context-menu-header', disabled: true })
    expect(find(items, 'Open rack').url).toBe('/infrastructure/101/rack')
  })

  it('turns, lines up and removes the selection while editing', () => {
    const ctx = context({ selectedItems: [RACK, OTHER_RACK] })
    const items = floorPlanMenuItems({ kind: 'rack', key: 'r:101', point: POINT }, ctx)

    expect(labels(items)).toEqual([
      '2 selected',
      'Rotate left',
      'Rotate right',
      'Line up as a row',
      'Remove from plan',
    ])
    find(items, 'Rotate left').command()
    expect(ctx.run.rotate).toHaveBeenCalledWith(-90)
  })

  it('keeps the last three corners', () => {
    const ctx = context({ selectedItems: [CORNER], canRemoveVertex: false })
    const items = floorPlanMenuItems({ kind: 'vertex', key: 'v:2', point: POINT }, ctx)

    expect(labels(items)).toEqual(['name of v:2', 'Delete corner'])
    expect(find(items, 'Delete corner').disabled).toBe(true)
  })

  it('adds a corner on a wall where it was clicked', () => {
    const ctx = context()
    const items = floorPlanMenuItems({ kind: 'wall', edge: 3, point: POINT }, ctx)

    find(items, 'Add corner here').command()
    expect(ctx.run.insertVertex).toHaveBeenCalledWith(3, POINT)
  })
})

describe('removeLabelFor', () => {
  it('names what the remove command does', () => {
    expect(removeLabelFor([RACK])).toBe('Remove from plan')
    expect(removeLabelFor([CORNER])).toBe('Delete corner')
    expect(removeLabelFor([COLUMN])).toBe('Delete')
    expect(removeLabelFor([COLUMN, RACK])).toBe('Remove')
  })
})
